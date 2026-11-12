import { beforeEach, describe, expect, it, vi } from "vitest";
import { numberPurchaseBlockReason } from "@/lib/phone/provision";

const searchLocalNumber = vi.fn();
const getLocalNumberMonthlyPrice = vi.fn();
const buyNumber = vi.fn();
const assignNumberWebhooks = vi.fn();

vi.mock("@/lib/adapters", () => ({
  getSmsProvider: () => ({
    searchLocalNumber,
    getLocalNumberMonthlyPrice,
    buyNumber,
    assignNumberWebhooks,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://portal.example.com");
});

describe("numberPurchaseBlockReason", () => {
  it("blocks when the client already has a number", () => {
    const reason = numberPurchaseBlockReason({
      twilio_phone_number: "+15125550100",
      forward_to_phone: "+15550001111",
    });
    expect(reason).toMatch(/already has/i);
  });

  it("blocks when forward_to_phone isn't set", () => {
    const reason = numberPurchaseBlockReason({
      twilio_phone_number: null,
      forward_to_phone: null,
    });
    expect(reason).toMatch(/forward-to phone/i);
  });

  it("allows when neither blocker applies", () => {
    const reason = numberPurchaseBlockReason({
      twilio_phone_number: null,
      forward_to_phone: "+15550001111",
    });
    expect(reason).toBeNull();
  });
});

describe("previewLocalNumber", () => {
  it("rejects a malformed area code without calling the provider", async () => {
    const { previewLocalNumber } = await import("@/lib/phone/provision");
    const result = await previewLocalNumber("5");
    expect(result).toEqual({ error: expect.stringContaining("area code") });
    expect(searchLocalNumber).not.toHaveBeenCalled();
  });

  it("returns the found number and price", async () => {
    searchLocalNumber.mockResolvedValue("+15125550123");
    getLocalNumberMonthlyPrice.mockResolvedValue("1.15");
    const { previewLocalNumber } = await import("@/lib/phone/provision");
    const result = await previewLocalNumber("512");
    expect(result).toEqual({ phoneNumber: "+15125550123", monthlyPrice: "1.15" });
  });

  it("returns an error when nothing is available", async () => {
    searchLocalNumber.mockResolvedValue(null);
    getLocalNumberMonthlyPrice.mockResolvedValue("1.15");
    const { previewLocalNumber } = await import("@/lib/phone/provision");
    const result = await previewLocalNumber("512");
    expect(result).toEqual({ error: expect.stringContaining("No numbers available") });
  });
});

describe("buyLocalNumberWithWebhooks", () => {
  it("buys the exact number and configures only that number's webhooks", async () => {
    buyNumber.mockResolvedValue({ phoneNumber: "+15125550123", sid: "PNabc" });
    const { buyLocalNumberWithWebhooks } = await import("@/lib/phone/provision");
    const result = await buyLocalNumberWithWebhooks("+15125550123");
    expect(result).toEqual({ phoneNumber: "+15125550123", sid: "PNabc" });
    expect(buyNumber).toHaveBeenCalledWith("+15125550123");
    expect(assignNumberWebhooks).toHaveBeenCalledWith("PNabc", {
      smsUrl: "https://portal.example.com/api/twilio/webhook",
      voiceUrl: "https://portal.example.com/api/twilio/voice",
    });
  });
});
