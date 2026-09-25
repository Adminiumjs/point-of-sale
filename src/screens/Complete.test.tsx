/**
 * THE RECEIPT PRINTS THE VENUE'S OWN DETAILS, and only the receipt is printed.
 *
 * Rendered to static markup (this suite runs in node): what the receipt says,
 * and which parts of the screen the print stylesheet keeps.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../i18n';
import { printOnly } from '../components/print';
import { Complete } from './Complete';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the receipt', () => {
  /*
   * Server rendering reads the store's INITIAL state (zustand's server
   * snapshot), which holds no sale — so this is the demo's receipt, the one a
   * receipt opened from the demo's dock shows, and it closed just now.
   */
  it('prints the venue’s name, street and phone, and when the sale closed', () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <Complete />
      </I18nProvider>,
    );
    expect(html).toContain('DAYBREAK COFFEE');
    expect(html).toContain('128 Alder Lane, San Francisco · (415) 555-0148');
    expect(html).toContain(new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date()));
    // The paper is the part that prints; the buttons beside it are not.
    expect(html).toContain('class="receipt-paper"');
    expect(html).toContain('class="no-print"');
  });
});

describe('the emailed receipt', () => {
  it('offers Email while Invoices & Receipts is attached (the demo stands for such a shop)', () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <Complete />
      </I18nProvider>,
    );
    // The button opens the address form; it is not the receipt, so it never prints.
    expect(html).toContain('aria-controls="receipt-mail"');
    expect(html).toContain('>Email<');
    expect(html).not.toContain('id="receipt-mail-to"');
  });
});

describe('printing one part of the screen', () => {
  it('names the part on the page, prints, and clears it after', () => {
    const listeners: Record<string, () => void> = {};
    const body = { dataset: {} as Record<string, string> };
    const print = vi.fn(() => expect(body.dataset['print']).toBe('receipt'));
    vi.stubGlobal('document', { body });
    vi.stubGlobal('window', {
      print,
      addEventListener: (type: string, fn: () => void) => (listeners[type] = fn),
      removeEventListener: vi.fn(),
    });
    printOnly('receipt');
    expect(print).toHaveBeenCalledOnce();
    listeners['afterprint']!();
    expect(body.dataset['print']).toBeUndefined();
  });
});
