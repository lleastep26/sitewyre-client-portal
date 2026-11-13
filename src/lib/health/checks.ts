export type HealthChecks = {
  supabase: boolean;
  turnstile: boolean;
  twilio: boolean;
  stripe: boolean;
  resend: boolean;
  inngest: boolean;
  vapid: boolean;
  anthropic: boolean;
  retell: boolean;
};

export function buildHealthChecks(
  env: Record<string, string | undefined> = process.env,
): HealthChecks {
  return {
    supabase: Boolean(
      (env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL) &&
        (env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY),
    ),
    turnstile: Boolean(env.TURNSTILE_SECRET_KEY),
    twilio: Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN),
    stripe: Boolean(env.STRIPE_SECRET_KEY),
    resend: Boolean(env.RESEND_API_KEY),
    inngest: Boolean(env.INNGEST_EVENT_KEY),
    vapid: Boolean(
      env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
        env.VAPID_PRIVATE_KEY &&
        env.VAPID_SUBJECT,
    ),
    anthropic: Boolean(env.ANTHROPIC_API_KEY),
    retell: Boolean(env.RETELL_API_KEY),
  };
}

export const HEALTH_CHECK_LABELS: Record<keyof HealthChecks, string> = {
  supabase: "Supabase",
  turnstile: "Turnstile (bot check)",
  twilio: "Twilio credentials",
  stripe: "Stripe platform",
  resend: "Resend email",
  inngest: "Inngest",
  vapid: "Web push (VAPID)",
  anthropic: "Claude (AI text assistant and chat widget)",
  retell: "Retell (AI receptionist)",
};
