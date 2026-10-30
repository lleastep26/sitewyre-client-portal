/**
 * Cloudflare Turnstile verification.
 * When TURNSTILE_SECRET_KEY is unset, verification is skipped so n8n dual-write
 * and local/dev ingest keep working until keys are configured.
 */
export async function verifyTurnstileToken(
  token: string | undefined | null,
  remoteIp?: string | null,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    return { ok: true, skipped: true };
  }
  if (!token?.trim()) {
    return { ok: false, error: "Missing turnstile_token" };
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token.trim());
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      },
    );
    const data = (await res.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };
    if (!data.success) {
      return {
        ok: false,
        error: data["error-codes"]?.join(",") || "Turnstile failed",
      };
    }
    return { ok: true };
  } catch (err) {
    console.error("turnstile verify", err);
    return { ok: false, error: "Turnstile unavailable" };
  }
}
