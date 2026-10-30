import { describe, expect, it } from "vitest";
import { buildHealthChecks } from "@/lib/health/checks";

describe("buildHealthChecks", () => {
  it("marks all false when env is empty", () => {
    expect(buildHealthChecks({})).toEqual({
      supabase: false,
      turnstile: false,
      twilio: false,
      stripe: false,
      resend: false,
      inngest: false,
      vapid: false,
    });
  });

  it("detects configured integrations", () => {
    const checks = buildHealthChecks({
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "secret",
      TURNSTILE_SECRET_KEY: "ts",
      TWILIO_ACCOUNT_SID: "ACxx",
      TWILIO_AUTH_TOKEN: "tok",
      STRIPE_SECRET_KEY: "sk_test",
      RESEND_API_KEY: "re_xx",
      INNGEST_EVENT_KEY: "evt",
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "pub",
      VAPID_PRIVATE_KEY: "priv",
      VAPID_SUBJECT: "mailto:ops@example.com",
    });
    expect(checks).toEqual({
      supabase: true,
      turnstile: true,
      twilio: true,
      stripe: true,
      resend: true,
      inngest: true,
      vapid: true,
    });
  });

  it("requires all three VAPID fields", () => {
    expect(
      buildHealthChecks({
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: "pub",
        VAPID_PRIVATE_KEY: "priv",
      }).vapid,
    ).toBe(false);
  });
});
