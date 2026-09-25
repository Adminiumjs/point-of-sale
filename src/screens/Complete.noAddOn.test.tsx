/**
 * WITHOUT INVOICES & RECEIPTS, THERE IS NO EMAIL BUTTON AT ALL.
 *
 * The store starts from `features.ts`; here the add-on is not attached, so
 * every feature starts off — as on a hosted till whose config lists no add-on.
 * A button whose email could never be drawn is a promise the till cannot keep.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../features', async (original) => {
  const real = await original<typeof import('../features')>();
  return { ...real, DEMO_FEATURES: real.NO_FEATURES };
});

const { I18nProvider } = await import('../i18n');
const { Complete } = await import('./Complete');

describe('the receipt screen with no add-on attached', () => {
  it('prints the receipt, and offers no email', () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <Complete />
      </I18nProvider>,
    );
    expect(html).toContain('Print receipt');
    expect(html).not.toContain('receipt-mail');
    expect(html).not.toContain('>Email<');
  });
});
