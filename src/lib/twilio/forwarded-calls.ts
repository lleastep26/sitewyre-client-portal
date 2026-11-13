import { normalizePhone } from "@/lib/utils";

/**
 * Forwarded calls: the client keeps their own business number and sets
 * conditional call forwarding (busy / no answer) from it to their Sitewyre
 * number. Their phone has already rung by the time the call gets here, so
 * it goes straight to the AI receptionist instead of ringing them again.
 *
 * Twilio's ForwardedFrom can't be the only signal: its docs say the value
 * depends on the forwarding carrier and not every carrier passes it. So
 * the client's own "my number forwards to Sitewyre" setting is the main
 * signal, and ForwardedFrom is the safety net for clients who set up
 * forwarding on their phone without turning the setting on.
 */

export const REJECT_TWIML = '<Response><Reject reason="busy"/></Response>';

export type ForwardingClient = {
  forward_to_phone: string | null;
  phone?: string | null;
  business_line_phone?: string | null;
  call_forwarding_enabled?: boolean | null;
};

/** Every number that belongs to the business itself, normalised. */
export function ownNumbers(client: ForwardingClient): string[] {
  return [client.business_line_phone, client.forward_to_phone, client.phone]
    .map((n) => normalizePhone(n ?? ""))
    .filter(Boolean);
}

export type InboundCallKind =
  /** One of our own calls to the owner (the emergency ring), sent back to
   * us by the owner's call forwarding. Never answer it. */
  | { kind: "own_leg" }
  | {
      kind: "forwarded";
      /** Saved on the call: the number it was forwarded from. */
      forwardedFrom: string;
      /** Known only from ForwardedFrom, so it may also be our own ring to
       * the owner coming back; check for a live call before answering. */
      mayBeBounce: boolean;
      /** False when caller ID is the business's own number: the carrier
       * replaced the real caller's number with the forwarding line's. */
      callerKnown: boolean;
    }
  | { kind: "direct" };

export function classifyInboundCall(
  client: ForwardingClient,
  call: { from: string; to: string; forwardedFrom: string },
): InboundCallKind {
  const from = normalizePhone(call.from);
  const to = normalizePhone(call.to);
  if (from && from === to) return { kind: "own_leg" };

  const own = ownNumbers(client);
  const forwardedFrom = normalizePhone(call.forwardedFrom);
  const settingOn = client.call_forwarding_enabled === true;
  const forwardedFromOwn = !!forwardedFrom && own.includes(forwardedFrom);
  if (!settingOn && !forwardedFromOwn) return { kind: "direct" };

  return {
    kind: "forwarded",
    forwardedFrom:
      forwardedFrom || normalizePhone(client.business_line_phone ?? "") || "unknown",
    mayBeBounce: !settingOn,
    callerKnown: !!from && !own.includes(from),
  };
}
