/**
 * Who sees what, read from the staff config's `access` — the three people a
 * built Adminium answers for: a cashier, a manager who also sits at Offers'
 * desk, and a Super Admin (who holds no role of the app's, and every grant).
 */
import { describe, expect, it } from 'vitest';

import type { StaffAccess } from '../staffConnection';
import { isManager, may, mayIssueCards, mayRunCardMove } from './may';

const NAMES = { 'offers:gift_cards': 'offers_gift_cards', 'offers:settings': 'offers_settings' };

const cashier: StaffAccess = {
  tables: { tickets: ['read', 'create', 'update'], settings: ['read'], offers_gift_cards: ['read'], offers_reasons: ['read'] },
  roles: [{ slug: 'pos-cashier', name: 'POS cashier' }],
};
const manager: StaffAccess = {
  tables: { tickets: ['read', 'create', 'update', 'delete'], settings: ['read', 'create', 'update', 'delete'], offers_gift_cards: ['read', 'create', 'update'], offers_settings: ['read'] },
  roles: [{ slug: 'pos-manager', name: 'POS manager' }],
};
const superAdmin: StaffAccess = {
  tables: { tickets: ['read', 'create', 'update', 'delete'], offers_gift_cards: ['read', 'create', 'update', 'delete'], offers_settings: ['read', 'create', 'update', 'delete'] },
  roles: [],
};
/** Someone whose role is only called a manager's: a name is not a grant. */
const named: StaffAccess = { tables: { tickets: ['read'] }, roles: [{ slug: 'pos-cashier', name: 'Shift manager' }, { slug: 'other-manager', name: 'Manager' }] };

describe('what the session says a person may do', () => {
  it('a new gift card is sold only by someone granted it in Offers', () => {
    expect([mayIssueCards(cashier, NAMES), mayIssueCards(manager, NAMES), mayIssueCards(superAdmin, NAMES)]).toEqual([false, true, true]);
    // An add-on's table the config did not name is listed under its key and short name.
    expect(mayIssueCards(manager)).toBe(true);
  });

  it('the card move is shown to the till’s managers and to whoever may change Offers’ settings — nobody by the sound of a role', () => {
    expect([mayRunCardMove(cashier, NAMES), mayRunCardMove(manager, NAMES), mayRunCardMove(superAdmin, NAMES), mayRunCardMove(named, NAMES)]).toEqual([false, true, true, false]);
    expect([isManager(cashier), isManager(manager), isManager(superAdmin), isManager(named)]).toEqual([false, true, false, false]);
  });

  it('a server that says nothing hides nothing: it refuses what it refuses', () => {
    expect([may(null, 'tickets', 'delete'), mayIssueCards(null), mayRunCardMove(null)]).toEqual([true, true, true]);
    expect(isManager(null)).toBe(false);
  });

  it('reads the app’s own tables by their short names', () => {
    expect([may(cashier, 'settings', 'update'), may(manager, 'settings', 'update'), may(cashier, 'nothing', 'read')]).toEqual([false, true, false]);
  });
});
