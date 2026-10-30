import { inngest } from "@/lib/inngest/client";
import { normalizePhone } from "@/lib/utils";
import { nextSendableAt } from "./quiet-hours";
import {
  applyTemplate,
  getAutomationState,
  getDefaultTemplate,
} from "@/lib/automations";
import { createAdminClient } from "@/lib/supabase/admin";

const DAY_MS = 24 * 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

const REMINDER_24H_DEFAULT =
  "Reminder: {{title}} tomorrow with {{business_name}} at {{when}}.";
const REMINDER_2H_DEFAULT =
  "Heads up: {{title}} with {{business_name}} in about 2 hours ({{when}}).";

async function sendOrSchedule(opts: {
  to: string;
  from: string;
  body: string;
  clientId?: string;
  trigger: string;
  at: Date;
  timeZone: string;
}) {
  const sendAt = nextSendableAt(opts.at, opts.timeZone);
  const payload = {
    name: "portal/appointment.reminder" as const,
    data: {
      to: opts.to,
      from: opts.from,
      body: opts.body,
      clientId: opts.clientId,
      trigger: opts.trigger,
    },
  };
  if (sendAt.getTime() <= Date.now() + 5_000) {
    await inngest.send(payload).catch(() => undefined);
  } else {
    await inngest
      .send({ ...payload, ts: sendAt.getTime() })
      .catch(() => undefined);
  }
}

/**
 * Confirmation now (or after quiet hours), ~24h-before and ~2h-before
 * when those targets are still in the future. Soft-fails without Twilio.
 * Confirmation SMS uses Automations → appointment_reminder template.
 */
export async function enqueueAppointmentSms(opts: {
  to: string | null | undefined;
  from: string | null | undefined;
  businessName: string;
  title: string;
  startAt: Date;
  clientId?: string;
  timeZone?: string | null;
}) {
  const to = opts.to ? normalizePhone(opts.to) : "";
  const from = opts.from?.trim() || "";
  if (!to || !from) return { skipped: true as const };

  const timeZone = opts.timeZone?.trim() || "America/Chicago";
  const when = opts.startAt.toLocaleString("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const vars = {
    business_name: opts.businessName,
    title: opts.title,
    when,
  };

  let confirmTemplate =
    getDefaultTemplate("appointment_reminder") ??
    "You're booked with {{business_name}} on {{when}}. Reply C to confirm.";
  if (opts.clientId) {
    try {
      const supabase = createAdminClient();
      const auto = await getAutomationState(
        supabase,
        opts.clientId,
        "appointment_reminder",
      );
      if (auto.templateBody) confirmTemplate = auto.templateBody;
    } catch {
      // Soft-fail: keep default confirmation copy.
    }
  }

  await sendOrSchedule({
    to,
    from,
    body: applyTemplate(confirmTemplate, vars),
    clientId: opts.clientId,
    trigger: "appointment_confirmation",
    at: new Date(),
    timeZone,
  });

  let reminder24 = false;
  let reminder2h = false;
  const at24 = opts.startAt.getTime() - DAY_MS;
  if (at24 > Date.now() + 60_000) {
    await sendOrSchedule({
      to,
      from,
      body: applyTemplate(REMINDER_24H_DEFAULT, vars),
      clientId: opts.clientId,
      trigger: "appointment_reminder_24h",
      at: new Date(at24),
      timeZone,
    });
    reminder24 = true;
  }

  const at2h = opts.startAt.getTime() - TWO_HOURS_MS;
  if (at2h > Date.now() + 60_000) {
    await sendOrSchedule({
      to,
      from,
      body: applyTemplate(REMINDER_2H_DEFAULT, vars),
      clientId: opts.clientId,
      trigger: "appointment_reminder_2h",
      at: new Date(at2h),
      timeZone,
    });
    reminder2h = true;
  }

  return {
    confirmation: true as const,
    reminder: reminder24,
    reminder2h,
  };
}
