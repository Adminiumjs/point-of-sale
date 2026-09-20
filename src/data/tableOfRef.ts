/**
 * Ref → table for this app.
 *
 * App-specific by nature: it is one of the two things this repo supplies to the
 * shared hosted-mode machinery (the other is the side → entry line in
 * `main.tsx`). Kept in its own module rather than beside that line so
 * `refCoverage.test.ts` can check it against `REQUIRED` — an unmapped ref is
 * invisible until a hosted build asks for it.
 *
 * `restaurantTables` is the one ref whose table name is not its ref snake-cased
 * with nothing added: TABLE is a reserved word, so `db/schema.sql` names the
 * floor `restaurant_tables`.
 */
export const TABLE_OF_REF = {
  menuItems: 'menu_items',
  restaurantTables: 'restaurant_tables',
  tickets: 'tickets',
  ticketItems: 'ticket_items',
  payments: 'payments',
  shifts: 'shifts',
} as const;
