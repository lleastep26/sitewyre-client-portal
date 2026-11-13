import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sign } from "retell-sdk";

let fakeSupabase: unknown;
let clientRow: Record<string, unknown> | null;
let serviceRow: Record<string, unknown> | null;
let insertedAppointment: Record<string, unknown> | null;

const findOrCreateContact = vi.fn();
const isSlotAvailable = vi.fn();
const getExternalBusyTimes = vi.fn();
const pushAppointmentCreated = vi.fn();
const enqueueAppointmentSms = vi.fn();
const handleLeadBookedForContact = vi.fn();
const inngestSend = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeSupabase }));
vi.mock("@/lib/crm/contacts", () => ({ findOrCreateContact }));
vi.mock("@/lib/scheduling/slots", () => ({ isSlotAvailable }));
vi.mock("@/lib/scheduling/calendar-sync", () => ({ getExternalBusyTimes, pushAppointmentCreated }));
vi.mock("@/lib/scheduling/reminders", () => ({ enqueueAppointmentSms }));
vi.mock("@/lib/a2p/sending", () => ({ resolveSmsFrom: (c: unknown) => (c ? "+15550001111" : null) }));
vi.mock("@/lib/leads/lifecycle", () => ({ handleLeadBookedForContact }));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: inngestSend } }));

function buildSupabase() {
  return {
    from(table: string) {
      if (table === "clients") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: clientRow }) }) }) };
      }
      if (table === "services") {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ ilike: () => ({ maybeSingle: async () => ({ data: serviceRow }) }) }) }),
          }),
        };
      }
      if (table === "availability") {
        return { select: () => ({ eq: () => ({ data: [] }) }) };
      }
      if (table === "appointments") {
        return {
          select: () => ({
            eq: () => ({ neq: () => ({ lt: () => ({ gt: async () => ({ data: [] }) }) }) }),
          }),
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                insertedAppointment = row;
                return { data: { id: "appt1", ...row }, error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

async function callRoute(body: unknown) {
  const raw = JSON.stringify(body);
  const signature = await sign(raw, "test-key");
  const { POST } = await import("@/app/api/retell/functions/book-appointment/route");
  return POST(
    new Request("http://localhost/api/retell/functions/book-appointment", {
      method: "POST",
      headers: { "x-retell-signature": signature },
      body: raw,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RETELL_API_KEY", "test-key");
  fakeSupabase = buildSupabase();
  insertedAppointment = null;
  clientRow = {
    id: "client1",
    ai_receptionist_booking_enabled: true,
    phone: "+15559990000",
    business_name: "Acme",
    timezone: "America/Chicago",
    user_id: "user1",
  };
  serviceRow = { id: "svc1", name: "Drain Cleaning", duration_minutes: 60 };
  findOrCreateContact.mockResolvedValue({ id: "contact1" });
  isSlotAvailable.mockReturnValue(true);
  getExternalBusyTimes.mockResolvedValue([]);
  enqueueAppointmentSms.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const baseArgs = {
  service_name: "drain",
  start_at: "2026-11-16T15:00:00.000Z",
  caller_name: "Jane Doe",
  caller_phone: "+15551234567",
};

describe("POST /api/retell/functions/book-appointment", () => {
  it("refuses to book when booking is disabled for this client", async () => {
    clientRow = { ...clientRow, ai_receptionist_booking_enabled: false };
    const res = await callRoute({
      name: "book_appointment",
      args: baseArgs,
      call: { call_id: "c1", agent_id: "a1", metadata: { client_id: "client1" } },
    });
    const json = await res.json();
    expect(json.error).toContain("Booking isn't enabled");
    expect(insertedAppointment).toBeNull();
  });

  it("errors when the requested time is no longer available", async () => {
    isSlotAvailable.mockReturnValue(false);
    const res = await callRoute({
      name: "book_appointment",
      args: baseArgs,
      call: { call_id: "c1", agent_id: "a1", metadata: { client_id: "client1" } },
    });
    const json = await res.json();
    expect(json.error).toContain("just filled up");
    expect(insertedAppointment).toBeNull();
  });

  it("books the appointment and notifies downstream systems", async () => {
    const res = await callRoute({
      name: "book_appointment",
      args: baseArgs,
      call: { call_id: "c1", agent_id: "a1", metadata: { client_id: "client1" } },
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(insertedAppointment).toMatchObject({ title: "Drain Cleaning", contact_id: "contact1" });
    expect(handleLeadBookedForContact).toHaveBeenCalledTimes(1);
    expect(pushAppointmentCreated).toHaveBeenCalledTimes(1);
    // Confirmation and reminders go to the customer, not the owner.
    expect(enqueueAppointmentSms).toHaveBeenCalledTimes(1);
    expect(enqueueAppointmentSms).toHaveBeenCalledWith(expect.objectContaining({ to: "+15551234567" }));
  });
});
