// Thin data-source seam. Today the only implementation is `demoSource`, which
// returns the built-in catalogue from demo.ts. When the Adminium publishable-key
// API lands, a `httpSource(publishableKey)` implementation can satisfy the same
// interface and the rest of the app never changes.

import {
  CATS,
  MENU,
  SHIFT,
  STAFF,
  TABLES,
  seedHeld,
  seedKds,
  seedTicket,
} from './demo';
import type {
  Category,
  HeldTicket,
  KdsOrder,
  MenuItem,
  ShiftTotals,
  Staff,
  TableInfo,
  Ticket,
} from './types';

export interface DataSource {
  staff(): Staff[];
  menu(): MenuItem[];
  categories(): Category[];
  tables(): TableInfo[];
  shift(): ShiftTotals;
  openTicket(): Ticket;
  heldTickets(): HeldTicket[];
  kitchenOrders(): KdsOrder[];
}

export const demoSource: DataSource = {
  staff: () => STAFF,
  menu: () => MENU,
  categories: () => CATS,
  tables: () => TABLES,
  shift: () => SHIFT,
  openTicket: () => seedTicket(),
  heldTickets: () => seedHeld(),
  kitchenOrders: () => seedKds(),
};
