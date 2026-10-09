/**
 * The parts of the till that work only with an add-on.
 *
 * Point of Sale needs no add-on to sell: the printed receipt is its own,
 * drawn here and printed at once, offline included. Two things are better
 * done by an add-on the shop may or may not have, so the manifest SUGGESTS
 * them and names a feature for each (`addOns.features`):
 *
 *   emailed-receipts   the receipt emailed to a guest, drawn by Invoices &
 *                      Receipts on an 80 mm roll and carried by the email;
 *   shelf-labels       a sheet of shelf labels from an item's barcode, drawn
 *                      by Barcode labels (retail).
 *
 *   stock              how many are left on a tile, and where a returned item
 *                      goes (Inventory);
 *   offers             codes, vouchers and staff discounts on the ticket,
 *                      worked out by Offers & gift cards;
 *   gift-cards         gift cards kept by Offers & gift cards, once the shop
 *                      has brought the till's own cards in.
 *
 * A feature is ON when every add-on it needs is attached to this app and
 * switched on for it — which is exactly what the staff config's `addOns`
 * lists. Off, its buttons are not there at all: a button whose request the
 * server would refuse is a promise the till cannot keep.
 *
 * The list below is the manifest's, repeated for the screens; a test holds
 * the two together.
 */
import type { AttachedAddOn } from './staffConnection';

export const FEATURES = {
  'emailed-receipts': ['invoices'],
  'shelf-labels': ['barcode-labels'],
  stock: ['inventory'],
  offers: ['offers'],
  'gift-cards': ['offers'],
} as const satisfies Record<string, readonly string[]>;

export type FeatureId = keyof typeof FEATURES;
export type Features = Readonly<Record<FeatureId, boolean>>;

/** Every feature off: a hosted till before its config says otherwise. */
export const NO_FEATURES: Features = { 'emailed-receipts': false, 'shelf-labels': false, stock: false, offers: false, 'gift-cards': false };

/**
 * The demo's: it stands for a shop that attached Invoices & Receipts, so the
 * email is asked for and queued (in memory, like every demo write). It has no
 * Adminium to draw a label sheet, so shelf labels stay off rather than offer a
 * button that could only pretend. Stock, offers and Offers' gift cards are
 * off for the same reason: every figure of theirs is a server's answer, and
 * the demo has no server to ask — it keeps the till's own gift cards.
 */
export const DEMO_FEATURES: Features = { 'emailed-receipts': true, 'shelf-labels': false, stock: false, offers: false, 'gift-cards': false };

/** Which features the attached add-ons switch on. */
export function featuresOf(addOns: Readonly<Record<string, AttachedAddOn>> | null | undefined): Features {
  const present = new Set(Object.keys(addOns ?? {}));
  const on = (id: FeatureId) => FEATURES[id].every((key) => present.has(key));
  return { 'emailed-receipts': on('emailed-receipts'), 'shelf-labels': on('shelf-labels'), stock: on('stock'), offers: on('offers'), 'gift-cards': on('gift-cards') };
}
