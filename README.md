# Point of Sale

A complete, open-source **point-of-sale** example for cafes and restaurants — staff login, floor plan, order building with modifiers, split payments, a simulated card reader, receipts, and a kitchen display. Built with Vite + React + TypeScript, no backend required: it runs entirely on built-in demo data.

**Live demo → [adminium.dev/demo/point-of-sale](https://adminium.dev/demo/point-of-sale)**

The demo card beside it switches screens — the till, its tools and the guest booking pages — flips between **Restaurant** and **Retail** service modes, toggles **online/offline**, and changes the **theme** and the **language**. The app speaks to the card through `src/demoBridge.ts`; what the card offers is declared in `src/demo-card.ts`.

The demo also shows what the till does with **Offers & gift cards** and **Inventory** attached (see [Add-ons](#add-ons)) — an offer that applies by itself, a discount code, a staff discount held to a limit, a gift card paid from at Pay, and how many are left on a shelf. It has no server and calls no add-on: the demo café's own shop answers from memory ([`src/data/demoShop.ts`](src/data/demoShop.ts)) with the café's own figures, worked out by the till's own arithmetic. The card types the café's code and its gift card for you; a card's code is never shown, only its last four.

---

## What's inside

- **Login** — staff chips, a PIN pad that auto-verifies at 4 digits (shake on error), and an opening-float drawer count.
- **Register** — quick-add favourites, category filter + density toggle, a menu grid, a **modifier bottom-sheet** (size / milk / extras / seat / note with live price deltas), and a ticket pane that merges identical lines by a composite key. Hold / Send, coursing by seat, and **type-VOID-to-confirm** for sent items.
- **Payment** — tip presets, a cash keypad with change, a **simulated card reader** (waiting → reading → approved / declined), QR, and a **split-payment ledger** (even + fraction splits with last-payer remainder absorption).
- **Receipt** — printable receipt facsimile (the till's own, printed at once, offline too), an emailed receipt when Invoices & Receipts is attached (see [Add-ons](#add-ons)), new order.
- **Floor** — zones, live table states, seat/auto-hold flow.
- **Kitchen display** — three-column bump flow with an all-day aggregate.
- Held-tickets tray, move / merge, discount & comps.
- **Customer display** — the guest's view of their order: the items, the money, the tip (the same buttons as Payment, custom amount on a keypad — and Payment keeps the guest's choice), then a signature and how they want their receipt. The choice is kept on the ticket and shown on the receipt screen; an address the guest typed there fills in the receipt screen's Email form. Email is offered only while the till can send one. Nothing sends a texted receipt yet.
- **Pickup** — mark a ticket for pickup (at the till or by phone, with the name and number to call), and work the queue in three lanes: Start, Mark ready, Hand off; Notify opens the device's own messages on the guest's number. A paid order waits until it is collected.
- **Gift cards** — look a card up by its code (or scan it), put money on it through the ticket — untaxed, and credited once the ticket is paid — pay a ticket from it, issue a new one, and see its history. A refund of a sale paid by gift card can go back onto the card.
- **Loyalty & rewards** — find a member by phone, member number or name (or scan their code), enroll someone new, put them on the ticket, and spend their points on a reward that joins the ticket free. Points are earned when the ticket is paid — one per whole unit spent on goods — and a tier follows every point ever earned (Silver, Gold from 1,000, Platinum from 2,500).

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
npm run build:demo   # the hosted demo, served inside its card (base "/demo/point-of-sale/app/"; writes dist/demo.json)
npm run preview      # preview a production build locally
npm run typecheck    # type-check without emitting
npm test             # unit tests (vitest)
npm run test:e2e     # every demo screen under axe, light/dark × English/Arabic (Playwright); and, with
                     # ADMINIUM_REPO and ADD_ONS_REPO pointing at built checkouts, the staff screens in a
                     # browser on a real Adminium (e2e/live.e2e.ts) — skipped, with the reason, without one
```

---

## Add-ons

Point of Sale needs no add-on to sell. Installed from Adminium, it **suggests** four, and each switches on its own features of the till. The install check offers them unticked; either can be added, switched off or removed later, and the till follows what its staff config says is attached.

| Add-on | Feature | What the till does with it |
| --- | --- | --- |
| **Invoices & Receipts** | Emailed receipts | The receipt screen's **Email** button asks for the guest's address and queues one message in the app's outbox (`messages`). Adminium sends it with the receipt the add-on draws on an 80 mm roll attached: a PDF, or the print copy in a language a PDF's standard fonts cannot set (Arabic, Chinese). The receipt is the sale line by line (without the lines voided before it was paid), with the figures the till stored — subtotal, a discount as its own row, tax, tip, total — what was taken, tip included (`tickets.charged`, worked out by Adminium), the order number and who served. Without the add-on there is no Email button, and the customer display does not offer an emailed receipt. |
| **Barcode Labels** | Shelf labels (retail) | **Shelf labels**, in the till's menu in retail mode, lists every item with a barcode and draws labels for one from its own `barcode`, `name` and key, through Adminium's staff document route — as many as you ask for, 1 to 240, 24 to an A4 sheet. The sheet opens as a PDF. |
| **Offers & gift cards** | Codes, offers and staff discounts · Gift cards | A **code field** on the ticket takes a discount code or a voucher; an offer that applies by itself shows as its own line. The **discount** dialog gives a staff discount with a reason from Offers' own list, held to the ceiling the owner set for the role — refused by Adminium, not by the till. **Gift cards** are Offers': sold and loaded by a line on a ticket, spent at Pay, given back to on a refund. |
| **Inventory** | Retail stock | A menu item linked to a stock item (on Inventory's own pages) falls when a ticket is **paid** and comes back when a refund says "Back on the shelf". A tile says "Only 3 left" or "Out"; at zero the till still sells, and the ticket's line says "Out on the books · count this item". The sold-out switch stays as it is. |

What to know:

- **The printed receipt stays the till's own.** It is drawn in the browser and printed at once, with or without a connection; the emailed one is a second, separate document.
- **The guest's address is kept in one place:** on that one message (`messages.to_address`), a column marked personal, so Adminium masks it for anyone who has no need to see it. No public page reads it. The ticket keeps nothing of it unless the guest typed it on the customer display (`tickets.receipt_to`, personal too).
- **An address on a reserved domain** (`example.com`, `.test`) is never sent: Adminium skips it.
- **A label sheet prints plain letters only.** It is set in the standard PDF fonts, which carry ASCII and nothing else, so an item named *Café crème* is refused and the till says which letters it cannot print — it never prints a label with holes in it. A number that is not a valid EAN-13 (thirteen digits, check digit included) or Code 128 is refused too, and so is an item with no barcode.
- Every emailed receipt is a row on the **Emailed receipts** page (Records): sent, not sent and why, and a manager can queue a failed one again.

### Who decides a ticket's figures (from 0.3.0)

Adminium does. The reduction, the tax and the total of a ticket are worked out by the server from its lines, in whole cents, the reduction rounded once before tax; a ticket keeps the tax rate of the day it was opened (`tickets.tax_rate_bp`). The till shows its own sum only as an **estimate** until the answer is in, and a ticket closes only on the server's word: it is `paid` when nothing is owing, and from then on its lines, payments and figures are closed. A sale is undone by a refund, never by voiding a paid ticket. A refund carries no money either: Adminium works out what the returned lines come to, and never gives back more than the payment took.

With **Offers & gift cards** connected:

- **Staff ceilings are Offers' rows, by role.** Add a row for `pos-cashier` and one for `pos-manager` on Offers' *Ceilings* page (the percent each may give, and whether a comp is allowed). With no row, a till role can give no staff discount at all — Adminium answers "over the ceiling, the most is 0". A Super Admin is held to none.
- **A code for a named customer** ("first order", "one each") needs a member on the ticket, and the member needs an email: that is what uses are counted by.
- **A gift card pays goods and tax, never the tip.** Its code is typed or scanned once and never shown again; the receipt prints the last four and what is left on it. Money a card paid on a ticket nobody finishes goes back to the card twelve hours later, and at once when the ticket is voided.
- **Selling a new card** needs Offers' own *desk* role beside the till's (the owner gives it); topping one up, paying with a card and reading its balance do not. The Gift card tile opens one sheet for both; someone who may not sell a new card is not offered it (the till reads that from their session, it does not try and fail).
- **A new card's code is never on the till.** Offers hands the save that makes a card its whole code once, and a print ticket beside it. The till drops the code as it reads the reply and keeps only the ticket (in the browser tab, until the card is printed). Once the sale is paid — the card holds nothing before that — **Print the card** opens the page Offers draws, once, for the person who sold it; a reload in between loses nothing. The ticket is good for ten minutes and one use; after that a manager prints the card from Offers.
- **What is typed is never dropped at Pay.** A code left in the ticket's field when Pay is pressed is applied first: refused, the cashier stays on the ticket and the field says why (pressed again with the same refused code, Pay goes on); taken, Payment opens on the total Adminium worked out with it. A gift card typed there is kept for Payment's own tab, and one typed in that tab is asked what it covers before any other payment is taken — once the cashier has the answer, the choice is theirs.
- **A guest reads a card's balance on the Guests side**, at `/gift-card`: one field for the code on the card, the balance and until when it can be used, and nothing else. The code travels in a header, never the address, and is kept nowhere. A card that cannot pay — unknown, cancelled, never sold, past its date — reads the one sentence "That code is not valid", and Adminium allows a visitor only a few wrong codes a minute. The page is there while Offers is attached and its public access allowed; without it the address is the not-found page. The link in a card's email (`/gift-card#…`) opens that card directly, through Offers' own link key — made with Offers' public access, whether Offers was installed by itself or came with the till's install; a cancelled card's link reads the same one sentence. Where a shop holds no such key, the page asks for the code the email carries.
- **A staff discount is refused in words.** "You can give up to 10 %", "You can give up to $4.36" for an amount, "Your role can’t give a comp", or "Your role has no discount limit set in Offers · Ask the owner" when no ceiling row covers the role.
- **Switched off for the till** (not removed), Offers cannot answer: a ticket line is refused by name rather than sold at full price in silence. Switch it on again, or disconnect it — then the till is as it was without it.

With **Inventory** connected: link a menu item to a stock item on Inventory's pages (the link names the till's menu, `pos:menu_items`). Nothing is counted for an item with no link. Switched off for the till, sales go through uncounted.

### Moving from 0.2.x

0.3.0 is a larger step than its number: update on a quiet moment, with every till **synced** (no "offline" chip) and, if you can, the shift closed.

1. **Update Adminium first** to 0.3.20 or later, then the app. The update adds one table and columns; it changes no row that is there — every ticket keeps the cents it charged.
2. **Reload every till** after the update. A till still running the old screens sends its own tax and total, which Adminium now ignores; it also reads a refused close as saved. Until it is reloaded, do not trust its receipt.
3. **A ticket that was open during the update cannot be paid** (it has no tax rate of its own). The till shows "Opened before the update" on it with one button that moves its items onto a new ticket. A ticket that was already part-paid is finished from the dashboard by a manager.
4. **Gift cards, if you had any.** They stay in the till's own tables, exactly as before, until Offers & gift cards is connected. Once it is, a manager sees **Bring your gift cards into Offers** — and the owner (a Super Admin) runs it, once:
   - finish or void any open ticket that carries a gift card first (the screen names them);
   - every card comes into Offers under the code it has always had, with its whole history and its balance to the cent; a card that was cancelled at the till is cancelled there too; a card never sold is left behind;
   - the run can be pressed again at any time: what was moved stays moved, and a run that stopped half-way goes on. While it runs, Offers issues and tops up no card;
   - afterwards the till's own card tables are closed, the old Gift cards screen leaves the menu, and cards are sold, loaded and spent through Offers. **Run the move before issuing any card from Offers' own pages.**
   - **a shop that never sold a card of its own has nothing to run.** With Offers connected and not one card in the till's own table, the cards are Offers' from the first minute: the tile that sells them is on the register, the gift card tab is at Pay, and nobody is shown the banner. It appears only once there is a card to bring in.
5. **A refund of a ticket paid before the update** comes out at the figure 0.2.x would have given. With Offers connected, a ticket that already holds an old refund cannot be refunded a second time from the till; do that one from the dashboard.

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

## Building on this app with a coding agent

The Adminium skills teach Claude Code, Codex and other agents to build and change an app:
`npx skills add Adminiumjs/skills` — https://github.com/Adminiumjs/skills
