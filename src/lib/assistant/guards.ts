/**
 * Code-level checks around the AI text assistant, independent of what the
 * model decides: obvious emergencies and "get me a person" requests never
 * reach the model, and a drafted reply is never sent if it quotes a price,
 * states a clock time that isn't backed by anything, or claims a booking
 * that wasn't made.
 */

export type HandoffReason =
  | "unknown_answer"
  | "upset"
  | "wants_person"
  | "emergency"
  | "reply_cap"
  | "guard_blocked"
  | "error";

export const MODEL_HANDOFF_REASONS = ["unknown_answer", "upset", "wants_person", "emergency"] as const;

const EMERGENCY_PATTERN =
  /\b(emergency|911|flooding|flooded|gas leak|gas smell|smell(s|ing)? gas|carbon monoxide|burst pipe|on fire|fire|smoke|sparking|electrocuted)\b/i;

const WANTS_PERSON_PATTERN =
  /\b(real person|a human|human being|(speak|talk) (to|with) (someone|somebody|a person|the owner|a manager|a real)|call me|representative|operator)\b/i;

export function detectHandoffKeyword(text: string): "emergency" | "wants_person" | null {
  if (EMERGENCY_PATTERN.test(text)) return "emergency";
  if (WANTS_PERSON_PATTERN.test(text)) return "wants_person";
  return null;
}

const PRICE_PATTERN = /\$\s?\d|\b\d+(\.\d+)?\s?(dollars|bucks|usd)\b/i;

const BOOKING_CLAIM_PATTERN =
  /\b(you('|’)?re (all )?(booked|scheduled|confirmed)|you are (all )?(booked|scheduled|confirmed)|i('|’)?ve (booked|scheduled)|i have (booked|scheduled)|appointment is (booked|confirmed|scheduled))\b/i;

/**
 * Each clock time mentioned in `text`, as the minutes-after-midnight values
 * it could mean. "2:30pm" is one value; a bare "2:30" could be am or pm, so
 * it yields both.
 */
export function parseClockTimes(text: string): number[][] {
  const mentions: number[][] = [];

  const meridiem = /\b(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?m\b/gi;
  for (const m of text.matchAll(meridiem)) {
    const hour = Number(m[1]);
    if (hour < 1 || hour > 12) continue;
    const minute = Number(m[2] ?? "0");
    const isPm = m[3]!.toLowerCase() === "p";
    mentions.push([((hour % 12) + (isPm ? 12 : 0)) * 60 + minute]);
  }

  const bare = /\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*[ap]\.?m\b)/gi;
  for (const m of text.matchAll(bare)) {
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    const values = [hour * 60 + minute];
    if (hour >= 1 && hour <= 11) values.push((hour + 12) * 60 + minute);
    mentions.push(values);
  }

  return mentions;
}

export type GuardResult =
  | { ok: true }
  | { ok: false; reason: "empty" | "price" | "unverified_time" | "unconfirmed_booking" };

/**
 * `allowedTimeText` is everything a clock time may legitimately come from:
 * the business knowledge (hours, FAQs), the conversation so far, and the
 * calendar tool results from this run.
 */
export function checkReplyGuards(
  reply: string,
  opts: { allowedTimeText: string; bookedThisRun: boolean },
): GuardResult {
  const text = reply.trim();
  if (!text) return { ok: false, reason: "empty" };
  if (PRICE_PATTERN.test(text)) return { ok: false, reason: "price" };
  if (!opts.bookedThisRun && BOOKING_CLAIM_PATTERN.test(text)) {
    return { ok: false, reason: "unconfirmed_booking" };
  }

  const allowed = new Set(parseClockTimes(opts.allowedTimeText).flat());
  for (const candidates of parseClockTimes(text)) {
    if (!candidates.some((minutes) => allowed.has(minutes))) {
      return { ok: false, reason: "unverified_time" };
    }
  }
  return { ok: true };
}
