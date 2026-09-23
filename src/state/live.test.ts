import { beforeEach, describe, expect, it } from 'vitest';

import { demoGroupId } from '../data/demo';
import { memorySink } from '../data/sink';
import { applyFrame } from './live';
import { usePos } from './store';
import { outbox, setSink } from './writes';

const INITIAL = usePos.getState();
const s = () => usePos.getState();
const settled = async () => {
  for (let i = 0; i < 20; i += 1) {
    await outbox().idle();
    await Promise.resolve();
  }
};

beforeEach(() => {
  setSink(memorySink());
  usePos.setState(INITIAL, true);
  usePos.setState({
    ticket: { number: 1, table: null, seats: 2, openedAt: 0, items: [] },
    held: [],
    kds: [],
    floor: [
      { id: '41', zone: 'Window', label: 'W2', seats: 2, status: 'open' },
      { id: '42', zone: 'Patio', label: 'P1', seats: 4, status: 'open' },
    ],
  });
});

describe('what another till changes, this one shows', () => {
  it('parks another till’s new ticket, fills in its lines, and sends it to the kitchen', () => {
    applyFrame({ table: 'tickets', kind: 'record.create', id: '70', row: { id: 70, number: '1050', table_id: 42, status: 'open', kitchen_status: 'new', guests: 4 } });
    expect(s().held).toMatchObject([{ number: 1050, rid: '70', table: 'P1', items: [] }]);
    expect(s().floor.find((t) => t.label === 'P1')!.status).toBe('occupied');
    applyFrame({ table: 'ticket_items', kind: 'record.create', id: '80', row: { id: 80, ticket_id: 70, menu_item_id: 'croissant', qty: 2, notes: null, seat: 1, sent_at: null } });
    expect(s().held[0]!.items).toMatchObject([{ rid: '80', id: 'croissant', qty: 2 }]);
    applyFrame({ table: 'tickets', kind: 'record.update', id: '70', row: { id: 70, number: '1050', table_id: 42, status: 'sent', kitchen_status: 'new', sent_at: new Date().toISOString() } });
    expect(s().kds).toMatchObject([{ number: 1050, rid: '70', status: 'new', items: [{ n: 'Croissant', q: 2 }] }]);
    applyFrame({ table: 'tickets', kind: 'record.update', id: '70', row: { id: 70, status: 'sent', kitchen_status: 'ready', table_id: 42 } });
    expect(s().kds[0]!.status).toBe('ready');
    applyFrame({ table: 'tickets', kind: 'record.update', id: '70', row: { id: 70, status: 'paid', table_id: 42 } });
    expect(s().held).toEqual([]);
    expect(s().kds).toEqual([]);
    expect(s().floor.find((t) => t.label === 'P1')!.status).toBe('open');
  });

  it('gives another till’s ticket with no table no table of this till’s', () => {
    usePos.setState({ ticket: { number: 1, table: 'W2', seats: 2, openedAt: 0, items: [] } });
    applyFrame({ table: 'tickets', kind: 'record.create', id: '71', row: { id: 71, number: '1051', table_id: null, status: 'sent', kitchen_status: 'new', sent_at: new Date().toISOString() } });
    expect(s().kds).toMatchObject([{ number: 1051, table: null }]);
  });

  it('takes a voided or removed line off the ticket', () => {
    applyFrame({ table: 'tickets', kind: 'record.create', id: '70', row: { id: 70, status: 'open', table_id: null } });
    applyFrame({ table: 'ticket_items', kind: 'record.create', id: '80', row: { id: 80, ticket_id: 70, menu_item_id: 'croissant', qty: 1 } });
    applyFrame({ table: 'ticket_items', kind: 'record.create', id: '81', row: { id: 81, ticket_id: 70, menu_item_id: 'banana', qty: 1 } });
    applyFrame({ table: 'ticket_items', kind: 'record.update', id: '80', row: { id: 80, ticket_id: 70, voided_at: '2026-09-23T10:00:00Z' } });
    applyFrame({ table: 'ticket_items', kind: 'record.delete', id: '81', row: null });
    expect(s().held[0]!.items).toEqual([]);
  });

  it('knows its own lines when the server announces them, instead of adding them twice', async () => {
    s().tapTile('croissant');
    await settled();
    const ticketKey = String(outbox().resolve(s().ticket.rid!));
    const lineKey = String(outbox().resolve(s().ticket.items[0]!.rid!));
    applyFrame({ table: 'tickets', kind: 'record.create', id: ticketKey, row: { id: ticketKey, status: 'open', table_id: null } });
    applyFrame({ table: 'ticket_items', kind: 'record.create', id: lineKey, row: { id: lineKey, ticket_id: ticketKey, menu_item_id: 'croissant', qty: 1 } });
    applyFrame({ table: 'ticket_items', kind: 'record.update', id: lineKey, row: { id: lineKey, ticket_id: ticketKey, qty: 3 } });
    expect(s().held).toEqual([]);
    expect(s().ticket.items).toHaveLength(1);
    expect(s().ticket.items[0]!.qty).toBe(3);
  });

  it('knows its own line and ticket even when the server announces them before it answers', async () => {
    // The stream is quicker than the reply: the till still knows both by temporary keys.
    const inner = memorySink();
    let answer!: () => void;
    const gate = new Promise<void>((resolve) => (answer = resolve));
    setSink({ ...inner, insert: async (ref, values, children) => (await gate, inner.insert(ref, values, children)) });
    s().tapTile('croissant');
    await Promise.resolve();
    applyFrame({ table: 'tickets', kind: 'record.create', id: '1', row: { id: 1, status: 'open', table_id: null } });
    applyFrame({ table: 'ticket_items', kind: 'record.create', id: '1', row: { id: 1, ticket_id: 1, menu_item_id: 'croissant', qty: 1 } });
    expect(s().ticket.items).toHaveLength(1);
    expect(s().held).toEqual([]);
    answer();
    await settled();
    // Matched by key once answered: still one line, and no ticket parked as another till's.
    expect(s().ticket.items).toHaveLength(1);
    expect(s().held).toEqual([]);
  });

  it('fills in a line’s options as they arrive, and the kitchen reads them', () => {
    applyFrame({ table: 'tickets', kind: 'record.create', id: '70', row: { id: 70, status: 'sent', kitchen_status: 'new', table_id: 41, sent_at: new Date().toISOString() } });
    applyFrame({ table: 'ticket_items', kind: 'record.create', id: '80', row: { id: 80, ticket_id: 70, menu_item_id: 'latte', qty: 1, sent_at: new Date().toISOString() } });
    applyFrame({ table: 'ticket_item_modifiers', kind: 'record.create', id: '90', row: { id: 90, ticket_item_id: 80, modifier_id: 'latte:size:l', price_delta: '0.70' } });
    applyFrame({ table: 'ticket_item_modifiers', kind: 'record.create', id: '91', row: { id: 91, ticket_item_id: 80, modifier_id: 'latte:milk:oat', price_delta: '0.60' } });
    applyFrame({ table: 'ticket_item_modifiers', kind: 'record.create', id: '92', row: { id: 92, ticket_item_id: 80, modifier_id: 'latte:extras:vanilla', price_delta: '0.50' } });
    // Announced twice (an echo, a reconnect): still one of each.
    applyFrame({ table: 'ticket_item_modifiers', kind: 'record.create', id: '92', row: { id: 92, ticket_item_id: 80, modifier_id: 'latte:extras:vanilla', price_delta: '0.50' } });
    expect(s().held[0]!.items[0]!.selection).toEqual({
      [demoGroupId('latte', 'size')]: ['latte:size:l'],
      [demoGroupId('latte', 'milk')]: ['latte:milk:oat'],
      [demoGroupId('latte', 'extras')]: ['latte:extras:vanilla'],
    });
    expect(s().kds[0]!.items[0]!.m).toBe('Large · Oat milk · Vanilla');
    // A delete frame may carry no row: the option is still found and taken off.
    applyFrame({ table: 'ticket_item_modifiers', kind: 'record.delete', id: '92', row: null });
    expect(s().held[0]!.items[0]!.selection[demoGroupId('latte', 'extras')]).toBeUndefined();
    expect(s().kds[0]!.items[0]!.m).toBe('Large · Oat milk');
  });

  it('an option for a line this till does not hold changes nothing', () => {
    const before = s();
    applyFrame({ table: 'ticket_item_modifiers', kind: 'record.create', id: '93', row: { id: 93, ticket_item_id: 999, modifier_id: 'latte:size:l' } });
    expect(s().ticket).toBe(before.ticket);
    expect(s().held).toBe(before.held);
  });

  it('adds a guest’s booking, and reads it again for the name the stream masks', async () => {
    applyFrame(
      { table: 'reservations', kind: 'record.create', id: '99', row: { id: 99, name: null, mobile: null, party_size: 4, starts_at: '2026-09-23T19:00:00Z', status: 'confirmed', channel: 'online' } },
      {
        fetchReservation: async (id) => ({ id, code: 'MR-AB12', name: 'Ada', mobile: '+1 415 555 0100', email: null, partySize: 4, startsAt: Date.parse('2026-09-23T19:00:00Z'), status: 'confirmed', channel: 'online', tableId: null, occasion: null, request: null, note: null }),
      },
    );
    expect(s().reservations.find((r) => r.id === '99')).toMatchObject({ partySize: 4, name: '' });
    await Promise.resolve();
    await Promise.resolve();
    expect(s().reservations.find((r) => r.id === '99')).toMatchObject({ name: 'Ada', code: 'MR-AB12' });
    applyFrame({ table: 'reservations', kind: 'record.delete', id: '99', row: null });
    expect(s().reservations.find((r) => r.id === '99')).toBeUndefined();
  });

  it('marks an item sold out, and back on sale', () => {
    applyFrame({ table: 'menu_items', kind: 'record.update', id: 'croissant', row: { id: 'croissant', available: false } });
    expect(s().unavail).toContain('croissant');
    applyFrame({ table: 'menu_items', kind: 'record.update', id: 'croissant', row: { id: 'croissant', available: 1 } });
    expect(s().unavail).not.toContain('croissant');
  });
});
