/**
 * Payment's panels for the payments Adminium takes: the till's card reader,
 * a standalone terminal's slip, the ticket's pay link, and the band a
 * rehearsing payment manager sees. Each is drawn in the card tab's own look:
 * one box, a tinted icon, a title in plain words, the amount in mono.
 */
import { useEffect, useRef } from 'react';
import { qrSvg } from '@adminiumjs/public-client/qr';

import { usePos } from '../state/store';
import { money } from '../state/calc';
import { tillReader, type ReaderRun } from '../state/tillPay';
import { slipErrors } from '../data/payments';
import { useI18n, useT } from '../i18n';
import { Icon } from '../components/Icon';
import { css } from '../components/css';

const MONO = "font-family:'JetBrains Mono',monospace;";

type Tone = 'acc' | 'pos' | 'bad' | 'warn' | 'mute';
const TONES: Record<Tone, [string, string, string]> = {
  acc: ['var(--accent)', 'var(--accent-soft)', 'var(--border)'],
  pos: ['var(--pos)', 'var(--pos-soft)', 'color-mix(in srgb, var(--pos) 45%, transparent)'],
  bad: ['var(--danger)', 'var(--danger-soft)', 'color-mix(in srgb, var(--danger) 45%, transparent)'],
  warn: ['var(--warn)', 'var(--warn-soft)', 'color-mix(in srgb, var(--warn) 45%, transparent)'],
  mute: ['var(--fg-muted)', 'var(--surface-3)', 'var(--border)'],
};

const button = (primary: boolean) =>
  'display:flex;align-items:center;justify-content:center;gap:8px;min-height:54px;padding:0 22px;border-radius:15px;font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;' +
  (primary ? 'border:none;background:var(--accent);color:var(--accent-fg);' : 'border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);');

/** One state of a panel: the box, its icon, the words, and what can be pressed. */
function StateBox(props: { tone: Tone; icon: string; title: string; sub?: string | null; chip?: { label: string; online: boolean } | null; spin?: boolean; children?: React.ReactNode; live?: boolean }) {
  const [fg, soft, edge] = TONES[props.tone];
  return (
    <div style={css('max-width:480px;margin:8px auto;text-align:center;padding:36px 28px;border-radius:22px;background:var(--surface);border:1.5px solid ' + edge + ';')}>
      <span aria-hidden="true" style={css('width:76px;height:76px;margin:0 auto;border-radius:22px;background:' + soft + ';color:' + fg + ';display:flex;align-items:center;justify-content:center;')}>
        <Icon name={props.icon} size={40} />
      </span>
      {/* The state's words are announced; its buttons are not. */}
      <div role={props.live === false ? undefined : 'status'} aria-live={props.live === false ? undefined : 'polite'}>
        <div style={css('font-size:20px;font-weight:800;margin-top:18px;letter-spacing:-.01em;line-height:1.4;')}>{props.title}</div>
        {props.sub !== undefined && props.sub !== null && <div style={css('font-size:14px;color:var(--fg-muted);margin-top:8px;line-height:1.55;')}>{props.sub}</div>}
      </div>
      {props.chip !== undefined && props.chip !== null && (
        <div style={css('display:inline-flex;align-items:center;gap:7px;margin-top:14px;padding:5px 12px;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);font-size:12.5px;font-weight:700;color:var(--fg-muted);')}>
          <span aria-hidden="true" style={css('width:8px;height:8px;border-radius:999px;background:' + (props.chip.online ? 'var(--pos)' : 'var(--warn)') + ';')} />
          <span>{props.chip.label}</span>
        </div>
      )}
      {props.spin === true && <div aria-hidden="true" style={css('width:34px;height:34px;border:3px solid var(--surface-3);border-top-color:var(--accent);border-radius:50%;animation:pos-spin .8s linear infinite;margin:18px auto 0;')} />}
      {props.children !== undefined && <div style={css('display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:22px;')}>{props.children}</div>}
    </div>
  );
}

/** The band a payment manager sees while rehearsing the till's payments. */
export function TestBand() {
  const t = useT();
  return (
    <div role="note" data-test-band="" style={css('flex-shrink:0;display:flex;align-items:center;gap:10px;margin:14px 18px 0;padding:12px 16px;border-radius:14px;background:var(--warn-soft);color:var(--warn);font-size:13.5px;font-weight:700;line-height:1.45;')}>
      <Icon name="flask-conical" size={18} />
      <span>{t('payment.testBand')}</span>
    </div>
  );
}

/** "Card · Front counter" and the like: how a payment of this ticket was taken. */
export function splitWords(t: ReturnType<typeof useT>, sp: { method: string; via?: string; reader?: string; provider?: string }): string | null {
  if (sp.via === 'reader') return sp.reader === undefined ? t('common.card') : t('payment.splitReader', { reader: sp.reader });
  if (sp.via === 'link' || sp.method === 'online') return sp.provider === undefined ? t('refund.chipOnlinePlain') : t('refund.chipOnline', { provider: sp.provider });
  return null;
}

/** The card tab with the till's reader. */
export function ReaderPanel({ amount }: { amount: number }) {
  const s = usePos();
  const t = useT();
  const { date } = useI18n();
  const reader = tillReader(s);
  const run: ReaderRun | null = s.charge;
  const label = run?.label ?? reader?.label ?? '';
  const chip = reader === null ? null : { label: reader.online ? t('reader.chip', { reader: reader.label }) : t('reader.chipOff', { reader: reader.label }), online: reader.online };
  const anotherWay = () => {
    s.dropCharge();
    // The tab row is where another way is chosen.
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-method="cash"]')?.focus());
  };
  if (run === null) {
    // The till's own internet is down: the reader cannot be reached.
    if (s.online === false) return <StateBox tone="warn" icon="wifi-off" title={t('reader.noNet')}><button className="pos-press" onClick={s.useTerminal} style={css(button(true))}>{t('reader.useTerminal')}</button></StateBox>;
    if (reader !== null && !reader.online)
      return (
        <StateBox tone="warn" icon="unplug" title={t('reader.offlineWords', { reader: reader.label })} sub={reader.lastSeenAt === null ? null : t('reader.offlineSince', { time: date(new Date(reader.lastSeenAt), { hour: 'numeric', minute: '2-digit' }) })}>
          <button className="pos-press" onClick={s.useTerminal} style={css(button(true))}>{t('reader.useTerminal')}</button>
        </StateBox>
      );
    return <StateBox tone="acc" icon="credit-card" title={t('reader.chargeOn', { amount: money(amount), reader: label })} chip={chip} />;
  }
  const cancel = (
    <button className="pos-press" data-reader-cancel="" disabled={run.cancelling} onClick={s.cancelCharge} style={css(button(false))}>
      {t('common.cancel')}
    </button>
  );
  switch (run.phase) {
    case 'sending':
    case 'on_reader':
      return (
        <StateBox tone="acc" icon="nfc" title={t('reader.sent', { reader: label })} chip={chip} spin>
          {cancel}
        </StateBox>
      );
    case 'recording':
    case 'approved': {
      const card = run.paidWith ?? (run.last4 === null ? t('common.card') : t('reader.cardEnding', { last4: run.last4 }));
      const title =
        run.tip !== null && run.tip > 0
          ? t('reader.approved', { card, amount: money(run.amount), tip: money(run.tip) })
          : t('reader.approvedNoTip', { card, amount: money(run.amount) });
      return <StateBox tone="pos" icon="check-circle-2" title={title} sub={run.race ? t('reader.race') : run.phase === 'recording' ? t('reader.recording') : t('reader.approvedSub')} spin={run.phase === 'recording'} />;
    }
    case 'declined':
      return (
        <StateBox tone="bad" icon="x-circle" title={t('reader.declined')}>
          <button className="pos-press" data-reader-retry="" onClick={s.onCharge} style={css(button(true))}>
            {t('reader.tryAgain')}
          </button>
          <button className="pos-press" onClick={anotherWay} style={css(button(false))}>
            {t('reader.anotherWay')}
          </button>
        </StateBox>
      );
    case 'cancelled':
      return <StateBox tone="mute" icon="ban" title={t('reader.cancelled')} />;
    case 'offline':
      return (
        <StateBox tone="warn" icon="unplug" title={t('reader.offlineWords', { reader: label })} spin={run.attemptId !== null}>
          <button className="pos-press" onClick={s.useTerminal} style={css(button(true))}>
            {t('reader.useTerminal')}
          </button>
        </StateBox>
      );
    case 'nonet':
      return (
        <StateBox tone="warn" icon="wifi-off" title={t('reader.noNet')}>
          <button className="pos-press" onClick={s.useTerminal} style={css(button(true))}>
            {t('reader.useTerminal')}
          </button>
        </StateBox>
      );
    case 'busy':
      return <StateBox tone="warn" icon="credit-card" title={t('reader.busy', { reader: label })} chip={chip} />;
    default:
      return (
        <StateBox tone="bad" icon="circle-alert" title={t('reader.failed')}>
          <button className="pos-press" onClick={s.useTerminal} style={css(button(false))}>
            {t('reader.useTerminal')}
          </button>
        </StateBox>
      );
  }
}

/** The card tab with a standalone terminal: what was taken there, recorded from its slip. */
export function TerminalPanel({ amount }: { amount: number }) {
  const s = usePos();
  const t = useT();
  const slip = s.slip;
  if (slip.done !== null) return <StateBox tone="pos" icon="check-circle-2" title={t('terminal.done', { amount: money(slip.done.amount), last4: slip.done.last4 })} />;
  const wrong = slipErrors(slip.code, slip.last4);
  const fields = [
    { k: 'code' as const, label: t('terminal.code'), hint: t('terminal.codeHint'), value: slip.code, max: 12, mode: 'text' as const, err: slip.tried && wrong.code ? t(slip.code.trim() === '' ? 'terminal.codeEmpty' : 'terminal.codeBad') : null },
    { k: 'last4' as const, label: t('terminal.last4'), hint: t('terminal.last4Hint'), value: slip.last4, max: 4, mode: 'numeric' as const, err: slip.tried && wrong.last4 ? t(slip.last4.trim() === '' ? 'terminal.last4Empty' : 'terminal.last4Bad') : null },
  ];
  return (
    <form
      data-terminal-slip=""
      onSubmit={(e) => {
        e.preventDefault();
        s.onCharge();
      }}
      style={css('max-width:480px;margin:8px auto;display:flex;flex-direction:column;gap:18px;')}
    >
      <div style={css('display:flex;align-items:flex-start;gap:14px;')}>
        <span aria-hidden="true" style={css('width:52px;height:52px;flex:0 0 auto;border-radius:15px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;')}>
          <Icon name="credit-card" size={26} />
        </span>
        <p style={css('margin:0;font-size:19px;font-weight:800;line-height:1.45;letter-spacing:-.01em;')}>{t('terminal.title', { amount: money(amount) })}</p>
      </div>
      {fields.map((f) => (
        <div key={f.k} style={css('display:flex;flex-direction:column;gap:7px;')}>
          <label htmlFor={`slip-${f.k}`} style={css('font-size:13.5px;font-weight:800;')}>
            {f.label} <span style={css('font-weight:600;color:var(--fg-muted);')}>· {t('terminal.required')}</span>
          </label>
          <input
            id={`slip-${f.k}`}
            value={f.value}
            onChange={(e) => s.setSlip(f.k, e.target.value)}
            maxLength={f.max}
            inputMode={f.mode}
            autoComplete="off"
            aria-invalid={f.err !== null}
            aria-describedby={`slip-${f.k}-d`}
            dir="ltr"
            style={css('height:56px;padding:0 16px;border-radius:14px;border:1.5px solid ' + (f.err !== null ? 'var(--danger)' : 'var(--border-strong)') + ';background:var(--surface);color:var(--fg);font-size:19px;font-weight:700;letter-spacing:.06em;outline:none;' + MONO)}
          />
          {f.err !== null ? (
            <span id={`slip-${f.k}-d`} role="alert" style={css('display:flex;align-items:center;gap:7px;font-size:13px;font-weight:700;color:var(--danger);')}>
              <Icon name="circle-alert" size={15} />
              {f.err}
            </span>
          ) : (
            <span id={`slip-${f.k}-d`} style={css('font-size:12.5px;color:var(--fg-muted);')}>
              {f.hint}
            </span>
          )}
        </div>
      ))}
      {/* Enter records it, as the bar's button does. */}
      <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
    </form>
  );
}

/** The QR tab with the ticket's pay link: the guest scans it and pays on their phone. */
export function LinkPanel() {
  const s = usePos();
  const t = useT();
  const run = s.link;
  const svg = useRef<HTMLSpanElement>(null);
  const url = run?.link?.url ?? null;
  useEffect(() => {
    if (svg.current === null || url === null) return;
    try {
      svg.current.innerHTML = qrSvg(url, { size: 260, page: true });
    } catch {
      svg.current.innerHTML = '';
    }
  }, [url]);
  if (run === null || run.phase === 'making') return <StateBox tone="acc" icon="qr-code" title={t('link.making')} spin />;
  const again = (
    <button className="pos-press" data-link-again="" onClick={s.newLink} style={css(button(true))}>
      {t('link.again')}
    </button>
  );
  if (run.phase === 'failed') return <StateBox tone="warn" icon="circle-alert" title={run.words ?? t('link.refused')}>{again}</StateBox>;
  if (run.phase === 'closed') return <StateBox tone="mute" icon="ban" title={t('link.closed')}>{again}</StateBox>;
  if (run.phase === 'expired') return <StateBox tone="mute" icon="clock" title={t('link.expired')}>{again}</StateBox>;
  if (run.phase === 'paid') return <StateBox tone="pos" icon="check-circle-2" title={t('link.paid')} sub={t('link.paidSub', { amount: money(run.paid) })} />;
  return (
    <div style={css('max-width:420px;margin:8px auto;text-align:center;display:flex;flex-direction:column;align-items:center;')}>
      {/* White ground and a quiet zone, in dark mode too: a phone reads it either way. */}
      <span ref={svg} data-pay-link={url ?? ''} role="img" aria-label={t('link.alt', { n: s.ticket.number })} style={css('display:block;width:260px;height:260px;border-radius:22px;border:1px solid var(--border);background:#fff;overflow:hidden;box-shadow:var(--shadow);')} />
      <div style={css('font-size:19px;font-weight:800;margin-top:18px;')}>{t('link.scan', { amount: money(run.amount) })}</div>
      <div role="status" aria-live="polite" style={css('display:flex;align-items:center;gap:10px;margin-top:12px;font-size:14px;font-weight:700;color:var(--fg-muted);')}>
        <span aria-hidden="true" style={css('width:18px;height:18px;border:2.5px solid var(--surface-3);border-top-color:var(--accent);border-radius:50%;animation:pos-spin .8s linear infinite;')} />
        {t('link.wait')}
      </div>
      <button className="pos-press" data-link-cancel="" onClick={s.closeLink} style={css('margin-top:20px;' + button(false))}>
        {t('common.cancel')}
      </button>
    </div>
  );
}
