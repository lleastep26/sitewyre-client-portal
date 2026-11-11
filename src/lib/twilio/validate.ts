import twilio from "twilio";

/**
 * Whether it's safe to skip Twilio signature verification when the auth
 * token or signature header is missing. True only in plain local dev:
 * NODE_ENV isn't "production" AND we're not running on Vercel at all.
 * `VERCEL` is set to "1" by Vercel in every deployed context — Production,
 * Preview, and `vercel dev` — regardless of how NODE_ENV ends up set, so
 * this can't be fooled by a NODE_ENV misconfiguration on a deployment.
 */
export function isLocalDevBypassAllowed(): boolean {
  return process.env.NODE_ENV !== "production" && !process.env.VERCEL;
}

/** Shared by every Twilio webhook route — validates the request signature
 * against the exact URL Twilio was configured to call. */
export function validateTwilioSignature(
  request: Request,
  params: URLSearchParams,
  path: string,
): boolean {
  const signature = request.headers.get("x-twilio-signature");
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const url = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}${path}`
    : request.url;
  if (!authToken || !signature) return isLocalDevBypassAllowed();
  const data: Record<string, string> = {};
  params.forEach((v, k) => {
    data[k] = v;
  });
  return twilio.validateRequest(authToken, signature, url, data);
}
