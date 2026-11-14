/**
 * Cloudflare Turnstile (bot check).
 *
 * Turnstile only runs on hostnames registered with Cloudflare, so it is
 * used only on forms the portal hosts itself: the booking page and the
 * embeddable booking calendar and lead form (those sit in a frame on a
 * client's site, but the page inside the frame is the portal's). Nothing
 * that runs on a client's own website uses it: the chat widget, form
 * capture, /api/leads and /api/reviews/rating rely on origin checks,
 * per-visitor limits and hidden trap fields instead.
 *
 * It is on only when BOTH keys are set, so a half-finished setup can
 * never lock a form: the site key draws the widget, the secret key
 * checks its answer.
 */

/** The public site key for portal-hosted forms, or null when Turnstile
 * isn't fully set up. Read on the server and passed to the form. */
export function portalTurnstileSiteKey(): string | null {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  return siteKey && secret ? siteKey : null;
}

/** Checks the Turnstile answer from a portal-hosted form. Passes without
 * checking when Turnstile isn't fully set up. */
export async function verifyPortalFormTurnstile(
  token: FormDataEntryValue | string | null | undefined,
  remoteIp?: string | null,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!portalTurnstileSiteKey()) return { ok: true, skipped: true };
  return verifyTurnstileToken(typeof token === "string" ? token : undefined, remoteIp);
}

/**
 * Verifies a token with Cloudflare. When TURNSTILE_SECRET_KEY is unset,
 * verification is skipped.
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
