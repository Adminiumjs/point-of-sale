import { useState, type ReactNode } from 'react';
import type { MenuItem } from '../data/types';
import { catTint, hexToRgba } from '../state/calc';
import { Icon } from './Icon';
import { css } from './css';

// Menu-item visual: a real product photo (object-fit: cover, lazy-loaded) laid
// over a subtle wash of the category tint. The tint shows through while the
// image loads and frames it with the same colour language as the old
// procedural placeholders. `overlay` stacks on top (Sold-out / mods badge).
//
// With no photo to show it IS that placeholder again: the item's own glyph,
// centred in the category tint, as the design drew every tile before real
// photography. That covers an item with no image, and — the case that made it
// necessary — an image the browser could not load: a till that has lost its
// network, a dead link, or a host the serving page's Content-Security-Policy
// does not allow. A failed <img> otherwise paints the browser's broken-picture
// icon with the alt text spilling across the tile.
export function MenuThumb({
  item,
  dark,
  radius,
  box,
  iconSize = 30,
  overlay,
}: {
  item: MenuItem;
  dark: boolean;
  /** Border radius for the thumb; pass '0' when a parent clips the corners. */
  radius: string;
  /** Extra layout css for the container (dimensions, flex-shrink, …). */
  box?: string;
  /** The placeholder glyph's size, matched to the tile it sits in. */
  iconSize?: number;
  overlay?: ReactNode;
}) {
  const tint = catTint(item.cat);
  // The src that FAILED rather than a flag: a tile handed a different item
  // tries that item's picture instead of inheriting the last one's failure.
  const [failed, setFailed] = useState<string | null>(null);
  const photo = item.image !== '' && failed !== item.image;
  return (
    <div
      style={css(
        'position:relative;overflow:hidden;border-radius:' +
          radius +
          ';background:' +
          hexToRgba(tint, dark ? 0.24 : 0.12) +
          ';' +
          (box || ''),
      )}
    >
      {photo ? (
        <img
          src={item.image}
          alt={item.name}
          loading="lazy"
          onError={() => setFailed(item.image)}
          style={css('width:100%;height:100%;object-fit:cover;display:block;')}
        />
      ) : (
        // Decorative: every tile prints the item's name beside it.
        <span
          aria-hidden="true"
          style={css('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;')}
        >
          <Icon name={item.icon} size={iconSize} color={hexToRgba(tint, dark ? 0.7 : 0.58)} />
        </span>
      )}
      {overlay}
    </div>
  );
}
