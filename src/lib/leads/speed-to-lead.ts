/** Target minutes before an unanswered lead is flagged on Home / owner nudge. */
export const SPEED_TO_LEAD_SLA_MINUTES = 15;

/** Inngest sleep duration string for the owner SLA nudge. */
export const SPEED_TO_LEAD_SLA_SLEEP = `${SPEED_TO_LEAD_SLA_MINUTES}m` as const;

export function slaCutoffIso(now: Date = new Date()): string {
  return new Date(
    now.getTime() - SPEED_TO_LEAD_SLA_MINUTES * 60_000,
  ).toISOString();
}

/** True when a lead still needs a human reply for the owner SLA nudge. */
export function shouldNudgeOwnerForSla(lead: {
  id?: string | null;
  first_response_at: string | null;
} | null): boolean {
  return Boolean(lead?.id) && !lead?.first_response_at;
}

export function minutesWaiting(
  createdAt: string | Date,
  now: Date = new Date(),
): number {
  const created =
    typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  return Math.max(0, Math.floor((now.getTime() - created.getTime()) / 60_000));
}

export function isPastSpeedToLeadSla(
  lead: { created_at: string; first_response_at: string | null },
  now: Date = new Date(),
): boolean {
  if (lead.first_response_at) return false;
  return new Date(lead.created_at).getTime() <= Date.parse(slaCutoffIso(now));
}

export function formatWaitingLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m waiting`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem ? `${hours}h ${rem}m waiting` : `${hours}h waiting`;
}

export type SlaNudgeOutcome = {
  status: "sent" | "skipped";
  sms: "sent" | "no_owner_phone";
  push: "sent" | "no_push_key" | "no_push_devices";
  /** Set only when nothing went out. */
  reason?: string;
};

/**
 * What actually happened to the owner nudge, for the log. It only counts
 * as sent if a text went to the owner's mobile or a push reached at least
 * one device; otherwise it is logged as skipped with the reason.
 */
export function slaNudgeOutcome(input: {
  ownerPhone: string | null | undefined;
  push: { skipped?: boolean; sent?: number } | null | undefined;
}): SlaNudgeOutcome {
  const sms = input.ownerPhone ? "sent" : "no_owner_phone";
  const push = input.push?.skipped
    ? "no_push_key"
    : (input.push?.sent ?? 0) > 0
      ? "sent"
      : "no_push_devices";
  if (sms === "sent" || push === "sent") return { status: "sent", sms, push };
  return { status: "skipped", sms, push, reason: `${sms}_and_${push}` };
}
