/**
 * The shop's people, as the manifest tells Adminium of them: who a member is
 * and where a guest's address, name or phone is copied, which emails the
 * do-not-email list may stop (none: a receipt is service mail), and which
 * tables the law keeps.
 *
 * E-mail to contacts reads the declaration for an audience; finding,
 * exporting and erasing a person's data read it for where that person is. A
 * column that holds a guest's address and is not declared here is found by
 * nothing, so the last check of the first block looks for one.
 */
import { describe, expect, it } from 'vitest';

import manifest from '../manifest.json';
import { mailClassFloorIssues, mailClassOf } from './testing/manifest/mail-class.ts';
import { validateManifest } from './testing/manifest/index.ts';

type Json = Record<string, unknown>;
type Column = Json & { ref: string; type: string; references?: string; semantic?: string; rules?: Json & { personal?: boolean; rollup?: Json; validation?: { format?: string } } };
type Table = Json & { ref: string; keep?: Json; columns: Column[] };

const m = manifest as unknown as Json & {
  version: string;
  compatibility: { minAdminiumVersion: string };
  people: (Json & { table: string; copies: { table: string; column: string; holds: string; via?: string }[] })[];
  outbox: Json & { table: string; recipient: Json; kinds: Record<string, string>; classes: Record<string, string> };
  requiredSchema: { tables: Table[] };
  emailTemplates: { key: string }[];
  automations?: unknown[];
};
const table = (ref: string) => m.requiredSchema.tables.find((t) => t.ref === ref)!;
const column = (t: string, ref: string) => table(t).columns.find((c) => c.ref === ref);
const valid = (doc: unknown) => validateManifest(doc as never);
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("the shop's people", () => {
  it('are the loyalty members: their address, their name and its first word, a customer once they have visited, and every copy of a guest', () => {
    expect(m.people).toEqual([
      {
        table: 'customers',
        kind: 'people',
        email: 'email',
        name: 'name',
        firstName: 'firstWordOfName',
        customer: 'visits',
        copies: [
          { table: 'reservations', column: 'name', holds: 'name' },
          { table: 'reservations', column: 'email', holds: 'email' },
          { table: 'reservations', column: 'mobile', holds: 'phone' },
          { table: 'tickets', column: 'receipt_to', holds: 'email', via: 'customer_id' },
        ],
      },
    ]);
    // Nothing the shop keeps says yes to news, nor a language, nor that the opt-out line was shown: the consent log alone holds a yes.
    for (const key of ['consent', 'language', 'optOutMark', 'carry', 'company']) expect([key, m.people[0]![key]]).toEqual([key, undefined]);
  });

  it('ask for the Adminium that reads them, and come as a patch', () => {
    expect(m.compatibility.minAdminiumVersion).toBe('0.3.38');
    expect(m.version).toBe('0.3.1');
    expect(valid(m)).toMatchObject({ ok: true });
  });

  it('have one address: the one the outbox writes a member to', () => {
    const person = m.people[0]!;
    expect([m.outbox.recipient['table'], m.outbox.recipient['email'], m.outbox.recipient['name']]).toEqual([person['table'], person['email'], person['name']]);
    // Another address for the same people is refused, so the two cannot drift apart.
    const drifted = copy(m);
    drifted.people[0]!['email'] = 'mobile';
    expect(valid(drifted)).toMatchObject({ ok: false });
  });

  it('are customers by their visits, the count the loyalty ledger keeps', () => {
    expect(column('customers', 'visits')).toMatchObject({ type: 'int', rules: { rollup: { from: 'loyalty_ledger', via: 'customer_id', sum: 'visit' } } });
  });

  it("are copied onto text columns, linked back to the member where the row has a link (a booking has none)", () => {
    for (const c of m.people[0]!.copies) {
      expect([c.table, c.column, column(c.table, c.column)?.type]).toEqual([c.table, c.column, 'text']);
      if (c.via !== undefined) expect([c.table, c.via, column(c.table, c.via)?.references]).toEqual([c.table, c.via, 'customers']);
    }
    expect(table('reservations').columns.filter((c) => c.references === 'customers')).toEqual([]);
  });

  it("leave no copy of a guest's address, name or phone undeclared on another table but the outbox's own", () => {
    const declared = new Set(m.people[0]!.copies.map((c) => `${c.table}.${c.column}`));
    const reaches = (c: Column) => c.semantic === 'email' || c.rules?.validation?.format === 'email' || c.rules?.validation?.format === 'phone' || c.rules?.personal === true;
    // The shop's own staff are no guests: their sign-in is Adminium's, not a contact's.
    const NOT_GUESTS = ['customers', m.outbox.table, 'staff'];
    const found = m.requiredSchema.tables
      .filter((t) => !NOT_GUESTS.includes(t.ref))
      .flatMap((t) => {
        // A name counts on a row that also reaches a person (a booking), not on a dish or a reward.
        const person = t.columns.some((c) => c.type === 'text' && c.rules?.personal !== false && reaches(c));
        return t.columns.filter((c) => c.type === 'text' && c.rules?.personal !== false && (reaches(c) || (person && c.semantic === 'name'))).map((c) => `${t.ref}.${c.ref}`);
      });
    expect(table('staff').columns.some((c) => c.semantic === 'email')).toBe(true);
    expect(found.length).toBeGreaterThan(0);
    expect(found.filter((ref) => !declared.has(ref))).toEqual([]);
  });
});

describe('the tables the law keeps', () => {
  it('are the money: tickets, payments, refunds and the gift card ledger, kept for tax, and no other', () => {
    const kept = m.requiredSchema.tables.filter((t) => t.keep !== undefined).map((t) => [t.ref, t.keep]);
    expect(kept).toEqual([
      ['tickets', { law: 'tax' }],
      ['payments', { law: 'tax' }],
      ['refunds', { law: 'tax' }],
      ['gift_card_ledger', { law: 'tax' }],
    ]);
  });
});

describe("the shop's emails", () => {
  it('are one kind, the receipt, and it is service mail: the do-not-email list never stops it', () => {
    expect(Object.keys(m.outbox.kinds)).toEqual(['receipt']);
    expect(m.outbox.classes).toEqual({ receipt: 'service' });
    expect(mailClassOf(m as never, { outboxKind: 'receipt' })).toBe('service');
  });

  it('say a class for every kind, and every class is of a kind', () => {
    expect(Object.keys(m.outbox.classes).sort()).toEqual(Object.keys(m.outbox.kinds).sort());
    expect(m.automations).toBeUndefined();
    expect(mailClassFloorIssues(m as never)).toEqual([]);
    // A kind with no class is refused at this floor, so a kind added later cannot go out unsaid.
    const unsaid = copy(m);
    delete (unsaid.outbox as Json)['classes'];
    expect(mailClassFloorIssues(unsaid as never)).toHaveLength(1);
    expect(valid(unsaid)).toMatchObject({ ok: false });
  });
});
