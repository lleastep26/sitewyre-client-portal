import { nanoid } from "nanoid";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Database } from "@/lib/supabase/types";
import { applyTradePreset } from "@/lib/crm/apply-trade-preset";
import type { createAccountSchema } from "@/lib/validation/leads";
import { getEmailProvider } from "@/lib/adapters";
import { ensureClientAutomations } from "@/lib/automations";
import { welcomeEmailHtml } from "@/lib/email/welcome";
import { SITEWYRE_AGENCY_ID } from "@/lib/agencies";
import { normalizeHost, normalizePhone } from "@/lib/utils";

type Admin = SupabaseClient<Database>;
type AccountInput = z.infer<typeof createAccountSchema>;

export type CreateClientResult =
  | { ok: true; clientId: string; siteKey: string; twilioPhoneNumber: string | null }
  | { error: string };

/**
 * The one place a new client account gets created, so every entry point
 * (the n8n-facing /api/internal/accounts route, and the admin "Add
 * client" form) seeds the same trade preset, automations and welcome
 * email, and never forgets to set agency_id.
 */
export async function createClientAccount(
  supabase: Admin,
  input: AccountInput,
  options: { agencyId?: string; actorId?: string; auditVia: string },
): Promise<CreateClientResult> {
  const agencyId = options.agencyId ?? SITEWYRE_AGENCY_ID;
  const siteKey = nanoid(24);

  let ownerUserId = input.owner_user_id ?? null;
  if (!ownerUserId) {
    const { data: created, error: createErr } =
      await supabase.auth.admin.createUser({
        email: input.email,
        email_confirm: true,
        phone: input.phone ? normalizePhone(input.phone) : undefined,
        user_metadata: { business_name: input.business_name },
      });
    if (createErr || !created.user) {
      // Maybe user already exists
      const { data: listed } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      const existing = listed.users.find(
        (u) => u.email?.toLowerCase() === input.email.toLowerCase(),
      );
      if (!existing) {
        return { error: createErr?.message ?? "Unable to create user" };
      }
      ownerUserId = existing.id;
    } else {
      ownerUserId = created.user.id;
    }
  }

  // Creating an account never buys a Twilio number. Numbers cost money,
  // so they are only bought through the Phone tab or /admin, which show
  // the price and ask for confirmation first.
  const { data: client, error } = await supabase
    .from("clients")
    .insert({
      agency_id: agencyId,
      user_id: ownerUserId,
      business_name: input.business_name,
      trade: input.trade,
      service_area: input.service_area ?? null,
      phone: input.phone ? normalizePhone(input.phone) : null,
      domain: input.domain ? normalizeHost(input.domain) : null,
      live_site_url: input.live_site_url ?? null,
      brand_colors: input.brand_colors ?? {},
      timezone: input.timezone ?? "America/Chicago",
      site_key: siteKey,
      plan: "contractor_299",
      status: "active",
      twilio_phone_number: null,
      twilio_phone_sid: null,
      a2p_status: "pending",
      setup_checklist: {
        verify_phone: false,
        test_form: false,
        add_services: false,
        connect_stripe: false,
        google_review: false,
        invite_crew: false,
      },
    })
    .select("*")
    .single();

  if (error || !client) {
    console.error(error);
    return { error: "Unable to create account" };
  }

  await supabase.from("memberships").upsert(
    {
      user_id: ownerUserId,
      client_id: client.id,
      role: "owner",
    },
    { onConflict: "user_id,client_id" },
  );

  await applyTradePreset(supabase, client.id, input.trade);
  await ensureClientAutomations(supabase, client.id);

  await supabase.from("audit_log").insert({
    actor_id: options.actorId ?? ownerUserId,
    action: "account.created",
    entity: "clients",
    entity_id: client.id,
    client_id: client.id,
    diff: { via: options.auditVia },
  });

  // Welcome email (best-effort)
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    await getEmailProvider().send({
      to: input.email,
      subject: "Your Sitewyre portal is ready",
      html: welcomeEmailHtml({
        businessName: input.business_name,
        loginUrl: `${appUrl}/login`,
      }),
    });
  } catch (err) {
    console.warn("Welcome email skipped", err);
  }

  return {
    ok: true,
    clientId: client.id,
    siteKey: client.site_key ?? siteKey,
    twilioPhoneNumber: client.twilio_phone_number,
  };
}
