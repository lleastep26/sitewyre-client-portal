import { inngest } from "./client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailProvider, getSmsProvider } from "@/lib/adapters";
import { getTradePreset } from "@/lib/trade-presets";
import { normalizePhone } from "@/lib/utils";
import { nextSendableAt } from "@/lib/scheduling/quiet-hours";
import {
  applyTemplate,
  getAutomationState,
  getDefaultTemplate,
} from "@/lib/automations";
import { sendPushToClient } from "@/lib/push/web-push";
import {
  SPEED_TO_LEAD_SLA_SLEEP,
  shouldNudgeOwnerForSla,
} from "@/lib/leads/speed-to-lead";
import { isOptedOut, logSkippedOptOut } from "@/lib/funnels/opt-out";
import { hasRecentSend } from "@/lib/funnels/dedupe";
import { buildReviewMessage } from "@/lib/funnels/review-link";
import { nextFunnelSendableAt } from "@/lib/funnels/quiet-hours";
import { shouldStopReviewDrip } from "@/lib/funnels/review-request-gate";
import { shouldStopReviewBlast } from "@/lib/funnels/review-blast-gate";
import { buildReviewBlastReminderMessage } from "@/lib/funnels/review-blast-message";
import { checkA2pGate } from "@/lib/funnels/a2p-gate";
import { resolveEmailFromAddress } from "@/lib/email/from-address";
import { resolveSmsFrom } from "@/lib/a2p/sending";
import { advanceA2pPipeline, type A2pPipelineState } from "@/lib/a2p/pipeline";
import { buildA2pBusinessInfo } from "@/lib/a2p/business-info";
import { decryptEin } from "@/lib/a2p/encryption";
import { refreshEmailDomain } from "@/lib/email/resend-domains";

type LeadEvent = {
  name: "portal/lead.created";
  data: {
    clientId: string;
    leadId: string;
    phone: string;
    email?: string | null;
    name: string;
  };
};

type Step = {
  sleep: (id: string, d: string) => Promise<void>;
  sleepUntil?: (id: string, d: Date | string) => Promise<void>;
  run: <T>(id: string, fn: () => Promise<T>) => Promise<T>;
};

async function respectQuietHours(
  step: Step,
  timeZone: string,
  sleepId = "quiet-hours",
) {
  const sendAt = nextSendableAt(new Date(), timeZone);
  const delayMs = sendAt.getTime() - Date.now();
  if (delayMs > 5_000) {
    if (step.sleepUntil) {
      await step.sleepUntil(sleepId, sendAt);
    } else {
      const mins = Math.ceil(delayMs / 60_000);
      await step.sleep(sleepId, `${Math.min(mins, 12 * 60)}m`);
    }
  }
}

export const leadAutoReply = inngest.createFunction(
  { id: "lead-auto-reply", triggers: [{ event: "portal/lead.created" }] },
  async ({ event, step }: { event: LeadEvent; step: Step }) => {
    const { clientId, leadId, phone, email, name } = event.data;
    await step.sleep("wait-brief", "2s");

    const supabase = createAdminClient();
    const { data: client } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .single();

    if (!client) return { skipped: true };

    const auto = await getAutomationState(supabase, clientId, "lead_auto_reply");
    if (!auto.enabled) return { skipped: true, reason: "disabled" };

    await respectQuietHours(step, client.timezone ?? "America/Chicago");

    const preset = getTradePreset(client.trade ?? "other");
    const template =
      auto.templateBody ??
      preset.templates.find((t) => t.key === "lead_auto_reply")?.body ??
      "Hi {{first_name}}, thanks for contacting {{business_name}}.";
    const firstName = name.split(" ")[0] ?? name;
    const body = applyTemplate(template, {
      first_name: firstName,
      business_name: client.business_name ?? "us",
    });

    const sms = getSmsProvider();
    const to = normalizePhone(phone);
    if (to && client.twilio_phone_number && checkA2pGate(client, to).allowed) {
      await step.run("sms-homeowner", async () =>
        sms.send({ to, from: resolveSmsFrom(client) ?? undefined, body }),
      );
    }

    if (email) {
      const mail = getEmailProvider();
      await step.run("email-homeowner", async () =>
        mail.send({
          to: email,
          subject: `We got your request — ${client.business_name ?? "Sitewyre"}`,
          html: `<p>${body}</p>`,
          text: body,
          ...resolveEmailFromAddress(client),
        }),
      );
    }

    if (client.phone) {
      await step.run("alert-owner-sms", async () =>
        sms.send({
          to: normalizePhone(client.phone!),
          body: `New lead for ${client.business_name}: ${name} ${phone}`,
        }),
      );
    }

    await step.run("log-workflow", async () => {
      await supabase.from("workflow_runs").insert({
        client_id: clientId,
        trigger: "lead_auto_reply",
        status: "sent",
        log: { leadId, phone, email },
      });
    });

    await step.run("push-notify", async () =>
      sendPushToClient(clientId, {
        title: `New lead — ${client.business_name ?? "Sitewyre"}`,
        body: `${name} · ${phone}`,
        url: "/leads",
      }),
    );

    return { ok: true };
  },
);

export const leadUnansweredFollowUp = inngest.createFunction(
  {
    id: "lead-unanswered-follow-up",
    triggers: [{ event: "portal/lead.created" }],
  },
  async ({ event, step }: { event: LeadEvent; step: Step }) => {
    const { clientId, leadId, phone, name } = event.data;
    await step.sleep("wait-2d", "2d");

    const supabase = createAdminClient();
    const auto = await getAutomationState(
      supabase,
      clientId,
      "lead_unanswered_follow_up",
    );
    if (!auto.enabled) return { skipped: true, reason: "disabled" };

    const { data: lead } = await supabase
      .from("leads")
      .select("id, first_response_at, phone")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead || lead.first_response_at) {
      return { skipped: true, reason: "answered_or_missing" };
    }

    const { data: client } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .single();
    if (!client?.twilio_phone_number) return { skipped: true };

    await respectQuietHours(step, client.timezone ?? "America/Chicago", "quiet-follow-up");

    const to = normalizePhone(lead.phone || phone);
    const firstName = name.split(" ")[0] ?? name;
    const body = applyTemplate(
      auto.templateBody ??
        `Hi {{first_name}}, just checking in from {{business_name}} — still happy to help whenever you're ready.`,
      {
        first_name: firstName,
        business_name: client.business_name ?? "us",
      },
    );

    const a2p = checkA2pGate(client, to);
    if (!a2p.allowed) {
      await supabase.from("workflow_runs").insert({
        client_id: clientId,
        trigger: "lead_unanswered_follow_up",
        status: "skipped",
        log: { leadId, phone: to, reason: a2p.reason },
      });
      return { skipped: true, reason: a2p.reason };
    }

    await step.run("sms-follow-up", async () =>
      getSmsProvider().send({
        to,
        from: resolveSmsFrom(client)!,
        body,
      }),
    );

    await step.run("log-follow-up", async () => {
      await supabase.from("workflow_runs").insert({
        client_id: clientId,
        trigger: "lead_unanswered_follow_up",
        status: "sent",
        log: { leadId, phone: to },
      });
    });

    return { ok: true };
  },
);

export const leadSlaNudge = inngest.createFunction(
  {
    id: "lead-sla-nudge",
    triggers: [{ event: "portal/lead.created" }],
  },
  async ({ event, step }: { event: LeadEvent; step: Step }) => {
    const { clientId, leadId, phone, name } = event.data;
    await step.sleep("wait-sla", SPEED_TO_LEAD_SLA_SLEEP);

    const supabase = createAdminClient();
    const auto = await getAutomationState(supabase, clientId, "lead_sla_nudge");
    if (!auto.enabled) return { skipped: true, reason: "disabled" };

    const { data: lead } = await supabase
      .from("leads")
      .select("id, first_response_at, phone, name")
      .eq("id", leadId)
      .maybeSingle();
    if (!shouldNudgeOwnerForSla(lead)) {
      return { skipped: true, reason: "answered_or_missing" };
    }

    const { data: client } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .single();
    if (!client) return { skipped: true };

    // Owner SLA alert — do not delay for quiet hours.
    const firstName = (lead?.name ?? name).split(" ")[0] ?? name;
    const leadPhone = lead?.phone || phone;
    const body = applyTemplate(
      auto.templateBody ??
        "SLA: {{first_name}} still needs a reply ({{business_name}}). {{phone}}",
      {
        first_name: firstName,
        business_name: client.business_name ?? "us",
        phone: leadPhone,
      },
    );

    if (client.phone) {
      await step.run("sms-owner-sla", async () =>
        getSmsProvider().send({
          to: normalizePhone(client.phone!),
          body,
        }),
      );
    }

    await step.run("push-owner-sla", async () =>
      sendPushToClient(clientId, {
        title: `Still needs reply — ${client.business_name ?? "Sitewyre"}`,
        body: `${firstName} · ${leadPhone}`,
        url: "/inbox",
      }),
    );

    await step.run("log-sla-nudge", async () => {
      await supabase.from("workflow_runs").insert({
        client_id: clientId,
        trigger: "lead_sla_nudge",
        status: "sent",
        log: { leadId, phone: leadPhone },
      });
    });

    return { ok: true };
  },
);

export const missedCallTextBack = inngest.createFunction(
  { id: "missed-call-text-back", triggers: [{ event: "portal/call.missed" }] },
  async ({
    event,
    step,
  }: {
    event: { data: { clientId: string; from: string } };
    step: Step;
  }) => {
    const { clientId, from } = event.data;
    await step.sleep("wait-30s", "30s");
    const supabase = createAdminClient();

    const auto = await getAutomationState(
      supabase,
      clientId,
      "missed_call_text_back",
    );
    if (!auto.enabled) return { skipped: true, reason: "disabled" };

    const { data: client } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .single();
    if (!client?.twilio_phone_number) return { skipped: true };

    await respectQuietHours(step, client.timezone ?? "America/Chicago");

    const toPhone = normalizePhone(from);
    if (await isOptedOut(supabase, clientId, toPhone)) {
      await logSkippedOptOut(supabase, {
        clientId,
        trigger: "missed_call_text_back",
        log: { from: toPhone },
      });
      return { skipped: true, reason: "opted_out" };
    }

    const recentlyTexted = await hasRecentSend(supabase, {
      clientId,
      trigger: "missed_call_text_back",
      phone: toPhone,
    });
    if (recentlyTexted) {
      await supabase.from("workflow_runs").insert({
        client_id: clientId,
        trigger: "missed_call_text_back",
        status: "skipped",
        log: { from: toPhone, reason: "recently_texted" },
      });
      return { skipped: true, reason: "recently_texted" };
    }

    const body = applyTemplate(
      auto.templateBody ??
        "Sorry we missed your call to {{business_name}}. How can we help?",
      { business_name: client.business_name ?? "us" },
    );

    const sms = getSmsProvider();
    const a2p = checkA2pGate(client, toPhone);
    if (a2p.allowed) {
      await step.run("sms-missed", async () =>
        sms.send({
          to: toPhone,
          from: resolveSmsFrom(client)!,
          body,
        }),
      );
    }

    if (client.phone) {
      await step.run("alert-owner-missed-call", async () =>
        sms.send({
          to: normalizePhone(client.phone!),
          body: `Missed call from ${toPhone}. Auto-text sent.`,
        }),
      );
    }

    await step.run("log-missed", async () => {
      await supabase.from("workflow_runs").insert({
        client_id: clientId,
        trigger: "missed_call_text_back",
        status: a2p.allowed ? "sent" : "skipped",
        log: a2p.allowed ? { from } : { from, reason: a2p.reason },
      });
    });

    return { ok: true };
  },
);

export const appointmentReminder = inngest.createFunction(
  { id: "appointment-reminder", triggers: [{ event: "portal/appointment.reminder" }] },
  async ({
    event,
    step,
  }: {
    event: {
      data: {
        to: string;
        body: string;
        from?: string;
        clientId?: string;
        trigger?: string;
      };
    };
    step: Step;
  }) => {
    const { to, body, from, clientId, trigger } = event.data;
    if (!to) return { skipped: true };

    // review_request moved to the dedicated reviewRequestDrip function
    // (portal/review_request.started). Any review_request event still
    // queued here from before that move is stale: no-op it rather than
    // let it fall through to the generic appointment_reminder gate below,
    // which would check the wrong automation toggle and skip the
    // opted-out/replied/clicked checks that trigger used to have.
    if (trigger === "review_request") {
      return { skipped: true, reason: "migrated_to_review_request_drip" };
    }

    let timeZone = "America/Chicago";
    if (clientId) {
      const supabase = createAdminClient();
      const gateKey = trigger === "on_my_way" ? trigger : "appointment_reminder";
      const auto = await getAutomationState(supabase, clientId, gateKey);
      if (!auto.enabled) return { skipped: true, reason: "disabled" };

      if (await isOptedOut(supabase, clientId, to)) {
        await logSkippedOptOut(supabase, {
          clientId,
          trigger: trigger ?? "appointment_reminder",
          log: { to },
        });
        return { skipped: true, reason: "opted_out" };
      }

      const { data: client } = await supabase
        .from("clients")
        .select("timezone, a2p_status, phone")
        .eq("id", clientId)
        .maybeSingle();
      timeZone = client?.timezone ?? timeZone;

      const a2p = checkA2pGate(client, to);
      if (!a2p.allowed) {
        await supabase.from("workflow_runs").insert({
          client_id: clientId,
          trigger: trigger ?? "appointment_reminder",
          status: "skipped",
          log: { to, reason: a2p.reason },
        });
        return { skipped: true, reason: a2p.reason };
      }
    }

    await respectQuietHours(step, timeZone);

    const sms = getSmsProvider();
    await step.run("send-sms", async () => sms.send({ to, body, from }));

    if (clientId) {
      const supabase = createAdminClient();
      await step.run("log-reminder", async () => {
        await supabase.from("workflow_runs").insert({
          client_id: clientId,
          trigger: trigger ?? "appointment_reminder",
          status: "sent",
          log: { to },
        });
      });
    }

    return { ok: true };
  },
);

const REVIEW_REQUEST_STEP2_TEMPLATE =
  "Hi {{first_name}}, just a friendly reminder — your review means a lot to our small business: {{review_link}}";
const REVIEW_REQUEST_STEP3_TEMPLATE =
  "Hi {{first_name}}, one last ask — a quick review would really help {{business_name}}: {{review_link}}";
const REVIEW_REQUEST_FALLBACK_TEMPLATE =
  "Thanks for choosing {{business_name}}! Mind leaving a quick review? {{review_link}}";

// This function requires step.sleepUntil (not the step.sleep fallback
// respectQuietHours uses elsewhere) — the Inngest runtime always provides
// it; this narrows the shared optional-sleepUntil Step type for this
// function only.
type StepWithSleepUntil = Step & { sleepUntil: NonNullable<Step["sleepUntil"]> };

type ReviewRequestStartedEvent = {
  name: "portal/review_request.started";
  data: {
    jobId: string;
    clientId: string;
    contactId?: string;
    phone: string;
    from: string;
    reviewToken: string;
    /** When the job was marked complete — every step's send time and the
     * "has the contact replied since" check are anchored to this, not to
     * whenever this function happens to run. */
    completedAt: string;
  };
};

export const reviewRequestDrip = inngest.createFunction(
  {
    id: "review-request-drip",
    triggers: [{ event: "portal/review_request.started" }],
    // If the job's status changes away from "complete" (e.g. completed by
    // mistake and reverted), cancel this run — portal/job.status_changed
    // is sent on every status change, with the `if` filtering out the
    // "changed TO complete" case that started this run in the first place.
    cancelOn: [
      {
        event: "portal/job.status_changed",
        match: "data.jobId",
        if: "async.data.status != 'complete'",
      },
    ],
  },
  async ({
    event,
    step,
  }: {
    event: ReviewRequestStartedEvent;
    step: StepWithSleepUntil;
  }) => {
    const { jobId, clientId, contactId, phone, from, reviewToken, completedAt } =
      event.data;
    const supabase = createAdminClient();

    const { data: client } = await supabase
      .from("clients")
      .select("business_name, timezone")
      .eq("id", clientId)
      .maybeSingle();
    const businessName = client?.business_name ?? "us";
    const timeZone = client?.timezone ?? "America/Chicago";

    let firstName = "there";
    if (contactId) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("name")
        .eq("id", contactId)
        .maybeSingle();
      firstName = contact?.name?.split(" ")[0] || firstName;
    }

    const reviewUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/r/${reviewToken}`;

    async function logSkip(stepNum: number, reason: string) {
      await supabase.from("workflow_runs").insert({
        client_id: clientId,
        trigger: "review_request",
        status: "skipped",
        log: { jobId, step: stepNum, reason },
      });
    }

    // Returns false (and logs why) if this step must not send — re-checked
    // fresh every time, never cached from an earlier step, since each of
    // these can change while this function is asleep.
    async function runStep(stepNum: 1 | 2 | 3, fallbackTemplate: string) {
      const gate = await shouldStopReviewDrip(supabase, {
        clientId,
        phone,
        contactId,
        completedAt,
        reviewToken,
      });
      if (gate.stop) {
        await logSkip(stepNum, gate.reason);
        return false;
      }

      const sendAt = nextFunnelSendableAt(new Date(), timeZone);
      if (sendAt.getTime() > Date.now() + 5_000) {
        await step.sleepUntil(`funnel-quiet-${stepNum}`, sendAt);
      }

      const template =
        stepNum === 1
          ? gate.templateBody ??
            getDefaultTemplate("review_request") ??
            REVIEW_REQUEST_FALLBACK_TEMPLATE
          : fallbackTemplate;
      const body = buildReviewMessage(
        template,
        { business_name: businessName, first_name: firstName },
        reviewUrl,
      );

      await step.run(`send-${stepNum}`, () =>
        getSmsProvider().send({ to: phone, from, body }),
      );
      await step.run(`log-sent-${stepNum}`, async () => {
        await supabase.from("workflow_runs").insert({
          client_id: clientId,
          trigger: "review_request",
          status: "sent",
          log: { jobId, step: stepNum, to: phone },
        });
      });
      return true;
    }

    const completedAtMs = new Date(completedAt).getTime();

    await step.sleepUntil("wait-step-1", new Date(completedAtMs + 2 * 60 * 60 * 1000));
    if (!(await runStep(1, REVIEW_REQUEST_FALLBACK_TEMPLATE))) {
      return { stopped: true, at: 1 };
    }

    await step.sleepUntil(
      "wait-step-2",
      new Date(completedAtMs + 2 * 24 * 60 * 60 * 1000),
    );
    if (!(await runStep(2, REVIEW_REQUEST_STEP2_TEMPLATE))) {
      return { stopped: true, at: 2 };
    }

    await step.sleepUntil(
      "wait-step-3",
      new Date(completedAtMs + 5 * 24 * 60 * 60 * 1000),
    );
    if (!(await runStep(3, REVIEW_REQUEST_STEP3_TEMPLATE))) {
      return { stopped: true, at: 3 };
    }

    return { ok: true };
  },
);

export const invoiceReminder = inngest.createFunction(
  { id: "invoice-reminder", triggers: [{ event: "portal/invoice.reminder" }] },
  async ({
    event,
    step,
  }: {
    event: {
      data: {
        to: string;
        subject: string;
        html: string;
        clientId?: string;
      };
    };
    step: Step;
  }) => {
    const { to, subject, html, clientId } = event.data;
    const mail = getEmailProvider();
    await step.run("send-email", async () =>
      mail.send({ to, subject, html }),
    );
    if (clientId) {
      const supabase = createAdminClient();
      await step.run("log-invoice-reminder", async () => {
        await supabase.from("workflow_runs").insert({
          client_id: clientId,
          trigger: "invoice_reminder",
          status: "sent",
          log: { to, subject },
        });
      });
    }
    return { ok: true };
  },
);

export const invoiceFollowUp = inngest.createFunction(
  { id: "invoice-follow-up", triggers: [{ event: "portal/invoice.sent" }] },
  async ({
    event,
    step,
  }: {
    event: { data: { invoiceId: string; clientId: string } };
    step: Step;
  }) => {
    const { invoiceId, clientId } = event.data;
    let invoiceTemplate: string | null = null;
    {
      const supabase = createAdminClient();
      const auto = await getAutomationState(supabase, clientId, "invoice_reminder");
      if (!auto.enabled) return { skipped: true, reason: "disabled" };
      invoiceTemplate = auto.templateBody;
    }

    async function sendIfUnpaid(attempt: 1 | 2) {
      const supabase = createAdminClient();
      const { data: invoice } = await supabase
        .from("invoices")
        .select(
          "id, number, status, total, amount_paid, public_token, contact_id",
        )
        .eq("id", invoiceId)
        .maybeSingle();
      if (!invoice) return { skipped: true as const, reason: "missing" };
      if (invoice.status === "paid" || invoice.status === "void") {
        return { skipped: true as const, reason: "closed" };
      }
      const remaining =
        Number(invoice.total) - Number(invoice.amount_paid ?? 0);
      if (remaining <= 0) {
        return { skipped: true as const, reason: "balanced" };
      }

      const { data: client } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single();
      if (!client) return { skipped: true as const };

      await respectQuietHours(
        step,
        client.timezone ?? "America/Chicago",
        `quiet-invoice-${attempt}`,
      );

      let email: string | null = null;
      let phone: string | null = null;
      if (invoice.contact_id) {
        const { data: contact } = await supabase
          .from("contacts")
          .select("emails, phones")
          .eq("id", invoice.contact_id)
          .maybeSingle();
        email = contact?.emails?.[0] ?? null;
        phone = contact?.phones?.[0]
          ? normalizePhone(contact.phones[0])
          : null;
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const link = `${appUrl}/pay/${invoice.public_token}`;
      const amount = remaining.toFixed(2);
      const subject =
        attempt === 1
          ? `Reminder: invoice ${invoice.number}`
          : `Past due: invoice ${invoice.number}`;
      const fallback =
        attempt === 1
          ? (getDefaultTemplate("invoice_reminder") ??
            `Friendly reminder from {{business_name}}: \${{amount}} due on invoice {{invoice_number}}. Pay: {{link}}`)
          : `Second reminder from {{business_name}}: \${{amount}} still due on {{invoice_number}}. Pay: {{link}}`;
      const body = applyTemplate(invoiceTemplate ?? fallback, {
        business_name: client.business_name ?? "us",
        amount,
        invoice_number: String(invoice.number ?? ""),
        link,
      });

      if (email) {
        await getEmailProvider().send({
          to: email,
          subject,
          html: `<p>${body}</p><p><a href="${link}">${link}</a></p>`,
          text: body,
          ...resolveEmailFromAddress(client),
        });
      }
      let a2pReason: string | undefined;
      if (phone && client.twilio_phone_number) {
        const a2p = checkA2pGate(client, phone);
        if (a2p.allowed) {
          await getSmsProvider().send({
            to: phone,
            from: resolveSmsFrom(client)!,
            body,
          });
        } else {
          a2pReason = a2p.reason;
        }
      }

      await supabase.from("workflow_runs").insert({
        client_id: clientId,
        trigger: "invoice_reminder",
        status: email || phone ? "sent" : "skipped",
        log: { invoiceId, attempt, remaining, email, phone, a2pReason },
      });
      return { ok: true as const, attempt };
    }

    await step.sleep("wait-3d", "3d");
    await step.run("invoice-follow-up-1", () => sendIfUnpaid(1));
    await step.sleep("wait-4d-more", "4d");
    await step.run("invoice-follow-up-2", () => sendIfUnpaid(2));
    return { ok: true };
  },
);

export const quoteFollowUp = inngest.createFunction(
  { id: "quote-follow-up", triggers: [{ event: "portal/quote.sent" }] },
  async ({
    event,
    step,
  }: {
    event: { data: { quoteId: string; clientId: string } };
    step: Step;
  }) => {
    const { quoteId, clientId } = event.data;
    let quoteTemplate: string | null = null;
    {
      const supabase = createAdminClient();
      const auto = await getAutomationState(supabase, clientId, "quote_follow_up");
      if (!auto.enabled) return { skipped: true, reason: "disabled" };
      quoteTemplate = auto.templateBody;
    }

    async function sendAttempt(attempt: 1 | 2) {
      const supabase = createAdminClient();
      const { data: quote } = await supabase
        .from("quotes")
        .select("id, status, number, public_token, contact_id, expires_at")
        .eq("id", quoteId)
        .maybeSingle();
      if (!quote || quote.status !== "sent") {
        return { skipped: true as const, reason: "not_open" };
      }
      if (quote.expires_at && new Date(quote.expires_at).getTime() < Date.now()) {
        return { skipped: true as const, reason: "expired" };
      }

      const { data: client } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single();
      if (!client) return { skipped: true as const };

      await respectQuietHours(
        step,
        client.timezone ?? "America/Chicago",
        `quiet-quote-${attempt}`,
      );

      let phone: string | null = null;
      let email: string | null = null;
      if (quote.contact_id) {
        const { data: contact } = await supabase
          .from("contacts")
          .select("phones, emails")
          .eq("id", quote.contact_id)
          .maybeSingle();
        phone = contact?.phones?.[0] ? normalizePhone(contact.phones[0]) : null;
        email = contact?.emails?.[0] ?? null;
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const link = `${appUrl}/q/${quote.public_token}`;
      const fallback =
        attempt === 1
          ? (getDefaultTemplate("quote_follow_up") ??
            "Friendly reminder: your quote {{quote_number}} from {{business_name}} is ready: {{link}}")
          : "Last reminder: quote {{quote_number}} from {{business_name}} expires soon: {{link}}";
      const body = applyTemplate(quoteTemplate ?? fallback, {
        quote_number: String(quote.number ?? ""),
        business_name: client.business_name ?? "us",
        link,
      });

      let a2pReason: string | undefined;
      if (phone && client.twilio_phone_number) {
        if (await isOptedOut(supabase, clientId, phone, quote.contact_id)) {
          await logSkippedOptOut(supabase, {
            clientId,
            trigger: "quote_follow_up",
            log: { quoteId, attempt, phone },
          });
        } else {
          const a2p = checkA2pGate(client, phone);
          if (a2p.allowed) {
            await getSmsProvider().send({
              to: phone,
              from: resolveSmsFrom(client)!,
              body,
            });
          } else {
            a2pReason = a2p.reason;
          }
        }
      }
      if (email) {
        await getEmailProvider().send({
          to: email,
          subject: `Reminder: quote ${quote.number}`,
          html: `<p>${body}</p>`,
          text: body,
          ...resolveEmailFromAddress(client),
        });
      }

      await supabase.from("workflow_runs").insert({
        client_id: clientId,
        trigger: "quote_follow_up",
        status: phone || email ? "sent" : "skipped",
        log: { quoteId, attempt, phone, email, a2pReason },
      });
      return { ok: true as const, attempt };
    }

    await step.sleep("wait-3d", "3d");
    await step.run("follow-up-1", () => sendAttempt(1));
    await step.sleep("wait-4d-more", "4d");
    await step.run("follow-up-2", () => sendAttempt(2));
    return { ok: true };
  },
);

export const rebookingNudge = inngest.createFunction(
  { id: "rebooking-nudge", triggers: [{ event: "portal/job.completed" }] },
  async ({
    event,
    step,
  }: {
    event: { data: { jobId: string; clientId: string } };
    step: Step;
  }) => {
    const { jobId, clientId } = event.data;
    await step.sleep("wait-14d", "14d");

    const supabase = createAdminClient();
    const auto = await getAutomationState(supabase, clientId, "rebooking_nudge");
    if (!auto.enabled) return { skipped: true, reason: "disabled" };

    const { data: job } = await supabase
      .from("jobs")
      .select("id, contact_id, status")
      .eq("id", jobId)
      .maybeSingle();
    if (!job) return { skipped: true };

    const { data: client } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .single();
    if (!client?.twilio_phone_number || !client.site_key) {
      return { skipped: true };
    }

    let phone: string | null = null;
    if (job.contact_id) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("phones")
        .eq("id", job.contact_id)
        .maybeSingle();
      phone = contact?.phones?.[0] ? normalizePhone(contact.phones[0]) : null;
    }
    if (!phone) return { skipped: true, reason: "no_phone" };

    await respectQuietHours(step, client.timezone ?? "America/Chicago", "quiet-rebook");

    if (await isOptedOut(supabase, clientId, phone, job.contact_id)) {
      await logSkippedOptOut(supabase, {
        clientId,
        trigger: "rebooking_nudge",
        log: { jobId, phone },
      });
      return { skipped: true, reason: "opted_out" };
    }

    const a2p = checkA2pGate(client, phone);
    if (!a2p.allowed) {
      await supabase.from("workflow_runs").insert({
        client_id: clientId,
        trigger: "rebooking_nudge",
        status: "skipped",
        log: { jobId, phone, reason: a2p.reason },
      });
      return { skipped: true, reason: a2p.reason };
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const link = `${appUrl}/book/${client.site_key}`;
    const body = `${applyTemplate(
      auto.templateBody ??
        "Hi from {{business_name}} — ready to book your next visit?",
      { business_name: client.business_name ?? "us" },
    )} ${link}`;

    await step.run("sms-rebook", async () =>
      getSmsProvider().send({
        to: phone!,
        from: resolveSmsFrom(client)!,
        body,
      }),
    );

    await step.run("log-rebook", async () => {
      await supabase.from("workflow_runs").insert({
        client_id: clientId,
        trigger: "rebooking_nudge",
        status: "sent",
        log: { jobId, phone },
      });
    });

    return { ok: true };
  },
);

export const monthlyResultsEmail = inngest.createFunction(
  { id: "monthly-results-email", triggers: [{ cron: "0 14 1 * *" }] },
  async ({
    step,
  }: {
    step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> };
  }) => {
    return step.run("send-all-clients", async () => {
      const supabase = createAdminClient();
      const { data: clients } = await supabase
        .from("clients")
        .select("id, business_name, phone, plan, status")
        .eq("status", "active");

      const since = new Date();
      since.setDate(since.getDate() - 30);
      let sent = 0;

      for (const client of clients ?? []) {
        if (!client.phone) continue;
        const [{ count: leadsCount }, { data: invoices }] = await Promise.all([
          supabase
            .from("leads")
            .select("*", { count: "exact", head: true })
            .eq("client_id", client.id)
            .gte("created_at", since.toISOString()),
          supabase
            .from("invoices")
            .select("total, amount_paid, status")
            .eq("client_id", client.id)
            .gte("created_at", since.toISOString()),
        ]);
        const collected = (invoices ?? []).reduce(
          (s, i) => s + Number(i.amount_paid ?? 0),
          0,
        );
        const unpaid = (invoices ?? [])
          .filter((i) => i.status !== "paid")
          .reduce(
            (s, i) => s + (Number(i.total) - Number(i.amount_paid)),
            0,
          );

        const body = `${client.business_name} monthly snapshot: ${leadsCount ?? 0} leads, $${collected.toFixed(0)} collected, $${unpaid.toFixed(0)} unpaid (last 30d).`;
        await getSmsProvider().send({
          to: normalizePhone(client.phone),
          body,
        });
        await supabase.from("workflow_runs").insert({
          client_id: client.id,
          trigger: "monthly_results",
          status: "sent",
          log: { leadsCount, collected, unpaid, channel: "sms" },
        });
        sent += 1;
      }
      return { sent };
    });
  },
);

export const healthMonitor = inngest.createFunction(
  { id: "health-monitor", triggers: [{ cron: "*/15 * * * *" }] },
  async ({
    step,
  }: {
    step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> };
  }) => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return step.run("ping-health", async () => {
      const res = await fetch(`${appUrl}/api/health`);
      if (!res.ok) return { ok: false, status: res.status };
      const body = (await res.json()) as {
        ok?: boolean;
        checks?: Record<string, boolean>;
      };
      return {
        ok: Boolean(body.ok),
        status: res.status,
        checks: body.checks ?? null,
      };
    });
  },
);

export const emailDomainVerificationPoll = inngest.createFunction(
  { id: "email-domain-verification-poll", triggers: [{ cron: "*/30 * * * *" }] },
  async ({ step }: { step: Step }) => {
    return step.run("poll-pending-domains", async () => {
      const supabase = createAdminClient();
      const { data: pending } = await supabase
        .from("clients")
        .select("id, email_domain, email_domain_resend_id")
        .eq("email_domain_status", "pending");

      let checked = 0;
      for (const row of pending ?? []) {
        if (!row.email_domain_resend_id || !row.email_domain) continue;
        try {
          const result = await refreshEmailDomain(row.email_domain_resend_id, row.email_domain);
          await supabase
            .from("clients")
            .update({
              email_domain_status: result.status,
              email_dns_records: result.records,
              email_domain_verified_at: result.status === "verified" ? new Date().toISOString() : null,
            })
            .eq("id", row.id);
          checked++;
        } catch {
          // Soft-fail this client — tried again on the next run.
        }
      }
      return { checked };
    });
  },
);

export const a2pPipelinePoll = inngest.createFunction(
  { id: "a2p-pipeline-poll", triggers: [{ cron: "*/30 * * * *" }] },
  async ({ step }: { step: Step }) => {
    return step.run("poll-pending-a2p", async () => {
      const supabase = createAdminClient();
      const { data: pending } = await supabase
        .from("clients")
        .select("*")
        .eq("a2p_status", "pending")
        .not("a2p_registration_type", "is", null);

      let checked = 0;
      for (const client of pending ?? []) {
        const state = (client.a2p_pipeline as Partial<A2pPipelineState> | null) ?? null;
        if (!state?.stage) continue;
        try {
          const ein = client.a2p_ein_encrypted ? decryptEin(client.a2p_ein_encrypted) : undefined;
          const info = buildA2pBusinessInfo(client, ein);
          const result = await advanceA2pPipeline(info, client.twilio_phone_sid, state as A2pPipelineState);
          await supabase
            .from("clients")
            .update({ a2p_pipeline: result.state, a2p_status: result.a2pStatus })
            .eq("id", client.id);
          checked++;
        } catch {
          // Soft-fail this client — tried again on the next run.
        }
      }
      return { checked };
    });
  },
);

type ReviewBlastContactEvent = {
  name: "portal/review_blast.contact_started";
  data: {
    clientId: string;
    contactId: string;
    phone: string;
    from: string;
    reviewToken: string;
    firstName: string;
    firstMessageBody: string;
    firstSendAt: string;
    reminderSendAt: string;
    /** When this import batch was confirmed — the "has this contact
     * replied since" check anchors here, same role as review_request's
     * completedAt. */
    since: string;
  };
};

export const reviewBlastContact = inngest.createFunction(
  {
    id: "review-blast-contact",
    triggers: [{ event: "portal/review_blast.contact_started" }],
  },
  async ({
    event,
    step,
  }: {
    event: ReviewBlastContactEvent;
    step: StepWithSleepUntil;
  }) => {
    const {
      clientId,
      contactId,
      phone,
      from,
      reviewToken,
      firstName,
      firstMessageBody,
      firstSendAt,
      reminderSendAt,
      since,
    } = event.data;
    const supabase = createAdminClient();

    await step.sleepUntil("wait-first-send", new Date(firstSendAt));

    const gate1 = await shouldStopReviewBlast(supabase, {
      clientId,
      phone,
      contactId,
      since,
      reviewToken,
      checkClicked: false,
    });
    if (gate1.stop) {
      await supabase.from("workflow_runs").insert({
        client_id: clientId,
        trigger: "review_blast",
        status: "skipped",
        log: { contactId, step: 1, reason: gate1.reason },
      });
      return { stopped: true, at: 1, reason: gate1.reason };
    }

    await step.run("send-1", () =>
      getSmsProvider().send({ to: phone, from, body: firstMessageBody }),
    );
    await step.run("log-sent-1", async () => {
      await supabase.from("workflow_runs").insert({
        client_id: clientId,
        trigger: "review_blast",
        status: "sent",
        log: { contactId, step: 1, to: phone },
      });
    });

    await step.sleepUntil("wait-reminder", new Date(reminderSendAt));

    const gate2 = await shouldStopReviewBlast(supabase, {
      clientId,
      phone,
      contactId,
      since,
      reviewToken,
      checkClicked: true,
    });
    if (gate2.stop) {
      await supabase.from("workflow_runs").insert({
        client_id: clientId,
        trigger: "review_blast",
        status: "skipped",
        log: { contactId, step: 2, reason: gate2.reason },
      });
      return { stopped: true, at: 2, reason: gate2.reason };
    }

    const { data: client } = await supabase
      .from("clients")
      .select("business_name")
      .eq("id", clientId)
      .maybeSingle();
    const reviewUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/r/${reviewToken}`;
    const reminderBody = buildReviewBlastReminderMessage({
      firstName,
      businessName: client?.business_name ?? "us",
      reviewLink: reviewUrl,
    });

    await step.run("send-2", () =>
      getSmsProvider().send({ to: phone, from, body: reminderBody }),
    );
    await step.run("log-sent-2", async () => {
      await supabase.from("workflow_runs").insert({
        client_id: clientId,
        trigger: "review_blast",
        status: "sent",
        log: { contactId, step: 2, to: phone },
      });
    });

    return { ok: true };
  },
);

export const functions = [
  leadAutoReply,
  leadUnansweredFollowUp,
  leadSlaNudge,
  missedCallTextBack,
  appointmentReminder,
  reviewRequestDrip,
  reviewBlastContact,
  invoiceReminder,
  invoiceFollowUp,
  quoteFollowUp,
  rebookingNudge,
  monthlyResultsEmail,
  healthMonitor,
  emailDomainVerificationPoll,
  a2pPipelinePoll,
];
