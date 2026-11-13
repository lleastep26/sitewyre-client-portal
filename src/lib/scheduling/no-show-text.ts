import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { applyTemplate } from "@/lib/automations";
import { resolveSmsFrom } from "@/lib/a2p/sending";
import { sendFunnelMessage } from "@/lib/funnels/send";
import { isWithinFunnelWindow } from "@/lib/funnels/quiet-hours";

type NoShowClient = Pick<
  Database["public"]["Tables"]["clients"]["Row"],
  "id" | "business_name" | "timezone" | "a2p_status" | "a2p_pipeline" | "twilio_phone_number"
>;

export type NoShowTextResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string };

/**
 * The "we missed you" text sent when an owner marks an appointment as a
 * no-show. It is a customer text like any other, so it goes through the
 * shared send (opt-out check, A2P gate, logging) and is not sent during
 * quiet hours.
 */
export async function sendNoShowText(
  supabase: SupabaseClient<Database>,
  client: NoShowClient,
  params: { contactId: string; phone: string | null | undefined; title: string | null },
  now: Date = new Date(),
): Promise<NoShowTextResult> {
  const from = resolveSmsFrom(client);
  if (!params.phone || !from) return { status: "skipped", reason: "no_phone_or_number" };

  if (!isWithinFunnelWindow(now, client.timezone ?? "America/Chicago")) {
    await supabase.from("workflow_runs").insert({
      client_id: client.id,
      trigger: "no_show_text",
      status: "skipped",
      log: { to: params.phone, contactId: params.contactId, reason: "quiet_hours" },
    });
    return { status: "skipped", reason: "quiet_hours" };
  }

  const body = applyTemplate(
    "Hi, we missed you for your {{title}} appointment with {{business_name}} — give us a call to reschedule.",
    { title: params.title ?? "scheduled", business_name: client.business_name ?? "us" },
  );
  const result = await sendFunnelMessage(supabase, {
    clientId: client.id,
    trigger: "no_show_text",
    to: params.phone,
    from,
    body,
    contactId: params.contactId,
  });
  return result.status === "sent"
    ? { status: "sent" }
    : { status: "skipped", reason: result.reason };
}
