/**
 * Ref → table for this app: the manifest's SHORT names.
 *
 * App-specific by nature: it is one of the two things this repo supplies to the
 * shared hosted-mode machinery (the other is the side → entry line in
 * `main.tsx`). Kept in its own module rather than beside that line so
 * `refCoverage.test.ts` can check it against `REQUIRED` — an unmapped ref is
 * invisible until a hosted build asks for it.
 *
 * These are the names the manifest declares. An install gives the tables a
 * prefix (`pos_tickets`), and the staff config says what they are really
 * called; {@link realTables} applies that. Without one — the demo, a database
 * someone made by hand — the short names stand.
 */
export const TABLE_OF_REF = {
  settings: 'settings',
  bookingRules: 'booking_rules',
  staff: 'staff',
  menuCategories: 'menu_categories',
  menuItems: 'menu_items',
  modifierGroups: 'modifier_groups',
  modifiers: 'modifiers',
  restaurantTables: 'restaurant_tables',
  tickets: 'tickets',
  ticketItems: 'ticket_items',
  ticketItemModifiers: 'ticket_item_modifiers',
  payments: 'payments',
  refunds: 'refunds',
  refundItems: 'refund_items',
  shifts: 'shifts',
  timeClock: 'time_clock',
  reservations: 'reservations',
  customers: 'customers',
  rewards: 'rewards',
  loyaltyLedger: 'loyalty_ledger',
  giftCards: 'gift_cards',
  giftCardLedger: 'gift_card_ledger',
} as const;

/** The map above, pointed at the tables an install actually made. */
export function realTables(real: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(TABLE_OF_REF).map(([ref, short]) => [ref, real[short] ?? short]));
}
