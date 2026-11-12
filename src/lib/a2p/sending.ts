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
