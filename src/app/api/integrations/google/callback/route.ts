import { cookies } from "next/headers";
import { requireMembership } from "@/lib/auth/session";
import { exchangeGoogleCode } from "@/lib/integrations/google";
import { encryptToken } from "@/lib/integrations/token-encryption";
import { OAUTH_STATE_COOKIE } from "../connect/route";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const { supabase, client, user, role } = await requireMembership();
  if (!client) {
    return Response.redirect(new URL("/settings", url.origin));
  }
  if (role !== "owner" && role !== "sitewyre_admin") {
    return Response.redirect(new URL("/settings", url.origin));
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(OAUTH_STATE_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    return Response.redirect(
      new URL("/settings?calendar_error=invalid_state", url.origin),
    );
  }

  try {
    const tokens = await exchangeGoogleCode(code);
    if (!tokens.refresh_token) {
      return Response.redirect(
        new URL("/settings?calendar_error=no_refresh_token", url.origin),
      );
    }

    await supabase.from("calendar_connections").upsert(
      {
        client_id: client.id,
        provider: "google",
        access_token_encrypted: encryptToken(tokens.access_token),
        refresh_token_encrypted: encryptToken(tokens.refresh_token),
        expires_at: new Date(
          tokens.expiry_date ?? Date.now() + 3600 * 1000,
        ).toISOString(),
        calendar_id: "primary",
        connected_by_user_id: user.id,
      },
      { onConflict: "client_id" },
    );
  } catch (err) {
    console.error("Google calendar connect failed", err);
    return Response.redirect(
      new URL("/settings?calendar_error=connect_failed", url.origin),
    );
  }

  return Response.redirect(new URL("/settings?calendar=connected", url.origin));
}
