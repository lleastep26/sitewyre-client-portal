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
  healthMonitor,
];
