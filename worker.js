// ---------------------------------------------------------------------------
// Reframe Houses — Cloudflare Worker
//
// Serves the static site (from ./public via the ASSETS binding) and handles
// POST /api/lead, writing each submission into the dedicated
// "Reframe Houses — Website Leads" monday.com board.
//
// Deploy: `wrangler deploy` (Workers Builds runs this automatically on push).
// Secret: set the monday token with `wrangler secret put MONDAY_TOKEN`
//         (or in the dashboard: the Worker → Settings → Variables and Secrets).
// ---------------------------------------------------------------------------

// Board: "Reframe Houses — Website Leads" (created 2026-07-05, separate from the
// Quo→monday leads board). Regenerate with setup/create-monday-board.mjs.
const CONFIG = {
  MONDAY_BOARD_ID: "18420631658",
  MONDAY_NEW_LEADS_GROUP_ID: "group_mm50w9rw",
  COL: {
    phone: "phone_mm50h7cp",
    email: "email_mm50y9j1",
    address: "text_mm50n0c9",
    condition: "dropdown_mm508egc",
    status: "color_mm50c7s",
    source: "dropdown_mm5081vz",
    dateOfLead: "date_mm508s8j",
    notes: "long_text_mm50qexq",
  },
};

const MONDAY_URL = "https://api.monday.com/v2";

// ---- small helpers ---------------------------------------------------------

function digits(s) {
  return (s || "").replace(/\D/g, "");
}
// Normalize a US number to E.164 (+1XXXXXXXXXX) when we can.
function toE164(raw) {
  const d = digits(raw);
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return raw ? (raw.startsWith("+") ? raw : "+" + d) : "";
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function clean(s) {
  return (s || "").toString().slice(0, 2000);
}
function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function gql(token, query, variables) {
  const res = await fetch(MONDAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "API-Version": "2024-10",
      Authorization: token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors) throw new Error("monday error: " + JSON.stringify(data.errors));
  return data.data;
}

// Post a new-lead notification to Slack via an Incoming Webhook (set the
// SLACK_WEBHOOK_URL secret on the Worker). No webhook set = silently skip.
const MONDAY_ACCOUNT_SLUG = "zatulovebrians-team";

async function notifySlack(env, lead) {
  const url = env.SLACK_WEBHOOK_URL;
  if (!url) return "skipped:no-webhook"; // Slack not configured — skip quietly.

  const itemUrl = `https://${MONDAY_ACCOUNT_SLUG}.monday.com/boards/${CONFIG.MONDAY_BOARD_ID}/pulses/${lead.itemId}`;
  const lines = [
    `*Name:* ${lead.name}`,
    `*Phone:* ${lead.phone}`,
    lead.email ? `*Email:* ${lead.email}` : null,
    `*Property:* ${lead.property}`,
    lead.condition ? `*Condition:* ${lead.condition}` : null,
    lead.notes ? `*Notes:* ${lead.notes}` : null,
  ].filter(Boolean);

  const payload = {
    text: `🏠 New website lead: ${lead.name} — ${lead.phone}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "🏠 New Website Lead", emoji: true } },
      { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
      {
        type: "actions",
        elements: [
          { type: "button", text: { type: "plain_text", text: "View in monday", emoji: true }, url: itemUrl },
        ],
      },
    ],
  };

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return "sent:" + r.status;
}

// ---- lead handler ----------------------------------------------------------

async function handleLead(request, env) {
  const token = env.MONDAY_TOKEN;
  if (!token) return json(500, { ok: false, error: "Server not configured." });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "Invalid request." });
  }

  const name = clean(body.name).trim();
  const phone = clean(body.phone).trim();
  const email = clean(body.email).trim();
  const property = clean(body.property).trim();
  const condition = clean(body.condition).trim();
  const notes = clean(body.notes).trim();

  if (!name || !phone || !property) {
    return json(422, { ok: false, error: "Name, phone, and property are required." });
  }

  const { COL } = CONFIG;
  const columnValues = {
    [COL.phone]: { phone: toE164(phone), countryShortName: "US" },
    [COL.dateOfLead]: { date: todayISO() },
    [COL.source]: { labels: ["Website"] },
    [COL.status]: { label: "New" },
  };
  if (email) columnValues[COL.email] = { email, text: email };
  if (property) columnValues[COL.address] = property;
  if (condition) columnValues[COL.condition] = { labels: [condition] };
  if (notes) columnValues[COL.notes] = notes;

  try {
    const data = await gql(
      token,
      `mutation ($board: ID!, $group: String!, $name: String!, $vals: JSON!) {
        create_item(
          board_id: $board,
          group_id: $group,
          item_name: $name,
          column_values: $vals,
          create_labels_if_missing: true
        ) { id }
      }`,
      {
        board: CONFIG.MONDAY_BOARD_ID,
        group: CONFIG.MONDAY_NEW_LEADS_GROUP_ID,
        name,
        vals: JSON.stringify(columnValues),
      }
    );

    const itemId = data.create_item.id;
    const summary =
      `New website lead\n` +
      `• Name: ${name}\n` +
      `• Phone: ${phone}\n` +
      (email ? `• Email: ${email}\n` : "") +
      `• Property: ${property}\n` +
      (condition ? `• Condition: ${condition}\n` : "") +
      (notes ? `• Notes: ${notes}\n` : "");
    await gql(
      token,
      `mutation ($item: ID!, $body: String!) {
        create_update(item_id: $item, body: $body) { id }
      }`,
      { item: itemId, body: summary }
    ).catch(() => {}); // update is best-effort

    // Post to Slack (#website-leads) — best-effort, never blocks the lead.
    const slack = await notifySlack(env, { name, phone, email, property, condition, notes, itemId })
      .catch((e) => "error:" + ((e && e.message) || "unknown").slice(0, 80));

    return json(200, { ok: true, id: itemId, slack });
  } catch (err) {
    return json(502, { ok: false, error: "Could not save lead." });
  }
}

// ---- CORS ------------------------------------------------------------------
// The static site is served from reframehouses.com (GitHub Pages) while this
// Worker is the API at a different origin, so the browser sends a cross-origin
// request. Allow the site's origins to call /api/lead.

const ALLOWED_ORIGINS = new Set([
  "https://reframehouses.com",
  "https://www.reframehouses.com",
  "https://zatulove1995.github.io",
]);

function corsHeaders(origin) {
  if (!ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function withCors(resp, cors) {
  const r = new Response(resp.body, resp);
  for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
  return r;
}

// ---- entry point -----------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/lead") {
      const cors = corsHeaders(request.headers.get("Origin") || "");
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
      }
      if (request.method !== "POST") {
        return withCors(json(405, { ok: false, error: "Method not allowed." }), cors);
      }
      const resp = await handleLead(request, env);
      return withCors(resp, cors);
    }

    // Everything else is served from the static assets in ./docs
    return env.ASSETS.fetch(request);
  },
};
