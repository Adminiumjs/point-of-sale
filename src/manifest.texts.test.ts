/**
 * The shop's texts (plan 80), as the manifest tells Adminium of them: three
 * texts a customer is waiting for, each a template in eight languages that
 * opens with the shop's name and holds no link, code or "reply YES"; the
 * booking form's own box for texts, unticked, never required, with the words
 * the guest saw; and a member known by their mobile alone.
 */
import { describe, expect, it } from 'vitest';

import manifest from '../manifest.json';
import { checkTextTemplate } from './testing/manifest/text-messages.ts';
import { validateManifest } from './testing/manifest/index.ts';
import { MESSAGES } from './i18n/messages';

type Json = Record<string, unknown>;
type Column = Json & { ref: string; type: string; nullable?: boolean; default?: unknown; rules?: Json; references?: string; enum?: string[] };
const m = manifest as unknown as Json & {
  compatibility: { minAdminiumVersion: string };
  requiredSchema: { tables: (Json & { ref: string; columns: Column[] })[] };
  outbox: Json & { table: string; links: Record<string, string>; recipient: Json & { fallback?: Json }; kinds: Record<string, string>; channels?: Record<string, string>; classes: Record<string, string>; waiting?: string[] };
  textTemplates: { key: string; name: Record<string, string>; locales: Record<string, { body: string }> }[];
  textReplies?: string;
  people: (Json & { table: string; phone?: string })[];
  publicAccess: (Json & { table: string; methods: string[]; writable?: string[]; requires?: string[]; consent?: Json; textConsent?: { column: string; phone: string; class: string; wording: { version: number; text: Record<string, string> } } })[];
  pages: (Json & { ref: string; feature?: string })[];
};
const column = (table: string, ref: string) => m.requiredSchema.tables.find((t) => t.ref === table)!.columns.find((c) => c.ref === ref);

const LOCALES = ['en-US', 'de-DE', 'fr-FR', 'da-DK', 'cs-CZ', 'ar-EG', 'zh-CN', 'zh-TW'] as const;
const TEXT_KINDS = ['pickup_ready', 'table_reminder', 'receipt_text'];

/** The GSM-7 alphabet a text is counted in, when every character is in it (its basic set and the escaped ones). */
const GSM = new Set('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\\[~]|€');
/** Segments, as a carrier counts them: 160 / 153 in GSM-7, else 70 / 67. */
function segments(text: string): number {
  const gsm = [...text].every((ch) => GSM.has(ch));
  const length = gsm ? [...text].reduce((n, ch) => n + ('^{}\\[~]|€'.includes(ch) ? 2 : 1), 0) : [...text].length;
  const [one, many] = gsm ? [160, 153] : [70, 67];
  return length <= one ? 1 : Math.ceil(length / many);
}
/** What a body reads as, filled with long-ish values of the shop's own, and the longest opt-out Adminium adds. */
const SAMPLE: Record<string, string> = {
  appName: 'Daybreak Coffee',
  'ticket.number': '10512',
  'ticket.charged': '$128.40',
  'reservation.party_size': '12',
  'reservation.starts_at.time': '7:30 PM',
  'reservation.starts_at.date': 'Tue, Nov 24',
};
const filled = (body: string) => body.replace(/\{\{([^}]+)\}\}/g, (_whole, name: string) => SAMPLE[name.trim()] ?? `<${name}>`);

describe("the shop's texts", () => {
  it('need Adminium 0.3.77 (texts from 0.3.76; a widened outbox kind on Postgres and MySQL, and the till’s own roles on /texts, from 0.3.77)', () => {
    expect(m.compatibility.minAdminiumVersion).toBe('0.3.77');
    expect(validateManifest(m as never)).toMatchObject({ ok: true });
  });

  it('are three kinds, each a service text a customer is waiting for, sent as a text', () => {
    expect(Object.keys(m.outbox.channels ?? {})).toEqual(TEXT_KINDS);
    for (const kind of TEXT_KINDS) {
      expect([kind, m.outbox.channels?.[kind], m.outbox.classes[kind]]).toEqual([kind, 'sms', 'service']);
      expect(m.textTemplates.map((t) => t.key)).toContain(m.outbox.kinds[kind]);
    }
    // Waiting: the order is ready now, the guest is at the table now, the receipt is asked for now — any hour.
    expect(m.outbox.waiting).toEqual(TEXT_KINDS);
    expect(column('messages', 'kind')?.enum).toEqual(['receipt', ...TEXT_KINDS]);
  });

  it('go to the member’s mobile, else the booking’s, and a member may be known by their mobile alone', () => {
    expect(m.outbox.recipient).toMatchObject({ via: 'customer_id', table: 'customers', phone: 'mobile', fallback: { via: 'reservation_id', phone: 'mobile' } });
    expect(m.outbox.links['reservation']).toBe('reservation_id');
    // A text about a booking goes to the number typed on it, and is judged for that number.
    expect(m.outbox.recipient['textPhone']).toEqual({ via: 'reservation_id', column: 'mobile' });
    // Adminium's code beside its sentence: what the till reads.
    expect((m.outbox['columns'] as Record<string, string>)['textReason']).toBe('text_reason');
    expect(column('messages', 'text_reason')).toMatchObject({ type: 'text', nullable: true, maxLength: expect.any(Number) });
    expect(Number(column('messages', 'text_reason')?.['maxLength'])).toBeGreaterThanOrEqual(40);
    expect(column('messages', 'reservation_id')).toMatchObject({ type: 'fk', references: 'reservations', nullable: true });
    expect(m.people.find((p) => p.table === 'customers')?.phone).toBe('mobile');
    expect(column('customers', 'email')?.nullable).toBe(true);
    for (const [table, ref] of [['customers', 'mobile'], ['reservations', 'mobile']] as const) expect(column(table, ref)?.type).toBe('text');
    // The outbox's address column holds an address or a number now: no e-mail format on it, and still personal.
    expect(column('messages', 'to_address')).toMatchObject({ rules: { personal: true } });
    expect(column('messages', 'to_address')?.rules?.['validation']).toBeUndefined();
  });

  it('read a staff reply only where the owner lets them: replies are on, and no role reads them by default', () => {
    expect(m.textReplies).toBe('on');
    expect(JSON.stringify(m['roles'])).not.toMatch(/texts:@/);
  });

  it('are listed with the emailed receipts on one Messages page, add-on or not', () => {
    const page = m.pages.find((p) => p.ref === 'pos-receipts')!;
    expect(page.feature).toBeUndefined();
    expect(page['title']).toMatchObject({ fallback: 'Messages' });
  });
});

describe('each text template', () => {
  it('speaks all eight languages and opens with the shop’s name (Taiwan asks it)', () => {
    for (const template of m.textTemplates) {
      expect([template.key, Object.keys(template.locales).sort()]).toEqual([template.key, [...LOCALES].sort()]);
      expect([template.key, Object.keys(template.name).sort()]).toEqual([template.key, [...LOCALES].sort()]);
      for (const [locale, { body }] of Object.entries(template.locales)) expect([template.key, locale, body.startsWith('{{appName}}')]).toEqual([template.key, locale, true]);
    }
  });

  it('holds no link, code, YES or opt-out of its own: Adminium adds the opt-out that works for its sender', () => {
    for (const template of m.textTemplates) {
      for (const [locale, { body }] of Object.entries(template.locales)) {
        const here = `${template.key} ${locale}`;
        expect([here, checkTextTemplate(body)]).toEqual([here, { ok: true }]);
        expect([here, /https?:|www\.|\.com\b|\bSTOP\b|\bYES\b/i.test(body)]).toEqual([here, false]);
        // Only what the row it is about holds: the shop, the ticket, the booking.
        for (const [, name] of body.matchAll(/\{\{([^}]+)\}\}/g)) expect([here, name!.trim()]).toEqual([here, expect.stringMatching(/^(appName|ticket\.(number|charged)|reservation\.(party_size|starts_at\.(time|date)))$/)]);
      }
    }
  });

  it('fits two segments filled, with the longest opt-out line added', () => {
    const optOut = ' To stop these texts, contact +1 (415) 555-0148.';
    for (const template of m.textTemplates) {
      for (const [locale, { body }] of Object.entries(template.locales)) {
        const text = filled(body) + optOut;
        expect([template.key, locale, segments(text) <= 2]).toEqual([template.key, locale, true]);
      }
    }
  });
});

describe("the booking form's box for texts", () => {
  const entry = m.publicAccess.find((e) => e.table === 'reservations' && e.methods.includes('POST'))!;
  const box = entry.textConsent!;

  it('is its own column, starts unticked and is never required', () => {
    expect(box).toMatchObject({ column: 'texts_ok', phone: 'mobile', class: 'service' });
    expect(column('reservations', 'texts_ok')).toEqual(expect.objectContaining({ type: 'bool', nullable: true }));
    expect(column('reservations', 'texts_ok')?.default).toBeUndefined();
    expect(column('reservations', 'texts_ok')?.rules).toBeUndefined();
    expect(entry.writable).toContain('texts_ok');
    expect(entry.requires ?? []).not.toContain('texts_ok');
    expect(entry['defaults']).not.toHaveProperty('texts_ok');
    // Separate from any e-mail tick, and the only entry that writes it: the till never ticks it for a guest.
    expect(entry.consent).toBeUndefined();
    expect(m.publicAccess.filter((e) => (e.writable ?? []).includes('texts_ok'))).toEqual([entry]);
  });

  it('records the very words the guest sees beside it, in each language, with their version', () => {
    expect(box.wording.version).toBe(1);
    expect(Object.keys(box.wording.text).sort()).toEqual([...LOCALES].sort());
    for (const locale of LOCALES) {
      const bundle = MESSAGES[locale] as Record<string, string | undefined>;
      const label = bundle['guest.textsLabel']!;
      const sub = bundle['guest.textsSub']!;
      const joined = locale.startsWith('zh') ? `${label}。${sub}` : `${label}. ${sub}`;
      expect([locale, box.wording.text[locale]]).toEqual([locale, joined]);
    }
  });
});
