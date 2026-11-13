import { beforeEach, describe, expect, it, vi } from "vitest";

let fakeConnection: {
  id: string;
  client_id: string;
  provider: "google" | "outlook";
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  expires_at: string;
  calendar_id: string;
} | null;
let connectionUpdates: unknown[];
let appointmentUpdates: unknown[];

const listGoogleBusyTimes = vi.fn();
const createGoogleEvent = vi.fn();
const updateGoogleEvent = vi.fn();
const deleteGoogleEvent = vi.fn();
const listMicrosoftBusyTimes = vi.fn();
const createMicrosoftEvent = vi.fn();
const refreshGoogleToken = vi.fn();
const refreshMicrosoftToken = vi.fn();

vi.mock("@/lib/integrations/token-encryption", () => ({
  encryptToken: (t: string) => `enc(${t})`,
  decryptToken: (t: string) => t.replace(/^enc\(/, "").replace(/\)$/, ""),
}));
vi.mock("@/lib/integrations/google", () => ({ refreshGoogleToken }));
vi.mock("@/lib/integrations/microsoft", () => ({ refreshMicrosoftToken }));
vi.mock("@/lib/integrations/google-calendar", () => ({
  listGoogleBusyTimes,
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
}));
vi.mock("@/lib/integrations/microsoft-calendar", () => ({
  listMicrosoftBusyTimes,
  createMicrosoftEvent,
  updateMicrosoftEvent: vi.fn(),
  deleteMicrosoftEvent: vi.fn(),
}));

function fakeSupabase() {
  return {
    from(table: string) {
      if (table === "calendar_connections") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: fakeConnection }),
            }),
          }),
          update: (patch: unknown) => {
            connectionUpdates.push(patch);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === "appointments") {
        return {
          update: (patch: unknown) => {
            appointmentUpdates.push(patch);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  connectionUpdates = [];
  appointmentUpdates = [];
  fakeConnection = null;
});

describe("getExternalBusyTimes", () => {
  it("returns an empty list when nothing is connected", async () => {
    const { getExternalBusyTimes } = await import("@/lib/scheduling/calendar-sync");
    const result = await getExternalBusyTimes(
      fakeSupabase() as never,
      "client1",
      new Date(),
      new Date(),
    );
    expect(result).toEqual([]);
  });

  it("uses the stored token when it hasn't expired, and calls the Google client", async () => {
    fakeConnection = {
      id: "conn1",
      client_id: "client1",
      provider: "google",
      access_token_encrypted: "enc(access-1)",
      refresh_token_encrypted: "enc(refresh-1)",
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      calendar_id: "primary",
    };
    listGoogleBusyTimes.mockResolvedValue([{ start_at: "a", end_at: "b" }]);
    const { getExternalBusyTimes } = await import("@/lib/scheduling/calendar-sync");
    const result = await getExternalBusyTimes(
      fakeSupabase() as never,
      "client1",
      new Date(),
      new Date(),
    );
    expect(result).toEqual([{ start_at: "a", end_at: "b" }]);
    expect(listGoogleBusyTimes).toHaveBeenCalledWith("access-1", "primary", expect.any(Date), expect.any(Date));
    expect(refreshGoogleToken).not.toHaveBeenCalled();
  });

  it("refreshes an expired Google token before querying, and persists it", async () => {
    fakeConnection = {
      id: "conn1",
      client_id: "client1",
      provider: "google",
      access_token_encrypted: "enc(stale-access)",
      refresh_token_encrypted: "enc(refresh-1)",
      expires_at: new Date(Date.now() - 1000).toISOString(),
      calendar_id: "primary",
    };
    refreshGoogleToken.mockResolvedValue({
      access_token: "fresh-access",
      expiry_date: Date.now() + 3600_000,
    });
    listGoogleBusyTimes.mockResolvedValue([]);
    const { getExternalBusyTimes } = await import("@/lib/scheduling/calendar-sync");
    await getExternalBusyTimes(fakeSupabase() as never, "client1", new Date(), new Date());
    expect(refreshGoogleToken).toHaveBeenCalledWith("refresh-1");
    expect(listGoogleBusyTimes).toHaveBeenCalledWith("fresh-access", "primary", expect.any(Date), expect.any(Date));
    expect(connectionUpdates).toContainEqual(
      expect.objectContaining({ access_token_encrypted: "enc(fresh-access)" }),
    );
  });

  it("calls the Microsoft client for an outlook connection", async () => {
    fakeConnection = {
      id: "conn1",
      client_id: "client1",
      provider: "outlook",
      access_token_encrypted: "enc(ms-access)",
      refresh_token_encrypted: "enc(ms-refresh)",
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      calendar_id: "primary",
    };
    listMicrosoftBusyTimes.mockResolvedValue([{ start_at: "c", end_at: "d" }]);
    const { getExternalBusyTimes } = await import("@/lib/scheduling/calendar-sync");
    const result = await getExternalBusyTimes(
      fakeSupabase() as never,
      "client1",
      new Date(),
      new Date(),
    );
    expect(result).toEqual([{ start_at: "c", end_at: "d" }]);
    expect(listMicrosoftBusyTimes).toHaveBeenCalledWith("ms-access", expect.any(Date), expect.any(Date));
  });

  it("fails open (returns []) when the provider call throws", async () => {
    fakeConnection = {
      id: "conn1",
      client_id: "client1",
      provider: "google",
      access_token_encrypted: "enc(access-1)",
      refresh_token_encrypted: "enc(refresh-1)",
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      calendar_id: "primary",
    };
    listGoogleBusyTimes.mockRejectedValue(new Error("Google is down"));
    const { getExternalBusyTimes } = await import("@/lib/scheduling/calendar-sync");
    const result = await getExternalBusyTimes(
      fakeSupabase() as never,
      "client1",
      new Date(),
      new Date(),
    );
    expect(result).toEqual([]);
  });
});

describe("pushAppointmentCreated", () => {
  it("no-ops when nothing is connected", async () => {
    const { pushAppointmentCreated } = await import("@/lib/scheduling/calendar-sync");
    await pushAppointmentCreated(fakeSupabase() as never, "client1", {
      id: "appt1",
      title: "Service call",
      startAt: new Date(),
      endAt: new Date(),
    });
    expect(createGoogleEvent).not.toHaveBeenCalled();
    expect(appointmentUpdates).toHaveLength(0);
  });

  it("creates the event and stores the external id/provider", async () => {
    fakeConnection = {
      id: "conn1",
      client_id: "client1",
      provider: "google",
      access_token_encrypted: "enc(access-1)",
      refresh_token_encrypted: "enc(refresh-1)",
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      calendar_id: "primary",
    };
    createGoogleEvent.mockResolvedValue({ id: "gcal_evt_1" });
    const { pushAppointmentCreated } = await import("@/lib/scheduling/calendar-sync");
    await pushAppointmentCreated(fakeSupabase() as never, "client1", {
      id: "appt1",
      title: "Service call",
      startAt: new Date(),
      endAt: new Date(),
    });
    expect(appointmentUpdates).toContainEqual({
      external_event_id: "gcal_evt_1",
      external_calendar_provider: "google",
    });
  });

  it("swallows a create failure without throwing", async () => {
    fakeConnection = {
      id: "conn1",
      client_id: "client1",
      provider: "google",
      access_token_encrypted: "enc(access-1)",
      refresh_token_encrypted: "enc(refresh-1)",
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      calendar_id: "primary",
    };
    createGoogleEvent.mockRejectedValue(new Error("boom"));
    const { pushAppointmentCreated } = await import("@/lib/scheduling/calendar-sync");
    await expect(
      pushAppointmentCreated(fakeSupabase() as never, "client1", {
        id: "appt1",
        title: "Service call",
        startAt: new Date(),
        endAt: new Date(),
      }),
    ).resolves.toBeUndefined();
  });
});

describe("pushAppointmentDeleted", () => {
  it("no-ops when there's no external event id", async () => {
    const { pushAppointmentDeleted } = await import("@/lib/scheduling/calendar-sync");
    await pushAppointmentDeleted(fakeSupabase() as never, "client1", "appt1", null, null);
    expect(deleteGoogleEvent).not.toHaveBeenCalled();
  });

  it("deletes the event and clears the external fields", async () => {
    fakeConnection = {
      id: "conn1",
      client_id: "client1",
      provider: "google",
      access_token_encrypted: "enc(access-1)",
      refresh_token_encrypted: "enc(refresh-1)",
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      calendar_id: "primary",
    };
    const { pushAppointmentDeleted } = await import("@/lib/scheduling/calendar-sync");
    await pushAppointmentDeleted(fakeSupabase() as never, "client1", "appt1", "gcal_evt_1", "google");
    expect(deleteGoogleEvent).toHaveBeenCalledWith("access-1", "primary", "gcal_evt_1");
    expect(appointmentUpdates).toContainEqual({
      external_event_id: null,
      external_calendar_provider: null,
    });
  });
});
