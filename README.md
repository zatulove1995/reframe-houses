# Reframe Houses — Marketing Website + Lead Capture

A conversion-focused landing site for the cash home-buying business, with a lead
form that writes straight into a dedicated **monday.com** board via a Cloudflare
Pages Function.

## Files
```
index.html                       all page content
styles.css                       styling (brand colors are CSS vars at the top)
script.js                        mobile menu, hero-form handoff, lead POST
functions/api/lead.js            Cloudflare Pages Function → monday.com
setup/create-monday-board.mjs    one-time: builds the monday board + prints IDs
wrangler.toml                    Cloudflare Pages config
```

## Run locally (static preview)
```bash
cd reframe-houses
python3 -m http.server 8000     # visit http://localhost:8000
```
The form still works visually offline — it just shows the success message
without hitting the API (the API only exists once deployed to Cloudflare).

---

## Go live in 3 steps

### 1. Create the monday.com board
Get a monday API token: monday.com → your avatar → **Developers → My Access Tokens**.
Then run:
```bash
cd reframe-houses
MONDAY_TOKEN='paste-token-here' node setup/create-monday-board.mjs
```
This creates a **new, separate** board — "Reframe Houses — Website Leads" — with:
- Groups: New Leads · Contacted · Offer Sent · Under Contract · Closed · Dead
- Columns: Phone · Email · Property Address · Home Condition · Lead Status ·
  Source · Date of Lead · Notes

It prints a `CONFIG = {…}` block. **Copy it and paste it over the placeholder
`CONFIG` object at the top of `functions/api/lead.js`.**

### 2. Deploy to Cloudflare Pages
```bash
wrangler pages deploy . --project-name reframe-houses
```
(First time will prompt `wrangler login` in your browser.)

### 3. Give the Function the token
```bash
wrangler pages secret put MONDAY_TOKEN --project-name reframe-houses
# paste the same token when prompted
```
Redeploy once more so the secret is picked up, and you're live. Submitting the
form now creates a lead in the new board within a second.

---

## Customize
- **Phone:** already set to (659) 246-2020 — search `+16592462020` / `(659) 246-2020`.
- **Email:** search `hello@reframehouses.com` in `index.html` to set a real inbox.
- **Brand colors:** `:root` variables at the top of `styles.css`.
- **Copy / stats / reviews:** all inline in `index.html`.

## Notes
- The board is intentionally separate from your Quo→monday leads board, so
  website inquiries stay distinct from inbound-call leads.
- `functions/api/lead.js` normalizes phones to E.164 and sets Lead Status = "New",
  Source = "Website", and Date of Lead = today automatically.
