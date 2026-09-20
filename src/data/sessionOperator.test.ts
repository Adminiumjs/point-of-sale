/**
 * Who a hosted till opens for — and, as much the point, when it opens for
 * nobody.
 *
 * The till is signed into by the Adminium session, so the name on the top bar
 * and on every receipt comes from here. The refusals below pin the rule that a
 * name is never invented: no session, a malformed reply or a blank account all
 * come back null, which `main.tsx` turns into a legible stop.
 */
import { describe, expect, it, vi } from 'vitest';

import { SESSION_STAFF_ID, initialsOf, readSessionOperator } from './sessionOperator';

/** A `fetch` answering `/api/v1/bootstrap` with `body` (or throwing). */
function bootstrap(status: number, body: unknown) {
  return vi.fn(async (input: unknown, init?: RequestInit) => {
    expect(String(input)).toBe('/api/v1/bootstrap');
    // The session cookie has to ride along; the same-origin assumption is
    // stated, not left to fetch's defaults.
    expect(init?.credentials).toBe('same-origin');
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

describe('readSessionOperator', () => {
  it('puts the signed-in account on the till, with a PIN the pad can never match', async () => {
    const operator = await readSessionOperator(
      bootstrap(200, { data: { user: { name: 'Ada Lovelace', email: 'ada@example.test' }, csrfToken: 'x' } }),
    );
    expect(operator).toEqual({ id: SESSION_STAFF_ID, name: 'Ada Lovelace', initials: 'AL', role: '', pin: '' });
  });

  it('falls back to the mailbox name when the account name is blank', async () => {
    const operator = await readSessionOperator(
      bootstrap(200, { data: { user: { name: '   ', email: 'sam.rivera@example.test' } } }),
    );
    expect(operator?.name).toBe('sam.rivera');
  });

  it('opens for nobody without a session', async () => {
    expect(
      await readSessionOperator(bootstrap(401, { error: { code: 'UNAUTHENTICATED' } })),
    ).toBeNull();
  });

  it('opens for nobody when the reply names no one', async () => {
    expect(await readSessionOperator(bootstrap(200, { data: {} }))).toBeNull();
    expect(await readSessionOperator(bootstrap(200, { data: { user: { name: '', email: '' } } }))).toBeNull();
  });

  it('opens for nobody when a proxy answers with HTML', async () => {
    // `json()` throws on it, exactly as it does on an older server's SPA page.
    expect(await readSessionOperator(bootstrap(200, '<!doctype html><title>502</title>'))).toBeNull();
  });

  it('opens for nobody when the network fails', async () => {
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await readSessionOperator(offline)).toBeNull();
  });
});

describe('initialsOf', () => {
  it('takes the first and last word', () => {
    expect(initialsOf('Sam Rivera')).toBe('SR');
    expect(initialsOf('  Mary Ann  de la Cruz ')).toBe('MC');
  });

  it('keeps two letters of a single word', () => {
    expect(initialsOf('jordan')).toBe('JO');
  });

  it('splits characters, not UTF-16 halves', () => {
    // An astral-plane letter is two code units; indexing would cut it in half.
    expect(initialsOf('𝒜da 𝒵ed')).toBe('𝒜𝒵');
  });

  it('is empty for a blank name', () => {
    expect(initialsOf('   ')).toBe('');
  });
});
