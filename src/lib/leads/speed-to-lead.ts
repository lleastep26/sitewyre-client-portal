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
