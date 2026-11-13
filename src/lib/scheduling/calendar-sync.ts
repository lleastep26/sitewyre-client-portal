import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarConnectionRow, Database } from "@/lib/supabase/types";
import { decryptToken, encryptToken } from "@/lib/integrations/token-encryption";
import { refreshGoogleToken } from "@/lib/integrations/google";
import { refreshMicrosoftToken } from "@/lib/integrations/microsoft";
import {
  createGoogleEvent,
  deleteGoogleEvent,
  listGoogleBusyTimes,
  updateGoogleEvent,
} from "@/lib/integrations/google-calendar";
import {
  createMicrosoftEvent,
  deleteMicrosoftEvent,
  listMicrosoftBusyTimes,
  updateMicrosoftEvent,
} from "@/lib/integrations/microsoft-calendar";

type Admin = SupabaseClient<Database>;
type BusyInterval = { start_at: string; end_at: string };

/** Access token refreshed if needed, with the refresh persisted back to
 * the row — never surfaces the plaintext refresh token to the caller. */
async function getFreshAccessToken(
  supabase: Admin,
  connection: CalendarConnectionRow,
): Promise<string> {
  const expiresAt = new Date(connection.expires_at).getTime();
  if (expiresAt > Date.now() + 60_000) {
    return decryptToken(connection.access_token_encrypted);
  }

  const refreshToken = decryptToken(connection.refresh_token_encrypted);
  if (connection.provider === "google") {
    const tokens = await refreshGoogleToken(refreshToken);
    const newExpiresAt = new Date(
      tokens.expiry_date ?? Date.now() + 3600 * 1000,
    ).toISOString();
    await supabase
      .from("calendar_connections")
      .update({
        access_token_encrypted: encryptToken(tokens.access_token),
        expires_at: newExpiresAt,
      })
      .eq("id", connection.id);
    return tokens.access_token;
  }

  const tokens = await refreshMicrosoftToken(refreshToken);
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  await supabase
    .from("calendar_connections")
    .update({
      access_token_encrypted: encryptToken(tokens.access_token),
      refresh_token_encrypted: tokens.refresh_token
        ? encryptToken(tokens.refresh_token)
        : connection.refresh_token_encrypted,
      expires_at: newExpiresAt,
    })
    .eq("id", connection.id);
  return tokens.access_token;
}

async function getConnection(
  supabase: Admin,
  clientId: string,
): Promise<CalendarConnectionRow | null> {
  const { data } = await supabase
    .from("calendar_connections")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();
  return data;
}

/**
 * Busy blocks from the connected calendar, merged alongside the portal's
 * own appointments. Fails open — any missing connection, expired-refresh
 * failure, or API error returns an empty list, so booking always falls
 * back to the portal calendar alone rather than erroring out.
 */
export async function getExternalBusyTimes(
  supabase: Admin,
  clientId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<BusyInterval[]> {
  try {
    const connection = await getConnection(supabase, clientId);
    if (!connection) return [];
    const accessToken = await getFreshAccessToken(supabase, connection);
    if (connection.provider === "google") {
      return await listGoogleBusyTimes(
        accessToken,
        connection.calendar_id,
        rangeStart,
        rangeEnd,
      );
    }
    return await listMicrosoftBusyTimes(accessToken, rangeStart, rangeEnd);
  } catch (err) {
    console.warn("getExternalBusyTimes failed, falling back to portal-only", err);
    return [];
  }
}

type PushableAppointment = {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date;
};

/** Best-effort — never blocks the appointment itself on a push failure. */
export async function pushAppointmentCreated(
  supabase: Admin,
  clientId: string,
  appt: PushableAppointment,
): Promise<void> {
  try {
    const connection = await getConnection(supabase, clientId);
    if (!connection) return;
    const accessToken = await getFreshAccessToken(supabase, connection);
    const created =
      connection.provider === "google"
        ? await createGoogleEvent(accessToken, connection.calendar_id, appt)
        : await createMicrosoftEvent(accessToken, appt);
    await supabase
      .from("appointments")
      .update({
        external_event_id: created.id,
        external_calendar_provider: connection.provider,
      })
      .eq("id", appt.id);
  } catch (err) {
    console.warn("pushAppointmentCreated failed", err);
  }
}

export async function pushAppointmentUpdated(
  supabase: Admin,
  clientId: string,
  appt: PushableAppointment & {
    externalEventId: string | null;
    externalProvider: string | null;
  },
): Promise<void> {
  if (!appt.externalEventId || !appt.externalProvider) return;
  try {
    const connection = await getConnection(supabase, clientId);
    if (!connection || connection.provider !== appt.externalProvider) return;
    const accessToken = await getFreshAccessToken(supabase, connection);
    if (connection.provider === "google") {
      await updateGoogleEvent(accessToken, connection.calendar_id, appt.externalEventId, appt);
    } else {
      await updateMicrosoftEvent(accessToken, appt.externalEventId, appt);
    }
  } catch (err) {
    console.warn("pushAppointmentUpdated failed", err);
  }
}

export async function pushAppointmentDeleted(
  supabase: Admin,
  clientId: string,
  appointmentId: string,
  externalEventId: string | null,
  externalProvider: string | null,
): Promise<void> {
  if (!externalEventId || !externalProvider) return;
  try {
    const connection = await getConnection(supabase, clientId);
    if (!connection || connection.provider !== externalProvider) return;
    const accessToken = await getFreshAccessToken(supabase, connection);
    if (connection.provider === "google") {
      await deleteGoogleEvent(accessToken, connection.calendar_id, externalEventId);
    } else {
      await deleteMicrosoftEvent(accessToken, externalEventId);
    }
    await supabase
      .from("appointments")
      .update({ external_event_id: null, external_calendar_provider: null })
      .eq("id", appointmentId);
  } catch (err) {
    console.warn("pushAppointmentDeleted failed", err);
  }
}
