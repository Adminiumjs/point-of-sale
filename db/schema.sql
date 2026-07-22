-- Martin's POS — PostgreSQL schema (marketplace §10.2 contract).
--
-- This is the source of truth for the back-office database. Adminium imports a
-- connection to a database with this shape and auto-generates the admin
-- dashboard described in manifest.json. The POS terminal (src/data/demo.ts)
-- ships the SAME 25-item catalogue so both surfaces show identical menus.
--
-- Table name note: `restaurant_tables`, not `tables`, because TABLE is a SQL
-- reserved word and bare `tables` fights tooling and information_schema.

DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS ticket_items CASCADE;
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS restaurant_tables CASCADE;
DROP TABLE IF EXISTS menu_items CASCADE;
DROP TABLE IF EXISTS shifts CASCADE;

-- The sellable catalogue. Mirrors MENU in src/data/demo.ts one-to-one.
CREATE TABLE menu_items (
  id        SERIAL PRIMARY KEY,
  name      TEXT NOT NULL,
  price     NUMERIC(10, 2) NOT NULL,
  category  TEXT NOT NULL,
  image_url TEXT,
  available BOOLEAN NOT NULL DEFAULT TRUE
);

-- Physical seating, grouped by zone (Window / Patio / Bar / Main).
CREATE TABLE restaurant_tables (
  id    SERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  seats INT NOT NULL,
  zone  TEXT NOT NULL
);

-- One open/closed check. table_id is nullable for walk-in / retail sales.
CREATE TABLE tickets (
  id        SERIAL PRIMARY KEY,
  number    TEXT NOT NULL UNIQUE,
  table_id  INT REFERENCES restaurant_tables (id),
  status    TEXT NOT NULL DEFAULT 'open'
              CHECK (status IN ('open', 'sent', 'paid', 'void')),
  total     NUMERIC(10, 2) NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

-- Line items on a ticket. Deleting a ticket removes its lines.
CREATE TABLE ticket_items (
  id           SERIAL PRIMARY KEY,
  ticket_id    INT NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  menu_item_id INT REFERENCES menu_items (id),
  qty          INT NOT NULL DEFAULT 1,
  unit_price   NUMERIC(10, 2) NOT NULL,
  notes        TEXT
);

-- Tenders against a ticket. A ticket may have several (split payments).
CREATE TABLE payments (
  id        SERIAL PRIMARY KEY,
  ticket_id INT NOT NULL REFERENCES tickets (id),
  method    TEXT NOT NULL CHECK (method IN ('cash', 'card', 'qr')),
  amount    NUMERIC(10, 2) NOT NULL,
  paid_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Staff shifts. ended_at NULL means the shift is still open.
CREATE TABLE shifts (
  id         SERIAL PRIMARY KEY,
  staff      TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at   TIMESTAMPTZ
);

CREATE INDEX idx_tickets_status ON tickets (status);
CREATE INDEX idx_ticket_items_ticket_id ON ticket_items (ticket_id);
CREATE INDEX idx_payments_ticket_id ON payments (ticket_id);
