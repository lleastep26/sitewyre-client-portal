import { describe, expect, it, vi } from "vitest";

const sendSpy = vi.fn().mockResolvedValue({ id: "sm1", status: "sent" });

vi.mock("@/lib/adapters", () => ({
  getSmsProvider: () => ({ send: sendSpy }),
  getEmailProvider: () => ({ send: vi.fn() }),
}));

function fakeSupabase(contact: unknown) {
  return {
    from(table: string) {
      if (table === "contacts") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          contains: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: contact, error: null }),
        };
        return chain;
      }
      if (table === "opt_outs") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: null, error: null }),
        };
        return chain;
      }
      if (table === "messages") {
        return { insert: async () => ({ error: null }) };
      }
      if (table === "leads") {
        return {
          update: () => ({
            eq: () => ({
              eq: () => ({ is: async () => ({ error: null }) }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as never;
}

const CONTACT = { id: "contact1", phones: ["+15551234567"], emails: [], sms_opt_in: true };

describe("sendInboxMessageForClient — A2P gate", () => {
  it("blocks an SMS reply when the client's A2P status isn't approved", async () => {
    const { sendInboxMessageForClient } = await import("@/lib/inbox/send");
    const client = {
      id: "client1",
      business_name: "Acme",
      twilio_phone_number: "+15550009999",
      a2p_status: "pending",
      phone: "+15550001111",
    } as never;

    const result = await sendInboxMessageForClient(fakeSupabase(CONTACT), client, {
      contactId: "contact1",
      channel: "sms",
      body: "hi there",
    });

    expect(result).toEqual({
      error: "Texting is blocked: A2P registration isn't approved (status: pending).",
    });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("sends normally once A2P is approved", async () => {
    sendSpy.mockClear();
    const { sendInboxMessageForClient } = await import("@/lib/inbox/send");
    const client = {
      id: "client1",
      business_name: "Acme",
      twilio_phone_number: "+15550009999",
      a2p_status: "approved",
      phone: "+15550001111",
    } as never;

    const result = await sendInboxMessageForClient(fakeSupabase(CONTACT), client, {
      contactId: "contact1",
      channel: "sms",
      body: "hi there",
    });

    expect(result).toEqual({ ok: true });
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ from: "+15550009999" }));
  });

  it("sends through the client's own Messaging Service once a campaign is approved", async () => {
    sendSpy.mockClear();
    const { sendInboxMessageForClient } = await import("@/lib/inbox/send");
    const client = {
      id: "client1",
      business_name: "Acme",
      twilio_phone_number: "+15550009999",
      a2p_status: "approved",
      a2p_pipeline: { messagingServiceSid: "MGabc123" },
      phone: "+15550001111",
    } as never;

    const result = await sendInboxMessageForClient(fakeSupabase(CONTACT), client, {
      contactId: "contact1",
      channel: "sms",
      body: "hi there",
    });

    expect(result).toEqual({ ok: true });
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ from: "MGabc123" }));
  });

  it("still allows a reply to the client's own phone even when A2P isn't approved", async () => {
    sendSpy.mockClear();
    const { sendInboxMessageForClient } = await import("@/lib/inbox/send");
    const client = {
      id: "client1",
      business_name: "Acme",
      twilio_phone_number: "+15550009999",
      a2p_status: "pending",
      phone: "+15551234567",
    } as never;

    const result = await sendInboxMessageForClient(
      fakeSupabase(CONTACT),
      client,
      { contactId: "contact1", channel: "sms", body: "hi there" },
    );

    expect(result).toEqual({ ok: true });
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
});
