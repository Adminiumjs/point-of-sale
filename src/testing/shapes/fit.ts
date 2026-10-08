// Vendored from the Offers & gift cards add-on: packages/offers/src/testing/fit.ts. Do not edit; copy it again.
/**
 * DOES AN APP'S TABLE FIT THE PART IT SPELLS OUT?
 *
 * Offers defines four shapes (`src/shapes/*.json`, the same four the manifest
 * carries): an order whose price it lowers, a payment a card makes, a line
 * that loads a card, a line that sells a voucher. An app does not build its
 * table ON a part — a till's line is a discount line, a card sale and a
 * voucher sale at once, and Offers is only suggested to it. It spells the
 * part's columns and rule out on its own table, under its own column names,
 * and this check holds the two together.
 *
 * A pairing says which app table plays which part, which app tables play the
 * parts beside it, and which of its columns plays each column of the part
 * (`null`: the app does not adopt that one — allowed only for the columns
 * `MAY_LEAVE_OUT` lists). The check then reads the app's table as if it were
 * built on the part, with Adminium's own conformance check, and compares the
 * part's price rule and posting rules with the table's.
 *
 * WHAT IS THE HOST'S AND IS NOT COMPARED: when a rule fires (`reserve`,
 * `post`, `reverse`), the link a row hangs by (`via`), how long a hold lasts,
 * which rows are lines at all, what a line is to an offer, where a line's
 * price and quantity are kept, who is buying, what comes back, what is still
 * due — and every rule the host keeps on a column that is not Adminium's own
 * (how it works out a line's amount, where a default comes from).
 *
 * WHAT MAY DIFFER, each a column that was there before the app adopted the
 * part: a decided reduction that may be empty in place of one that starts at
 * zero; a staff value kept as money; a list with more members; a wider text;
 * money kept as a decimal at the currency's places (the database keeps the
 * two alike, and a released column does not change its type to be paired);
 * a net worked out the app's own way, as long as it takes the reduction off;
 * a subtotal added up the app's own way, as long as it adds up the lines; a
 * column the host fills itself that it never leaves empty (a card payment's
 * amount, which other ways of paying fill too).
 *
 * WHAT NEVER MAY: a column that is Adminium's own named in a role's or a
 * public entry's list of what it may write (a writer's value for such a
 * column is dropped by Adminium whatever a role holds, so a list that names
 * one promises what cannot happen); a link that is not a link into Offers'
 * table; money at another scale; a card load an offer could reduce; a
 * voucher sale an offer could reduce; a card that could pay for a card.
 *
 * It lives in `testing/` because it is a check and never ships: an app vendors
 * the four shape files and runs this same call in its own suite.
 */

import { shapeConformanceIssues } from '../manifest/index.ts';

type Doc = Record<string, unknown>;
interface Column extends Doc {
  ref: string;
  type: string;
  role?: string;
  nullable?: boolean;
  default?: unknown;
  enum?: string[];
  maxLength?: number;
  scale?: number | string;
  references?: string;
  rules?: Doc;
}
interface Table extends Doc {
  ref: string;
  columns: Column[];
  adjust?: Doc;
  postings?: Doc[];
}
export interface Shape {
  name: string;
  version: number;
  parts: Record<string, { columns: Column[]; adjust?: Doc; postings?: Doc[] }>;
}
export interface Pairing {
  /** The app's table. */
  table: string;
  /** `discountable@1`. */
  shape: string;
  part: string;
  /** The app table that plays each OTHER part of the shape this one names. */
  tables?: Record<string, string>;
  /** A part column → the app column that plays it, where the names differ; `null`: not adopted. */
  columns?: Record<string, string | null>;
}
export interface FitIssue {
  table: string;
  shape: string;
  part: string;
  message: string;
}
interface PublicEntry {
  table?: string;
  writable?: string[];
  defaults?: Doc;
  writableValues?: Doc;
  children?: Record<string, PublicEntry>;
}

const isDoc = (value: unknown): value is Doc => typeof value === 'object' && value !== null && !Array.isArray(value);
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, one: unknown) => (isDoc(one) ? Object.fromEntries(Object.entries(one).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : one));
/** A value with every string put through `name`. */
function renamed<T>(value: T, name: (text: string) => string): T {
  if (typeof value === 'string') return name(value) as T;
  if (Array.isArray(value)) return value.map((one) => renamed(one as unknown, name)) as T;
  if (isDoc(value)) return Object.fromEntries(Object.entries(value).map(([key, one]) => [key, renamed(one, name)])) as T;
  return value;
}
/** Every string a value holds, at any depth. */
function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  return isDoc(value) ? Object.values(value).flatMap(stringsIn) : [];
}

/** The `order` part of these shapes only stands for "the row a line hangs under": it has no column an app adopts. */
const STANDS_IN: Readonly<Record<string, readonly string[]>> = { 'card-payment@1': ['order'], 'card-sale@1': ['order'], 'voucher-sale@1': ['order'] };

/** The columns of a part an adopter may leave out (`null` in a pairing). Every other column of a part is adopted. */
export const MAY_LEAVE_OUT: Readonly<Record<string, readonly string[]>> = {
  // A place whose staff give no reduction by hand keeps none of the four staff columns; a stay keeps no net of its own.
  'discountable@1/order': ['subtotal', 'net', 'discount_kind', 'discount_value', 'discount_reason', 'discount_by', 'paid_at', 'cancelled_at'],
  'discountable@1/lines': ['item', 'amount'],
  'discountable@1/codes': ['removed_at'],
  'card-payment@1/payments': ['card_code', 'card_last4', 'card_balance_after', 'voided_at'],
  'card-sale@1/lines': [],
  'voucher-sale@1/lines': ['tax_later'],
};
/** The parts beside a part that a pairing must name: the ones its columns and its rule point at. */
const BESIDE: Readonly<Record<string, readonly string[]>> = {
  'discountable@1/order': ['lines', 'codes'],
  'discountable@1/lines': ['order'],
  'discountable@1/codes': ['order'],
  'card-payment@1/payments': ['order'],
  'card-sale@1/lines': ['order'],
  'voucher-sale@1/lines': ['order'],
};
/** The rules through which a part works a column out itself. */
const WORKED_OUT = ['rollup', 'formula', 'codeLast4', 'stamp'];
/** A reduction given by hand is four columns or none. */
const STAFF = ['discount_kind', 'discount_value', 'discount_reason', 'discount_by'];

/**
 * The columns of a part that are Adminium's own: what a rule on the column
 * works out, what the price rule writes, and what a card holds after paying.
 * What a card PAYS is not among them — the same column takes a cash amount
 * somebody types — and neither is the card's link, which staff may fill from
 * a look-up.
 */
export function ownedOf(shape: Shape, part: string): string[] {
  const own = shape.parts[part]!;
  const out = new Set<string>();
  for (const column of own.columns) {
    if (WORKED_OUT.some((rule) => column.rules?.[rule] !== undefined)) out.add(column.ref);
  }
  for (const [name, other] of Object.entries(shape.parts)) {
    const adjust = other.adjust;
    if (adjust === undefined) continue;
    const order = adjust['order'] as { discount: string; staff?: { by: string } };
    if (name === part) {
      out.add(order.discount);
      if (order.staff !== undefined) out.add(order.staff.by);
    }
    for (const line of adjust['lines'] as { table?: string; discount: string }[]) if (line.table === part) out.add(line.discount);
    const codes = adjust['codes'] as { table: string; code: string; voucher: string } | undefined;
    if (codes?.table === part) {
      out.add(codes.code);
      out.add(codes.voucher);
    }
  }
  for (const posting of own.postings ?? []) {
    const after = (posting['map'] as Record<string, unknown>)['balance_after'];
    if ((posting['into'] as { action: string }).action === 'spend' && typeof after === 'string') out.add(after);
  }
  return [...out];
}

/** What of a rule is the host's own. */
const HOSTS_IN_ADJUST = ['needs', 'frozen', 'expect', 'refunds'];
const HOSTS_IN_ORDER = ['customer', 'currency'];
const HOSTS_IN_LINE = ['via', 'price', 'quantity', 'what', 'only', 'unlessSet', 'excludes', 'paidBy', 'nights'];
const HOSTS_IN_POSTING = ['id', 'reserve', 'post', 'reverse', 'via', 'heldUntil', 'refuses', 'only', 'needs'];
/** Inputs a host maps its own way: what is still due is a balance of its own. */
const HOSTS_IN_MAP = ['due', 'label'];
const less = (doc: Doc | undefined, keys: readonly string[]): Doc => Object.fromEntries(Object.entries(doc ?? {}).filter(([key]) => !keys.includes(key)));

/** Every column a public entry may write on a table: its own list, what it fills, and the same of each table it writes under it. */
function publiclyWritten(entries: readonly PublicEntry[], table: string): string[] {
  const out: string[] = [];
  const read = (entry: PublicEntry, at: string | undefined) => {
    if (at === table) out.push(...(entry.writable ?? []), ...Object.keys(entry.defaults ?? {}), ...Object.keys(entry.writableValues ?? {}));
    for (const [child, under] of Object.entries(entry.children ?? {})) read(under, child);
  };
  for (const entry of entries) read(entry, entry.table);
  return out;
}

/**
 * Every way the app's tables differ from the parts they are paired with.
 * `shapes`: Offers' four (the vendored files). An empty answer is a fit.
 */
export function shapeFit(manifest: { requiredSchema?: { tables: unknown[] }; roles?: unknown[]; publicAccess?: unknown[] }, pairings: readonly Pairing[], shapes: readonly Shape[]): FitIssue[] {
  const out: FitIssue[] = [];
  const tables = (manifest.requiredSchema?.tables ?? []) as Table[];
  const tableNamed = (ref: string | undefined): Table | undefined => tables.find((one) => one.ref === ref);
  /** The app's column that plays a part's column in a pairing; `null` when it is left out. */
  const plays = (pairing: Pairing, ref: string): string | null => (pairing.columns !== undefined && ref in pairing.columns ? pairing.columns[ref]! : ref);

  for (const pairing of pairings) {
    const say = (message: string) => out.push({ table: pairing.table, shape: pairing.shape, part: pairing.part, message });
    const shape = shapes.find((one) => `${one.name}@${String(one.version)}` === pairing.shape);
    const part = shape?.parts[pairing.part];
    const table = tableNamed(pairing.table);
    if (shape === undefined || part === undefined) {
      say(`"${pairing.shape}" has no part "${pairing.part}"`);
      continue;
    }
    if (table === undefined) {
      say(`the app has no table "${pairing.table}"`);
      continue;
    }
    const hostOf = (ref: string): string | null => plays(pairing, ref);
    const standsIn = (name: string): boolean => (STANDS_IN[pairing.shape] ?? []).includes(name);
    /** The app's table that plays a part of this shape. */
    const tableOf = (name: string): string | undefined => (name === pairing.part ? pairing.table : pairing.tables?.[name]);
    const owned = new Set(ownedOf(shape, pairing.part));

    // ── what a pairing may leave out, and what it must name ─────────────────
    const optional = MAY_LEAVE_OUT[`${pairing.shape}/${pairing.part}`] ?? [];
    for (const column of part.columns) {
      if (column.role !== 'pk' && hostOf(column.ref) === null && !optional.includes(column.ref)) say(`"${column.ref}" is not a column an adopter may leave out`);
    }
    const staffLeft = STAFF.filter((ref) => part.columns.some((column) => column.ref === ref) && hostOf(ref) === null);
    if (staffLeft.length > 0 && staffLeft.length < STAFF.length) say('a reduction given by hand is four columns or none: the pairing leaves out some of them');
    const twice = part.columns.map((column) => hostOf(column.ref)).filter((host, at, all) => host !== null && all.indexOf(host) !== at);
    if (twice.length > 0) say(`"${String(twice[0])}" plays two columns of the part`);

    const adopted = part.columns.filter((column) => column.role !== 'pk' && hostOf(column.ref) !== null);
    const selfLine = ((table.adjust?.['lines'] ?? []) as Doc[]).some((line) => line['self'] === true);
    const beside = BESIDE[`${pairing.shape}/${pairing.part}`] ?? [];
    for (const name of Object.keys(shape.parts)) {
      if (name === pairing.part) continue;
      const named = tableOf(name);
      if (named === undefined) {
        if (!beside.includes(name)) continue;
        // A stay is its own one line, and an order that takes no typed code keeps no table of them.
        const spared = pairing.part === 'order' && ((name === 'lines' && selfLine) || (name === 'codes' && table.adjust !== undefined && table.adjust['codes'] === undefined));
        if (!spared) say(`the pairing does not say which table plays "${name}" ("tables")`);
        continue;
      }
      if (tableNamed(named) === undefined) say(`the app has no table "${named}" to play "${name}"`);
      else if (beside.includes(name) && !standsIn(name) && !pairings.some((other) => other.table === named && other.shape === pairing.shape && other.part === name)) say(`"${named}" plays "${name}" and is paired with nothing: pair it as ${pairing.shape}/${name} too`);
    }

    // ── what may never differ ───────────────────────────────────────────────
    const missing = new Set<string>();
    const roles = (manifest.roles ?? []) as { key: string; limits?: Record<string, { writable?: string[]; creatable?: string[] }> }[];
    const open = publiclyWritten((manifest.publicAccess ?? []) as PublicEntry[], pairing.table);
    for (const column of adopted) {
      const host = table.columns.find((one) => one.ref === hostOf(column.ref));
      if (host === undefined) {
        missing.add(column.ref);
        say(`"${pairing.table}" has no column "${String(hostOf(column.ref))}" to play "${column.ref}"`);
        continue;
      }
      if (column.type === 'money' && ((host.type !== 'money' && host.type !== 'decimal') || host.scale !== column.scale)) say(`"${pairing.table}.${host.ref}" is money at another scale than the order's`);
      const link = column.rules?.['addOnLink'];
      if (link !== undefined && canonical(host.rules?.['addOnLink']) !== canonical(link)) say(`"${pairing.table}.${host.ref}" is not a link into ${String((link as { table: string }).table)} of Offers`);
      if (!owned.has(column.ref)) continue;
      for (const role of roles) {
        const limit = role.limits?.[pairing.table];
        if ([...(limit?.writable ?? []), ...(limit?.creatable ?? [])].includes(host.ref)) say(`"${pairing.table}.${host.ref}" is decided by Adminium, and the role "${role.key}" may write it`);
      }
      if (open.includes(host.ref)) say(`"${pairing.table}.${host.ref}" is decided by Adminium, and a public entry may write it`);
    }

    // ── the columns, read as Adminium reads a table built on a part ─────────
    const key = `offers/${pairing.shape}`;
    const toPart = new Map(adopted.map((column) => [hostOf(column.ref)!, column.ref]));
    const wanted = new Map(adopted.map((column) => [column.ref, column]));
    const partNames = new Set(part.columns.filter((column) => column.role !== 'pk').map((column) => column.ref));
    /** A column's rules under the part's names. A link into Offers, and where a typed code is looked for, name Offers' own table and column: left as written. */
    const underPartNames = (rules: Doc): Doc => {
      const name = (text: string) => toPart.get(text) ?? text;
      return Object.fromEntries(
        Object.entries(rules).map(([rule, value]) => {
          if (rule === 'addOnLink') return [rule, value];
          if (rule === 'lookup' && isDoc(value)) return [rule, { ...value, from: renamed(value['from'], name) }];
          return [rule, renamed(value, name)];
        }),
      );
    };
    const left = new Set(part.columns.filter((column) => column.role !== 'pk' && hostOf(column.ref) === null).map((column) => column.ref));
    /** The part's own columns, less the ones left out and less a rule that reads one of them. */
    const cut = part.columns
      .filter((column) => !left.has(column.ref))
      .map((column) => {
        const rules = Object.fromEntries(Object.entries(column.rules ?? {}).filter(([, value]) => !stringsIn(value).some((text) => left.has(text))));
        return Object.keys(rules).length === Object.keys(column.rules ?? {}).length ? column : { ...column, rules };
      });
    const cutRules = new Map(cut.map((column) => [column.ref, column.rules ?? {}]));
    const view: Table[] = tables.map((one) => {
      const playing = one.ref === pairing.table ? pairing.part : Object.entries(pairing.tables ?? {}).find(([, ref]) => ref === one.ref)?.[0];
      if (playing === undefined) return one;
      if (one.ref !== pairing.table) return { ...one, builtOn: key, part: playing };
      const columns = one.columns.map((column) => {
        const ref = toPart.get(column.ref);
        const want = ref === undefined ? undefined : wanted.get(ref);
        // A column of the app's own that happens to carry a part column's name is kept out of the way of the one that plays it.
        if (ref === undefined || want === undefined) return partNames.has(column.ref) ? { ...column, ref: `(own) ${column.ref}` } : column;
        const kept = cutRules.get(ref) ?? {};
        let rules = underPartNames({ ...(column.rules ?? {}) });
        // A rule the host keeps on a column that is not Adminium's own is the host's business: how it works out a line's amount,
        // where a default comes from. On Adminium's own columns nothing may be added. (A column the part works out from one
        // the pairing leaves out is the host's again: a net with no subtotal beside it.)
        const worked = WORKED_OUT.some((rule) => want.rules?.[rule] !== undefined);
        const strict = owned.has(ref) && (!worked || WORKED_OUT.some((rule) => kept[rule] !== undefined));
        if (!strict) rules = Object.fromEntries(Object.entries(rules).filter(([name]) => kept[name] !== undefined || name === 'addOnLink'));
        const fitted: Column = { ...column, ref, rules };
        // The differences an adopter is allowed, each put as the part has it before the two are compared.
        if (owned.has(ref) && want.default === 0 && column.nullable === true && column.default === undefined) {
          fitted.nullable = false;
          fitted.default = 0;
        }
        if (ref === 'discount_value' && (column.type === 'money' || column.type === 'decimal')) {
          fitted.type = want.type;
          fitted.scale = want.scale as number;
        }
        if (want.type === 'money' && column.type === 'decimal' && column.scale === want.scale) fitted.type = 'money';
        if (want.enum !== undefined && column.enum !== undefined && want.enum.every((member) => column.enum!.includes(member))) fitted.enum = want.enum;
        if (want.maxLength !== undefined && column.maxLength !== undefined && column.maxLength >= want.maxLength) fitted.maxLength = want.maxLength;
        if (ref === 'net' && rules['formula'] !== undefined && kept['formula'] !== undefined) {
          const reduction = hostOf('discount');
          if (reduction === null || !stringsIn(column.rules?.['formula']).includes(reduction)) say(`"${pairing.table}.${column.ref}" is the order's net and does not take the reduction off`);
          rules['formula'] = kept['formula'];
        }
        if (ref === 'subtotal' && rules['rollup'] !== undefined && kept['rollup'] !== undefined) {
          const from = (column.rules?.['rollup'] as { from?: string }).from;
          if (from !== tableOf('lines')) say(`"${pairing.table}.${column.ref}" is the order's subtotal and does not add up its lines`);
          rules['rollup'] = { ...(kept['rollup'] as Doc), from: tableOf('lines') ?? from };
        }
        // A column the host fills itself may be one it never leaves empty (a payment's amount, a line's). Never a link — an empty
        // link is how a row says it is no card's — and never a column that is Adminium's own to fill later.
        if (!strict && want.rules?.['addOnLink'] === undefined && want.nullable === true && column.nullable !== true) fitted.nullable = true;
        if (Object.keys(rules).length === 0) delete fitted.rules;
        return fitted;
      });
      return { ...one, builtOn: key, part: playing, columns };
    });
    const at = view.findIndex((one) => one.ref === pairing.table);
    const cutShape = { ...shape, parts: { ...shape.parts, [pairing.part]: { ...part, columns: cut } } };
    for (const issue of shapeConformanceIssues({ requiredSchema: { tables: view as never } }, new Map([[key, cutShape as never]]))) {
      if (!issue.path.startsWith(`requiredSchema.tables.${String(at)}.`) && issue.path !== `requiredSchema.tables.${String(at)}`) continue;
      // Said above, by the column's own name.
      if ([...missing].some((ref) => issue.message.includes(`has no column "${ref}"`))) continue;
      // The check read the table under the part's names: an issue is told under the app's own.
      say(adopted.reduce((message, column) => message.replaceAll(`"${pairing.table}.${column.ref}"`, `"${pairing.table}.${hostOf(column.ref)!}"`), issue.message));
    }

    // ── the price rule ──────────────────────────────────────────────────────
    const column = (ref: unknown): unknown => (typeof ref === 'string' ? hostOf(ref) : ref);
    if (part.adjust !== undefined) {
      const want = part.adjust;
      const have = table.adjust;
      if (have === undefined) say(`"${pairing.table}" has no price rule ("adjust"), which the part keeps`);
      else {
        if (canonical(have['by']) !== canonical(want['by'])) say('the price rule is answered by another add-on than Offers');
        const wantOrder = want['order'] as { discount: string; staff?: Record<string, string> };
        const haveOrder = less(have['order'] as Doc, HOSTS_IN_ORDER);
        const staff = staffLeft.length > 0 || wantOrder.staff === undefined ? undefined : Object.fromEntries(Object.entries(wantOrder.staff).map(([name, ref]) => [name, hostOf(ref)]));
        const wantedOrder = { discount: column(wantOrder.discount), ...(staff === undefined ? {} : { staff }) };
        if (canonical(haveOrder) !== canonical(wantedOrder)) say(`the price rule's "order" is not the part's: it names ${canonical(haveOrder)}, the part ${canonical(wantedOrder)}`);
        const linesTable = tableOf('lines');
        if (linesTable !== undefined) {
          const found = ((have['lines'] ?? []) as Doc[]).filter((one) => one['table'] === linesTable);
          // The reduction's own column is named by the lines table's pairing; here, that the rule reads that table, once, and adds nothing.
          if (found.length !== 1) say(`the price rule reads the lines of "${linesTable}" ${found.length === 0 ? 'nowhere' : 'twice'}`);
          else if (canonical(Object.keys(less(found[0], HOSTS_IN_LINE)).sort()) !== canonical(['discount', 'table'])) say(`the price rule's lines of "${linesTable}" carry something the part does not`);
        }
        const codesTable = tableOf('codes');
        const haveCodes = have['codes'] as Record<string, string> | undefined;
        if (codesTable !== undefined && haveCodes?.['table'] !== codesTable) say(`the price rule keeps its typed codes somewhere else than "${codesTable}"`);
        if (want['uses'] !== undefined) {
          const uses = (table.postings ?? []).find((posting) => posting['id'] === have['uses']);
          if (uses === undefined || (uses['into'] as { action?: string }).action !== 'redeem') say('the price rule names no posting that records what was used ("uses")');
        }
        for (const extra of Object.keys(less(have, [...HOSTS_IN_ADJUST, 'by', 'lines', 'order', 'codes', 'uses']))) say(`the price rule carries "${extra}", which the part does not`);
      }
    }

    // ── the lines' and the codes' own columns, named by the order's rule ────
    const order = tableNamed(tableOf('order'));
    for (const [name, other] of Object.entries(shape.parts)) {
      if (other.adjust === undefined || name === pairing.part) continue;
      const have = order?.adjust;
      if (have === undefined) continue;
      for (const line of other.adjust['lines'] as { table?: string; discount: string }[]) {
        if (line.table !== pairing.part) continue;
        const found = ((have['lines'] ?? []) as Doc[]).find((one) => one['table'] === pairing.table);
        if (found !== undefined && found['discount'] !== hostOf(line.discount)) say(`the price rule writes a line's reduction to "${String(found['discount'])}", and the pairing says "${String(hostOf(line.discount))}" plays it`);
      }
      const codes = other.adjust['codes'] as Record<string, string> | undefined;
      const haveCodes = have['codes'] as Record<string, string> | undefined;
      if (codes?.['table'] === pairing.part && haveCodes?.['table'] === pairing.table) {
        for (const role of ['typed', 'code', 'voucher', 'removed']) {
          const ref = codes[role];
          if (ref === undefined) continue;
          if (hostOf(ref) === null ? haveCodes[role] !== undefined : haveCodes[role] !== hostOf(ref)) say(`the price rule's codes read "${String(haveCodes[role])}" as ${role}, and the pairing says "${String(hostOf(ref))}" plays it`);
        }
      }
    }

    // ── a line no offer may reduce, and a card that may not pay for a card ──
    const lineOfOrder = ((order?.adjust?.['lines'] ?? []) as Doc[]).find((one) => one['table'] === pairing.table);
    if (pairing.shape === 'card-sale@1' && pairing.part === 'lines' && order?.adjust !== undefined) {
      const wantExcludes = { column: hostOf('gift_card_id'), set: true };
      if (lineOfOrder !== undefined && canonical(lineOfOrder['excludes']) !== canonical(wantExcludes)) say(`a line that loads a card takes no reduction: the price rule's lines of "${pairing.table}" say "excludes": ${canonical(wantExcludes)}`);
    }
    if (pairing.shape === 'voucher-sale@1' && pairing.part === 'lines' && order?.adjust !== undefined) {
      const wantPaidBy = { column: hostOf('voucher_id') };
      if (lineOfOrder !== undefined && canonical(lineOfOrder['paidBy']) !== canonical(wantPaidBy)) say(`a line that sells a voucher takes no reduction: the price rule's lines of "${pairing.table}" say "paidBy": ${canonical(wantPaidBy)}`);
    }
    if (pairing.shape === 'card-payment@1' && pairing.part === 'payments') {
      const spend = (table.postings ?? []).find((posting) => (posting['into'] as { action?: string }).action === 'spend');
      for (const sale of pairings.filter((other) => other.shape === 'card-sale@1' && other.part === 'lines')) {
        const loads = plays(sale, 'gift_card_id');
        const refused = ((spend?.['refuses'] ?? []) as Doc[]).some((one) => one['table'] === sale.table && one['column'] === loads && one['set'] === true);
        if (spend !== undefined && !refused) say(`a card may not pay for a card: the posting into "spend" says "refuses": [{"table": "${sale.table}", …, "column": "${String(loads)}", "set": true}]`);
      }
    }

    // ── the postings ────────────────────────────────────────────────────────
    for (const want of part.postings ?? []) {
      const into = want['into'];
      const found = (table.postings ?? []).filter((posting) => canonical(posting['into']) === canonical(into));
      const action = (into as { action: string }).action;
      const have = found[0];
      if (have === undefined) {
        say(`"${pairing.table}" has no posting into Offers' "${action}", which the part keeps`);
        continue;
      }
      if (found.length > 1) say(`"${pairing.table}" has ${String(found.length)} postings into Offers' "${action}": one row posts once`);
      const haveMap = have['map'] as Doc;
      for (const [input, ref] of Object.entries(less(want['map'] as Doc, HOSTS_IN_MAP))) {
        const mapped = column(ref);
        if (mapped === null ? haveMap[input] !== undefined : canonical(haveMap[input]) !== canonical(mapped)) say(`the posting into "${action}" maps "${input}" to ${canonical(haveMap[input])}, and the part to ${canonical(mapped)}`);
      }
      for (const extra of Object.keys(less(have, [...HOSTS_IN_POSTING, 'into', 'map']))) say(`the posting into "${action}" carries "${extra}", which the part does not`);
    }
  }
  return out;
}
