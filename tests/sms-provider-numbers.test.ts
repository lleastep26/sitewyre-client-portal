import { beforeEach, describe, expect, it, vi } from "vitest";

const fakeClient = {
  availablePhoneNumbers: vi.fn(() => ({
    local: {
      list: vi.fn().mockResolvedValue([{ phoneNumber: "+15125550123" }]),
    },
  })),
  incomingPhoneNumbers: Object.assign(
    vi.fn(() => ({ update: vi.fn().mockResolvedValue({}) })),
    { create: vi.fn().mockResolvedValue({ phoneNumber: "+15125550123", sid: "PNabc" }) },
  ),
  pricing: {
    v1: {
      phoneNumbers: {
        countries: vi.fn(() => ({
          fetch: vi.fn().mockResolvedValue({
            phoneNumberPrices: [{ numberType: "local", currentPrice: 1.15 }],
          }),
        })),
      },
    },
  },
};

vi.mock("twilio", () => ({
  default: vi.fn(() => fakeClient),
}));

beforeEach(() => {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "ACxxxx");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "tokxxxx");
  vi.clearAllMocks();
});

describe("TwilioSmsProvider number purchase helpers", () => {
  it("searchLocalNumber finds a candidate without purchasing it", async () => {
    const { TwilioSmsProvider } = await import("@/lib/adapters/sms");
    const provider = new TwilioSmsProvider();
    const result = await provider.searchLocalNumber("512");
    expect(result).toBe("+15125550123");
    expect(fakeClient.incomingPhoneNumbers.create).not.toHaveBeenCalled();
  });

  it("getLocalNumberMonthlyPrice reads the current local-number price", async () => {
    const { TwilioSmsProvider } = await import("@/lib/adapters/sms");
    const provider = new TwilioSmsProvider();
    const price = await provider.getLocalNumberMonthlyPrice();
    expect(price).toBe("1.15");
  });

  it("buyNumber purchases exactly the number passed in, not a fresh search", async () => {
    const { TwilioSmsProvider } = await import("@/lib/adapters/sms");
    const provider = new TwilioSmsProvider();
    const result = await provider.buyNumber("+15125550123");
    expect(result).toEqual({ phoneNumber: "+15125550123", sid: "PNabc" });
    expect(fakeClient.incomingPhoneNumbers.create).toHaveBeenCalledWith({
      phoneNumber: "+15125550123",
    });
    expect(fakeClient.availablePhoneNumbers).not.toHaveBeenCalled();
  });

  it("assignNumberWebhooks updates only the sid it was given", async () => {
    const { TwilioSmsProvider } = await import("@/lib/adapters/sms");
    const provider = new TwilioSmsProvider();
    await provider.assignNumberWebhooks("PNabc", {
      smsUrl: "https://app.example.com/api/twilio/webhook",
      voiceUrl: "https://app.example.com/api/twilio/voice",
    });
    expect(fakeClient.incomingPhoneNumbers).toHaveBeenCalledWith("PNabc");
  });
});

describe("FakeSmsProvider number purchase helpers", () => {
  it("round-trips search, price, and buy without hitting Twilio", async () => {
    const { FakeSmsProvider } = await import("@/lib/adapters/sms");
    const provider = new FakeSmsProvider();
    const found = await provider.searchLocalNumber("512");
    expect(found).toMatch(/^\+1512/);
    const price = await provider.getLocalNumberMonthlyPrice();
    expect(price).toBe("1.15");
    const bought = await provider.buyNumber(found!);
    expect(bought.phoneNumber).toBe(found);
  });
});
