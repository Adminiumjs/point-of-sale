/**
 * THE DEMO'S OWN SHOP — the stand-in for the doors a real till asks Adminium
 * through, so the demo shows codes, offers, staff discounts, gift cards and
 * stock on the very screens the real till uses.
 *
 * The demo has no server and calls nobody: everything here is answered in
 * memory, from the demo café's own figures (`demo.ts`) and the till's own
 * arithmetic (`estimate()` in `state/calc.ts`, which is the demo's authority).
 * No add-on is involved and none of their routes is ever named, let alone
 * requested — a real till's doors (`sessionDesk`) are not in the demo's bundle.
 *
 *   demoShop().sink   the memory sink the demo always wrote to, whose answer
 *                     to a ticket's save carries the demo's figures for it —
 *                     the way Adminium's does;
 *   demoShop().desk   the doors that are never queued: a ticket's figures, a
 *                     code, a staff discount tried and given, a gift card
 *                     asked and spent, a refund quoted, the stock words.
 *
 * What the demo decides, and how:
 *
 *   an offer      a tenth off each croissant, by itself;
 *   a code        DAYBREAK5: five off the order (never more than is left);
 *   a discount    up to 10 % for the person at the till, with a reason; a
 *                 comp, or more, is refused in the words the real till uses;
 *   the figures   the reductions in whole cents, then tax on what is left —
 *                 `estimate()`, once;
 *   a gift card   one, holding $25.00: it pays what it covers, never the tip;
 *   a refund      the till's own sum of the lines given back
 *                 (`refundMoney`), never more than the payment took;
 *   stock         what a few shelves hold, less what this session sold.
 *
 * Imported ONLY inside `if (DEMO)` in `main.tsx`, so no real bundle carries a
 * line of it (`testing/demoDataAbsent.test.ts`).
 */
import { money, t } from '../i18n/ambient';
import { estimate, lineUnit, round2 } from '../state/calc';
import { refundMoney, usePos } from '../state/store';
import { outbox, setSink } from '../state/writes';
import { DEMO_CEILING, DEMO_CODE, DEMO_GIFT_CARD, DEMO_OFFER, DEMO_REASONS, DEMO_STOCK, DEMO_STOCK_LOW } from './demo';
import { setDesk, type Desk, type DeskReply, type StockWord, type WireApplied } from './desk';
import type { ListCondition } from './snapshotPort';
import { source } from './source';
import { SinkError, memorySink, type DataSink, type MemorySink, type RowId, type SinkRow } from './sink';

const cents = (n: number): number => Math.round((n + Number.EPSILON) * 100);
/** `a ÷ b` rounded half up, on whole numbers. */
const divRound = (a: number, b: number): number => Math.floor((2 * a + b) / (2 * b));
const same = (a: unknown, b: unknown): boolean => String(a) === String(b);
const refusal = (code: string, details: Record<string, unknown>): SinkError => new SinkError('The demo would not take that.', 'refused', 409, code, null, details);
/** A typed code as it is compared: no spaces or dashes, upper case. */
const bare = (typed: unknown): string =>
  String(typed ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');

/** A condition's value for one column, wherever in an `and` it sits. */
function wanted(where: ListCondition | undefined, column: string): unknown {
  if (where === undefined) return undefined;
  if ('and' in where) {
    for (const one of where.and) {
      const found = wanted(one, column);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if ('or' in where) return undefined;
  return where.column === column ? where.value : undefined;
}

type StaffDiscount = { kind: 'percent' | 'amount' | 'comp'; value: number; reason: string };
interface Reductions {
  codes: { id: string; typed: string; removed: boolean }[];
  staff: StaffDiscount | null;
}

export interface DemoShop {
  sink: DataSink;
  desk: Desk;
  /** What the demo's gift card holds now. */
  cardBalance(): number;
}

export function demoShop(inner: MemorySink = memorySink()): DemoShop {
  const byTicket = new Map<string, Reductions>();
  const of = (ticket: unknown): Reductions => {
    const key = String(ticket);
    const found = byTicket.get(key) ?? { codes: [], staff: null };
    byTicket.set(key, found);
    return found;
  };
  let codeNo = 0;
  let cardNo = 0;
  let cardCents = cents(DEMO_GIFT_CARD.balance);
  /** What this session sold and took back, by menu item. */
  const moved = new Map<string, number>();

  /** The ticket on the register, when `id` is its key. */
  const onRegister = (id: unknown) => {
    const tk = usePos.getState().ticket;
    if (tk.rid === undefined) return null;
    const real = outbox().resolve(tk.rid);
    return real !== undefined && same(real, id) ? tk : null;
  };
  const paidCents = (id: unknown): number =>
    (inner.rows.get('payments') ?? []).filter((row) => same(row['ticket_id'], id)).reduce((sum, row) => sum + cents(Number(row['amount'] ?? 0)), 0);

  /**
   * The demo's figures for the ticket on the register: every reduction in
   * whole cents, then `estimate()` — the till's own arithmetic — on what is
   * left. `trying` is a staff discount tried and not kept.
   */
  function worked(id: unknown, trying?: StaffDiscount | null): { row: SinkRow; applied: WireApplied[]; base: number } | null {
    const tk = onRegister(id);
    if (tk === null) return null;
    const lines = tk.items.map((li) => ({ unit: lineUnit(li), qty: li.qty, load: li.giftCard !== undefined, id: li.id, reward: li.rewardId !== undefined }));
    const goods = lines.filter((li) => !li.load).reduce((sum, li) => sum + cents(li.unit) * li.qty, 0);
    const state = of(id);
    const applied: WireApplied[] = [];

    const onOffer = lines.filter((li) => !li.load && !li.reward && li.id === DEMO_OFFER.item).reduce((sum, li) => sum + cents(li.unit) * li.qty, 0);
    const offer = divRound(onOffer * DEMO_OFFER.percent, 100);
    if (offer > 0) applied.push({ name: DEMO_OFFER.name, kind: 'offer', amount: offer / 100 });

    let left = goods - offer;
    for (const one of state.codes.filter((c) => !c.removed)) {
      const off = Math.min(cents(DEMO_CODE.off), left);
      if (off <= 0) continue;
      left -= off;
      applied.push({ name: t('discount.amountOff', { amount: money(DEMO_CODE.off) }), kind: 'code', amount: off / 100, typed: true, line: one.id });
    }

    // What a staff discount is taken on: the goods less what offers and codes took.
    const base = left;
    const staff = trying === undefined ? state.staff : trying;
    if (staff !== null) {
      const off = Math.min(left, staff.kind === 'comp' ? left : staff.kind === 'percent' ? divRound(left * Math.round(staff.value * 1000), 100_000) : cents(staff.value));
      if (off > 0) {
        left -= off;
        applied.push({ name: DEMO_REASONS.find((r) => r.id === staff.reason)?.label ?? t('offers.kind.staff'), kind: 'staff', amount: off / 100 });
      }
    }

    const reduced = goods - left;
    const fig = estimate(lines, reduced > 0 ? { kind: 'amt', value: reduced / 100 } : null, source.taxRate());
    const paid = paidCents(id);
    return {
      base,
      applied,
      row: {
        id,
        tax_rate_bp: Math.round(source.taxRate() * 10_000),
        subtotal: fig.subtotal,
        goods: fig.goods,
        own_discount: 0,
        discount: fig.discount,
        net: fig.net,
        tax: fig.tax,
        total: fig.total,
        paid: paid / 100,
        due: Math.max(0, cents(fig.total) - paid) / 100,
      },
    };
  }

  /** A staff discount as asked for, held to the demo's limit — refused as Adminium refuses one. */
  function asked(id: unknown, values: SinkRow): StaffDiscount | null | undefined {
    if (!('discount_kind' in values)) return undefined;
    const kind = values['discount_kind'];
    if (kind === null || kind === undefined) return null;
    const value = Number(values['discount_value'] ?? 0);
    const base = worked(id, null)?.base ?? 0;
    if (kind === 'comp') throw refusal('ADJUST_REFUSED', { reason: 'over-ceiling', max: DEMO_CEILING });
    if (kind === 'percent' && value > DEMO_CEILING) throw refusal('ADJUST_REFUSED', { reason: 'over-ceiling', max: DEMO_CEILING });
    const most = divRound(base * DEMO_CEILING, 100);
    if (kind === 'amount' && cents(value) > most) throw refusal('ADJUST_REFUSED', { reason: 'over-ceiling', max: most / 100 });
    return { kind: kind === 'percent' ? 'percent' : 'amount', value, reason: String(values['discount_reason_id'] ?? '') };
  }

  /** What the demo's gift card would cover on a ticket; refused in Adminium's reasons. */
  function cover(values: SinkRow): { covers: number; due: number } {
    if (bare(values['card_code']) !== bare(DEMO_GIFT_CARD.code)) throw refusal('POSTING_REFUSED', { reason: 'not-valid' });
    if (cardCents <= 0) throw refusal('POSTING_REFUSED', { reason: 'empty' });
    const owing = cents(Number(worked(values['ticket_id'])?.row['due'] ?? 0));
    if (owing <= 0) throw refusal('BALANCE_EXCEEDED', { balance: 0 });
    const covers = Math.min(cardCents, owing);
    return { covers, due: owing - covers };
  }

  /** The refund the Refund screen is asking about: the till's own sum of the lines chosen, held to what the payment took. */
  function refundQuote(head: SinkRow): DeskReply {
    const s = usePos.getState();
    const sale = s.refundSale;
    if (sale === null) throw refusal('REFUND_REFUSED', {});
    const sums = refundMoney(sale, s.refundSel);
    const left = round2(sale.total - sale.refunded);
    const payments = (sale.payments ?? []).map((one) => ({ key: one.id, took: one.amount, max: Math.max(0, Math.min(one.amount, left)) }));
    const to = payments.find((one) => same(one.key, head['payment_id']));
    if (to !== undefined && sums.total > to.max + 0.005) throw refusal('ADJUST_REFUSED', { reason: 'refund-over', left: to.max });
    return { data: { ...head, amount: sums.total, tax: sums.tax }, refund: { refundable: left, payments } };
  }

  const withFigures = (ref: string, row: SinkRow): SinkRow => {
    if (ref !== 'tickets') return row;
    const fig = worked(row['id']);
    return fig === null ? row : { ...row, ...fig.row };
  };

  const sink: DataSink = {
    async insert(ref, values, children) {
      const row = await inner.insert(ref, values, children);
      // A refund back onto the demo's gift card puts the money on it again.
      if (ref === 'refunds' && values['method'] === 'gift_card') {
        const sale = usePos.getState().refundSale;
        const paidBy = sale?.payments?.find((one) => same(one.id, values['payment_id']));
        if (sale !== null && paidBy?.last4 === DEMO_GIFT_CARD.last4) cardCents += cents(refundMoney(sale, usePos.getState().refundSel).total);
      }
      if (ref === 'refund_items' || ref === 'refunds') {
        // What goes back on the shelf is on the shelf again.
        for (const child of children ?? []) {
          if (child.ref !== 'refund_items') continue;
          const sale = usePos.getState().refundSale;
          for (const item of child.rows) {
            const line = sale?.lines.find((l) => l.rid !== undefined && same(outbox().resolve(l.rid) ?? l.rid, item['ticket_item_id']));
            const menu = line === undefined ? undefined : source.menu().find((m) => m.name === line.name);
            if (menu !== undefined && item['back_to'] === 'shelf') moved.set(menu.id, (moved.get(menu.id) ?? 0) - Number(item['qty'] ?? 0));
          }
        }
      }
      return withFigures(ref, row);
    },
    async update(ref, id, patch) {
      // A ticket that closes takes what it sold off the shelves, once.
      if (ref === 'tickets' && patch['status'] === 'paid') {
        const tk = onRegister(id);
        for (const li of tk?.items ?? []) if (li.giftCard === undefined) moved.set(li.id, (moved.get(li.id) ?? 0) + li.qty);
      }
      return withFigures(ref, await inner.update(ref, id, patch));
    },
    remove: (ref, id) => inner.remove(ref, id),
  };

  const desk: Desk = {
    async one(ref, id) {
      return ref === 'tickets' ? (worked(id)?.row ?? {}) : {};
    },
    async rows(ref, where) {
      if (ref === 'offers:reasons') return DEMO_REASONS.map((reason, position) => ({ ...reason, active: true, position }));
      if (ref === 'offers:applied') return (worked(wanted(where, 'source_row'))?.applied ?? []).map((line) => ({ ...line }));
      if (ref === 'ticket_codes') {
        return of(wanted(where, 'ticket_id'))
          .codes.filter((code) => !code.removed)
          .map((code) => ({ id: code.id, typed: code.typed }));
      }
      if (ref === 'payments') return (inner.rows.get('payments') ?? []).filter((row) => same(row['ticket_id'], wanted(where, 'ticket_id')));
      return [];
    },
    async create(ref, values, children) {
      if (ref === 'ticket_codes') {
        const state = of(values['ticket_id']);
        if (bare(values['typed']) !== DEMO_CODE.code) throw refusal('ADJUST_REFUSED', { column: 'typed', reason: 'unknown' });
        if (state.codes.some((code) => !code.removed)) throw refusal('ADJUST_REFUSED', { column: 'typed', reason: 'over-limit' });
        const id = `demo-code-${String((codeNo += 1))}`;
        state.codes.push({ id, typed: DEMO_CODE.code, removed: false });
        return { data: { id, ticket_id: values['ticket_id'], typed: DEMO_CODE.code, voucher_id: null }, applied: worked(values['ticket_id'])?.applied ?? [] };
      }
      if (ref === 'payments') {
        const { covers, due } = cover(values);
        cardCents -= covers;
        const row = await inner.insert('payments', { id: values['id'], ticket_id: values['ticket_id'], method: 'gift_card', amount: covers / 100, tip: 0 });
        return {
          data: { ...row, card_amount: covers / 100, card_last4: DEMO_GIFT_CARD.last4, card_balance_after: cardCents / 100 },
          payment: { amount: covers / 100, due: due / 100 },
        };
      }
      // A new card: made, and waiting for the ticket that sells it. The demo has no page to print one on.
      if (ref === 'offers:gift_cards') {
        const label = String(1000 + ((cardNo += 1) * 2371) % 9000);
        return { data: { id: `demo-card-${String(cardNo)}`, kind: 'card', label, status: 'inactive', balance: 0 } };
      }
      return { data: await sink.insert(ref, values, children) };
    },
    async patch(ref, id, values) {
      if (ref === 'tickets') {
        const staff = asked(id, values);
        if (staff !== undefined) of(id).staff = staff;
        const fig = worked(id);
        return { data: fig?.row ?? {}, applied: fig?.applied ?? [] };
      }
      if (ref === 'ticket_codes') {
        for (const state of byTicket.values()) for (const code of state.codes) if (code.id === String(id) && values['removed_at'] !== undefined) code.removed = true;
        return { data: { id, ...values } };
      }
      return { data: await sink.update(ref, id, values) };
    },
    async dryCreate(ref, values) {
      if (ref === 'payments') {
        const { covers, due } = cover(values);
        return { data: {}, payment: { amount: covers / 100, due: due / 100 } };
      }
      if (ref === 'refunds') return refundQuote(values);
      return { data: values };
    },
    async dryUpdate(ref, id, values) {
      if (ref !== 'tickets') return { data: values };
      const fig = worked(id, asked(id, values));
      return { data: fig?.row ?? {}, applied: fig?.applied ?? [] };
    },
    async oneByOne() {
      return { results: [], notRun: 0 };
    },
    async lookUp(value) {
      if (bare(value) !== bare(DEMO_GIFT_CARD.code)) return { found: false };
      return { found: true, kind: 'gift-card', table: 'gift_cards', key: DEMO_GIFT_CARD.id, last4: DEMO_GIFT_CARD.last4, record: { status: 'active', balance: cardCents / 100 } };
    },
    async stockWords(ids) {
      const out: StockWord[] = [];
      for (const id of ids) {
        const counted = DEMO_STOCK[id];
        if (counted === undefined) continue;
        const left = counted - (moved.get(id) ?? 0);
        out.push(left <= 0 ? { id, state: 'out', exact: 0 } : left <= DEMO_STOCK_LOW ? { id, state: 'low', exact: left } : { id, state: 'in' });
      }
      return out;
    },
    async cardPrintUrl() {
      throw refusal('NO_PRINT', {});
    },
  };

  return { sink, desk, cardBalance: () => cardCents / 100 };
}

/**
 * Open the demo's shop: its writes and its doors from now on, the features
 * the demo café has, and — since the cards were never the till's own — gift
 * cards as Offers keeps them, with no move. The figures are the demo's own,
 * so nothing is ever labelled an estimate.
 *
 * The ticket the demo opens on is given its row, so its offer shows from the
 * first look — and again whenever the demo puts a seeded ticket back.
 */
export function openDemoShop(shop: DemoShop = demoShop()): () => void {
  setSink(shop.sink);
  setDesk(shop.desk);
  usePos.setState({ connected: true, figureless: true, cardsMoved: true, ownCards: 0 });
  const rowFor = (): void => {
    const tk = usePos.getState().ticket;
    if (tk.rid !== undefined || tk.items.length === 0) return;
    const rid = outbox().temp();
    usePos.setState((s) => (s.ticket.rid === undefined ? { ticket: { ...s.ticket, rid } } : {}));
    void outbox().insert(rid, 'tickets', { status: 'open', held: false, guests: Math.max(1, tk.seats || 1) }, { temp: rid });
  };
  rowFor();
  /*
   * A seeded line was never written (the demo opens with it), so changing it
   * writes nothing — and nothing would read the figures again. The demo reads
   * them whenever what is on the ticket changed and no write is on its way.
   */
  const shape = (): string => {
    const tk = usePos.getState().ticket;
    return `${tk.rid ?? ''}|${tk.items.map((li) => `${li.key}×${String(li.qty)}`).join(',')}`;
  };
  let seen = shape();
  /*
   * The café's gift card is typed for the visitor, and its code is never
   * shown: a real till's Payment field holds what the cashier typed, so the
   * demo takes its own card's code out of that field at once and asks what
   * the card covers — the answer names the card by its last four.
   */
  const hideCode = (): void => {
    const s = usePos.getState();
    if (bare(s.cardDraft) !== bare(DEMO_GIFT_CARD.code)) return;
    usePos.setState({ cardDraft: '' });
    if (s.view === 'payment' && s.cardPay === null && !s.cardPayBusy) void s.quoteCard(DEMO_GIFT_CARD.code);
  };
  const stop = usePos.subscribe(() => {
    rowFor();
    hideCode();
    const now = shape();
    if (now === seen) return;
    seen = now;
    const rid = usePos.getState().ticket.rid;
    if (rid !== undefined && outbox().pendingIn(rid) === 0) void usePos.getState().refreshTicket(rid);
  });
  return () => {
    stop();
    setDesk(null);
  };
}
