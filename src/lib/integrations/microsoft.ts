/** Outlook/Microsoft Graph Calendar OAuth helpers. */

export type MicrosoftTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

/**
 * Narrowest scope that works: Microsoft Graph has no separate
 * freebusy-only permission the way Google does — Calendars.ReadWrite is
 * the minimum that covers both reading getSchedule (busy times) and
 * creating/updating/deleting events. offline_access is required to get a
 * refresh_token back at all.
 */
export const MICROSOFT_CALENDAR_SCOPES = ["offline_access", "Calendars.ReadWrite"];

const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";

export function getMicrosoftAuthUrl(state: string) {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const redirect = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/microsoft/callback`;
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    response_mode: "query",
    scope: MICROSOFT_CALENDAR_SCOPES.join(" "),
    state,
  });
  return `${AUTHORITY}/authorize?${params}`;
}

export async function exchangeMicrosoftCode(code: string): Promise<MicrosoftTokens> {
  const redirect = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/microsoft/callback`;
  const res = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
      client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
      redirect_uri: redirect,
      code,
      grant_type: "authorization_code",
      scope: MICROSOFT_CALENDAR_SCOPES.join(" "),
    }),
  });
  if (!res.ok) throw new Error("Microsoft code exchange failed");
  return (await res.json()) as MicrosoftTokens;
}

export async function refreshMicrosoftToken(refreshToken: string): Promise<MicrosoftTokens> {
  const res = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
      client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: MICROSOFT_CALENDAR_SCOPES.join(" "),
    }),
  });
  if (!res.ok) throw new Error("Microsoft token refresh failed");
  return (await res.json()) as MicrosoftTokens;
}
