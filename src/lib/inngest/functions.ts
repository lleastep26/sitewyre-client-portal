import { inngest } from "./client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailProvider, getSmsProvider } from "@/lib/adapters";
import { getTradePreset } from "@/lib/trade-presets";
import { normalizePhone } from "@/lib/utils";

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

export const leadAutoReply = inngest.createFunction(
  { id: "lead-auto-reply", triggers: [{ event: "portal/lead.created" }] },
  async ({ event, step }: { event: LeadEvent; step: { sleep: (id: string, d: string) => Promise<void>; run: <T>(id: string, fn: () => Promise<T>) => Promise<T> } }) => {
    const { clientId, leadId, phone, email, name } = event.data;
    await step.sleep("wait-brief", "2s");

    const supabase = createAdminClient();
    const { data: client } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .single();

    if (!client) return { skipped: true };

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

export const missedCallTextBack = inngest.createFunction(
  { id: "missed-call-text-back", triggers: [{ event: "portal/call.missed" }] },
  async ({
    event,
    step,
  }: {
    event: { data: { clientId: string; from: string } };
    step: { sleep: (id: string, d: string) => Promise<void> };
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

    const sms = getSmsProvider();
    await sms.send({
      to: normalizePhone(from),
      from: client.twilio_phone_number,
      body: `Sorry we missed your call to ${client.business_name}. How can we help?`,
    });

    await supabase.from("workflow_runs").insert({
      client_id: clientId,
      trigger: "missed_call_text_back",
      status: "sent",
      log: { from },
    });

    return { ok: true };
  },
);

export const appointmentReminder = inngest.createFunction(
  { id: "appointment-reminder", triggers: [{ event: "portal/appointment.reminder" }] },
  async ({
    event,
  }: {
    event: { data: { to: string; body: string; from?: string } };
  }) => {
    const { to, body, from } = event.data;
    if (!to) return { skipped: true };
    const sms = getSmsProvider();
    await sms.send({ to, body, from });
    return { ok: true };
  },
);

export const invoiceReminder = inngest.createFunction(
  { id: "invoice-reminder", triggers: [{ event: "portal/invoice.reminder" }] },
  async ({
    event,
  }: {
    event: { data: { to: string; subject: string; html: string } };
  }) => {
    const { to, subject, html } = event.data;
    const mail = getEmailProvider();
    await mail.send({ to, subject, html });
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
  missedCallTextBack,
  appointmentReminder,
  invoiceReminder,
  healthMonitor,
];
