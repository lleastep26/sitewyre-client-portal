"use server";

import { requireMembership } from "@/lib/auth/session";
import { getSmsProvider } from "@/lib/adapters";

export async function createSupportTicket(input: {
  subject: string;
  body: string;
  urgent?: boolean;
}) {
  const { supabase, user, client } = await requireMembership();
  if (!client) return { error: "No client" };

  const priority = input.urgent ? "urgent" : "normal";
  const { error } = await supabase.from("support_tickets").insert({
    client_id: client.id,
    user_id: user.id,
    subject: input.subject,
    priority,
    status: "open",
    messages: [
      {
        body: input.body,
        at: new Date().toISOString(),
        from: user.email ?? user.phone ?? user.id,
      },
    ],
  });

  if (error) return { error: error.message };

  if (input.urgent && process.env.ADMIN_ALERT_PHONE) {
    try {
      await getSmsProvider().send({
        to: process.env.ADMIN_ALERT_PHONE,
        body: `URGENT Sitewyre support from ${client.business_name}: ${input.body.slice(0, 120)}`,
      });
    } catch (err) {
      console.error("Urgent alert failed", err);
    }
  }

  return { ok: true };
}
