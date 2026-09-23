/**
 * What a live frame changes in the store.
 *
 * Every change arrives here — including the till's OWN, echoed back by the
 * stream — so each is applied by key and is idempotent: a line this till
 * added (known to it by a temporary key the outbox has since resolved) is the
 * same line when the server announces it, not a second one.
 *
 *   tickets        another till's ticket joins the held tray; one paid or
 *                  voided anywhere leaves it, and frees its table; the
 *                  kitchen's board follows `status` and `kitchen_status`
 *   ticket_items   lines added, changed, voided or removed on any till
 *   ticket_item_modifiers
 *                  a line's chosen options, added to or taken off its selection
 *   reservations   bookings made by guests or at another till; the frame's
 *                  personal fields arrive masked, so the row is read again
 *   menu_items     an item sold out (86) or back on sale anywhere
 *
 * After a reconnect the live lists are read again whole (`resync`), because
 * whatever was announced while the connection was down is gone.
 */
import type { LiveFrame } from '../data/live';
import type { Snapshot } from '../data/adminiumSource';
import type { HeldTicket, KdsOrder, KdsStatus, LineItem, PickupOrder, Reservation, Ticket } from '../data/types';
import { groupsOf, lineName, modLabel } from './calc';
import { instant } from '../data/venueTime';
import { outbox } from './writes';
import { usePos } from './store';

type Row = Record<string, unknown>;

/** A key the till holds — maybe still temporary — is the server's `id`. */
const same = (local: string | undefined, id: string): boolean =>
  local !== undefined && (local === id || String(outbox().resolve(local) ?? '') === id);

const text = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const stamp = (v: unknown): number | null => (typeof v === 'string' ? instant(v) : null);
const numberOf = (v: unknown, fallback: number): number => {
  const match = typeof v === 'string' ? /(\d+)/.exec(v) : null;
  return match === null ? fallback : Number(match[1]);
};

function lineOf(id: string, row: Row): LineItem {
  const reward = text(row['reward_id']);
  return {
    key: id,
    rid: id,
    id: text(row['menu_item_id']) ?? '',
    qty: Number(row['qty'] ?? 1),
    selection: {},
    note: text(row['notes']) ?? '',
    seat: Number(row['seat'] ?? 1),
    sent: row['sent_at'] !== null && row['sent_at'] !== undefined,
    ...(reward === null ? {} : { rewardId: reward }),
    // A gift card load from another till: its code arrives with the next read.
    ...(text(row['gift_card_id']) === null ? {} : { giftCard: { cardId: text(row['gift_card_id'])!, code: '', amount: Number(row['unit_price'] ?? 0) } }),
  };
}

/** The kitchen's card for a ticket, from the lines the till knows it has. */
function cardOf(number: number, rid: string, table: string | null, row: Row, lines: LineItem[]): KdsOrder {
  return {
    number,
    rid,
    table,
    at: stamp(row['sent_at']) ?? Date.now(),
    status: (['new', 'cooking', 'ready'].includes(String(row['kitchen_status'])) ? row['kitchen_status'] : 'new') as KdsStatus,
    items: lines.map(kitchenLine),
  };
}

/** A line as the kitchen reads it: the item, how many, its options and note (as `send` writes it). */
const kitchenLine = (li: LineItem) => ({ n: lineName(li), q: li.qty, m: [modLabel(li), li.note].filter(Boolean).join(' · ') });

export interface ApplyDeps {
  /** Read one booking again: its frame's personal fields arrive masked. */
  fetchReservation?: (id: string) => Promise<Reservation | null>;
}

/** Tables this till adds rows to: their frames can outrun the till's own answer. */
const WRITTEN_HERE = new Set(['tickets', 'ticket_items', 'ticket_item_modifiers']);

export function applyFrame(frame: LiveFrame, deps: ApplyDeps = {}): void {
  const id = frame.id;
  if (id === null) return;
  /*
   * THE ECHO CAN BEAT THE ANSWER. The server announces a row the moment it is
   * written, and the stream can deliver that before the till's own request
   * has its reply — when the till still knows the row only by a temporary
   * key, so the row looked like another till's: the same line twice on the
   * ticket (and in its total), the till's own new ticket on its held tray.
   * While this till has an unanswered insert into the table, the frame waits
   * until everything is answered; then it is matched by key like any other.
   */
  if (WRITTEN_HERE.has(frame.table) && outbox().unanswered(frame.table)) {
    void outbox()
      .idle()
      .then(() => applyFrame(frame, deps));
    return;
  }
  switch (frame.table) {
    case 'tickets':
      applyTicket(frame, id);
      return;
    case 'ticket_items':
      applyLine(frame, id);
      return;
    case 'reservations':
      applyReservation(frame, id, deps);
      return;
    case 'ticket_item_modifiers':
      applyLineOption(frame, id);
      return;
    case 'menu_items':
      applyMenuItem(frame, id);
      return;
    default:
      return;
  }
}

/** A ticket's pickup order, as another till or the kitchen moved it (wave 2). */
function applyPickup(frame: LiveFrame, id: string): void {
  const row = frame.row ?? {};
  const stage = text(row['pickup_stage']);
  const s = usePos.getState();
  const known = s.pickups.find((p) => same(p.rid, id));
  if (frame.kind === 'record.delete' || stage === null || stage === 'collected') {
    if (known !== undefined) usePos.setState({ pickups: s.pickups.filter((p) => p !== known) });
    return;
  }
  if (stage !== 'queued' && stage !== 'making' && stage !== 'ready') return;
  const channel = text(row['channel']);
  const next: PickupOrder = {
    rid: known?.rid ?? id,
    number: numberOf(row['number'], known?.number ?? Number(id)),
    name: known?.name ?? '',
    mobile: known?.mobile ?? null,
    channel: channel === 'phone' || channel === 'web' || channel === 'app' ? channel : 'till',
    stage,
    placedAt: known?.placedAt ?? stamp(row['opened_at']) ?? Date.now(),
    readyAt: stamp(row['ready_at']),
    notifiedAt: stamp(row['notified_at']),
    items: known?.items ?? [],
  };
  usePos.setState({ pickups: known === undefined ? [...s.pickups, next] : s.pickups.map((p) => (p === known ? next : p)) });
}

function applyTicket(frame: LiveFrame, id: string): void {
  applyPickup(frame, id);
  const s = usePos.getState();
  const row = frame.row ?? {};
  const closed = frame.kind === 'record.delete' || row['status'] === 'paid' || row['status'] === 'void';
  const tableId = text(row['table_id']);
  const label = tableId === null ? null : (s.floor.find((tb) => tb.id === tableId)?.label ?? null);

  if (closed) {
    // Settled somewhere — this till's own payment included: off the tray and the board.
    usePos.setState({
      held: s.held.filter((h) => !same(h.rid, id)),
      kds: s.kds.filter((o) => !same(o.rid, id)),
      floor:
        label === null || same(s.ticket.rid, id)
          ? s.floor
          : s.floor.map((tb) => (tb.label === label ? { id: tb.id, zone: tb.zone, label: tb.label, seats: tb.seats, status: 'open' as const } : tb)),
    });
    return;
  }

  const number = numberOf(row['number'], Number(id));
  const isCurrent = same(s.ticket.rid, id);
  const customerId = text(row['customer_id']);
  const member = customerId === null ? {} : { customerId };
  let held: HeldTicket[] = s.held;
  let lines: LineItem[];
  if (isCurrent) {
    lines = s.ticket.items;
  } else {
    const known = s.held.find((h) => same(h.rid, id));
    if (known === undefined) {
      // Another till's ticket: parked on this one's tray, lines to follow.
      held = [...s.held, { number, rid: id, table: label, at: stamp(row['opened_at']) ?? Date.now(), seats: Number(row['guests'] ?? 2), items: [], ...member }];
      lines = [];
    } else {
      held = s.held.map((h) => (h === known ? { ...h, number, table: label ?? h.table, ...member } : h));
      lines = known.items;
    }
  }
  const ticket: Ticket = isCurrent ? { ...s.ticket, number } : s.ticket;
  const atKitchen = row['status'] === 'sent' && row['kitchen_status'] !== 'served';
  const others = s.kds.filter((o) => !same(o.rid, id));
  // Only this till's own ticket may fall back to the table it has on screen; another till's has none.
  const kds = atKitchen ? [...others, cardOf(number, id, label ?? (isCurrent ? ticket.table : null), row, lines)] : others;
  usePos.setState({
    ticket,
    held,
    kds: kds.sort((a, b) => a.at - b.at),
    floor: label === null ? s.floor : s.floor.map((tb) => (tb.label === label && tb.status === 'open' ? { ...tb, status: 'occupied' as const, since: tb.since ?? Date.now() } : tb)),
  });
}

function applyLine(frame: LiveFrame, id: string): void {
  const row = frame.row ?? {};
  const gone = frame.kind === 'record.delete' || (row['voided_at'] !== null && row['voided_at'] !== undefined);
  onLine(id, text(row['ticket_id']), (current) => {
    if (gone) return null;
    if (current === undefined) return lineOf(id, row);
    return { ...current, qty: Number(row['qty'] ?? current.qty), note: text(row['notes']) ?? current.note, sent: current.sent || row['sent_at'] != null };
  });
}

/**
 * Where each option row sits: a delete frame may carry no row, and the option
 * it took off must still be found.
 */
const optionRows = new Map<string, { line: string; option: string }>();

function applyLineOption(frame: LiveFrame, id: string): void {
  const row = frame.row;
  const known = optionRows.get(id);
  const line = text(row?.['ticket_item_id']) ?? known?.line ?? null;
  const option = text(row?.['modifier_id']) ?? known?.option ?? null;
  if (line === null || option === null) return;
  const removed = frame.kind === 'record.delete';
  if (removed) optionRows.delete(id);
  else optionRows.set(id, { line, option });
  onLine(line, null, (current) => {
    if (current === undefined) return undefined;
    // The option's group, read from the item's own menu (menu v1).
    const group = groupsOf(current.id).find((g) => g.options.some((o) => o.id === option));
    if (group === undefined) return current;
    const now = current.selection[group.id] ?? [];
    let next: string[];
    if (removed) next = now.filter((x) => x !== option);
    else if (now.includes(option)) return current;
    else next = group.kind === 'radio' ? [option] : [...now, option];
    const selection = { ...current.selection };
    if (next.length === 0) delete selection[group.id];
    else selection[group.id] = next;
    return { ...current, selection };
  });
}

/**
 * Change one line, on whichever ticket holds it — the register's or a parked
 * one — and let the kitchen's card for that ticket follow. `change` is given
 * the line as the till has it (or `undefined`) and returns the new line,
 * `null` to take it off, or `undefined` to leave the ticket as it is.
 */
function onLine(id: string, ticketId: string | null, change: (current: LineItem | undefined) => LineItem | null | undefined): void {
  const s = usePos.getState();
  const update = (items: LineItem[]): LineItem[] => {
    const at = items.findIndex((li) => same(li.rid, id));
    const next = change(at === -1 ? undefined : items[at]);
    if (next === undefined) return items;
    if (next === null) return at === -1 ? items : items.filter((_, i) => i !== at);
    if (at === -1) return [...items, next];
    return next === items[at] ? items : items.map((li, i) => (i === at ? next : li));
  };
  // Which ticket: the frame names it, or (for a delete or an option) whichever holds the line.
  const owns = (rid: string | undefined, items: LineItem[]) =>
    ticketId !== null ? same(rid, ticketId) : items.some((li) => same(li.rid, id));
  const patch: Partial<ReturnType<typeof usePos.getState>> = {};
  if (owns(s.ticket.rid, s.ticket.items)) {
    const items = update(s.ticket.items);
    if (items !== s.ticket.items) patch.ticket = { ...s.ticket, items };
  }
  const held = s.held.map((h) => {
    if (!owns(h.rid, h.items)) return h;
    const items = update(h.items);
    return items === h.items ? h : { ...h, items };
  });
  if (held.some((h, i) => h !== s.held[i])) patch.held = held;
  if (patch.ticket === undefined && patch.held === undefined) return;
  // The kitchen's card for that ticket follows its lines.
  const linesFor = (rid: string | undefined): LineItem[] | null => {
    if (patch.ticket !== undefined && same(s.ticket.rid, rid ?? '')) return patch.ticket.items;
    const h = (patch.held ?? s.held).find((x) => x.rid !== undefined && rid !== undefined && x.rid === rid);
    return h === undefined ? null : h.items;
  };
  patch.kds = s.kds.map((o) => {
    const own = linesFor(o.rid);
    return own === null ? o : { ...o, items: own.map(kitchenLine) };
  });
  usePos.setState(patch);
}

function applyReservation(frame: LiveFrame, id: string, deps: ApplyDeps): void {
  const s = usePos.getState();
  if (frame.kind === 'record.delete') {
    usePos.setState({ reservations: s.reservations.filter((r) => r.id !== id) });
    return;
  }
  const row = frame.row ?? {};
  const known = s.reservations.find((r) => r.id === id);
  const merged: Reservation = {
    id,
    code: text(row['code']) ?? known?.code ?? null,
    name: text(row['name']) ?? known?.name ?? '',
    mobile: text(row['mobile']) ?? known?.mobile ?? null,
    email: text(row['email']) ?? known?.email ?? null,
    partySize: Number(row['party_size'] ?? known?.partySize ?? 2),
    startsAt: stamp(row['starts_at']) ?? known?.startsAt ?? Date.now(),
    status: (text(row['status']) ?? known?.status ?? 'confirmed') as Reservation['status'],
    channel: (text(row['channel']) ?? known?.channel ?? 'online') as Reservation['channel'],
    tableId: row['table_id'] === undefined ? (known?.tableId ?? null) : text(row['table_id']),
    occasion: row['occasion'] === undefined ? (known?.occasion ?? null) : text(row['occasion']),
    request: row['guest_request'] === undefined ? (known?.request ?? null) : text(row['guest_request']),
    note: row['staff_note'] === undefined ? (known?.note ?? null) : text(row['staff_note']),
  };
  const list = known === undefined ? [...s.reservations, merged] : s.reservations.map((r) => (r.id === id ? merged : r));
  usePos.setState({ reservations: list.sort((a, b) => a.startsAt - b.startsAt) });
  // The stream never carries a guest's name or number: read the row itself.
  if (deps.fetchReservation !== undefined && (row['name'] === null || row['name'] === undefined)) {
    void deps.fetchReservation(id).then((full) => {
      if (full === null) return;
      usePos.setState((st) => ({ reservations: st.reservations.map((r) => (r.id === id ? full : r)) }));
    });
  }
}

function applyMenuItem(frame: LiveFrame, id: string): void {
  if (frame.kind !== 'record.update' || frame.row === null || frame.row['available'] === undefined) return;
  const available = frame.row['available'] === true || frame.row['available'] === 1;
  usePos.setState((s) => ({
    unavail: available ? s.unavail.filter((x) => x !== id) : s.unavail.includes(id) ? s.unavail : [...s.unavail, id],
  }));
}

/**
 * After a reconnect: the live lists as the server has them now. The ticket on
 * the register keeps what this till has not saved yet; once saved, the
 * server's lines stand.
 */
export function resync(snap: Snapshot): void {
  const s = usePos.getState();
  const current = s.ticket.rid;
  const serverCopy = [snap.openTicket, ...snap.held].find((t) => t.rid !== undefined && same(current, t.rid));
  usePos.setState({
    ticket: serverCopy === undefined ? s.ticket : { ...s.ticket, items: serverCopy.items },
    held: snap.held.filter((h) => !same(current, h.rid ?? '')).concat(
      snap.openTicket.rid !== undefined && !same(current, snap.openTicket.rid) ? [{ ...snap.openTicket, at: snap.openTicket.openedAt }] : [],
    ),
    kds: snap.kitchen,
    floor: snap.tables,
    reservations: snap.reservations,
    pickups: snap.pickups,
    unavail: snap.menu.filter((m) => m.available === false).map((m) => m.id),
  });
}
