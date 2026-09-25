/**
 * THE ADD-ONS THE TILL WORKS BETTER WITH, AND WHAT EACH SWITCHES ON.
 *
 * The manifest suggests two add-ons and names a feature for each; the till
 * repeats that list (`features.ts`) to know which buttons to show. These hold
 * the two copies together, and hold the manifest to the rule that Point of
 * Sale never REQUIRES an add-on: a café that never emails a receipt must not
 * be made to install an invoicing add-on to open its till.
 */
import { describe, expect, it } from 'vitest';

import manifest from '../manifest.json';
import { DEMO_FEATURES, FEATURES, NO_FEATURES, featuresOf } from './features';
import { LOCALE_TAGS } from './i18n/locales';

interface Need {
  key: string;
  range: string;
  reason: Record<string, string>;
}
interface Feature {
  id: string;
  label: Record<string, string>;
  requires: string[];
}
const addOns = (manifest as unknown as { addOns: { requires?: Need[]; suggests: Need[]; features: Feature[] } }).addOns;
const documents = (manifest as unknown as { documents: { kind: string; addOn: string; table: string; feature?: string; mapping: Record<string, unknown> }[] }).documents;

describe('the manifest and the till name the same features', () => {
  it('lists each feature once, with the add-ons the till checks for', () => {
    expect(Object.fromEntries(addOns.features.map((f) => [f.id, f.requires]))).toEqual(FEATURES);
  });

  it('requires no add-on: each is suggested, and only switches its own feature on', () => {
    expect(addOns.requires).toBeUndefined();
    expect(addOns.suggests.map((s) => s.key).sort()).toEqual(['barcode-labels', 'invoices']);
    for (const feature of addOns.features) for (const key of feature.requires) expect(addOns.suggests.map((s) => s.key)).toContain(key);
  });

  it('gives every reason and every feature label in all eight languages', () => {
    const tags = [...LOCALE_TAGS].sort();
    for (const need of addOns.suggests) {
      expect(Object.keys(need.reason).sort(), need.key).toEqual(tags);
      // Translated, not copied: no language repeats the English words.
      for (const tag of tags) if (tag !== 'en-US') expect(need.reason[tag], `${need.key} ${tag}`).not.toBe(need.reason['en-US']);
    }
    for (const feature of addOns.features) {
      expect(Object.keys(feature.label).sort(), feature.id).toEqual(tags);
      for (const tag of tags) if (tag !== 'en-US') expect(feature.label[tag], `${feature.id} ${tag}`).not.toBe(feature.label['en-US']);
    }
  });

  it('draws each feature’s document through that feature’s add-on', () => {
    const receipt = documents.find((d) => d.kind === 'receipt')!;
    expect(receipt).toMatchObject({ addOn: 'invoices', table: 'tickets', feature: 'emailed-receipts' });
    // The amount taken, tip included — a stored figure, never one the add-on works out again.
    // The sale line by line, the voided lines left out; the stored figures; the amount taken, tip included.
    expect(receipt.mapping).toMatchObject({
      items: { collection: { table: 'ticket_items', via: 'ticket_id', unless: 'voided_at', columns: { desc: 'name', qty: 'qty', rate: 'unit_price' } } },
      subtotal: { column: 'subtotal' },
      tax: { column: 'tax' },
      total: { column: 'total' },
      tip: { column: 'tip' },
      amount: { column: 'charged' },
      reference: { column: 'number' },
    });
    // The receipt's own number is Adminium's register, not the ticket's.
    expect(receipt.mapping).not.toHaveProperty('number');
    expect(receipt.mapping).not.toHaveProperty('invoiceNumber');
    const labels = documents.find((d) => d.kind === 'label-sheet')!;
    expect(labels).toMatchObject({ addOn: 'barcode-labels', table: 'menu_items', feature: 'shelf-labels' });
    expect(labels.mapping).toMatchObject({ code: { column: 'barcode' }, reference: { column: 'name' } });
    // How many labels is the till's to ask, per request — so the manifest lets a request fill it, and nothing maps it.
    expect((labels as { requestValues?: string[] }).requestValues).toEqual(['count']);
    expect(labels.mapping).not.toHaveProperty('count');
    for (const doc of documents) expect(FEATURES[doc.feature as keyof typeof FEATURES]).toContain(doc.addOn);
  });
});

describe('which features the attached add-ons switch on', () => {
  const addOn = { version: '1.0.3', settings: {} };

  it('switches a feature on only when all its add-ons are attached', () => {
    expect(featuresOf({})).toEqual(NO_FEATURES);
    expect(featuresOf(null)).toEqual(NO_FEATURES);
    expect(featuresOf({ invoices: addOn })).toEqual({ 'emailed-receipts': true, 'shelf-labels': false });
    expect(featuresOf({ 'barcode-labels': addOn })).toEqual({ 'emailed-receipts': false, 'shelf-labels': true });
    expect(featuresOf({ invoices: addOn, 'barcode-labels': addOn, 'holiday-calendars': addOn })).toEqual({ 'emailed-receipts': true, 'shelf-labels': true });
  });

  it('starts a hosted till with everything off, and the demo with the email only', () => {
    expect(Object.values(NO_FEATURES).every((on) => !on)).toBe(true);
    // The demo has no Adminium to draw a label sheet with.
    expect(DEMO_FEATURES).toEqual({ 'emailed-receipts': true, 'shelf-labels': false });
  });
});
