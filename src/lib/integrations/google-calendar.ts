export type GoogleBusyInterval = { start_at: string; end_at: string };

export async function listGoogleBusyTimes(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<GoogleBusyInterval[]> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: calendarId }],
    }),
  });
  if (!res.ok) throw new Error(`Google freebusy query failed (${res.status})`);
  const data = (await res.json()) as {
    calendars?: Record<string, { busy?: { start: string; end: string }[] }>;
  };
  const busy = data.calendars?.[calendarId]?.busy ?? [];
  return busy.map((b) => ({ start_at: b.start, end_at: b.end }));
}

export async function createGoogleEvent(
  accessToken: string,
  calendarId: string,
  event: { title: string; startAt: Date; endAt: Date },
): Promise<{ id: string }> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        summary: event.title,
        start: { dateTime: event.startAt.toISOString() },
        end: { dateTime: event.endAt.toISOString() },
      }),
    },
  );
  if (!res.ok) throw new Error(`Google event create failed (${res.status})`);
  const data = (await res.json()) as { id: string };
  return { id: data.id };
}

export async function updateGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: { title: string; startAt: Date; endAt: Date },
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        summary: event.title,
        start: { dateTime: event.startAt.toISOString() },
        end: { dateTime: event.endAt.toISOString() },
      }),
    },
  );
  if (!res.ok) throw new Error(`Google event update failed (${res.status})`);
}

export async function deleteGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${accessToken}` },
    },
  );
  // 410 Gone means it was already deleted on the Google side — fine.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Google event delete failed (${res.status})`);
  }
}
