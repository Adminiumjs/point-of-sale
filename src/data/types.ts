// Domain types for Point of Sale. Ported from the design comp's implied data
// model — see src/data/demo.ts for the seed data these describe.

export type ServiceMode = 'restaurant' | 'retail';
export type Theme = 'light' | 'dark';
export type Size = 'S' | 'M' | 'L';
export type ModScheme = 'coffee' | 'tea' | 'cold' | null;

export type View =
  | 'login'
  | 'register'
  | 'floor'
  | 'payment'
  | 'complete'
  | 'kitchen';

export interface Staff {
  id: string;
  name: string;
  initials: string;
  role: string;
  pin: string;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  cat: string;
  icon: string;
  image: string;
  mods: ModScheme;
  available?: boolean;
}

export interface Category {
  slug: string;
  name: string;
  icon: string;
  tint: string | null;
}

export interface LineItem {
  key: string;
  id: string;
  qty: number;
  size: Size | null;
  milk: string | null;
  extras: string[];
  note: string;
  seat: number;
  sent: boolean;
}

export interface Ticket {
  number: number;
  table: string | null;
  seats: number;
  openedAt: number;
  items: LineItem[];
}

export interface HeldTicket {
  number: number;
  table: string | null;
  at: number;
  seats: number;
  items: LineItem[];
}

export type TableStatus = 'open' | 'occupied' | 'attention';

export interface TableInfo {
  zone: string;
  label: string;
  seats: number;
  status: TableStatus;
  total?: number;
  since?: number;
  server?: string;
  note?: string;
  current?: boolean;
}

export type DiscountKind = 'pct' | 'amt' | 'comp';

export interface Discount {
  kind: DiscountKind;
  value: number;
  label: string;
}

export type PayMethod = 'cash' | 'card' | 'qr';

export interface Split {
  method: PayMethod;
  amount: number;
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
  number: number;
  table: string | null;
  items: SaleLine[];
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  splits: Split[];
  change: number;
  at: number;
  staff: string;
}

export type KdsStatus = 'new' | 'cooking' | 'ready';

export interface KdsItem {
  n: string;
  q: number;
  m: string;
}

export interface KdsOrder {
  number: number;
  table: string;
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
  tips: number;
  refunds: number;
  comps: number;
}

export interface Extra {
  v: string;
  icon: string;
}

export interface Toast {
  msg: string;
  kind: 'default' | 'success' | 'error';
}
