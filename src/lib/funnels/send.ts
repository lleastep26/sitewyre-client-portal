import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getSmsProvider } from "@/lib/adapters";
import { isOptedOut, logSkippedOptOut } from "./opt-out";

export type SendFunnelMessageParams = {
  clientId: string;
  trigger: string;
  to: string;
  from: string;
  body: string;
  contactId?: string | null;
};

export type SendFunnelMessageResult =
  | { status: "sent"; sid: string }
  | { status: "skipped"; reason: "opted_out" };

/**
 * Opt-out check, then send + log to messages/workflow_runs. Quiet-hours
 * timing is the caller's responsibility (see quiet-hours.ts) — this only
 * guards against sending to an opted-out number.
 */
export async function sendFunnelMessage(
  supabase: SupabaseClient<Database>,
  params: SendFunnelMessageParams,
): Promise<SendFunnelMessageResult> {
  const { clientId, trigger, to, from, body, contactId } = params;

  if (await isOptedOut(supabase, clientId, to, contactId)) {
    await logSkippedOptOut(supabase, {
      clientId,
      trigger,
      log: { to, contactId },
    });
    return { status: "skipped", reason: "opted_out" };
  }

  const sms = await getSmsProvider().send({ to, from, body });

  if (contactId) {
    await supabase.from("messages").insert({
      client_id: clientId,
      contact_id: contactId,
      channel: "sms",
      direction: "outbound",
      body,
      status: sms.status,
      external_id: sms.id,
    });
  }

  await supabase.from("workflow_runs").insert({
    client_id: clientId,
    trigger,
    status: "sent",
    log: { to, contactId, sid: sms.id },
  });

  return { status: "sent", sid: sms.id };
}
