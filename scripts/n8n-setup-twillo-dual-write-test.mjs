#!/usr/bin/env node
/**
 * 1) Remove misplaced Portal Dual-Write node from "SiteWyre Systems workflow copy"
 *    (that copy is the website builder, not Site Lead).
 * 2) Create inactive "Twillo workflow Dual-Write TEST" from live Twillo workflow,
 *    with portal POST in parallel and a non-production webhook path.
 *
 * Does NOT modify or deactivate the live "Twillo workflow".
 *
 *   N8N_API_KEY=... node scripts/n8n-setup-twillo-dual-write-test.mjs
 */

const BASE = (process.env.N8N_BASE_URL || "https://landoneast.app.n8n.cloud").replace(/\/$/, "");
const KEY = process.env.N8N_API_KEY || "";
const PORTAL = "https://sitewyre-client-portal.vercel.app";
const NODE_NAME = "Portal Dual-Write Leads";
const TEST_NAME = "Twillo workflow Dual-Write TEST";
const LIVE_ID = "IFMPDoY2T4RjTUjs";
const WRONG_COPY_ID = "o98GMBfAZDot5z08";

if (!KEY) {
  console.error("Missing N8N_API_KEY");
  process.exit(1);
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      "X-N8N-API-KEY": KEY,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status}`);
    err.detail = json;
    throw err;
  }
  return json;
}

// --- 1. Clean wrong copy ---
const wrong = await api(`/workflows/${WRONG_COPY_ID}`);
if (wrong.name !== "SiteWyre Systems workflow copy") {
  throw new Error(`Unexpected workflow at ${WRONG_COPY_ID}: ${wrong.name}`);
}
const hadMisplaced = (wrong.nodes || []).some((n) => n.name === NODE_NAME);
if (hadMisplaced) {
  const cleanedNodes = (wrong.nodes || []).filter((n) => n.name !== NODE_NAME);
  const cleanedConnections = structuredClone(wrong.connections || {});
  for (const cfg of Object.values(cleanedConnections)) {
    if (!cfg?.main) continue;
    cfg.main = cfg.main.map((outs) => (outs || []).filter((c) => c.node !== NODE_NAME));
  }
  await api(`/workflows/${WRONG_COPY_ID}`, {
    method: "PUT",
    body: {
      name: wrong.name,
      nodes: cleanedNodes,
      connections: cleanedConnections,
      settings: wrong.settings || {},
      staticData: wrong.staticData ?? null,
    },
  });
  console.log("Removed misplaced portal node from SiteWyre Systems workflow copy");
} else {
  console.log("No misplaced portal node on SiteWyre Systems workflow copy");
}

// --- 2. Build TEST from live Twillo (read-only on live) ---
const live = await api(`/workflows/${LIVE_ID}`);
if (live.name !== "Twillo workflow") {
  throw new Error(`Unexpected live workflow: ${live.name}`);
}
if (!live.active) {
  console.warn("Warning: live Twillo workflow is not active");
}

const listed = await api("/workflows?limit=250");
const existing = (listed.data || listed).find((w) => w.name === TEST_NAME);
if (existing) {
  console.log("TEST workflow already exists:", existing.id, existing.name, "active="+existing.active);
  process.exit(0);
}

const saveLead = (live.nodes || []).find((n) => n.name === "Save lead to Sitewyre");
const nodes = structuredClone(live.nodes || []);
let connections = structuredClone(live.connections || {});

for (const n of nodes) {
  if (n.type === "n8n-nodes-base.webhook" && n.parameters?.path === "site-lead") {
    n.parameters.path = "site-lead-dual-write-test";
    n.name = "Site Lead Webhook TEST";
    n.webhookId = "site-lead-dual-write-test";
  }
  if (n.type === "n8n-nodes-base.webhook" && n.parameters?.path === "call-now-click") {
    n.parameters.path = "call-now-click-dual-write-test";
    n.webhookId = "call-now-click-dual-write-test";
  }
}

if (connections["Site Lead Webhook"] && !connections["Site Lead Webhook TEST"]) {
  connections["Site Lead Webhook TEST"] = connections["Site Lead Webhook"];
  delete connections["Site Lead Webhook"];
}

let upstream = null;
for (const [from, cfg] of Object.entries(connections)) {
  const outs = cfg?.main?.[0] || [];
  if (outs.some((c) => c.node === "Save lead to Sitewyre")) {
    upstream = from;
    break;
  }
}

nodes.push({
  id: "portal-dual-write-leads",
  name: NODE_NAME,
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [(saveLead?.position?.[0] || 700), (saveLead?.position?.[1] || 300) + 200],
  parameters: {
    method: "POST",
    url: `${PORTAL}/api/leads`,
    sendBody: true,
    specifyBody: "json",
    jsonBody: `={{ JSON.stringify({
  site_key: $json.site_key || undefined,
  business_name: $json.business_name || undefined,
  domain: $json.domain || undefined,
  name: $json.name,
  phone: $json.phone,
  email: $json.email || '',
  message: $json.message,
  source: $json.source || 'n8n_dual_write_test',
  service: $json.service || undefined,
}) }}`,
    options: { response: { response: { neverError: true } } },
  },
});

if (upstream) {
  const outs = connections[upstream]?.main?.[0] || [];
  if (!outs.some((c) => c.node === NODE_NAME)) {
    connections[upstream] = {
      ...(connections[upstream] || {}),
      main: [[...outs, { node: NODE_NAME, type: "main", index: 0 }]],
    };
  }
}

const created = await api("/workflows", {
  method: "POST",
  body: {
    name: TEST_NAME,
    nodes,
    connections,
    settings: live.settings || { executionOrder: "v1" },
    staticData: null,
  },
});

console.log(
  JSON.stringify(
    {
      created: { id: created.id, name: created.name, active: created.active },
      portalConnectedFrom: upstream,
      testWebhookPath: "site-lead-dual-write-test",
      liveUntouched: `${live.name} active=${live.active}`,
    },
    null,
    2,
  ),
);

const payload = {
  site_key: "af6e62ad7807180fcf897894",
  business_name: "Exclusive Cleaning Services",
  name: "Twillo Dual-Write Tester",
  phone: "5550004444",
  message: `Twillo dual-write test at ${new Date().toISOString()}`,
  source: "n8n_dual_write_test",
};
const portalRes = await fetch(`${PORTAL}/api/leads`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
});
console.log("PORTAL", portalRes.status, await portalRes.json());
console.log(`
Open TEST workflow in n8n (keep INACTIVE):
  ${BASE}/workflow/${created.id}
Manual test: Execute "Portal Dual-Write Leads" with sample JSON, or use
  POST ${BASE}/webhook-test/site-lead-dual-write-test
Do NOT activate this TEST on path site-lead — live Twillo owns that.
`);
