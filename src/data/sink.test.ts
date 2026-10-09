import { describe, expect, it, vi } from 'vitest';

import { SessionPortError, type SessionTransport } from './sessionSource';
import { dbKey, kindOfStatus, memorySink, sessionSink, type SinkError } from './sink';

const MAP = { tickets: 'pos_tickets', ticketItems: 'pos_ticket_items', lineOptions: 'pos_ticket_item_modifiers' };

function transport(answers: ((path: string, method: string, body: unknown) => unknown)[] = []) {
  const calls: { path: string; method: string; body: unknown }[] = [];
  const t: SessionTransport = {
    port: {} as SessionTransport['port'],
    connection: async () => 'conn-1',
    tableId: async (name: string) => `public.${name}`,
    relation: vi.fn(async (child: string, column: string) => `rel:${child}.${column}`),
    refresh: vi.fn(async () => undefined),
    get: async <T,>(): Promise<T> => ({}) as T,
    mutate: async <T,>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> => {
      calls.push({ path, method, body });
      const answer = answers.shift();
      return (answer === undefined ? { data: { id: 9 } } : answer(path, method, body)) as T;
    },
  };
  return { t, calls };
}

const fail = (status: number, code: string, details?: unknown) => () => {
  throw new SessionPortError('no', status, code, details);
};

describe('the session sink', () => {
  it('writes to the real table, and names children by the link the server knows', async () => {
    const { t, calls } = transport();
    const sink = sessionSink(t, MAP);
    const row = await sink.insert('ticketItems', { ticket_id: 4, qty: 1 }, [
      { ref: 'lineOptions', via: 'ticket_item_id', rows: [{ modifier_id: 7 }] },
    ]);
    expect(row).toEqual({ id: 9 });
    expect(calls[0]).toEqual({
      path: '/api/v1/data/conn-1/pos_ticket_items',
      method: 'POST',
      body: {
        values: { ticket_id: 4, qty: 1 },
        children: { 'rel:pos_ticket_item_modifiers.ticket_item_id': [{ values: { modifier_id: 7 } }] },
      },
    });
  });

  it('patches and deletes by key, the delete confirmed', async () => {
    const { t, calls } = transport();
    const sink = sessionSink(t, MAP);
    await sink.update('tickets', '12', { held: true });
    await sink.remove('ticketItems', '40');
    expect(calls.map((c) => [c.method, c.path])).toEqual([
      ['PATCH', '/api/v1/data/conn-1/pos_tickets/12'],
      ['DELETE', '/api/v1/data/conn-1/pos_ticket_items/40?confirm=true'],
    ]);
    expect(calls[0]!.body).toEqual({ values: { held: true } });
  });

  it('tries once more with a fresh token when the old one was refused', async () => {
    const { t, calls } = transport([fail(403, 'CSRF_FAILED')]);
    const sink = sessionSink(t, MAP);
    await expect(sink.update('tickets', 1, { held: true })).resolves.toEqual({ id: 9 });
    expect(t.refresh).toHaveBeenCalledOnce();
    expect(calls).toHaveLength(2);
  });

  it('says what the till should do about each failure', async () => {
    const kinds: string[] = [];
    for (const answer of [
      fail(401, 'UNAUTHENTICATED'),
      // A rule said no: the ticket cannot close, the card cannot pay, the row is locked.
      fail(409, 'STATE_MOVE_REFUSED', { requires: 'due' }),
      fail(409, 'RECORD_LOCKED'),
      fail(409, 'CONFLICT'),
      // The booking guard's 409 is a refusal: the slot is full, nothing was saved.
      fail(409, 'CAPACITY_FULL'),
      // Asked to try again: kept, and sent again.
      fail(409, 'WRITE_CONFLICT'),
      fail(409, 'CAPACITY_BUSY'),
      fail(422, 'VALIDATION_FAILED', { fields: { qty: { code: 'MIN' } } }),
      fail(403, 'COLUMN_FORBIDDEN'),
      fail(429, 'RATE_LIMITED'),
      fail(503, 'UNAVAILABLE'),
      () => {
        throw new TypeError('Failed to fetch');
      },
    ]) {
      const { t } = transport([answer]);
      const error = (await sessionSink(t, MAP).insert('tickets', {}).catch((e: unknown) => e)) as SinkError;
      kinds.push(`${error.kind}${error.field === null ? '' : `:${error.field}`}`);
    }
    expect(kinds).toEqual(['signed-out', 'refused', 'refused', 'refused', 'refused', 'offline', 'offline', 'refused:qty', 'refused', 'refused', 'offline', 'offline']);
  });

  it('takes "that key is there already" as saved only for a row the till keyed itself', async () => {
    const taken = fail(409, 'UNIQUE_VIOLATION');
    const keyed = (await sessionSink(transport([taken]).t, MAP).insert('tickets', { id: 'a-uuid' }).catch((e: unknown) => e)) as SinkError;
    const unkeyed = (await sessionSink(transport([taken]).t, MAP).insert('tickets', { number: '7' }).catch((e: unknown) => e)) as SinkError;
    const patched = (await sessionSink(transport([taken]).t, MAP).update('tickets', 4, { number: '7' }).catch((e: unknown) => e)) as SinkError;
    expect([keyed.kind, unkeyed.kind, patched.kind]).toEqual(['saved', 'refused', 'refused']);
  });

  it('never reads a refused close as saved: the reason travels with the refusal', async () => {
    const { t } = transport([fail(409, 'ADJUST_REFUSED', { reason: 'over-ceiling', max: 10 })]);
    const error = (await sessionSink(t, MAP).update('tickets', 4, { discount_kind: 'percent' }).catch((e: unknown) => e)) as SinkError;
    expect([error.kind, error.code, error.reason, error.details['max']]).toEqual(['refused', 'ADJUST_REFUSED', 'over-ceiling', 10]);
    expect(kindOfStatus(409, 'STATE_MOVE_REFUSED')).toBe('refused');
    expect(kindOfStatus(409, 'UNIQUE_VIOLATION', true)).toBe('saved');
    expect(kindOfStatus(409, 'UNIQUE_VIOLATION')).toBe('refused');
    expect(kindOfStatus(0)).toBe('offline');
    expect(kindOfStatus(500)).toBe('offline');
    expect(kindOfStatus(404)).toBe('refused');
    // Refused for the moment only: a queued write is tried again.
    expect(kindOfStatus(429, 'RATE_LIMITED')).toBe('offline');
  });

  it('a write the server was too busy for (429) is one to send again, not a refusal', async () => {
    const busy = (await sessionSink(transport([fail(429, 'RATE_LIMITED')]).t, MAP).insert('tickets', { number: '7' }).catch((e: unknown) => e)) as SinkError;
    expect([busy.kind, busy.status]).toEqual(['offline', 429]);
  });

  it('turns the till’s text keys back into numbers', () => {
    expect(dbKey('42')).toBe(42);
    expect(dbKey('5a3b1e00-0000-4000-8000-000000000001')).toBe('5a3b1e00-0000-4000-8000-000000000001');
  });
});

describe('the memory sink', () => {
  it('numbers tickets and keys rows as the server would, keeping a key it is given', async () => {
    const sink = memorySink({ firstNumber: 2001 });
    expect(await sink.insert('tickets', { status: 'open' })).toEqual({ status: 'open', id: 1, number: '2001' });
    expect(await sink.insert('payments', { id: 'a-uuid' })).toEqual({ id: 'a-uuid' });
    await sink.insert('ticketItems', { qty: 1 }, [{ ref: 'lineOptions', via: 'ticket_item_id', rows: [{ modifier_id: 3 }] }]);
    expect(sink.rows.get('lineOptions')).toEqual([{ modifier_id: 3, id: 1, ticket_item_id: 1 }]);
  });
});
