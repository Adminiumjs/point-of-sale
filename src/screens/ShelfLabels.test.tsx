/**
 * SHELF LABELS: the items that can have one, and every refusal in words.
 *
 * Rendered to static markup over the demo's menu, which gives eight items a
 * barcode; the refusals are the words the screen puts on an item's row.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MENU } from '../data/demo';
import { I18nProvider } from '../i18n';
import { t } from '../i18n/ambient';
import { ShelfLabels, refusal } from './ShelfLabels';

const croissant = MENU.find((m) => m.id === 'croissant')!;

describe('the shelf labels screen', () => {
  const html = renderToStaticMarkup(
    <I18nProvider>
      <ShelfLabels />
    </I18nProvider>,
  );

  it('lists each item that has a barcode, with its own print button', () => {
    const withCode = MENU.filter((m) => (m.barcode ?? '') !== '');
    expect(withCode.length).toBeGreaterThan(0);
    for (const item of withCode) {
      expect(html).toContain(`aria-label="Print a label for ${item.name}"`);
      expect(html).toContain(item.barcode!);
    }
    // An item with no barcode has no button: there is nothing to print on its label.
    expect(html).not.toContain('Print a label for Espresso');
  });

  it('asks how many labels, from 1 to 240, starting at one', () => {
    expect(html).toContain('<label for="labels-count"');
    expect(html).toMatch(/id="labels-count"[^>]*min="1"[^>]*max="240"|id="labels-count"[^>]*max="240"/);
    expect(html).toContain('value="1"');
    expect(html).toContain('From 1 to 240.');
  });

  it('counts the items with no barcode, and says where to give them one', () => {
    const without = MENU.filter((m) => (m.barcode ?? '') === '').length;
    expect(without).toBeGreaterThan(1);
    // One form of the sentence, chosen by the count — never every form side by side.
    expect(html).toContain(`${String(without)} items have no barcode. Add one on the Menu page in Adminium to print their labels.`);
    expect(html).not.toContain('item has no barcode');
    expect(html).not.toMatch(/labels?\.\|/);
  });
});

describe('why no label was drawn', () => {
  it('names the item and the letters a label sheet cannot print', () => {
    const cafe = { ...croissant, name: 'Café crème' };
    expect(refusal(t, cafe, { ok: false, reason: 'latin', letters: 'é è' })).toBe(
      '“Café crème” cannot go on a label: label sheets print plain letters only and cannot print é è. Rename the item in plain letters to print its label.',
    );
  });

  it('says each other reason, never a bare error code', () => {
    expect(refusal(t, croissant, { ok: false, reason: 'code' })).toContain(`The barcode ${croissant.barcode!} was refused`);
    expect(refusal(t, croissant, { ok: false, reason: 'missing' })).toBe('Croissant has no barcode to print.');
    expect(refusal(t, croissant, { ok: false, reason: 'off' })).toBe('Barcode Labels is switched off for Point of Sale, so no label can be drawn.');
    expect(refusal(t, croissant, { ok: false, reason: 'gone' })).toBe('This item is no longer on the menu.');
    expect(refusal(t, croissant, { ok: false, reason: 'offline' })).toContain('could not be reached');
    expect(refusal(t, croissant, { ok: false, reason: 'other', detail: 'Documents cannot be drawn on this server.' })).toBe(
      'The label could not be drawn: Documents cannot be drawn on this server.',
    );
  });
});
