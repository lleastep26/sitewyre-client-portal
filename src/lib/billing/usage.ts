/** Inclusive start of the calendar month containing `now` (UTC). */
export function monthStartIso(now: Date = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  ).toISOString();
}

export function monthLabel(now: Date = new Date()): string {
  return now.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export type UsageCounts = {
  smsOutbound: number;
  emailOutbound: number;
  workflowRuns: number;
  monthLabel: string;
};
