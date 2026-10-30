#!/usr/bin/env node
/**
 * Dry-run / sandbox dual-write tester.
 * Does NOT modify live n8n workflows.
 *
 * Usage:
 *   node scripts/test-dual-write.mjs --portal https://YOUR_PREVIEW.vercel.app --site-key KEY
 *   node scripts/test-dual-write.mjs --portal http://localhost:3000 --site-key KEY --also-systems
 *
 * When --also-systems is set, also POSTs to the existing systems API
 * (same payload n8n uses today) to verify both paths accept the lead.
 */

const args = process.argv.slice(2);
function flag(name, fallback = "") {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
const portal = flag("portal", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
const siteKey = flag("site-key", process.env.TEST_SITE_KEY || "");
const alsoSystems = args.includes("--also-systems");
const systems =
  flag("systems", "https://sitewyre-systems.vercel.app");

if (!siteKey) {
  console.error("Missing --site-key (or TEST_SITE_KEY). Get one from public.clients.site_key.");
  process.exit(1);
}

const payload = {
  site_key: siteKey,
  business_name: "Dual Write Test",
  domain: "dual-write-test.local",
  name: "Portal Dual-Write Tester",
  phone: "5550001111",
  email: "dual-write-test@example.com",
  message: `Dual-write test at ${new Date().toISOString()}`,
  source: "dual_write_test",
};

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

const portalRes = await post(`${portal.replace(/\/$/, "")}/api/leads`, payload);
console.log("PORTAL /api/leads", portalRes.status, portalRes.json);

if (alsoSystems) {
  // Systems API resolves by domain/business_name/client_id — may reject unknown test domain.
  const systemsPayload = {
    business_name: payload.business_name,
    domain: payload.domain,
    name: payload.name,
    phone: payload.phone,
    email: payload.email,
    message: payload.message,
  };
  const systemsRes = await post(`${systems}/api/leads`, systemsPayload);
  console.log("SYSTEMS /api/leads", systemsRes.status, systemsRes.json);
}

console.log(`
Next (manual, do not touch live yet):
1. Confirm portal row in Supabase leads for this site_key.
2. In n8n, duplicate the Site Lead webhook into a TEST workflow.
3. Add a second HTTP Request node POSTing to ${portal}/api/leads with site_key.
4. Fire a test execution only — leave production site-lead webhook unchanged until
   2 weeks of dual-write with zero misses.
`);
