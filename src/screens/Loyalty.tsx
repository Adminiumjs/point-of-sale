import { useEffect, useRef, useState } from 'react';
import { usePos } from '../state/store';
import { useI18n, useT, type MessageKey } from '../i18n';
import { Icon } from '../components/Icon';
import { AuxHeader } from '../components/AuxHeader';
import { css } from '../components/css';
import { initialsOf, nextTier, pointsLeft, tierOf, type Tier } from '../state/points';
import type { Member, PointsEntry } from '../data/types';

const MONO = "font-family:'JetBrains Mono',monospace;";

const TIER_KEY: Record<Tier, MessageKey> = { silver: 'loyalty.tier.silver', gold: 'loyalty.tier.gold', platinum: 'loyalty.tier.platinum' };
const TIER_ON_CARD: Record<Tier, MessageKey> = { silver: 'loyalty.tierCard.silver', gold: 'loyalty.tierCard.gold', platinum: 'loyalty.tierCard.platinum' };
const tierFg = (tier: Tier) => (tier === 'gold' ? 'var(--warn)' : tier === 'platinum' ? 'var(--accent)' : 'var(--fg-muted)');
const tierBg = (tier: Tier) => (tier === 'gold' ? 'var(--warn-soft)' : tier === 'platinum' ? 'var(--accent-soft)' : 'var(--surface-3)');

/**
 * Loyalty & rewards (COMP 656-696, logic `auxV` 2029-2051): find a member by
 * phone or member number, see their points, visits and tier, spend points on a
 * reward, and enroll someone new.
 *
 * Beyond the comp (wave 2, numbered in the plan's progress):
 *   - the search is real — a phone, a member number or a name — and a scanner
 *     that types the member's code into the field finds them the same way;
 *   - "Add to ticket" puts the member on the ticket on the register (the comp
 *     has no such control, yet a member must be on a ticket to earn from it);
 *   - an empty state when nobody is chosen, and while a search runs.
 */
export function Loyalty() {
  const s = usePos();
  const t = useT();
  const { number, date } = useI18n();
  const [query, setQuery] = useState(s.loyaltyQuery);
  const field = useRef<HTMLInputElement>(null);

  // A pause in typing is a search: one request per word, not per key.
  useEffect(() => {
    if (query === s.loyaltyQuery) return;
    const timer = setTimeout(() => usePos.getState().loyaltySearch(query), 250);
    return () => clearTimeout(timer);
  }, [query, s.loyaltyQuery]);

  const listed: Member[] = (s.loyaltyQuery.trim() === '' ? recentMembers(s.members, s.ticket.customerId) : s.loyaltyResults.map((id) => s.members[id])).filter(
    (m): m is Member => m !== undefined,
  );
  const member = s.loyaltySel === null ? undefined : s.members[s.loyaltySel];
  const pts = (n: number) => t('loyalty.pts', { n: number(n) });
  const onTicket = member !== undefined && s.ticket.customerId === member.id;

  return (
    <div style={css('flex:1;min-height:0;display:flex;flex-direction:column;background:var(--bg);')}>
      <AuxHeader title={t('loyalty.title')} sub={t('loyalty.sub')} onBack={() => usePos.setState({ view: 'register' })} backLabel={t('nav.register')}>
        <button
          className="pos-press"
          onClick={() => s.setEnrollOpen(true)}
          style={css('margin-inline-start:auto;height:48px;padding:0 18px;border-radius:13px;border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);font-size:14px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:8px;flex-shrink:0;')}
        >
          <Icon name="user-plus" size={17} />
          <span className="aux-back-label">{t('loyalty.enroll')}</span>
        </button>
      </AuxHeader>

      <div className="pos-scroll" style={css('flex:1;min-height:0;overflow-y:auto;padding:22px 24px;')}>
        <div style={css('display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;max-width:1040px;margin:0 auto;')}>
          <div style={css('flex:1 1 280px;min-width:260px;display:flex;flex-direction:column;gap:12px;')}>
            <div style={css('display:flex;align-items:center;gap:10px;height:52px;padding:0 15px;background:var(--surface);border:1px solid var(--border);border-radius:14px;')}>
              <Icon name="search" size={18} color="var(--fg-subtle)" />
              <input
                ref={field}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // A scanner ends its burst with Enter: search now, not after the pause.
                  if (e.key === 'Enter') s.loyaltySearch(query);
                }}
                placeholder={t('loyalty.searchHint')}
                aria-label={t('loyalty.searchLabel')}
                autoComplete="off"
                inputMode="search"
                style={css('flex:1;min-width:0;border:none;background:transparent;outline:none;font-size:15px;font-weight:600;color:var(--fg);' + MONO)}
              />
              <Icon name="scan-line" size={18} color="var(--fg-subtle)" />
            </div>
            {s.loyaltyBusy && <div role="status" style={css('font-size:13px;font-weight:600;color:var(--fg-muted);padding:4px 4px;')}>{t('loyalty.searching')}</div>}
            {!s.loyaltyBusy && s.loyaltyQuery.trim() !== '' && listed.length === 0 && (
              <div role="status" style={css('text-align:center;padding:22px;font-size:13.5px;font-weight:600;color:var(--fg-muted);border:1.5px dashed var(--border-strong);border-radius:16px;')}>
                {t('loyalty.noMatch')}
              </div>
            )}
            {s.loyaltyQuery.trim() === '' && listed.length === 0 && (
              <div style={css('padding:14px 4px;font-size:13.5px;color:var(--fg-muted);line-height:1.5;')}>{t('loyalty.startHint')}</div>
            )}
            {listed.map((m) => {
              const on = m.id === s.loyaltySel;
              const tier = tierOf(m.lifetime);
              return (
                <button
                  key={m.id}
                  className="pos-press"
                  aria-pressed={on}
                  onClick={() => s.loyaltyPick(m.id)}
                  style={css('display:flex;align-items:center;gap:11px;padding:11px 13px;border-radius:14px;cursor:pointer;font-family:inherit;color:var(--fg);border:1.5px solid ' + (on ? 'var(--accent)' : 'var(--border)') + ';background:' + (on ? 'var(--accent-soft)' : 'var(--surface)') + ';')}
                >
                  <div aria-hidden="true" style={css('width:40px;height:40px;border-radius:11px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;background:' + (on ? 'var(--accent)' : 'var(--surface-3)') + ';color:' + (on ? 'var(--accent-fg)' : 'var(--fg-muted)') + ';')}>
                    {initialsOf(m.name)}
                  </div>
                  <div style={css('flex:1;min-width:0;text-align:start;')}>
                    <div style={css('font-size:15px;font-weight:700;')}>{m.name}</div>
                    <div style={css('font-size:12px;color:var(--fg-muted);' + MONO)}>{m.mobile ?? (m.memberNo === null ? '' : `#${m.memberNo}`)}</div>
                  </div>
                  <span style={css('font-size:10.5px;font-weight:800;padding:3px 9px;border-radius:20px;flex-shrink:0;background:' + tierBg(tier) + ';color:' + tierFg(tier) + ';')}>{t(TIER_KEY[tier])}</span>
                </button>
              );
            })}
          </div>

          <div style={css('flex:2 1 440px;min-width:300px;display:flex;flex-direction:column;gap:16px;')}>
            {member === undefined ? (
              <div style={css('background:var(--surface);border:1px dashed var(--border-strong);border-radius:20px;padding:34px 24px;text-align:center;color:var(--fg-muted);')}>
                <Icon name="award" size={30} color="var(--fg-subtle)" />
                <div style={css('font-size:16px;font-weight:800;color:var(--fg);margin-top:10px;')}>{t('loyalty.noneTitle')}</div>
                <div style={css('font-size:13.5px;margin-top:6px;line-height:1.5;')}>{t('loyalty.noneBody')}</div>
              </div>
            ) : (
              <MemberCard member={member} onTicket={onTicket} />
            )}

            {member !== undefined && (
              <div style={css('background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:20px 22px;')}>
                <div style={css('font-size:15px;font-weight:800;margin-bottom:14px;')}>{t('loyalty.rewards')}</div>
                <div style={css('display:flex;flex-direction:column;gap:10px;')}>
                  {s.rewards.length === 0 && <div style={css('font-size:13.5px;color:var(--fg-muted);')}>{t('loyalty.noRewards')}</div>}
                  {s.rewards.map((r) => {
                    const applied = onTicket && s.ticket.items.some((x) => x.rewardId === r.id);
                    const left = onTicket ? pointsLeft(member, s.ticket.items, s.rewards) : member.points;
                    const can = !applied && left >= r.points;
                    const label = applied ? t('loyalty.applied') : member.points >= r.points ? t('loyalty.redeem') : t('loyalty.locked');
                    return (
                      <div key={r.id} style={css('display:flex;align-items:center;gap:12px;padding:13px 14px;border-radius:14px;border:1px solid var(--border);background:' + (applied ? 'var(--surface-2)' : 'var(--surface)') + ';opacity:' + (can || applied ? '1' : '.55') + ';')}>
                        <div aria-hidden="true" style={css('width:38px;height:38px;border-radius:11px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:var(--accent-soft);color:var(--accent);')}>
                          <Icon name={r.icon} size={19} />
                        </div>
                        <div style={css('flex:1;min-width:0;')}>
                          <div style={css('font-size:15px;font-weight:700;')}>{r.name}</div>
                          <div style={css('font-size:12.5px;color:var(--fg-muted);' + MONO)}>{pts(r.points)}</div>
                        </div>
                        <button
                          className="pos-press"
                          disabled={!can}
                          aria-label={can ? t('loyalty.redeemName', { name: r.name }) : undefined}
                          onClick={() => s.redeemReward(r.id)}
                          style={css('height:40px;padding:0 16px;border-radius:11px;border:none;font-size:13.5px;font-weight:800;flex-shrink:0;font-family:inherit;cursor:' + (can ? 'pointer' : 'default') + ';background:' + (applied ? 'var(--pos-soft)' : can ? 'var(--accent)' : 'var(--surface-3)') + ';color:' + (applied ? 'var(--pos)' : can ? 'var(--accent-fg)' : 'var(--fg-subtle)') + ';')}
                        >
                          {label}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {member !== undefined && (
              <div style={css('background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:20px 22px;')}>
                <div style={css('font-size:15px;font-weight:800;margin-bottom:14px;')}>{t('loyalty.activity')}</div>
                <div style={css('display:flex;flex-direction:column;gap:12px;')}>
                  {s.loyaltyActivity.length === 0 && <div style={css('font-size:13.5px;color:var(--fg-muted);')}>{t('loyalty.noActivity')}</div>}
                  {s.loyaltyActivity.map((e) => (
                    <ActivityRow key={e.id} entry={e} rewardName={s.rewards.find((r) => r.id === e.rewardId)?.name ?? null} when={dayLabel(e.at, t, date)} pts={pts} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {s.enrollOpen && <EnrollSheet onClose={() => s.setEnrollOpen(false)} />}
    </div>
  );
}

function MemberCard({ member, onTicket }: { member: Member; onTicket: boolean }) {
  const s = usePos();
  const t = useT();
  const { number, date } = useI18n();
  const tier = tierOf(member.lifetime);
  const next = nextTier(member.lifetime);
  const pct = next === null ? 100 : next.pct;
  const since = member.joinedAt > 0 ? t('loyalty.since', { year: date(new Date(member.joinedAt), { year: 'numeric' }) }) : '';
  return (
    <div style={css('background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:24px;box-shadow:var(--shadow);')}>
      <div style={css('display:flex;align-items:center;gap:14px;')}>
        <div aria-hidden="true" style={css('width:54px;height:54px;border-radius:15px;background:var(--accent);color:var(--accent-fg);display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:800;flex-shrink:0;')}>
          {initialsOf(member.name)}
        </div>
        <div style={css('flex:1;min-width:0;')}>
          <div style={css('font-size:20px;font-weight:800;letter-spacing:-.02em;')}>{member.name}</div>
          <div style={css('font-size:13px;color:var(--fg-muted);' + MONO)}>{[member.mobile, since].filter(Boolean).join(' · ')}</div>
        </div>
        <span style={css('font-size:12px;font-weight:800;padding:5px 12px;border-radius:20px;flex-shrink:0;background:' + tierBg(tier) + ';color:' + tierFg(tier) + ';')}>{t(TIER_ON_CARD[tier])}</span>
      </div>
      <div style={css('display:flex;gap:14px;margin:20px 0 18px;')}>
        <div style={css('flex:1;background:var(--surface-2);border-radius:14px;padding:14px 16px;')}>
          <div style={css('font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-subtle);')}>{t('loyalty.points')}</div>
          <div style={css('font-size:30px;font-weight:800;letter-spacing:-.02em;' + MONO)}>{number(member.points)}</div>
        </div>
        <div style={css('flex:1;background:var(--surface-2);border-radius:14px;padding:14px 16px;')}>
          <div style={css('font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--fg-subtle);')}>{t('loyalty.visits')}</div>
          <div style={css('font-size:30px;font-weight:800;letter-spacing:-.02em;' + MONO)}>{number(member.visits)}</div>
        </div>
      </div>
      <div style={css('display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:700;color:var(--fg-muted);margin-bottom:8px;')}>
        <span>{next === null ? t('loyalty.topTier') : t('loyalty.toNext', { n: number(next.need), tier: t(TIER_KEY[next.tier]) })}</span>
        <span style={css(MONO)}>{number(pct / 100, { style: 'percent' })}</span>
      </div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t('loyalty.progress')} style={css('height:10px;border-radius:20px;background:var(--surface-3);overflow:hidden;')}>
        <div style={css('height:100%;width:' + String(pct) + '%;border-radius:20px;background:var(--accent);')} />
      </div>
      <div style={css('display:flex;gap:10px;margin-top:18px;')}>
        {onTicket ? (
          <>
            <div style={css('flex:1;display:flex;align-items:center;gap:8px;height:48px;padding:0 14px;border-radius:13px;background:var(--pos-soft);color:var(--pos);font-size:14px;font-weight:800;')}>
              <Icon name="check-circle-2" size={18} />
              {t('loyalty.onTicket')}
            </div>
            <button className="pos-press" onClick={s.detachMember} style={css('height:48px;padding:0 16px;border-radius:13px;border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);font-family:inherit;font-size:14px;font-weight:800;cursor:pointer;')}>
              {t('loyalty.takeOff')}
            </button>
          </>
        ) : (
          <button className="pos-press" onClick={() => s.attachMember(member.id)} style={css('flex:1;height:48px;border-radius:13px;border:none;background:var(--accent);color:var(--accent-fg);font-family:inherit;font-size:14.5px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;')}>
            <Icon name="user-check" size={18} />
            {t('loyalty.addToTicket')}
          </button>
        )}
      </div>
    </div>
  );
}

function ActivityRow({ entry, rewardName, when, pts }: { entry: PointsEntry; rewardName: string | null; when: string; pts: (n: number) => string }) {
  const t = useT();
  const gained = entry.points >= 0 && entry.kind !== 'redeem';
  const title = entry.kind === 'earn' ? t('loyalty.earned') : entry.kind === 'redeem' ? t('loyalty.redeemed') : t('loyalty.adjusted');
  // Earned · +12 pts over what it was for; Redeemed · the reward over the points it took (COMP 2045).
  const signed = (entry.points > 0 ? '+' : entry.points < 0 ? '−' : '') + pts(Math.abs(entry.points));
  const amount = entry.kind === 'redeem' ? (rewardName ?? entry.note ?? '') : signed;
  const sub = entry.kind === 'redeem' ? signed : (entry.note ?? '');
  return (
    <div style={css('display:flex;align-items:center;gap:12px;')}>
      <div aria-hidden="true" style={css('width:34px;height:34px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:' + (gained ? 'var(--pos-soft)' : 'var(--accent-soft)') + ';color:' + (gained ? 'var(--pos)' : 'var(--accent)') + ';')}>
        <Icon name={entry.kind === 'earn' ? 'plus' : entry.kind === 'redeem' ? 'gift' : 'undo-2'} size={16} />
      </div>
      <div style={css('flex:1;min-width:0;')}>
        <div style={css('font-size:14px;font-weight:700;')}>
          {title} · <span style={css(MONO)}>{amount}</span>
        </div>
        {sub !== '' && <div style={css('font-size:12px;color:var(--fg-muted);')}>{sub}</div>}
      </div>
      <span style={css('font-size:12px;color:var(--fg-muted);font-weight:600;')}>{when}</span>
    </div>
  );
}

/** Today, else the day and month, in the reader's language. */
function dayLabel(at: number, t: ReturnType<typeof useT>, date: ReturnType<typeof useI18n>['date']): string {
  const d = new Date(at);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return t('loyalty.today');
  return date(d, { month: 'short', day: 'numeric' });
}

/** With nothing typed: the ticket's member first, then everyone met this session. */
function recentMembers(members: Record<string, Member>, onTicket: string | undefined): Member[] {
  const all = Object.values(members);
  return onTicket === undefined ? all : [...all.filter((m) => m.id === onTicket), ...all.filter((m) => m.id !== onTicket)];
}

function EnrollSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const enroll = usePos((s) => s.enroll);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const can = name.trim() !== '' && mobile.replace(/\D+/g, '').length >= 6 && !saving;
  const input = 'width:100%;height:50px;padding:0 15px;border-radius:13px;border:1.5px solid var(--border-strong);background:var(--surface);color:var(--fg);font-size:15px;font-weight:600;font-family:inherit;outline:none;box-sizing:border-box;';
  const label = 'display:block;font-size:12.5px;font-weight:800;color:var(--fg-muted);margin-bottom:6px;';
  const submit = async () => {
    if (!can) return;
    setSaving(true);
    const ok = await enroll({ name, mobile, email });
    setSaving(false);
    if (ok) onClose();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div onClick={onClose} style={css('position:absolute;inset:0;z-index:210;background:var(--scrim);animation:pos-scrim .2s ease;')} />
      <div role="dialog" aria-modal="true" aria-labelledby="enroll-title" className="pos-scroll" style={css('position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:211;width:min(460px, calc(100% - 32px));max-height:88%;overflow-y:auto;background:var(--surface);border-radius:24px;padding:22px;box-shadow:0 24px 60px rgba(10,10,20,.3);')}>
        <div style={css('display:flex;align-items:center;gap:12px;margin-bottom:18px;')}>
          <div style={css('width:42px;height:42px;border-radius:13px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;')}>
            <Icon name="user-plus" size={21} />
          </div>
          <div id="enroll-title" style={css('flex:1;min-width:0;font-size:19px;font-weight:800;letter-spacing:-.02em;')}>{t('loyalty.enrollTitle')}</div>
          <button className="pos-press" onClick={onClose} aria-label={t('common.close')} style={css('width:40px;height:40px;border-radius:12px;border:1px solid var(--border);background:var(--surface-2);color:var(--fg-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;')}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          style={css('display:flex;flex-direction:column;gap:13px;')}
        >
          <div>
            <label htmlFor="enroll-name" style={css(label)}>{t('loyalty.name')}</label>
            <input id="enroll-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoFocus style={css(input)} />
          </div>
          <div>
            <label htmlFor="enroll-mobile" style={css(label)}>{t('loyalty.mobile')}</label>
            <input id="enroll-mobile" type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} autoComplete="off" style={css(input)} />
          </div>
          <div>
            <label htmlFor="enroll-email" style={css(label)}>{t('loyalty.email')}</label>
            <input id="enroll-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('loyalty.emailHint')} autoComplete="off" style={css(input)} />
          </div>
          <div style={css('display:flex;gap:9px;margin-top:7px;')}>
            <button type="button" className="pos-press" onClick={onClose} style={css('width:120px;height:56px;border-radius:15px;border:1px solid var(--border-strong);background:var(--surface);color:var(--fg);font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;')}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="pos-press" disabled={!can} style={css('flex:1;height:56px;border-radius:15px;border:none;font-family:inherit;font-size:15px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:8px;cursor:' + (can ? 'pointer' : 'not-allowed') + ';background:' + (can ? 'var(--accent)' : 'var(--surface-3)') + ';color:' + (can ? 'var(--accent-fg)' : 'var(--fg-subtle)') + ';')}>
              <Icon name="check" size={17} />
              {t('loyalty.enrollConfirm')}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
