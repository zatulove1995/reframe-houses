# Reframe Houses — Marketing Website + Lead Capture

A conversion-focused landing site for the cash home-buying business, with a lead
form that writes straight into a dedicated **monday.com** board. Deployed as a
**Cloudflare Worker with static assets** (auto-deploys from GitHub via Workers Builds).

## Files
```
public/index.html                all page content
public/styles.css                styling (brand colors are CSS vars at the top)
public/script.js                 mobile menu, hero-form handoff, lead POST
worker.js                        the Worker: serves ./public + handles POST /api/lead
wrangler.toml                    Cloudflare Worker config (name, main, [assets])
setup/create-monday-board.mjs    one-time: builds the monday board + prints IDs
```

## Run locally (static preview)
```bash
cd reframe-houses/public
python3 -m http.server 8000     # visit http://localhost:8000
```
The form shows its success message offline; the `/api/lead` endpoint only runs
once deployed to Cloudflare (or via `npx wrangler dev` from the repo root).

---

## Deploy (Cloudflare Workers + GitHub)

The repo is connected to a Cloudflare Worker (**reframe-houses1**) via Workers
Builds, so **every push to `main` triggers a deploy** — no manual step. The
Worker runs `npx wrangler deploy`, which reads `wrangler.toml` (entry point
`worker.js` + `./public` static assets).

One-time setup on the Cloudflare side:
1. **Secret:** add `MONDAY_TOKEN` under the Worker → Settings → Variables and
   secrets (type: Secret). Without it, the form returns a 500.
2. **Public URL:** enable the `*.workers.dev` route (Settings → Domains & Routes)
   or attach a custom domain.

To deploy manually from a machine with Node:
```bash
cd reframe-houses
npx wrangler deploy
npx wrangler secret put MONDAY_TOKEN   # first time only
```

### Rebuild the monday board (only if needed)
```bash
MONDAY_TOKEN='...' node setup/create-monday-board.mjs
```
Paste the printed `CONFIG = {…}` block over the `CONFIG` object at the top of
`worker.js`.

---

## Customize
- **Phone:** already set to (659) 246-2020 — search `+16592462020` / `(659) 246-2020` in `public/index.html`.
- **Email:** search `hello@reframehouses.com` in `public/index.html` to set a real inbox.
- **Brand colors:** `:root` variables at the top of `public/styles.css`.
- **Copy / stats / reviews:** all inline in `public/index.html`.

## Notes
- The leads board is intentionally separate from the Quo→monday leads board, so
  website inquiries stay distinct from inbound-call leads.
- `worker.js` normalizes phones to E.164 and auto-sets Lead Status = "New",
  Source = "Website", and Date of Lead = today.
