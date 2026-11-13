import type { A2pPipelineState } from "./trust-hub";

export type A2pSendingClient = {
  a2p_status: string | null;
  a2p_pipeline: unknown;
  twilio_phone_number: string | null;
};

/**
 * Once a client's A2P campaign is approved, send through their own
 * Messaging Service (the number registered under it) rather than the raw
 * phone number — everyone else keeps sending from the raw number exactly
 * as before, unchanged.
 */
export function resolveSmsFrom(client: A2pSendingClient | null | undefined): string | null {
  if (!client) return null;
  if (client.a2p_status === "approved") {
    const pipeline = client.a2p_pipeline as Partial<A2pPipelineState> | null;
    if (pipeline?.messagingServiceSid) return pipeline.messagingServiceSid;
  }
  return client.twilio_phone_number;
}

/**
 * Sender for texts to the business owner's own phone (alerts, after-call
 * summaries). A client with an approved campaign uses their own Messaging
 * Service. Everyone else gets `undefined`, which makes the SMS adapter
 * send from Sitewyre's own registered sender: carriers reject texts from
 * a business number that isn't registered yet (Twilio error 30034), so an
 * owner alert sent from it would never arrive.
 */
export function resolveOwnerAlertFrom(
  client: A2pSendingClient | null | undefined,
): string | undefined {
  if (client?.a2p_status !== "approved") return undefined;
  const pipeline = client.a2p_pipeline as Partial<A2pPipelineState> | null;
  return pipeline?.messagingServiceSid ?? undefined;
}
