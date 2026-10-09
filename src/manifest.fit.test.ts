/**
 * The ticket, its lines, its codes and its payments are the parts Offers &
 * gift cards defines, spelled out on the till's own tables under its own
 * column names (a released column keeps its name). The add-on is only
 * suggested, so nothing is built ON its shapes; this check holds the two
 * together instead: Offers' own fit check (`src/testing/shapes/fit.ts`, a
 * copy) over the shape files it ships.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import manifest from '../manifest.json';
import { shapeFit, type Pairing, type Shape } from './testing/shapes/fit.ts';

const shape = (name: string): Shape => JSON.parse(readFileSync(new URL(`./testing/shapes/${name}.json`, import.meta.url), 'utf8')) as Shape;
const SHAPES = ['discountable', 'card-payment', 'card-sale', 'voucher-sale'].map(shape);

const PAIRINGS: Pairing[] = [
  // The staff reason is a link of its own (`discount_reason` is 0.2's text column and stays as history); a ticket says when it is paid and void by its status.
  { table: 'tickets', shape: 'discountable@1', part: 'order', tables: { lines: 'ticket_items', codes: 'ticket_codes' }, columns: { discount_reason: 'discount_reason_id', paid_at: null, cancelled_at: null } },
  { table: 'ticket_items', shape: 'discountable@1', part: 'lines', tables: { order: 'tickets' }, columns: { order_id: 'ticket_id', item: null, amount: 'goods_amount' } },
  { table: 'ticket_codes', shape: 'discountable@1', part: 'codes', tables: { order: 'tickets' }, columns: { order_id: 'ticket_id' } },
  // What a card pays is its own column: `amount` is the cashier's figure for the other tenders. The ticket's void gives a card its money back.
  { table: 'payments', shape: 'card-payment@1', part: 'payments', tables: { order: 'tickets' }, columns: { order_id: 'ticket_id', amount: 'card_amount', voided_at: null } },
  // A card is sold or loaded by a line: the card it names, and the line's own price as what goes on it.
  { table: 'ticket_items', shape: 'card-sale@1', part: 'lines', tables: { order: 'tickets' }, columns: { order_id: 'ticket_id', gift_card_id: 'card_id', load_amount: 'unit_price' } },
];

describe("the ticket, its lines, its codes and its payments fit Offers' parts, column for column", () => {
  const said = (m: unknown) => shapeFit(m as never, PAIRINGS, SHAPES).map((issue) => `${issue.table} as ${issue.shape}/${issue.part}: ${issue.message}`);

  /**
   * What the till cannot be made to match, and why — each held here by name,
   * so a ninth difference fails. Three columns were released before the parts
   * existed and a release never retypes a column: `subtotal` and `unit_price`
   * are plain money, a payment's key is the till's own device key. A card line
   * is told by `load_ref`, which is set for a card of the till's own (before
   * its cards are moved) as well as for one of Offers', so neither kind is
   * reduced or pays for itself. A voided card line loads nothing.
   */
  const KNOWN = [
    'tickets as discountable@1/order: "tickets.subtotal" is money at another scale than the order\'s',
    'tickets as discountable@1/order: "tickets.subtotal" is not declared as the shape declares it',
    'payments as card-payment@1/payments: "payments.id" is not declared as the shape declares it',
    'payments as card-payment@1/payments: a card may not pay for a card: the posting into "spend" says "refuses": [{"table": "ticket_items", …, "column": "card_id", "set": true}]',
    'ticket_items as card-sale@1/lines: "ticket_items.unit_price" is money at another scale than the order\'s',
    'ticket_items as card-sale@1/lines: "ticket_items.unit_price" is not declared as the shape declares it',
    'ticket_items as card-sale@1/lines: a line that loads a card takes no reduction: the price rule\'s lines of "ticket_items" say "excludes": {"column":"card_id","set":true}',
    'ticket_items as card-sale@1/lines: the posting into "issue" carries "unlessSet", which the part does not',
  ];

  it('as the manifest is written, but for what a released column cannot change', () => {
    expect(said(manifest)).toEqual(KNOWN);
  });

  it('a card line is still never reduced and never paid for by a card: by the column that marks both kinds of card line', () => {
    const tables = (manifest as unknown as { requiredSchema: { tables: { ref: string; adjust?: { lines: { excludes?: unknown }[] }; postings?: { id: string; refuses?: unknown }[] }[] } }).requiredSchema.tables;
    expect(tables.find((t) => t.ref === 'tickets')!.adjust!.lines[0]!.excludes).toEqual({ column: 'load_ref', set: true });
    expect(tables.find((t) => t.ref === 'payments')!.postings!.find((p) => p.id === 'card')!.refuses).toEqual([{ table: 'ticket_items', via: 'ticket_id', column: 'load_ref', set: true }]);
  });

  it('and would not with a line reduction a cashier may write, or a code column too narrow', () => {
    const changed = JSON.parse(JSON.stringify(manifest)) as { requiredSchema: { tables: { ref: string; columns: { ref: string; maxLength?: number }[] }[] } };
    changed.requiredSchema.tables.find((t) => t.ref === 'ticket_codes')!.columns.find((c) => c.ref === 'typed')!.maxLength = 40;
    expect(said(changed).join('\n')).toContain('typed');
  });
});
