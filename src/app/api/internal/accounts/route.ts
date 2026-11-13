import { createAdminClient } from "@/lib/supabase/admin";
import { createAccountSchema } from "@/lib/validation/leads";
import { createClientAccount } from "@/lib/accounts/create-client";

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

  const supabase = createAdminClient();
  const result = await createClientAccount(supabase, parsed.data, {
    auditVia: "n8n_internal_api",
  });

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 500 });
  }

  return Response.json({
    ok: true,
    client_id: result.clientId,
    site_key: result.siteKey,
    twilio_phone_number: result.twilioPhoneNumber,
  });
}
