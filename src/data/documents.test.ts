/**
 * A SHEET OF SHELF LABELS, ASKED FOR BY THE TILL — and every refusal named.
 *
 * The route's answers are the real ones Adminium gives (its staff document
 * route and the Barcode Labels add-on's refusals), so each reason the screen
 * says in words is tied to the reply that causes it.
 */
import { describe, expect, it } from 'vitest';

import { labelCount, labelOutcomeOf, portDocuments } from './documents';
import { SessionPortError } from './sessionSource';

const notDrawn = (why: string) => new SessionPortError(`The document could not be drawn: ${why}`, 422, 'DOCUMENT_NOT_DRAWN');

describe('asking for a label sheet', () => {
  it('asks the staff route for the item’s label sheet, by the manifest’s names, and opens its bytes', async () => {
    const calls: { path: string; method: string; body: unknown }[] = [];
    const port = portDocuments({
      mutate: async <T,>(path: string, method: string, body?: unknown) => {
        calls.push({ path, method, body });
        return { id: 'doc_1', contentUrl: '/api/v1/documents/doc_1/content', printUrl: '/api/v1/documents/doc_1/print' } as T;
      },
    });
    expect(await port.labelSheet('17', 24)).toEqual({ ok: true, url: '/api/v1/documents/doc_1/content' });
    // How many labels travels as a request value: the one slot the manifest lets a request fill.
    expect(calls).toEqual([{ path: '/api/v1/apps/pos/documents/render', method: 'POST', body: { kind: 'label-sheet', ref: 'menu_items', pk: { id: 17 }, values: { count: 24 } } }]);
  });

  it('turns a thrown refusal into a reason instead of throwing', async () => {
    const port = portDocuments({
      mutate: async () => {
        throw new SessionPortError('This document is not available for Point of Sale right now.', 409, 'FEATURE_OFF');
      },
    });
    expect(await port.labelSheet('17', 1)).toEqual({ ok: false, reason: 'off' });
  });
});

describe('how many labels', () => {
  it('takes a whole number from 1 to 240, and nothing else', () => {
    expect([1, 24, 240, '12', ' 7 '].map(labelCount)).toEqual([1, 24, 240, 12, 7]);
    for (const bad of [0, 241, -1, 2.5, '', 'lots', null, undefined, Number.NaN]) expect(labelCount(bad), String(bad)).toBeNull();
  });
});

describe('what each refusal means', () => {
  it('names the letters a label cannot print (an accented name)', () => {
    expect(labelOutcomeOf(notDrawn('LATIN_ONLY: a label sheet is drawn in the base-14 fonts, which are ASCII only: é'))).toEqual({ ok: false, reason: 'latin', letters: 'é' });
    expect(labelOutcomeOf(notDrawn('LATIN_ONLY: a label sheet is drawn in the base-14 fonts, which are ASCII only: é ü'))).toEqual({ ok: false, reason: 'latin', letters: 'é ü' });
    // A number claimed by another render is said after it; the letters are still found.
    expect(labelOutcomeOf(notDrawn('LATIN_ONLY: ascii only: 株 (number 4 was claimed and is not reused)'))).toEqual({ ok: false, reason: 'latin', letters: '株' });
  });

  it('tells a refused barcode from a missing one', () => {
    expect(labelOutcomeOf(notDrawn("INVALID_SUBJECT: 'code' was refused: the last digit should be 7 rather than 0"))).toEqual({ ok: false, reason: 'code' });
    expect(labelOutcomeOf(notDrawn('unmapped or empty: code'))).toEqual({ ok: false, reason: 'missing' });
  });

  it('says the add-on is gone, the item is gone, or Adminium is out of reach', () => {
    expect(labelOutcomeOf(new SessionPortError('x', 409, 'FEATURE_OFF'))).toEqual({ ok: false, reason: 'off' });
    expect(labelOutcomeOf(new SessionPortError('Not found.', 404, 'NOT_FOUND'))).toEqual({ ok: false, reason: 'gone' });
    expect(labelOutcomeOf(new TypeError('Failed to fetch'))).toEqual({ ok: false, reason: 'offline' });
    expect(labelOutcomeOf(new SessionPortError('Bad gateway', 502, 'INTERNAL'))).toEqual({ ok: false, reason: 'offline' });
  });

  it('passes anything else on in the server’s own words', () => {
    expect(labelOutcomeOf(new SessionPortError('Documents cannot be drawn on this server.', 503, 'DOCUMENTS_UNAVAILABLE'))).toEqual({
      ok: false,
      reason: 'other',
      detail: 'Documents cannot be drawn on this server.',
    });
  });
});
