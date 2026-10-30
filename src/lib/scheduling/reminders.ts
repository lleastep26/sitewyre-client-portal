import { inngest } from "@/lib/inngest/client";
import { normalizePhone } from "@/lib/utils";
import { nextSendableAt } from "./quiet-hours";

const DAY_MS = 24 * 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

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

  await sendOrSchedule({
    to,
    from,
    body: `You're booked with ${opts.businessName} on ${when}. Reply C to confirm.`,
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
      body: `Reminder: ${opts.title} tomorrow with ${opts.businessName} at ${when}.`,
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
      body: `Heads up: ${opts.title} with ${opts.businessName} in about 2 hours (${when}).`,
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
