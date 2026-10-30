import { inngest } from "./client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailProvider, getSmsProvider } from "@/lib/adapters";
import { getTradePreset } from "@/lib/trade-presets";
import { normalizePhone } from "@/lib/utils";
import { nextSendableAt } from "@/lib/scheduling/quiet-hours";

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

    await respectQuietHours(step, client.timezone ?? "America/Chicago");

    const preset = getTradePreset(client.trade ?? "other");
    const template =
      preset.templates.find((t) => t.key === "lead_auto_reply")?.body ??
      "Hi {{first_name}}, thanks for contacting {{business_name}}.";
    const firstName = name.split(" ")[0] ?? name;
    const body = template
      .replaceAll("{{first_name}}", firstName)
      .replaceAll("{{business_name}}", client.business_name ?? "us");

    const sms = getSmsProvider();
    const to = normalizePhone(phone);
    if (to && client.twilio_phone_number) {
      await step.run("sms-homeowner", async () =>
        sms.send({ to, from: client.twilio_phone_number ?? undefined, body }),
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
    const body = `Hi ${firstName}, just checking in from ${client.business_name ?? "us"} — still happy to help whenever you're ready.`;

    await step.run("sms-follow-up", async () =>
      getSmsProvider().send({
        to,
        from: client.twilio_phone_number!,
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
    const { data: client } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .single();
    if (!client?.twilio_phone_number) return { skipped: true };

    await respectQuietHours(step, client.timezone ?? "America/Chicago");

    const sms = getSmsProvider();
    await step.run("sms-missed", async () =>
      sms.send({
        to: normalizePhone(from),
        from: client.twilio_phone_number!,
        body: `Sorry we missed your call to ${client.business_name}. How can we help?`,
      }),
    );

    await step.run("log-missed", async () => {
      await supabase.from("workflow_runs").insert({
        client_id: clientId,
        trigger: "missed_call_text_back",
        status: "sent",
        log: { from },
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

    let timeZone = "America/Chicago";
    if (clientId) {
      const supabase = createAdminClient();
      const { data: client } = await supabase
        .from("clients")
        .select("timezone")
        .eq("id", clientId)
        .maybeSingle();
      timeZone = client?.timezone ?? timeZone;
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
      const subject =
        attempt === 1
          ? `Reminder: invoice ${invoice.number}`
          : `Past due: invoice ${invoice.number}`;
      const body =
        attempt === 1
          ? `Friendly reminder from ${client.business_name}: $${remaining.toFixed(2)} due on invoice ${invoice.number}. Pay: ${link}`
          : `Second reminder from ${client.business_name}: $${remaining.toFixed(2)} still due on ${invoice.number}. Pay: ${link}`;

      if (email) {
        await getEmailProvider().send({
          to: email,
          subject,
          html: `<p>${body}</p><p><a href="${link}">${link}</a></p>`,
          text: body,
        });
      }
      if (phone && client.twilio_phone_number) {
        await getSmsProvider().send({
          to: phone,
          from: client.twilio_phone_number,
          body,
        });
      }

      await supabase.from("workflow_runs").insert({
        client_id: clientId,
        trigger: "invoice_reminder",
        status: email || phone ? "sent" : "skipped",
        log: { invoiceId, attempt, remaining, email, phone },
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
      const body =
        attempt === 1
          ? `Friendly reminder: your quote ${quote.number} from ${client.business_name} is ready: ${link}`
          : `Last reminder: quote ${quote.number} from ${client.business_name} expires soon: ${link}`;

      if (phone && client.twilio_phone_number) {
        await getSmsProvider().send({
          to: phone,
          from: client.twilio_phone_number,
          body,
        });
      }
      if (email) {
        await getEmailProvider().send({
          to: email,
          subject: `Reminder: quote ${quote.number}`,
          html: `<p>${body}</p>`,
          text: body,
        });
      }

      await supabase.from("workflow_runs").insert({
        client_id: clientId,
        trigger: "quote_follow_up",
        status: phone || email ? "sent" : "skipped",
        log: { quoteId, attempt, phone, email },
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const link = `${appUrl}/book/${client.site_key}`;
    const body = `Hi from ${client.business_name} — ready to book your next visit? ${link}`;

    await step.run("sms-rebook", async () =>
      getSmsProvider().send({
        to: phone!,
        from: client.twilio_phone_number!,
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
      return { ok: res.ok, status: res.status };
    });
  },
);

export const functions = [
  leadAutoReply,
  leadUnansweredFollowUp,
  missedCallTextBack,
  appointmentReminder,
  invoiceReminder,
  invoiceFollowUp,
  quoteFollowUp,
  rebookingNudge,
  monthlyResultsEmail,
  healthMonitor,
];
