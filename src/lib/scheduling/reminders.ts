import { inngest } from "@/lib/inngest/client";
import { normalizePhone } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Send booking confirmation immediately and schedule a ~24h-before reminder
 * when the appointment is more than 24h out. Soft-fails when Twilio/from/to
 * are missing (same pattern as lead SMS).
 */
export async function enqueueAppointmentSms(opts: {
  to: string | null | undefined;
  from: string | null | undefined;
  businessName: string;
  title: string;
  startAt: Date;
}) {
  const to = opts.to ? normalizePhone(opts.to) : "";
  const from = opts.from?.trim() || "";
  if (!to || !from) return { skipped: true as const };

  const when = opts.startAt.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  await inngest
    .send({
      name: "portal/appointment.reminder",
      data: {
        to,
        from,
        body: `You're booked with ${opts.businessName} on ${when}. Reply C to confirm.`,
      },
    })
    .catch(() => undefined);

  const reminderAt = opts.startAt.getTime() - DAY_MS;
  if (reminderAt > Date.now() + 60_000) {
    await inngest
      .send({
        name: "portal/appointment.reminder",
        data: {
          to,
          from,
          body: `Reminder: ${opts.title} tomorrow with ${opts.businessName} at ${when}.`,
        },
        ts: reminderAt,
      })
      .catch(() => undefined);
    return { confirmation: true as const, reminder: true as const };
  }

  return { confirmation: true as const, reminder: false as const };
}
