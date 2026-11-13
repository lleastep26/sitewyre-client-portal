import { describe, expect, it } from "vitest";
import { resolveSmsFrom } from "@/lib/a2p/sending";

describe("resolveSmsFrom", () => {
  it("returns null for a missing client", () => {
    expect(resolveSmsFrom(null)).toBeNull();
  });

  it("uses the raw phone number when a2p_status isn't approved", () => {
    expect(
      resolveSmsFrom({
        a2p_status: "pending",
        a2p_pipeline: { messagingServiceSid: "MG123" },
        twilio_phone_number: "+15125550123",
      }),
    ).toBe("+15125550123");
  });

  it("uses the messaging service once approved and a service SID exists", () => {
    expect(
      resolveSmsFrom({
        a2p_status: "approved",
        a2p_pipeline: { messagingServiceSid: "MG123" },
        twilio_phone_number: "+15125550123",
      }),
    ).toBe("MG123");
  });

  it("falls back to the raw number when approved but no service SID is saved yet", () => {
    expect(
      resolveSmsFrom({
        a2p_status: "approved",
        a2p_pipeline: {},
        twilio_phone_number: "+15125550123",
      }),
    ).toBe("+15125550123");
  });
});

describe("resolveOwnerAlertFrom", () => {
  it("uses Sitewyre's sender (undefined) while the client's campaign is pending", async () => {
    const { resolveOwnerAlertFrom } = await import("@/lib/a2p/sending");
    expect(
      resolveOwnerAlertFrom({
        a2p_status: "pending",
        a2p_pipeline: { messagingServiceSid: "MG123" },
        twilio_phone_number: "+15125550123",
      }),
    ).toBeUndefined();
    expect(resolveOwnerAlertFrom(null)).toBeUndefined();
  });

  it("never falls back to the client's raw, unregistered number", async () => {
    const { resolveOwnerAlertFrom } = await import("@/lib/a2p/sending");
    expect(
      resolveOwnerAlertFrom({
        a2p_status: "approved",
        a2p_pipeline: {},
        twilio_phone_number: "+15125550123",
      }),
    ).toBeUndefined();
  });

  it("uses the client's own messaging service once approved", async () => {
    const { resolveOwnerAlertFrom } = await import("@/lib/a2p/sending");
    expect(
      resolveOwnerAlertFrom({
        a2p_status: "approved",
        a2p_pipeline: { messagingServiceSid: "MG123" },
        twilio_phone_number: "+15125550123",
      }),
    ).toBe("MG123");
  });
});
