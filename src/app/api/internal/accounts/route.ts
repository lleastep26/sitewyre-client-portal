import { nanoid } from "nanoid";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyTradePreset } from "@/lib/crm/apply-trade-preset";
import { createAccountSchema } from "@/lib/validation/leads";
import { getSmsProvider } from "@/lib/adapters";
import { normalizeHost, normalizePhone } from "@/lib/utils";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  const secret = process.env.INTERNAL_API_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return unauthorized();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = createAccountSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const supabase = createAdminClient();
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
        return Response.json(
          { error: createErr?.message ?? "Unable to create user" },
          { status: 500 },
        );
      }
      ownerUserId = existing.id;
    } else {
      ownerUserId = created.user.id;
    }
  }

  let twilioPhone: string | null = null;
  let twilioSid: string | null = null;
  try {
    if (input.area_code || input.phone) {
      const area =
        input.area_code ??
        normalizePhone(input.phone ?? "").replace("+1", "").slice(0, 3);
      if (area.length === 3) {
        const bought = await getSmsProvider().buyLocalNumber(area);
        twilioPhone = bought.phoneNumber;
        twilioSid = bought.sid;
      }
    }
  } catch (err) {
    console.warn("Twilio number provision skipped", err);
  }

  const { data: client, error } = await supabase
    .from("clients")
    .insert({
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
      twilio_phone_number: twilioPhone,
      twilio_phone_sid: twilioSid,
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
    return Response.json({ error: "Unable to create account" }, { status: 500 });
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

  await supabase.from("audit_log").insert({
    actor_id: ownerUserId,
    action: "account.created",
    entity: "clients",
    entity_id: client.id,
    client_id: client.id,
    diff: { via: "n8n_internal_api" },
  });

  // Magic link welcome (best-effort)
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: input.email,
      options: { redirectTo: `${appUrl}/auth/callback` },
    });
  } catch (err) {
    console.warn("Welcome magic link skipped", err);
  }

  return Response.json({
    ok: true,
    client_id: client.id,
    site_key: client.site_key,
    twilio_phone_number: client.twilio_phone_number,
  });
}
