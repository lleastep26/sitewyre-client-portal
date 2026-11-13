import { describe, expect, it } from "vitest";
import {
  isOpenLeadStatus,
  isOwnerPhone,
  findOpenLeadForPhone,
  findOpenLeadForContact,
  handleLeadBookedForContact,
} from "@/lib/leads/lifecycle";

describe("isOwnerPhone", () => {
  const client = { phone: "+15125550001", forward_to_phone: "+15125550002" };

  it("matches the business alert phone", () => {
    expect(isOwnerPhone(client, "(512) 555-0001")).toBe(true);
  });

  it("matches the forward-to phone", () => {
    expect(isOwnerPhone(client, "512-555-0002")).toBe(true);
  });

  it("does not match a customer's phone", () => {
    expect(isOwnerPhone(client, "+15125550099")).toBe(false);
  });

  it("handles a client with no phones set", () => {
    expect(isOwnerPhone({ phone: null, forward_to_phone: null }, "+15125550099")).toBe(false);
  });
});

describe("isOpenLeadStatus", () => {
  it("treats new/contacted/replied as open", () => {
    expect(isOpenLeadStatus("new")).toBe(true);
    expect(isOpenLeadStatus("contacted")).toBe(true);
    expect(isOpenLeadStatus("replied")).toBe(true);
  });

  it("treats booked/no_show/lost as closed", () => {
    expect(isOpenLeadStatus("booked")).toBe(false);
    expect(isOpenLeadStatus("no_show")).toBe(false);
    expect(isOpenLeadStatus("lost")).toBe(false);
  });
});

function fakeLeadsTable(rows: unknown[]) {
  return {
    select: () => ({
      eq: () => ({
        in: () => ({
          order: async () => ({ data: rows }),
        }),
        limit: () => ({
          maybeSingle: async () => ({ data: rows[0] ?? null }),
        }),
      }),
    }),
  };
}

describe("findOpenLeadForPhone", () => {
  it("returns the most recently created open lead when several share a phone", async () => {
    const supabase = {
      from: () =>
        fakeLeadsTable([
          { id: "lead-newer", name: "Newer", contact_id: "c1", phone: "+15125550099", lifecycle_status: "new" },
          { id: "lead-older", name: "Older", contact_id: "c2", phone: "+15125550099", lifecycle_status: "contacted" },
        ]),
    };
    const result = await findOpenLeadForPhone(supabase as never, "client1", "512-555-0099");
    expect(result).toEqual({ id: "lead-newer", name: "Newer", contact_id: "c1" });
  });

  it("returns null when no open lead matches the phone", async () => {
    const supabase = { from: () => fakeLeadsTable([]) };
    const result = await findOpenLeadForPhone(supabase as never, "client1", "+15125550099");
    expect(result).toBeNull();
  });
});

describe("findOpenLeadForContact", () => {
  it("finds the open lead for a contact", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              in: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: { id: "lead1" } }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    };
    const result = await findOpenLeadForContact(supabase as never, "client1", "contact1");
    expect(result).toEqual({ id: "lead1" });
  });
});

describe("handleLeadBookedForContact", () => {
  it("no-ops when the appointment has no contact", async () => {
    const sendEvent = async () => undefined;
    await handleLeadBookedForContact(
      {} as never,
      { clientId: "client1", contactId: null, appointmentId: "appt1" },
      sendEvent,
    );
    // No throw, nothing to assert beyond "didn't crash without a contact".
    expect(true).toBe(true);
  });

  it("marks the open lead booked and fires portal/lead.booked", async () => {
    const updates: unknown[] = [];
    const supabase = {
      from: (table: string) => {
        if (table === "leads") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  in: () => ({
                    order: () => ({
                      limit: () => ({
                        maybeSingle: async () => ({ data: { id: "lead1" } }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
            update: (patch: unknown) => {
              updates.push(patch);
              return { eq: async () => ({ error: null }) };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    const sent: unknown[] = [];
    await handleLeadBookedForContact(
      supabase as never,
      { clientId: "client1", contactId: "contact1", appointmentId: "appt1" },
      async (event) => {
        sent.push(event);
      },
    );
    expect(updates).toContainEqual(
      expect.objectContaining({ lifecycle_status: "booked" }),
    );
    expect(sent).toEqual([
      {
        name: "portal/lead.booked",
        data: { clientId: "client1", leadId: "lead1", appointmentId: "appt1" },
      },
    ]);
  });
});
