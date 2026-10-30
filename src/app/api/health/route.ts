import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "sitewyre-client-portal",
    time: new Date().toISOString(),
    checks: {
      turnstile: Boolean(process.env.TURNSTILE_SECRET_KEY),
      twilio: Boolean(
        process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN,
      ),
      stripe: Boolean(process.env.STRIPE_SECRET_KEY),
      inngest: Boolean(process.env.INNGEST_EVENT_KEY),
    },
  });
}
