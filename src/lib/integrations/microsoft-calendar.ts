export type MsBusyInterval = { start_at: string; end_at: string };

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export async function listMicrosoftBusyTimes(
  accessToken: string,
  timeMin: Date,
  timeMax: Date,
): Promise<MsBusyInterval[]> {
  const res = await fetch(`${GRAPH_BASE}/me/calendar/getSchedule`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      prefer: 'outlook.timezone="UTC"',
    },
    body: JSON.stringify({
      schedules: ["me"],
      startTime: { dateTime: timeMin.toISOString(), timeZone: "UTC" },
      endTime: { dateTime: timeMax.toISOString(), timeZone: "UTC" },
      availabilityViewInterval: 30,
    }),
  });
  if (!res.ok) throw new Error(`Microsoft getSchedule failed (${res.status})`);
  const data = (await res.json()) as {
    value?: {
      scheduleItems?: {
        status: string;
        start: { dateTime: string };
        end: { dateTime: string };
      }[];
    }[];
  };
  const items = data.value?.[0]?.scheduleItems ?? [];
  return items
    .filter((i) => i.status === "busy" || i.status === "oof" || i.status === "tentative")
    .map((i) => ({
      start_at: `${i.start.dateTime}Z`,
      end_at: `${i.end.dateTime}Z`,
    }));
}

export async function createMicrosoftEvent(
  accessToken: string,
  event: { title: string; startAt: Date; endAt: Date },
): Promise<{ id: string }> {
  const res = await fetch(`${GRAPH_BASE}/me/events`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      subject: event.title,
      start: { dateTime: event.startAt.toISOString(), timeZone: "UTC" },
      end: { dateTime: event.endAt.toISOString(), timeZone: "UTC" },
    }),
  });
  if (!res.ok) throw new Error(`Microsoft event create failed (${res.status})`);
  const data = (await res.json()) as { id: string };
  return { id: data.id };
}

export async function updateMicrosoftEvent(
  accessToken: string,
  eventId: string,
  event: { title: string; startAt: Date; endAt: Date },
): Promise<void> {
  const res = await fetch(`${GRAPH_BASE}/me/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      subject: event.title,
      start: { dateTime: event.startAt.toISOString(), timeZone: "UTC" },
      end: { dateTime: event.endAt.toISOString(), timeZone: "UTC" },
    }),
  });
  if (!res.ok) throw new Error(`Microsoft event update failed (${res.status})`);
}

export async function deleteMicrosoftEvent(
  accessToken: string,
  eventId: string,
): Promise<void> {
  const res = await fetch(`${GRAPH_BASE}/me/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Microsoft event delete failed (${res.status})`);
  }
}
