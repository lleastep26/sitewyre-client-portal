import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGoogleEvent,
  deleteGoogleEvent,
  listGoogleBusyTimes,
} from "@/lib/integrations/google-calendar";
import {
  createMicrosoftEvent,
  listMicrosoftBusyTimes,
} from "@/lib/integrations/microsoft-calendar";

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("listGoogleBusyTimes", () => {
  it("posts the right body and parses the busy intervals for the queried calendar", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        calendars: { primary: { busy: [{ start: "2026-01-01T09:00:00Z", end: "2026-01-01T10:00:00Z" }] } },
      }),
    });
    const result = await listGoogleBusyTimes(
      "tok",
      "primary",
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-01-02T00:00:00Z"),
    );
    expect(result).toEqual([{ start_at: "2026-01-01T09:00:00Z", end_at: "2026-01-01T10:00:00Z" }]);
    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://www.googleapis.com/calendar/v3/freeBusy");
    const body = JSON.parse(opts.body);
    expect(body.items).toEqual([{ id: "primary" }]);
  });

  it("throws on a non-ok response", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 401 });
    await expect(
      listGoogleBusyTimes("tok", "primary", new Date(), new Date()),
    ).rejects.toThrow(/401/);
  });
});

describe("createGoogleEvent / deleteGoogleEvent", () => {
  it("creates an event and returns its id", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "evt_123" }),
    });
    const result = await createGoogleEvent("tok", "primary", {
      title: "Appt",
      startAt: new Date(),
      endAt: new Date(),
    });
    expect(result).toEqual({ id: "evt_123" });
  });

  it("treats a 410 Gone delete response as success", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 410 });
    await expect(deleteGoogleEvent("tok", "primary", "evt_123")).resolves.toBeUndefined();
  });
});

describe("listMicrosoftBusyTimes", () => {
  it("parses busy schedule items", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        value: [
          {
            scheduleItems: [
              {
                status: "busy",
                start: { dateTime: "2026-01-01T09:00:00.0000000" },
                end: { dateTime: "2026-01-01T10:00:00.0000000" },
              },
              {
                status: "free",
                start: { dateTime: "2026-01-01T11:00:00.0000000" },
                end: { dateTime: "2026-01-01T12:00:00.0000000" },
              },
            ],
          },
        ],
      }),
    });
    const result = await listMicrosoftBusyTimes(
      "tok",
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-01-02T00:00:00Z"),
    );
    expect(result).toEqual([
      { start_at: "2026-01-01T09:00:00.0000000Z", end_at: "2026-01-01T10:00:00.0000000Z" },
    ]);
  });
});

describe("createMicrosoftEvent", () => {
  it("creates an event and returns its id", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "ms_evt_1" }),
    });
    const result = await createMicrosoftEvent("tok", {
      title: "Appt",
      startAt: new Date(),
      endAt: new Date(),
    });
    expect(result).toEqual({ id: "ms_evt_1" });
  });
});
