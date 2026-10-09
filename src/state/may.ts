/**
 * WHAT THE SIGNED-IN PERSON MAY DO, AS THE SESSION SAYS IT.
 *
 * Adminium's staff config carries `access`: what this person may do with each
 * of the app's tables (by short name) and with each table of an add-on the app
 * uses (by the name it is stored under), and the app's own roles they hold —
 * `pos-cashier`, `pos-manager`. A button whose save would be refused is left
 * out by reading that, never by trying and failing, and never by guessing
 * from a role's name.
 *
 * A server that says nothing (`access` null: an Adminium from before it did)
 * leaves every button showing; the server then refuses what it refuses.
 */
import type { StaffAccess, TableAction } from '../staffConnection';
import { APP_KEY } from '../surface-nav';

/** The till's manager role, exactly as the config names it: the app's key, then the role's. */
export const MANAGER_ROLE = `${APP_KEY}-manager`;

type Names = Readonly<Record<string, string>>;

/**
 * Whether `action` on a table is granted. `ref` is the app's own short name
 * (`tickets`), or an add-on's by key and short name (`offers:gift_cards`),
 * which `names` turns into the name it is stored — and listed — under.
 */
export function may(access: StaffAccess | null, ref: string, action: TableAction, names: Names = {}): boolean {
  if (access === null) return true;
  const listed = ref.includes(':') ? (names[ref] ?? ref.replace(/-/g, '_').replace(':', '_')) : ref;
  return (access.tables[listed] ?? []).includes(action);
}

/** Making a gift card is a grant of its own in Offers (its desk role's): a plain cashier does not hold it. */
export const mayIssueCards = (access: StaffAccess | null, names: Names = {}): boolean => may(access, 'offers:gift_cards', 'create', names);

/** Holds the till's manager role. */
export const isManager = (access: StaffAccess | null): boolean => access !== null && access.roles.some((role) => role.slug === MANAGER_ROLE);

/**
 * Who is shown the banner that brings the till's cards into Offers: the
 * till's managers, and whoever may change Offers' settings — the move's first
 * write is there, and it is a Super Admin's. A manager who presses it is told
 * to ask the owner by the move itself (`ask-owner`); nobody else sees it.
 */
export const mayRunCardMove = (access: StaffAccess | null, names: Names = {}): boolean =>
  access === null || isManager(access) || may(access, 'offers:settings', 'update', names);
