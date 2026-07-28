-- Point of Sale — seed data.
--
-- The 25 menu items below are byte-for-byte the same catalogue as MENU in
-- src/data/demo.ts (name, price, category, image URL, availability), so the POS
-- terminal and the Adminium admin dashboard render the identical menu. Almond
-- Croissant is the one sold-out item.
--
-- Serial ids land in insertion order: menu_items 1..25, restaurant_tables 1..12,
-- tickets 1..15. The ticket_items / payments below reference those ids directly.

-- ---------------------------------------------------------------------------
-- Menu (25 items — same as src/data/demo.ts)
-- ---------------------------------------------------------------------------
INSERT INTO menu_items (name, price, category, image_url, available) VALUES
  ('Espresso',        3.20, 'coffee', 'https://images.unsplash.com/photo-1510707577719-ae7c14805e3a?w=600&q=75&auto=format&fit=crop', TRUE),
  ('Flat White',      4.50, 'coffee', 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&q=75&auto=format&fit=crop', TRUE),
  ('Cappuccino',      4.20, 'coffee', 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=600&q=75&auto=format&fit=crop', TRUE),
  ('Latte',           4.80, 'coffee', 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=600&q=75&auto=format&fit=crop', TRUE),
  ('Americano',       3.60, 'coffee', 'https://images.unsplash.com/photo-1510707577719-ae7c14805e3a?w=600&q=75&auto=format&fit=crop', TRUE),
  ('Mocha',           5.20, 'coffee', 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&q=75&auto=format&fit=crop', TRUE),
  ('Chai Latte',      4.60, 'tea',    'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=600&q=75&auto=format&fit=crop', TRUE),
  ('Earl Grey',       3.40, 'tea',    'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=600&q=75&auto=format&fit=crop', TRUE),
  ('Green Tea',       3.40, 'tea',    'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=600&q=75&auto=format&fit=crop', TRUE),
  ('Matcha Latte',    5.40, 'tea',    'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=600&q=75&auto=format&fit=crop', TRUE),
  ('Avocado Toast',   9.50, 'food',   'https://images.unsplash.com/photo-1541519227354-08fa5d50c44d?w=600&q=75&auto=format&fit=crop', TRUE),
  ('Breakfast Bowl', 12.00, 'food',   'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&q=75&auto=format&fit=crop', TRUE),
  ('Halloumi Wrap',  10.50, 'food',   'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=600&q=75&auto=format&fit=crop', TRUE),
  ('Soup of the Day', 7.50, 'food',   'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600&q=75&auto=format&fit=crop', TRUE),
  ('Quiche Lorraine', 8.50, 'food',   'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=600&q=75&auto=format&fit=crop', TRUE),
  ('Croissant',       3.80, 'bakery', 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600&q=75&auto=format&fit=crop', TRUE),
  ('Almond Croissant',4.60, 'bakery', 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600&q=75&auto=format&fit=crop', FALSE),
  ('Banana Bread',    4.20, 'bakery', 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&q=75&auto=format&fit=crop', TRUE),
  ('Blueberry Muffin',3.90, 'bakery', 'https://images.unsplash.com/photo-1607958996333-41aef7caefaa?w=600&q=75&auto=format&fit=crop', TRUE),
  ('Cinnamon Roll',   4.40, 'bakery', 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=600&q=75&auto=format&fit=crop', TRUE),
  ('Cold Brew',       5.00, 'cold',   'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=600&q=75&auto=format&fit=crop', TRUE),
  ('Iced Latte',      5.20, 'cold',   'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=600&q=75&auto=format&fit=crop', TRUE),
  ('Fresh OJ',        5.50, 'cold',   'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=600&q=75&auto=format&fit=crop', TRUE),
  ('Sparkling Water', 3.00, 'cold',   'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=600&q=75&auto=format&fit=crop', TRUE),
  ('Lemonade',        4.50, 'cold',   'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=600&q=75&auto=format&fit=crop', TRUE);

-- ---------------------------------------------------------------------------
-- Floor plan (12 tables across four zones)
-- ---------------------------------------------------------------------------
INSERT INTO restaurant_tables (label, seats, zone) VALUES
  ('W1',  2, 'Window'),   -- 1
  ('W2',  4, 'Window'),   -- 2
  ('W3',  2, 'Window'),   -- 3
  ('P1',  4, 'Patio'),    -- 4
  ('P2',  4, 'Patio'),    -- 5
  ('P3',  6, 'Patio'),    -- 6
  ('B1',  1, 'Bar'),      -- 7
  ('B2',  1, 'Bar'),      -- 8
  ('B3',  1, 'Bar'),      -- 9
  ('T10', 4, 'Main'),     -- 10
  ('T12', 4, 'Main'),     -- 11
  ('T14', 6, 'Main');     -- 12

-- ---------------------------------------------------------------------------
-- Tickets (15 — mixed statuses and dates). total = sum of the ticket_items.
-- ---------------------------------------------------------------------------
INSERT INTO tickets (number, table_id, status, total, opened_at, closed_at) VALUES
  ('1028', 11,   'paid', 20.30, now() - interval '3 days',              now() - interval '3 days' + interval '42 minutes'), -- 1
  ('1029', 1,    'paid',  8.00, now() - interval '2 days' - interval '3 hours', now() - interval '2 days' - interval '2 hours'), -- 2
  ('1030', 4,    'paid', 22.00, now() - interval '2 days',              now() - interval '2 days' + interval '55 minutes'), -- 3
  ('1031', 6,    'paid', 31.50, now() - interval '1 day' - interval '5 hours', now() - interval '1 day' - interval '4 hours'),  -- 4
  ('1032', NULL, 'paid',  7.10, now() - interval '1 day' - interval '2 hours', now() - interval '1 day' - interval '2 hours'),  -- 5 (walk-in)
  ('1033', 2,    'void',  5.20, now() - interval '1 day',               now() - interval '1 day' + interval '9 minutes'),  -- 6
  ('1034', 10,   'paid', 23.50, now() - interval '20 hours',                now() - interval '20 hours' + interval '48 minutes'),  -- 7
  ('1035', 7,    'paid',  8.00, now() - interval '8 hours',                 now() - interval '8 hours' + interval '15 minutes'),   -- 8
  ('1036', 12,   'paid', 22.70, now() - interval '6 hours',                 now() - interval '6 hours' + interval '38 minutes'),   -- 9
  ('1037', 5,    'paid', 15.90, now() - interval '3 hours',                 now() - interval '3 hours' + interval '31 minutes'),   -- 10 (split)
  ('1038', 3,    'sent', 25.60, now() - interval '40 minutes',              NULL),                                         -- 11
  ('1039', 8,    'open',  8.00, now() - interval '6 minutes',               NULL),                                         -- 12
  ('1040', 4,    'sent', 22.00, now() - interval '4 minutes',               NULL),                                         -- 13
  ('1041', 9,    'open', 13.80, now() - interval '2 minutes',               NULL),                                         -- 14
  ('1042', 11,   'open', 33.90, now() - interval '19 minutes',              NULL);                                         -- 15

-- ---------------------------------------------------------------------------
-- Ticket line items (menu_item_id references the catalogue above)
-- ---------------------------------------------------------------------------
INSERT INTO ticket_items (ticket_id, menu_item_id, qty, unit_price, notes) VALUES
  -- #1028 (paid, T12) — 20.30
  (1, 4, 2, 5.40, 'Oat milk'),
  (1, 11, 1, 9.50, 'No chili flakes'),
  -- #1029 (paid, W1) — 8.00
  (2, 3, 1, 4.20, NULL),
  (2, 16, 1, 3.80, NULL),
  -- #1030 (paid, P1) — 22.00
  (3, 12, 1, 12.00, NULL),
  (3, 21, 2, 5.00, 'Extra ice'),
  -- #1031 (paid, P3) — 31.50
  (4, 2, 3, 4.50, NULL),
  (4, 13, 1, 10.50, 'No onion'),
  (4, 14, 1, 7.50, NULL),
  -- #1032 (paid, walk-in) — 7.10
  (5, 1, 1, 3.20, NULL),
  (5, 19, 1, 3.90, NULL),
  -- #1033 (void, W2) — 5.20
  (6, 6, 1, 5.20, 'Voided — wrong order'),
  -- #1034 (paid, T10) — 23.50
  (7, 10, 2, 5.40, NULL),
  (7, 18, 1, 4.20, NULL),
  (7, 15, 1, 8.50, NULL),
  -- #1035 (paid, B1) — 8.00
  (8, 5, 1, 3.60, NULL),
  (8, 20, 1, 4.40, NULL),
  -- #1036 (paid, T14) — 22.70
  (9, 4, 2, 4.80, NULL),
  (9, 16, 2, 3.80, NULL),
  (9, 23, 1, 5.50, NULL),
  -- #1037 (paid split, P2) — 15.90
  (10, 7, 1, 4.60, NULL),
  (10, 8, 1, 3.40, NULL),
  (10, 9, 1, 3.40, NULL),
  (10, 25, 1, 4.50, NULL),
  -- #1038 (sent, W3) — 25.60
  (11, 13, 1, 10.50, NULL),
  (11, 14, 1, 7.50, NULL),
  (11, 16, 2, 3.80, NULL),
  -- #1039 (open, B2) — 8.00
  (12, 3, 1, 4.20, NULL),
  (12, 16, 1, 3.80, NULL),
  -- #1040 (sent, P1) — 22.00
  (13, 12, 1, 12.00, NULL),
  (13, 21, 2, 5.00, NULL),
  -- #1041 (open, B3) — 12.80
  (14, 22, 1, 5.20, NULL),
  (14, 22, 1, 5.20, 'Decaf'),
  (14, 8, 1, 3.40, NULL),
  -- #1042 (open, T12) — 33.90 (matches src/data/demo.ts seedTicket)
  (15, 2, 2, 5.10, 'Oat milk'),
  (15, 11, 1, 9.50, 'No chili flakes'),
  (15, 21, 1, 6.60, 'Large · Extra shot'),
  (15, 16, 2, 3.80, NULL);

-- ---------------------------------------------------------------------------
-- Payments (paid tickets only; #1037 is a card + cash split)
-- ---------------------------------------------------------------------------
INSERT INTO payments (ticket_id, method, amount, paid_at) VALUES
  (1,  'card', 20.30, now() - interval '3 days' + interval '42 minutes'),
  (2,  'cash',  8.00, now() - interval '2 days' - interval '2 hours'),
  (3,  'card', 22.00, now() - interval '2 days' + interval '55 minutes'),
  (4,  'card', 31.50, now() - interval '1 day' - interval '4 hours'),
  (5,  'cash',  7.10, now() - interval '1 day' - interval '2 hours'),
  (7,  'qr',   23.50, now() - interval '20 hours' + interval '48 minutes'),
  (8,  'card',  8.00, now() - interval '8 hours' + interval '15 minutes'),
  (9,  'card', 22.70, now() - interval '6 hours' + interval '38 minutes'),
  (10, 'card', 10.00, now() - interval '3 hours' + interval '31 minutes'),
  (10, 'cash',  5.90, now() - interval '3 hours' + interval '31 minutes');

-- ---------------------------------------------------------------------------
-- Shifts (a few; the last one is still open — ended_at NULL)
-- ---------------------------------------------------------------------------
INSERT INTO shifts (staff, started_at, ended_at) VALUES
  ('Sam Rivera',  now() - interval '3 days' - interval '1 hours',  now() - interval '3 days' + interval '7 hours'),
  ('Alex Chen',   now() - interval '2 days' - interval '1 hours',  now() - interval '2 days' + interval '7 hours'),
  ('Jordan Diaz', now() - interval '1 day' - interval '1 hours',   now() - interval '1 day' + interval '7 hours'),
  ('Sam Rivera',  now() - interval '8 hours',                      NULL);
