# Point of Sale

A complete, open-source **point-of-sale** example for cafes and restaurants — staff login, floor plan, order building with modifiers, split payments, a simulated card reader, receipts, and a kitchen display. Built with Vite + React + TypeScript, no backend required: it runs entirely on built-in demo data.

**Live demo → [adminium.dev/demo/point-of-sale](https://adminium.dev/demo/point-of-sale)**

Use the **Demo controls** dock at the top to switch screens, flip between **Restaurant** and **Retail** service modes, toggle **online/offline**, and change the **theme**.

---

## What's inside

- **Login** — staff chips, a PIN pad that auto-verifies at 4 digits (shake on error), and an opening-float drawer count.
- **Register** — quick-add favourites, category filter + density toggle, a menu grid, a **modifier bottom-sheet** (size / milk / extras / seat / note with live price deltas), and a ticket pane that merges identical lines by a composite key. Hold / Send, coursing by seat, and **type-VOID-to-confirm** for sent items.
- **Payment** — tip presets, a cash keypad with change, a **simulated card reader** (waiting → reading → approved / declined), QR, and a **split-payment ledger** (even + fraction splits with last-payer remainder absorption).
- **Receipt** — printable receipt facsimile, email / text actions, new order.
- **Floor** — zones, live table states, seat/auto-hold flow.
- **Kitchen display** — three-column bump flow with an all-day aggregate.
- Held-tickets tray, move / merge, discount & comps.

Money math is exact: tax is **8.25%**, tip presets are **0 / 10 / 15 / 20%**, and split rounding matches the design to the cent.

---

## Deploy

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Adminiumjs/point-of-sale&project-name=point-of-sale&repository-name=point-of-sale)

`https://vercel.com/new/clone?repository-url=https://github.com/Adminiumjs/point-of-sale&project-name=point-of-sale&repository-name=point-of-sale`

### Deploy to DigitalOcean

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/Adminiumjs/point-of-sale/tree/main)

`https://cloud.digitalocean.com/apps/new?repo=https://github.com/Adminiumjs/point-of-sale/tree/main`

A DigitalOcean App Platform spec is included at [`.do/deploy.template.yaml`](.do/deploy.template.yaml).

### Host anywhere

It's a static single-page app — `npm run build` produces a plain `dist/` you can serve from any static host (Netlify, Cloudflare Pages, S3 + CloudFront, GitHub Pages, nginx, …). A multi-stage **Docker** image is provided that builds the app and serves it with Caddy:

```bash
docker build -t point-of-sale .
docker run -p 8080:80 point-of-sale   # → http://localhost:8080
```

---

## Full implementation (self-host)

There are two ways to run Point of Sale:

**1 · One-click frontend (Vercel / DigitalOcean).** The deploy buttons above ship the **POS terminal only**, running on the bundled demo catalogue — which now uses **real product photography**. No database, no backend: a static SPA you can hand to a café to try in a minute.

**2 · Full self-host (Docker Compose).** [`docker-compose.yml`](docker-compose.yml) brings up the whole product — a Postgres database seeded by default, an auto-generated Adminium admin dashboard, and the POS terminal:

```bash
cp .env.example .env      # optional for local; REQUIRED beyond your laptop
docker compose up
```

- **`pos-db`** — Postgres 16. On first boot it applies [`db/schema.sql`](db/schema.sql), then [`db/demo-toolkit.sql`](db/demo-toolkit.sql), then runs [`db/init-demo.sh`](db/init-demo.sh), which loads [`db/seed.sql`](db/seed.sql) unless you set `DEMO_DATA=0`: the same 25-item menu, prices, and **real images** the terminal ships.
- **`adminium`** — an Adminium instance pre-pointed at the `pos` database. It imports that connection and **auto-generates the back-office** (menu, tickets, payments, shifts) — see [`manifest.json`](manifest.json). Finish the ~1-minute setup wizard the first time.
- **`web`** — the POS terminal SPA, built and served by Caddy.

| Surface | URL |
| --- | --- |
| POS terminal | <http://localhost:8080> |
| Adminium back-office | <http://localhost:4600> |

The **same menu** appears in both, because both read the one `pos` database. Set a real `ADMINIUM_SECRET` (a 32-byte hex string — `openssl rand -hex 32`; see [`.env.example`](.env.example)) for any deployment beyond local dev.

> **Live data:** the terminal renders through a thin `DataSource` seam ([`src/data/source.ts`](src/data/source.ts)). Once the **browser-safe publishable key** ships, an HTTP source will read the same rows through the Adminium **records API** — the UI never changes. Today the terminal uses the built-in demo catalogue (now with real images).

### Demo data

The stack is seeded out of the box: `docker compose up` gives you the schema plus the demo menu, tickets, payments, and shifts, so the back-office has something to show on the first run. For an empty database with exactly the same schema, set `DEMO_DATA=0` in `.env` before the first `docker compose up`. Neither choice is permanent — four scripts drive it from then on:

| Command | What it does |
| --- | --- |
| `npm run demo:status` | What is loaded right now, table by table |
| `npm run demo:import` | Load `db/seed.sql` |
| `npm run demo:wipe` | Remove the demo rows — the schema and your own rows stay |
| `npm run demo:reset` | Wipe, then import a fresh copy |

A wipe deletes only the rows the seed added. They are tracked in a separate `adminium_demo` Postgres schema, so nothing is written to your tables. A demo row your own data still depends on is kept rather than force-deleted, and reported under `kept`. `ON DELETE CASCADE` still applies, though: deleting a demo ticket takes its `ticket_items` with it, including a line you added to that ticket yourself, and those rows are counted separately under `cascaded`. `wipe` and `reset` ask before they run — `npm run demo:wipe -- --yes` skips the question, which is what you need in a script, where there is nobody to ask. Set `DATABASE_URL` to point any of them at a Postgres elsewhere (Neon, Supabase, RDS) instead of the `pos-db` container.

The full reference, including how the tracking works, is in [db/README.md](db/README.md).

---

## Local development

Requires **Node 22**. Uses **npm** (a `package-lock.json` is committed).

```bash
npm install
npm run dev          # start the dev server
npm run build        # production build (base "/")  → dist/
npm run build:demo   # production build for the hosted demo (base "/demo/point-of-sale/")
npm run preview      # preview a production build locally
npm run typecheck    # type-check without emitting
```

---

## Connecting to Adminium

This example runs on built-in demo data today (see [`src/data/demo.ts`](src/data/demo.ts)). Data access is behind a thin `DataSource` seam in [`src/data/source.ts`](src/data/source.ts): when the Adminium **publishable-key API** lands, an HTTP implementation can satisfy the same interface and connect this UI to your Adminium instance — the rest of the app never changes.

> **Note:** the contract's primary target is an **Electron local build**. This repository ships the **hosted-SPA** variant; the Electron wrap is future work.

---

## Tech

- [Vite 7](https://vite.dev) + [React 19](https://react.dev) + [TypeScript](https://www.typescriptlang.org)
- [Zustand](https://github.com/pmndrs/zustand) for the shared POS store (one store across register / floor / payment / kitchen; state-based view routing, no router)
- [lucide-react](https://lucide.dev) icons
- Plain CSS with design-token custom properties; self-hosted Manrope + JetBrains Mono

## License

[AGPL-3.0](LICENSE) © 2026 Point of Sale. A demo shipped with Adminium.
