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
