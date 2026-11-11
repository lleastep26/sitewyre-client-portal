import { normalizePhone } from "@/lib/utils";

export type A2pGateClient = { a2p_status: string | null; phone: string | null };

/**
 * Carriers filter and block unregistered A2P 10DLC traffic, so every
 * outbound text is blocked unless the client's registration is explicitly
 * "approved" — missing/pending/failed/unknown all block, by design (fail
 * closed, not fail open). The one exception: a contractor alert sent to
 * the business's own phone isn't customer-facing A2P traffic the same way,
 * so it's always allowed regardless of registration status.
 */
export function checkA2pGate(
  client: A2pGateClient | null | undefined,
  toPhone: string,
): { allowed: true } | { allowed: false; reason: string } {
  if (!client) {
    return { allowed: false, reason: "a2p_unknown" };
  }
  if (client.a2p_status === "approved") {
    return { allowed: true };
  }
  if (client.phone && normalizePhone(client.phone) === normalizePhone(toPhone)) {
    return { allowed: true };
  }
  return { allowed: false, reason: `a2p_${client.a2p_status ?? "pending"}` };
}
