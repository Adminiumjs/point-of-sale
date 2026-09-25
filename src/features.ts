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
} as const satisfies Record<string, readonly string[]>;

export type FeatureId = keyof typeof FEATURES;
export type Features = Readonly<Record<FeatureId, boolean>>;

/** Every feature off: a hosted till before its config says otherwise. */
export const NO_FEATURES: Features = { 'emailed-receipts': false, 'shelf-labels': false };

/**
 * The demo's: it stands for a shop that attached Invoices & Receipts, so the
 * email is asked for and queued (in memory, like every demo write). It has no
 * Adminium to draw a label sheet, so shelf labels stay off rather than offer a
 * button that could only pretend.
 */
export const DEMO_FEATURES: Features = { 'emailed-receipts': true, 'shelf-labels': false };

/** Which features the attached add-ons switch on. */
export function featuresOf(addOns: Readonly<Record<string, AttachedAddOn>> | null | undefined): Features {
  const present = new Set(Object.keys(addOns ?? {}));
  const on = (id: FeatureId) => FEATURES[id].every((key) => present.has(key));
  return { 'emailed-receipts': on('emailed-receipts'), 'shelf-labels': on('shelf-labels') };
}
