import { describe, expect, it } from "vitest";
import { FakeSmsProvider, FakeEmailProvider, FakeAiProvider, FakeVoiceProvider } from "@/lib/adapters";
import { leadIngestSchema } from "@/lib/validation/leads";
import { getTradePreset } from "@/lib/trade-presets";
import { normalizePhone, normalizeHost } from "@/lib/utils";

describe("adapters", () => {
  it("fake sms records sends", async () => {
    const sms = new FakeSmsProvider();
    const res = await sms.send({ to: "+15551234567", body: "hi" });
    expect(res.status).toBe("sent");
    expect(sms.sent).toHaveLength(1);
  });

  it("fake email records sends", async () => {
    const email = new FakeEmailProvider();
    await email.send({
      to: "a@b.com",
      subject: "t",
      html: "<p>hi</p>",
    });
    expect(email.sent).toHaveLength(1);
  });

  it("fake ai suggests reply", async () => {
    const ai = new FakeAiProvider();
    const text = await ai.suggestReply("new lead");
    expect(text.length).toBeGreaterThan(5);
  });

  it("fake voice records outbound calls and redirects", async () => {
    const voice = new FakeVoiceProvider();
    const call = await voice.createOutboundCall({ to: "+15551234567", from: "+15557654321", twiml: "<Response/>" });
    expect(call.sid).toBeTruthy();
    expect(voice.outboundCalls).toHaveLength(1);
    await voice.redirectCall(call.sid, "<Response/>");
    expect(voice.redirects).toEqual([{ callSid: call.sid, twiml: "<Response/>" }]);
  });
});

describe("validation", () => {
  it("accepts lead payload", () => {
    const parsed = leadIngestSchema.parse({
      site_key: "abc",
      name: "Sam",
      phone: "5551234567",
      message: "Need a quote",
    });
    expect(parsed.name).toBe("Sam");
  });

  it("rejects missing message", () => {
    expect(() =>
      leadIngestSchema.parse({
        site_key: "abc",
        name: "Sam",
        phone: "5551234567",
      }),
    ).toThrow();
  });
});

describe("utils + presets", () => {
  it("normalizes phone and host", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("+15551234567");
    expect(normalizeHost("https://www.example.com/path")).toBe("example.com");
  });

  it("loads trade presets", () => {
    expect(getTradePreset("HVAC").services.length).toBeGreaterThan(0);
    expect(getTradePreset("unknown").trade).toBe("other");
  });
});
