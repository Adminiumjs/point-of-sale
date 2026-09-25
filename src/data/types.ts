// Domain types for Point of Sale. Ported from the design comp's implied data
// model — see src/data/demo.ts for the seed data these describe.

export type ServiceMode = 'restaurant' | 'retail';
export type Theme = 'light' | 'dark';
/**
 * What was chosen on a line: option ids by their group's id (menu v1). A
 * radio group holds one, a check group any number up to its `max`.
 */
export type Selection = Record<string, string[]>;

export type View =
  | 'login'
  | 'register'
  | 'floor'
  | 'payment'
  | 'complete'
  | 'kitchen'
  | 'reservations'
  | 'refund'
  | 'shiftclose'
  | 'eod'
  | 'staff'
  | 'menu86'
  | 'labels'
  | 'loyalty'
  | 'giftcards'
  | 'pickup'
  | 'display'
  | 'book'
  | 'manage'
  | 'email';

export interface Staff {
  id: string;
  name: string;
  initials: string;
  role: string;
  pin: string;
  email?: string | null;
}

/** Someone clocked in and not out yet: the open `time_clock` row. */
export interface ClockEntry {
  staffId: string;
  /** The row: a temporary key until saved. */
  rid?: string;
  /** A millisecond stamp. */
  since: number;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  cat: string;
  icon: string;
  image: string;
  available?: boolean;
  /** What a scanner reads off its label (menu v1's `barcode`). */
  barcode?: string | null;
}

export interface Category {
  slug: string;
  name: string;
  icon: string;
  tint: string | null;
}

export interface LineItem {
  key: string;
  /** The line's row: a temporary key until the server has saved it. */
  rid?: string;
  id: string;
  qty: number;
  /** The chosen options (menu v1): the item's own groups, by id. */
  selection: Selection;
  note: string;
  seat: number;
  sent: boolean;
  /**
   * A reward the ticket's member spent points on (wave 2): the line is the
   * reward's item, free. Its points are taken when the ticket is paid.
   */
  rewardId?: string;
  /**
   * Money put onto a gift card (wave 2): the line sells the load. It has no
   * menu item, no tax and no discount, and never goes to the kitchen; the
   * card is credited when the ticket is paid.
   */
  giftCard?: { cardId: string; code: string; amount: number };
}

export interface Ticket {
  number: number;
  /** The ticket's row: a temporary key until saved. Absent until the ticket is first written. */
  rid?: string;
  /** The booking seated at this ticket, when it was opened by "Seat now". */
  reservationId?: string;
  /** The loyalty member the ticket is for (wave 2): they earn its points. */
  customerId?: string;
  /** Taken for pickup (wave 2): how it came in. The order itself lives in `pickups`. */
  pickup?: PickupChannel;
  table: string | null;
  seats: number;
  openedAt: number;
  items: LineItem[];
}

export interface HeldTicket {
  number: number;
  rid?: string;
  /** Its loyalty member, parked with it. */
  customerId?: string;
  table: string | null;
  at: number;
  seats: number;
  items: LineItem[];
}

export type TableStatus = 'open' | 'occupied' | 'attention';

export interface TableInfo {
  /** The table's row, when the floor was read from Adminium. */
  id?: string;
  zone: string;
  label: string;
  seats: number;
  status: TableStatus;
  total?: number;
  /** When it was seated: a millisecond stamp (it was minutes in the demo, and a stamp when connected — §0.6). */
  since?: number;
  server?: string;
  /** A message key (see TABLES in data/demo.ts), not literal copy. */
  note?: string;
}

export type DiscountKind = 'pct' | 'amt' | 'comp';

export interface Discount {
  kind: DiscountKind;
  value: number;
  label: string;
}

export type PayMethod = 'cash' | 'card' | 'qr' | 'gift_card';

export interface Split {
  method: PayMethod;
  amount: number;
  /** A gift card's code, when it paid (`payments.reference`). */
  reference?: string;
  tendered?: number;
  change?: number;
}

export interface SaleLine {
  name: string;
  qty: number;
  unit: number;
  line: number;
  mod: string;
  note: string;
}

export interface Sale {
  /** The ticket's row, so the receipt can be emailed after it closed. */
  rid?: string;
  /** The member the ticket was for, when there was one (`tickets.customer_id`). */
  customerId?: string;
  number: number;
  table: string | null;
  items: SaleLine[];
  subtotal: number;
  /** Amount taken off the goods. Recorded so the receipt's rows add up to its
   * total — without it a comped or discounted sale printed a subtotal, a tax
   * and a tip that summed to more than the total beneath them. */
  discount: number;
  discountLabel: string;
  tax: number;
  tip: number;
  total: number;
  splits: Split[];
  change: number;
  at: number;
  staff: string;
  /** The loyalty member it was for: what it earned, and their balance after. */
  member?: { name: string; earned: number; balance: number | null };
  /** How the guest asked for their receipt on the customer display (wave 2). */
  receipt?: { via: ReceiptVia; to: string | null };
  /** The addresses its receipt was emailed to from the till, in order. */
  emailedTo?: string[];
}

export type KdsStatus = 'new' | 'cooking' | 'ready';

export interface KdsItem {
  n: string;
  q: number;
  m: string;
}

export interface KdsOrder {
  number: number;
  /** The ticket's row, so a bump is saved on it. */
  rid?: string;
  /** `null` for a ticket opened without a table — rendered through
   * `tableName()`, which turns it into the localized "New ticket" /
   * "Walk-in sale" label rather than a hardcoded English word. */
  table: string | null;
  at: number;
  status: KdsStatus;
  items: KdsItem[];
}

export interface ShiftTotals {
  orders: number;
  gross: number;
  card: number;
  cash: number;
  qr: number;
  /** Paid from gift cards (wave 2): not money into the drawer or the bank today. */
  gift: number;
  tips: number;
  refunds: number;
  /** The part of `refunds` paid out of the drawer — the drawer count leaves it out. */
  cashRefunds: number;
  comps: number;
}

/** One line of a closed sale, as Refund reads it. */
export interface PastLine {
  /** The `ticket_items` row, which a refund names. */
  rid?: string;
  name: string;
  qty: number;
  unit: number;
  line: number;
  mod: string;
  /** How many of it earlier refunds already gave back. */
  refunded: number;
  /** Money put on a gift card: it is on the card, and is never refunded from here. */
  giftCard?: true;
}

/** A closed (paid) ticket, as Refund reads it. */
export interface PastSale {
  rid?: string;
  number: number;
  table: string | null;
  /** A millisecond stamp. */
  closedAt: number;
  /** How it was paid: the first payment's method. */
  method: PayMethod;
  lines: PastLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  /** What earlier refunds on it came to. */
  refunded: number;
  /** The loyalty member it was for: a refund takes back the points it earned. */
  customerId?: string;
  /** The gift card that paid for it, by code: a refund can go back onto it. */
  giftCardCode?: string;
}

export interface Extra {
  v: string;
  icon: string;
}

/** A menu item's group of options (menu v1): a size, a milk, the extras. */
export interface ModifierGroup {
  id: string;
  itemId: string;
  slug: string;
  name: string;
  kind: 'radio' | 'check';
  min: number;
  max: number;
  options: { id: string; slug: string; name: string; delta: number; available: boolean }[];
}

export type ReservationStatus = 'confirmed' | 'seated' | 'no_show' | 'cancelled';

export interface Reservation {
  id: string;
  code: string | null;
  name: string;
  mobile: string | null;
  email: string | null;
  partySize: number;
  /** A millisecond stamp. */
  startsAt: number;
  status: ReservationStatus;
  channel: 'online' | 'phone' | 'walk_in';
  tableId: string | null;
  occasion: string | null;
  request: string | null;
  note: string | null;
}

/** The venue's booking rules (the one-row `booking_rules`). */
export interface BookingRules {
  opens: string;
  closes: string;
  slotMinutes: number;
  coversPerSlot: number;
  daysAhead: number;
  maxParty: number;
  holdMinutes: number;
  cancelHours: number;
  occasions: string[];
}

/** The venue's own details, as a receipt prints them (`settings`). */
export interface VenueDetails {
  name: string;
  address: string | null;
  phone: string | null;
  /** The line a receipt ends on. */
  footer: string | null;
}

/** A loyalty member (wave 2's `customers`). */
export interface Member {
  id: string;
  /** The number on their card, which Adminium gives them. */
  memberNo: string | null;
  name: string;
  mobile: string | null;
  email: string | null;
  /** A millisecond stamp. */
  joinedAt: number;
  /** What they can spend now. */
  points: number;
  /** Every point they ever earned: the tier reads this, so spending never lowers it. */
  lifetime: number;
  visits: number;
}

/** Something a member can spend points on: an item from the menu, free. */
export interface Reward {
  id: string;
  name: string;
  /** What it costs, in points. */
  points: number;
  /** The menu item it gives. */
  itemId: string;
  icon: string;
}

/** One line of a member's points history (`loyalty_ledger`). */
export interface PointsEntry {
  id: string;
  kind: 'earn' | 'redeem' | 'adjust';
  /** Signed: what it added or took. */
  points: number;
  rewardId: string | null;
  note: string | null;
  /** A millisecond stamp. */
  at: number;
}

/** A gift card (wave 2's `gift_cards`). Its balance is Adminium's rollup of its history. */
export interface GiftCard {
  id: string;
  /** `GC-7Q2KX9M4`: Adminium makes it. */
  code: string;
  /** Inactive until the ticket that sells it is paid. */
  status: 'inactive' | 'active' | 'void';
  balance: number;
  /** A millisecond stamp, once sold. */
  issuedAt: number | null;
}

/** One line of a card's history (`gift_card_ledger`). */
export interface GiftCardEntry {
  id: string;
  kind: 'issue' | 'reload' | 'redeem' | 'refund' | 'adjust';
  /** Signed: what it added or took. */
  amount: number;
  /** A millisecond stamp. */
  at: number;
}

/** How the guest wants their receipt (wave 2's `tickets.receipt_via`). */
export type ReceiptVia = 'email' | 'text' | 'print' | 'none';

export type PickupChannel = 'till' | 'phone' | 'web' | 'app';
export type PickupStage = 'queued' | 'making' | 'ready' | 'collected';

/** An order someone will collect (wave 2's ticket columns `channel`, `pickup_*`). */
export interface PickupOrder {
  /** The ticket's row (a temporary key until saved). */
  rid: string;
  number: number;
  /** Who collects it: the ticket's customer. */
  name: string;
  mobile: string | null;
  channel: PickupChannel;
  stage: Exclude<PickupStage, 'collected'>;
  /** Millisecond stamps. */
  placedAt: number;
  readyAt: number | null;
  notifiedAt: number | null;
  /** "2× Latte", as last known — the live ticket's lines win while it is on this till. */
  items: string[];
}

export interface Toast {
  msg: string;
  kind: 'default' | 'success' | 'error';
}
