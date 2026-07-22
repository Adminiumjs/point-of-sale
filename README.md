# Martin's POS

A complete, open-source **point-of-sale** example for cafes and restaurants — staff login, floor plan, order building with modifiers, split payments, a simulated card reader, receipts, and a kitchen display. Built with Vite + React + TypeScript, no backend required: it runs entirely on built-in demo data.

**Live demo → [adminium.dev/demo/martins-pos](https://adminium.dev/demo/martins-pos)**

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

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/MoSofi/martins-pos&project-name=martins-pos&repository-name=martins-pos)

`https://vercel.com/new/clone?repository-url=https://github.com/MoSofi/martins-pos&project-name=martins-pos&repository-name=martins-pos`

### Deploy to DigitalOcean

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/MoSofi/martins-pos/tree/main)

`https://cloud.digitalocean.com/apps/new?repo=https://github.com/MoSofi/martins-pos/tree/main`

A DigitalOcean App Platform spec is included at [`.do/deploy.template.yaml`](.do/deploy.template.yaml).

### Host anywhere

It's a static single-page app — `npm run build` produces a plain `dist/` you can serve from any static host (Netlify, Cloudflare Pages, S3 + CloudFront, GitHub Pages, nginx, …). A multi-stage **Docker** image is provided that builds the app and serves it with Caddy:

```bash
docker build -t martins-pos .
docker run -p 8080:80 martins-pos   # → http://localhost:8080
```

---

## Local development

Requires **Node 22**. Uses **npm** (a `package-lock.json` is committed).

```bash
npm install
npm run dev          # start the dev server
npm run build        # production build (base "/")  → dist/
npm run build:demo   # production build for the hosted demo (base "/demo/martins-pos/")
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

[AGPL-3.0](LICENSE) © Martin's POS contributors.
