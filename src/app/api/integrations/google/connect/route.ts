import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/auth/session";
import { getGoogleAuthUrl } from "@/lib/integrations/google";

export const OAUTH_STATE_COOKIE = "calendar_oauth_state";

export async function GET() {
  const { client, role } = await requireMembership();
  if (!client) redirect("/settings");
  if (role !== "owner" && role !== "sitewyre_admin") redirect("/settings");

  const state = randomBytes(24).toString("hex");
  const url = getGoogleAuthUrl(state);
  if (!url) redirect("/settings?calendar_error=not_configured");

  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  redirect(url);
}
