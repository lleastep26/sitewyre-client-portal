import { beforeEach, describe, expect, it, vi } from "vitest";

const sendFunnelMessage = vi.fn();
vi.mock("@/lib/funnels/send", () => ({
  sendFunnelMessage: (...args: unknown[]) => sendFunnelMessage(...args),
}));

import { sendNoShowText } from "@/lib/scheduling/no-show-text";

const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
const supabase = {
  from(table: string) {
    return {
      insert: async (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return { error: null };
      },
    };
  },
} as never;

const CLIENT = {
  id: "client1",
  business_name: "Acme Plumbing",
  timezone: "America/Chicago",
  a2p_status: "pending",
  a2p_pipeline: {},
  twilio_phone_number: "+14055550100",
};
const PARAMS = { contactId: "contact1", phone: "+14055550142", title: "Drain cleaning" };

// 2pm and 11pm Central on the same day.
const DAYTIME = new Date("2026-11-13T20:00:00Z");
const NIGHT = new Date("2026-11-14T05:00:00Z");

describe("sendNoShowText", () => {
  beforeEach(() => {
    sendFunnelMessage.mockReset();
    inserts.length = 0;
  });

  it("goes through the shared send, which checks opt-outs and A2P", async () => {
    sendFunnelMessage.mockResolvedValue({ status: "skipped", reason: "a2p_pending" });
    const result = await sendNoShowText(supabase, CLIENT, PARAMS, DAYTIME);

    expect(result).toEqual({ status: "skipped", reason: "a2p_pending" });
    expect(sendFunnelMessage).toHaveBeenCalledTimes(1);
    const sent = sendFunnelMessage.mock.calls[0][1];
    expect(sent).toMatchObject({
      clientId: "client1",
      trigger: "no_show_text",
      to: "+14055550142",
      from: "+14055550100",
      contactId: "contact1",
    });
    expect(sent.body).toContain("Drain cleaning");
    expect(sent.body).toContain("Acme Plumbing");
  });

  it("reports sent when the shared send delivers it", async () => {
    sendFunnelMessage.mockResolvedValue({ status: "sent", sid: "SM1" });
    expect(await sendNoShowText(supabase, CLIENT, PARAMS, DAYTIME)).toEqual({ status: "sent" });
  });

  it("does not text during quiet hours, and logs why", async () => {
    const result = await sendNoShowText(supabase, CLIENT, PARAMS, NIGHT);

    expect(result).toEqual({ status: "skipped", reason: "quiet_hours" });
    expect(sendFunnelMessage).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe("workflow_runs");
    expect(inserts[0].row).toMatchObject({
      client_id: "client1",
      trigger: "no_show_text",
      status: "skipped",
      log: { reason: "quiet_hours" },
    });
  });

  it("does nothing without a customer phone or a business number", async () => {
    expect(
      await sendNoShowText(supabase, CLIENT, { ...PARAMS, phone: null }, DAYTIME),
    ).toEqual({ status: "skipped", reason: "no_phone_or_number" });
    expect(
      await sendNoShowText(supabase, { ...CLIENT, twilio_phone_number: null }, PARAMS, DAYTIME),
    ).toEqual({ status: "skipped", reason: "no_phone_or_number" });
    expect(sendFunnelMessage).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });
});
