#!/usr/bin/env node
/**
 * Apply Site URL + redirect allow-list + enable email/phone auth providers.
 * Requires SUPABASE_ACCESS_TOKEN (Account → Access Tokens) with auth_config_write.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-supabase-auth-urls.mjs
 */

const REF = process.env.SUPABASE_PROJECT_REF || "voatwphkhqsskwmcrxjn";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || "";
const SITE = "https://sitewyre-client-portal.vercel.app";
const ALLOW = [
  "http://localhost:3000/auth/callback",
  "https://sitewyre-client-portal.vercel.app/auth/callback",
].join(",");

if (!TOKEN) {
  console.error(
    "Missing SUPABASE_ACCESS_TOKEN.\nCreate one at https://supabase.com/dashboard/account/tokens (needs auth config write).",
  );
  process.exit(1);
}

const body = {
  site_url: SITE,
  uri_allow_list: ALLOW,
  external_email_enabled: true,
  external_phone_enabled: true,
};

// Wire Twilio for Phone OTP when portal env has credentials.
const twilioSid = process.env.TWILIO_ACCOUNT_SID || "";
const twilioToken = process.env.TWILIO_AUTH_TOKEN || "";
const twilioMsg = process.env.TWILIO_MESSAGING_SERVICE_SID || "";
if (twilioSid && twilioToken) {
  body.sms_provider = "twilio";
  body.sms_twilio_account_sid = twilioSid;
  body.sms_twilio_auth_token = twilioToken;
  if (twilioMsg) body.sms_twilio_message_service_sid = twilioMsg;
}

const url = `https://api.supabase.com/v1/projects/${REF}/config/auth`;

const res = await fetch(url, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  json = { raw: text };
}

if (!res.ok) {
  console.error("FAILED", res.status, json);
  process.exit(1);
}

console.log("OK", {
  site_url: json.site_url,
  uri_allow_list: json.uri_allow_list,
  external_email_enabled: json.external_email_enabled,
  external_phone_enabled: json.external_phone_enabled,
  sms_provider: json.sms_provider,
});
