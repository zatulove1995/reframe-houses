#!/usr/bin/env node
// ---------------------------------------------------------------------------
// One-time setup: create a dedicated monday.com board for Reframe Houses
// website leads, with the columns this CRM needs.
//
// Usage:
//   MONDAY_TOKEN='your-token-here' node setup/create-monday-board.mjs
//
// It prints a block of IDs (board, group, columns) — paste those into
// functions/api/lead.js (the CONFIG object) so the site knows where to write.
//
// Safe to read first: it only CREATES a new board; it never touches your
// existing Quo leads board.
// ---------------------------------------------------------------------------

const TOKEN = process.env.MONDAY_TOKEN;
if (!TOKEN) {
  console.error("\n✗ Missing MONDAY_TOKEN.\n  Run:  MONDAY_TOKEN='...' node setup/create-monday-board.mjs\n");
  process.exit(1);
}

const MONDAY_URL = "https://api.monday.com/v2";

async function gql(query, variables) {
  const res = await fetch(MONDAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "API-Version": "2024-10",
      Authorization: TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error("monday error: " + JSON.stringify(json.errors, null, 2));
  }
  return json.data;
}

// Create a column and return its id.
async function createColumn(boardId, title, columnType, defaults) {
  const data = await gql(
    `mutation ($board: ID!, $title: String!, $type: ColumnType!, $defaults: JSON) {
      create_column(board_id: $board, title: $title, column_type: $type, defaults: $defaults) {
        id
      }
    }`,
    { board: boardId, title, type: columnType, defaults: defaults ? JSON.stringify(defaults) : null }
  );
  return data.create_column.id;
}

async function main() {
  console.log("→ Creating board “Reframe Houses — Website Leads”…");

  const boardData = await gql(
    `mutation ($name: String!) {
      create_board(board_name: $name, board_kind: public) { id }
    }`,
    { name: "Reframe Houses — Website Leads" }
  );
  const boardId = boardData.create_board.id;
  console.log(`  ✓ Board created: ${boardId}`);

  // ----- Groups (pipeline stages) -----
  // A fresh board comes with a default group; we add our own and use the first
  // as "New Leads". We create the stage groups top-to-bottom.
  console.log("→ Adding pipeline groups…");
  const groupTitles = ["New Leads", "Contacted", "Offer Sent", "Under Contract", "Closed", "Dead / No Deal"];
  const groups = {};
  for (const title of groupTitles) {
    const g = await gql(
      `mutation ($board: ID!, $name: String!) {
        create_group(board_id: $board, group_name: $name) { id }
      }`,
      { board: boardId, name: title }
    );
    groups[title] = g.create_group.id;
    console.log(`  ✓ Group: ${title} (${g.create_group.id})`);
  }

  // ----- Columns -----
  console.log("→ Adding columns…");
  const COL = {};

  COL.phone = await createColumn(boardId, "Phone", "phone");
  console.log(`  ✓ Phone: ${COL.phone}`);

  COL.email = await createColumn(boardId, "Email", "email");
  console.log(`  ✓ Email: ${COL.email}`);

  COL.address = await createColumn(boardId, "Property Address", "text");
  console.log(`  ✓ Property Address: ${COL.address}`);

  COL.condition = await createColumn(boardId, "Home Condition", "dropdown", {
    settings: {
      labels: [
        { id: 1, name: "Move-in ready" },
        { id: 2, name: "Needs minor work" },
        { id: 3, name: "Needs major repairs" },
        { id: 4, name: "Not sure" },
      ],
    },
  });
  console.log(`  ✓ Home Condition: ${COL.condition}`);

  COL.status = await createColumn(boardId, "Lead Status", "status", {
    labels: {
      0: "New",
      1: "Attempting Contact",
      2: "Contacted",
      3: "Offer Sent",
      4: "Under Contract",
      5: "Closed",
      6: "Dead / No Deal",
    },
  });
  console.log(`  ✓ Lead Status: ${COL.status}`);

  COL.source = await createColumn(boardId, "Source", "dropdown", {
    settings: { labels: [{ id: 1, name: "Website" }, { id: 2, name: "Referral" }, { id: 3, name: "Phone" }] },
  });
  console.log(`  ✓ Source: ${COL.source}`);

  COL.dateOfLead = await createColumn(boardId, "Date of Lead", "date");
  console.log(`  ✓ Date of Lead: ${COL.dateOfLead}`);

  COL.notes = await createColumn(boardId, "Notes", "long_text");
  console.log(`  ✓ Notes: ${COL.notes}`);

  // ----- Output the config block -----
  const config = {
    MONDAY_BOARD_ID: boardId,
    MONDAY_NEW_LEADS_GROUP_ID: groups["New Leads"],
    COL,
  };

  console.log("\n============================================================");
  console.log("  DONE. Paste this into functions/api/lead.js → CONFIG:");
  console.log("============================================================\n");
  console.log("const CONFIG = " + JSON.stringify(config, null, 2) + ";\n");
  console.log(`Open the board: https://view.monday.com/board/${boardId}\n`);
}

main().catch((err) => {
  console.error("\n✗ Failed:", err.message, "\n");
  process.exit(1);
});
