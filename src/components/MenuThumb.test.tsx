/**
 * The menu thumbnail with, and without, a picture to show.
 *
 * Rendered to static markup because this suite runs in node with no DOM. That
 * covers what a tile PAINTS for each state; the switch from photo to glyph when
 * a load fails is an event, and it is verified where it happens — in a browser,
 * against an image the page's policy refuses.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { MenuItem } from '../data/types';
import { MenuThumb } from './MenuThumb';

const ITEM: MenuItem = {
  id: 'flatwhite',
  name: 'Flat White',
  price: 4.5,
  cat: 'coffee',
  icon: 'coffee',
  image: 'https://images.example.com/flat-white.jpg',
  mods: 'coffee',
};

const render = (item: MenuItem): string =>
  renderToStaticMarkup(<MenuThumb item={item} dark={false} radius="11px" iconSize={19} />);

describe('MenuThumb', () => {
  it('shows the photo when the item has one', () => {
    const html = render(ITEM);
    expect(html).toContain('<img');
    expect(html).toContain('alt="Flat White"');
    expect(html).not.toContain('<svg');
  });

  it('draws the item’s glyph, not a broken picture, when it has none', () => {
    // An empty `src` used to render an <img> anyway: the browser's broken-picture
    // icon, with the name spilling out of a 38px chip.
    const html = render({ ...ITEM, image: '' });
    expect(html).not.toContain('<img');
    expect(html).toContain('<svg');
    // Decorative — the tile prints the name beside it, so a screen reader would
    // otherwise hear it twice.
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('width="19"');
  });
});
