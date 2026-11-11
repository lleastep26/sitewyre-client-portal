import { describe, expect, it } from "vitest";
import { checkA2pGate } from "@/lib/funnels/a2p-gate";

describe("checkA2pGate", () => {
  it("allows any destination once a2p_status is approved", () => {
    expect(
      checkA2pGate({ a2p_status: "approved", phone: null }, "+15551234567"),
    ).toEqual({ allowed: true });
  });

  it("blocks when a2p_status is pending", () => {
    expect(
      checkA2pGate({ a2p_status: "pending", phone: null }, "+15551234567"),
    ).toEqual({ allowed: false, reason: "a2p_pending" });
  });

  it("blocks when a2p_status is failed", () => {
    expect(
      checkA2pGate({ a2p_status: "failed", phone: null }, "+15551234567"),
    ).toEqual({ allowed: false, reason: "a2p_failed" });
  });

  it("blocks when a2p_status is null, reporting it as pending", () => {
    expect(
      checkA2pGate({ a2p_status: null, phone: null }, "+15551234567"),
    ).toEqual({ allowed: false, reason: "a2p_pending" });
  });

  it("fails closed (blocks) when the client is missing entirely", () => {
    expect(checkA2pGate(null, "+15551234567")).toEqual({
      allowed: false,
      reason: "a2p_unknown",
    });
  });

  it("allows a contractor alert sent to the client's own phone, regardless of status", () => {
    expect(
      checkA2pGate(
        { a2p_status: "pending", phone: "+15559998888" },
        "+15559998888",
      ),
    ).toEqual({ allowed: true });
  });

  it("the own-phone exemption matches after normalization (different formatting)", () => {
    expect(
      checkA2pGate(
        { a2p_status: "failed", phone: "(555) 999-8888" },
        "+15559998888",
      ),
    ).toEqual({ allowed: true });
  });

  it("does not exempt a customer phone just because it resembles the owner's", () => {
    expect(
      checkA2pGate(
        { a2p_status: "pending", phone: "+15559998888" },
        "+15551234567",
      ),
    ).toEqual({ allowed: false, reason: "a2p_pending" });
  });
});
