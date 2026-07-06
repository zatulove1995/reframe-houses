// ---------------------------------------------------------------------------
// Cloudflare Pages Function — POST /api/lead
//
// Receives a submission from the website lead form and creates an item in the
// dedicated "Reframe Houses — Website Leads" monday.com board.
//
// Setup:
//   1. Run  setup/create-monday-board.mjs  once to create the board, then
//      paste the printed CONFIG object over the placeholder below.
//   2. Set the monday token as a secret on the Pages project:
//        wrangler pages secret put MONDAY_TOKEN
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
function escapeText(s) {
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

// ---- handler ---------------------------------------------------------------

export async function onRequestPost({ request, env }) {
  const token = env.MONDAY_TOKEN;
  if (!token) return json(500, { ok: false, error: "Server not configured." });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "Invalid request." });
  }

  const name = escapeText(body.name).trim();
  const phone = escapeText(body.phone).trim();
  const email = escapeText(body.email).trim();
  const property = escapeText(body.property).trim();
  const condition = escapeText(body.condition).trim();
  const notes = escapeText(body.notes).trim();

  if (!name || !phone || !property) {
    return json(422, { ok: false, error: "Name, phone, and property are required." });
  }

  const { COL } = CONFIG;

  // Build the column values, only including columns that are configured.
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

    // Also drop a readable summary as an update on the item.
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

    return json(200, { ok: true, id: itemId });
  } catch (err) {
    return json(502, { ok: false, error: "Could not save lead." });
  }
}

// Any non-POST method to /api/lead gets a clean 405 (Pages routes by method,
// so defining only the POST handler is enough — this makes the intent explicit).
export const onRequestGet = () => json(405, { ok: false, error: "Method not allowed." });
