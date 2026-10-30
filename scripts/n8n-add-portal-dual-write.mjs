#!/usr/bin/env node
/**
 * Add portal dual-write HTTP node to the TEST n8n workflow only.
 * Does NOT touch the live Site Lead workflow.
 *
 *   N8N_API_KEY=... node scripts/n8n-add-portal-dual-write.mjs
 *   N8N_API_KEY=... node scripts/n8n-add-portal-dual-write.mjs --execute
 *
 * Optional:
 *   --name "SiteWyre Systems workflow copy"
 *   --portal https://sitewyre-client-portal.vercel.app
 *   --site-key <key>   (for --execute test payload)
 */

const args = process.argv.slice(2);
function flag(name, fallback = "") {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}

const BASE = (process.env.N8N_BASE_URL || "https://landoneast.app.n8n.cloud").replace(/\/$/, "");
const KEY = process.env.N8N_API_KEY || "";
const WORKFLOW_NAME = flag("name", "SiteWyre Systems workflow copy");
const PORTAL = flag("portal", "https://sitewyre-client-portal.vercel.app").replace(/\/$/, "");
const SITE_KEY = flag("site-key", process.env.TEST_SITE_KEY || "af6e62ad7807180fcf897894");
const DO_EXECUTE = args.includes("--execute");
const NODE_NAME = "Portal Dual-Write Leads";

if (!KEY) {
  console.error(
    "Missing N8N_API_KEY.\nCreate one in n8n → Settings → API (https://landoneast.app.n8n.cloud).",
  );
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
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`n8n ${method} ${path} → ${res.status}`);
    err.detail = json;
    throw err;
  }
  return json;
}

function nextNodeId(nodes) {
  // Prefer UUID-like ids; fall back to timestamp string.
  return `portal-dual-${Date.now()}`;
}

function findSystemsPostNode(nodes) {
  return (
    nodes.find(
      (n) =>
        n.type === "n8n-nodes-base.httpRequest" &&
        /sitewyre-systems|\/api\/leads/i.test(JSON.stringify(n.parameters || {})),
    ) ||
    nodes.find((n) => n.type === "n8n-nodes-base.httpRequest" && /lead/i.test(n.name || "")) ||
    nodes.find((n) => n.type === "n8n-nodes-base.httpRequest")
  );
}

function buildPortalNode(position) {
  // JSON body using n8n expressions from upstream webhook / item JSON.
  const jsonBody = `{
  "site_key": "{{$json.site_key || ''}}",
  "business_name": "{{$json.business_name || ''}}",
  "domain": "{{$json.domain || ''}}",
  "name": "{{$json.name}}",
  "phone": "{{$json.phone}}",
  "email": "{{$json.email || ''}}",
  "message": "{{$json.message}}",
  "source": "{{$json.source || 'n8n_dual_write_test'}}",
  "service": "{{$json.service || ''}}"
}`;

  return {
    id: nextNodeId([]),
    name: NODE_NAME,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: position || [900, 300],
    parameters: {
      method: "POST",
      url: `${PORTAL}/api/leads`,
      sendBody: true,
      specifyBody: "json",
      jsonBody,
      options: {
        response: {
          response: {
            neverError: true,
          },
        },
      },
    },
  };
}

function ensureConnection(connections, fromName, toName) {
  const main = connections[fromName]?.main || [[]];
  const outputs = main[0] || [];
  if (outputs.some((c) => c.node === toName)) return connections;
  return {
    ...connections,
    [fromName]: {
      ...(connections[fromName] || {}),
      main: [[...outputs, { node: toName, type: "main", index: 0 }]],
    },
  };
}

const listed = await api("/workflows?limit=100");
const workflows = listed.data || listed;
const match = (Array.isArray(workflows) ? workflows : []).find(
  (w) => (w.name || "").trim() === WORKFLOW_NAME,
);

if (!match) {
  console.error(
    `Workflow not found: "${WORKFLOW_NAME}"\nAvailable:`,
    (Array.isArray(workflows) ? workflows : []).map((w) => w.name),
  );
  process.exit(1);
}

const liveNames = /site lead|sitewyre systems workflow$/i;
if (liveNames.test(match.name) && !/copy|test|dual/i.test(match.name)) {
  console.error("Refusing to modify a live-looking workflow:", match.name);
  process.exit(1);
}

const full = await api(`/workflows/${match.id}`);
const nodes = [...(full.nodes || [])];
const existing = nodes.find((n) => n.name === NODE_NAME);

if (existing) {
  console.log("Portal dual-write node already present:", NODE_NAME);
} else {
  const systemsNode = findSystemsPostNode(nodes);
  const anchor = systemsNode || nodes[nodes.length - 1];
  const pos = [
    (anchor?.position?.[0] || 700) + 240,
    (anchor?.position?.[1] || 300) + (systemsNode ? 160 : 0),
  ];
  const portalNode = buildPortalNode(pos);
  nodes.push(portalNode);

  let connections = { ...(full.connections || {}) };
  // Fan-out from the same upstream as the systems HTTP node when possible.
  let upstream = null;
  for (const [from, cfg] of Object.entries(connections)) {
    const outs = cfg?.main?.[0] || [];
    if (systemsNode && outs.some((c) => c.node === systemsNode.name)) {
      upstream = from;
      break;
    }
  }
  if (!upstream && systemsNode) {
    // If systems node is first after webhook, connect from whatever feeds it; else from systems itself (sequential).
    upstream = Object.keys(connections).find((k) => k !== systemsNode.name) || systemsNode.name;
  }
  if (!upstream) upstream = nodes[0]?.name;

  if (upstream && upstream !== NODE_NAME) {
    connections = ensureConnection(connections, upstream, NODE_NAME);
  }

  // Keep TEST inactive so it cannot steal production webhook traffic.
  const updated = await api(`/workflows/${match.id}`, {
    method: "PUT",
    body: {
      name: full.name,
      nodes,
      connections,
      settings: full.settings || {},
      staticData: full.staticData ?? null,
    },
  });

  console.log("Added node", NODE_NAME, "to", updated.name || full.name, `(id ${match.id})`);
  console.log("Left workflow inactive (do not activate on production webhook path).");
}

if (DO_EXECUTE) {
  // Prefer test webhook path if present; otherwise run via API execute with sample payload.
  const payload = {
    site_key: SITE_KEY,
    business_name: "Exclusive Cleaning Services",
    domain: "exclusive-cleaning-services.vercel.app",
    name: "n8n Dual-Write Tester",
    phone: "5550002222",
    email: "n8n-dual-write-test@example.com",
    message: `n8n dual-write test at ${new Date().toISOString()}`,
    source: "n8n_dual_write_test",
  };

  // Direct portal check first (same as scripts/test-dual-write.mjs)
  const portalRes = await fetch(`${PORTAL}/api/leads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const portalJson = await portalRes.json().catch(() => ({}));
  console.log("PORTAL direct", portalRes.status, portalJson);

  try {
    const run = await api(`/workflows/${match.id}/run`, {
      method: "POST",
      body: { workflowData: { id: match.id }, runData: {}, startData: {}, destinationNode: NODE_NAME, inputData: { main: [[{ json: payload }]] } },
    });
    console.log("n8n execute accepted", run?.executionId || run?.id || run);
  } catch (err) {
    console.warn(
      "n8n /run not available or failed — portal path still verified above.",
      err.detail || err.message,
    );
    console.warn(
      "In n8n UI: open the copy workflow → click the Portal Dual-Write Leads node → Execute step with the sample JSON.",
    );
  }
}

console.log(`
Next:
1. Open https://landoneast.app.n8n.cloud → "${WORKFLOW_NAME}"
2. Confirm "${NODE_NAME}" POSTs to ${PORTAL}/api/leads
3. Execute that node / workflow once with a real client site_key
4. Do NOT activate this copy on webhook/site-lead (leave production workflow alone)
`);
