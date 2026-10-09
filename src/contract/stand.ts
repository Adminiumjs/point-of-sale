/**
 * A shop stood up for a contract file: the built Adminium on one engine, the
 * add-ons the file asks for uploaded and ticked, this repo's manifest
 * installed, and the doors the till speaks through — each a plain HTTP call
 * as the signed-in session makes it.
 *
 * Tests only; nothing that ships imports it.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { addOnBundle, appBundle, boot, Caller, FROM_ADMINIUM, ok, releasedBundle, until, type BootOptions, type Engine, type Reply, type Server } from './harness';

export type Row = Record<string, unknown>;

export const ADMIN = { email: process.env['E2E_ADMIN_EMAIL'] ?? 'e2e@adminium.local', password: process.env['E2E_ADMIN_PASSWORD'] ?? 'adminium-e2e-password' };

/** Cents, from whatever the engine hands back (`"12.5000"`, `12.5`). */
export const cents = (value: unknown): number => Math.round(Number(value) * 100);
/** The figure as a receipt prints it. */
export const money = (value: unknown): string => (value === null || value === undefined ? '—' : (Math.round(Number(value) * 100) / 100).toFixed(2));

export interface Stand {
  server: Server;
  staff: Caller;
  connectionId: string;
  /** Tables by the name the manifest gives them (`tickets`), and an add-on's by its stored name (`offers_gift_cards`). */
  ids: Record<string, string>;
  data(ref: string): string;
  insert(ref: string, values: Row, children?: Record<string, Row[]>): Promise<Row>;
  /** The whole reply of a create, refused or not. */
  post(ref: string, values: Row, children?: Record<string, Row[]>): Promise<Reply<{ data: Row } & Row>>;
  update(ref: string, id: unknown, values: Row): Promise<Row>;
  patch(ref: string, id: unknown, values: Row): Promise<Reply<{ data: Row } & Row>>;
  /** What a save would answer, with nothing written. */
  dryCreate(ref: string, values: Row, children?: Record<string, Row[]>): Promise<Reply<Row>>;
  dryUpdate(ref: string, id: unknown, values: Row): Promise<Reply<Row>>;
  one(ref: string, id: unknown): Promise<Row>;
  rows(ref: string, query?: string): Promise<Row[]>;
  config(): Promise<{ addOns?: Record<string, unknown>; tables?: Record<string, string> } & Row>;
  /** A second member of staff holding one of the till's roles, signed in. */
  member(role: 'cashier' | 'manager', name: string): Promise<Caller>;
  /** The same doors, spoken through another caller. */
  as(caller: Caller): Pick<Stand, 'insert' | 'post' | 'update' | 'patch' | 'dryCreate' | 'dryUpdate' | 'one' | 'rows'>;
  refreshIds(): Promise<void>;
}

export interface StandOptions extends BootOptions {
  /** The add-ons ticked at the install. */
  addOns?: string[];
  /** The add-ons whose own sample goes in, before the app's. */
  addOnSamples?: string[];
  /** The app's own sample too. */
  sample?: boolean;
  /** Uploaded, but not ticked: there to be attached later. */
  uploadOnly?: string[];
}

export async function upload(staff: Caller, key: string): Promise<{ key: string; version: string }> {
  const addOn = addOnBundle(key);
  const staged = await staff.post(`/api/v1/add-ons/upload?expectedSha512=${encodeURIComponent(addOn.integrity)}`, addOn.buffer);
  if (![200, 201].includes(staged.status)) throw new Error(`add-on upload ${key}: ${JSON.stringify(staged.body).slice(0, 600)}`);
  return { key: addOn.key, version: addOn.version };
}

const PREFIX = 'pos_';

/** A link from a child table to its parent, by the id a tree save names it with. */
export interface Relation {
  id: string;
  from: { tableId: string; columns: string[] };
  to: { tableId: string };
}
const RELATIONS = new WeakMap<Record<string, string>, Relation[]>();

export function doors(staff: Caller, connectionId: string, ids: Record<string, string>): Pick<Stand, 'data' | 'insert' | 'post' | 'update' | 'patch' | 'dryCreate' | 'dryUpdate' | 'one' | 'rows'> {
  const data = (ref: string) => {
    const id = ids[ref];
    if (id === undefined) throw new Error(`no table "${ref}" here: ${Object.keys(ids).sort().join(', ')}`);
    return `/api/v1/data/${connectionId}/${encodeURIComponent(id)}`;
  };
  // A tree save names its children by the link's id, as the till's own door does.
  const body = (parent: string, values: Row, children?: Record<string, Row[]>) => {
    if (children === undefined) return { values };
    const linked: Record<string, { values: Row }[]> = {};
    for (const [ref, list] of Object.entries(children)) {
      const relation = (RELATIONS.get(ids) ?? []).find((r) => r.from.tableId === ids[ref] && r.to.tableId === ids[parent]);
      if (relation === undefined) throw new Error(`"${ref}" is no child of "${parent}"`);
      linked[relation.id] = list.map((row) => ({ values: row }));
    }
    return { values, children: linked };
  };
  return {
    data,
    post: (ref, values, children) => staff.post(data(ref), body(ref, values, children)),
    insert: async (ref, values, children) => ok(await staff.post<{ data: Row }>(data(ref), body(ref, values, children)), 201).data,
    patch: (ref, id, values) => staff.patch(`${data(ref)}/${String(id)}`, { values }),
    update: async (ref, id, values) => ok(await staff.patch<{ data: Row }>(`${data(ref)}/${String(id)}`, { values })).data,
    dryCreate: (ref, values, children) => staff.post(`${data(ref)}/dry-run`, body(ref, values, children)),
    dryUpdate: (ref, id, values) => staff.post(`${data(ref)}/${String(id)}/dry-run`, { values }),
    one: async (ref, id) => ok(await staff.get<{ data: Row }>(`${data(ref)}/${String(id)}`)).data,
    rows: async (ref, query = '') => {
      const out: Row[] = [];
      for (let offset = 0; ; offset += 200) {
        const page = ok(await staff.get<{ data: Row[] }>(`${data(ref)}?limit=200&offset=${String(offset)}${query === '' ? '' : `&${query}`}`)).data;
        out.push(...page);
        if (page.length < 200) return out;
      }
    },
  };
}

export async function readIds(staff: Caller, connectionId: string, into: Record<string, string> = {}): Promise<Record<string, string>> {
  const schema = ok(await staff.get<{ model: { tables: { id: string; name: string }[]; relations: Relation[] } }>(`/api/v1/connections/${connectionId}/schema`));
  const ids: Record<string, string> = into;
  RELATIONS.set(ids, schema.model.relations);
  for (const table of schema.model.tables) ids[table.name.startsWith(PREFIX) ? table.name.slice(PREFIX.length) : table.name] = table.id;
  return ids;
}

export async function standUp(engine: Engine, port: number, database: string, options: StandOptions = {}): Promise<Stand> {
  const { addOns = [], addOnSamples = [], sample = false, uploadOnly = [], ...bootOptions } = options;
  const server = await boot(engine, port, database, bootOptions);
  try {
    return await standOn(server, engine, { addOns, addOnSamples, sample, uploadOnly });
  } catch (error) {
    // A stand that never came up leaves no server behind on its ports.
    await server.stop();
    throw error;
  }
}

async function standOn(server: Server, engine: Engine, options: Required<Pick<StandOptions, 'addOns' | 'addOnSamples' | 'sample' | 'uploadOnly'>>): Promise<Stand> {
  const { addOns, addOnSamples, sample, uploadOnly } = options;
  const staff = new Caller(server.base, { origin: server.base });
  await staff.signIn(ADMIN.email, ADMIN.password);
  const connectionId = ok(await staff.get<{ connections: { id: string; name: string }[] }>('/api/v1/connections')).connections.find((c) => c.name === 'northwind')!.id;

  const listed: { key: string; version: string }[] = [];
  for (const key of addOns) listed.push(await upload(staff, key));
  for (const key of uploadOnly) await upload(staff, key);
  const app = appBundle();
  const staged = await staff.post(`/api/v1/apps/upload?expectedSha512=${encodeURIComponent(app.integrity)}`, app.buffer);
  if (![200, 201].includes(staged.status)) throw new Error(`upload: ${JSON.stringify(staged.body).slice(0, 1500)}`);
  const body = { key: app.key, version: app.version, connectionId };
  const planned = await staff.post<{ plan: { checksum: string; installable: boolean } }>('/api/v1/apps/plan', body);
  if (planned.status !== 200 || !planned.body.plan.installable) throw new Error(`the plan: ${JSON.stringify(planned.body).slice(0, 3000)}`);
  const installed = await staff.post<{ schema: { created: string[] }; rules: { skipped: unknown[] } }>('/api/v1/apps/install', { ...body, planChecksum: planned.body.plan.checksum, ...(listed.length === 0 ? {} : { addOns: listed }) });
  if (installed.status !== 200) throw new Error(`the install: ${JSON.stringify(installed.body).slice(0, 3000)}\n${server.log().slice(-3000)}`);
  if (installed.body.rules.skipped.length > 0) throw new Error(`the install skipped rules: ${JSON.stringify(installed.body.rules.skipped).slice(0, 3000)}`);
  ok(await staff.patch(`/api/v1/connections/${connectionId}`, { currency: 'USD' }));

  const ids = await readIds(staff, connectionId);
  for (const key of addOnSamples) {
    ok(await staff.post(`/api/v1/add-ons/${key}/sample-data`));
    await until(async () => (ok(await staff.get<{ loaded: boolean }>(`/api/v1/add-ons/${key}/sample-data`)).loaded ? true : undefined), `${key}'s sample to be added`);
  }
  if (sample) {
    ok(await staff.post('/api/v1/apps/pos/sample-data'));
    await until(async () => (ok(await staff.get<{ loaded: boolean }>('/api/v1/apps/pos/sample-data')).loaded ? true : undefined), 'the sample to be added');
  }

  const mine = doors(staff, connectionId, ids);
  let members = 0;
  const member = async (role: 'cashier' | 'manager', name: string): Promise<Caller> => {
    members += 1;
    const email = `${role}-${String(members)}-${engine}@till.example`;
    const password = `contract-${role}-${String(members)}-pass!`;
    const roles = ok(await staff.get<{ roles: { id: string; key?: string; name: string }[] }>('/api/v1/roles')).roles;
    const wanted = role === 'cashier' ? 'POS cashier' : 'POS manager';
    const found = roles.find((r) => r.name === wanted);
    if (found === undefined) throw new Error(`no role "${wanted}": ${roles.map((r) => r.name).join(', ')}`);
    // Invited with exactly one role; they set a password from the invitation and sign in.
    const invited = ok(await staff.post<{ invite: { token: string } }>('/api/v1/users', { email, name, roleIds: [found.id] }), 201);
    ok(await new Caller(server.base, { origin: server.base }).post('/api/v1/auth/password/reset', { token: invited.invite.token, newPassword: password }));
    const caller = new Caller(server.base, { origin: server.base });
    await caller.signIn(email, password);
    return caller;
  };

  return {
    server,
    staff,
    connectionId,
    ids,
    ...mine,
    config: async () => ok(await staff.get('/apps/pos/staff/surface-config.json')),
    member,
    as: (caller) => doors(caller, connectionId, ids),
    refreshIds: async () => {
      await readIds(staff, connectionId, ids);
    },
  };
}

/** A shop that began on the released version: what it did there, then the update to this build. */
export interface UpdatedShop {
  server: Server;
  staff: Caller;
  connectionId: string;
  ids: Record<string, string>;
  d: ReturnType<typeof doors>;
}

/**
 * The released version installed on the Adminium it was released for, with
 * its own sample and whatever `under` does through that version's doors; then
 * that Adminium stopped, this build's started on the same data, and the app
 * updated — with `addOns` connected as it updates.
 */
export async function standUpFromRelease(
  engine: Engine,
  port: number,
  database: string,
  options: { addOns?: string[]; under?: (d: ReturnType<typeof doors>) => Promise<void> } = {},
): Promise<UpdatedShop> {
  const shop = mkdtempSync(join(tmpdir(), `pos-shop-${database}-`));
  let server = await boot(engine, port, database, { adminium: FROM_ADMINIUM, keep: shop });
  const signIn = async () => {
    const caller = new Caller(server.base, { origin: server.base });
    await caller.signIn(ADMIN.email, ADMIN.password);
    return caller;
  };
  try {
    let staff = await signIn();
    const connectionId = ok(await staff.get<{ connections: { id: string; name: string }[] }>('/api/v1/connections')).connections.find((c) => c.name === 'northwind')!.id;
    ok(await staff.patch(`/api/v1/connections/${connectionId}`, { currency: 'USD' }));
    const put = async (kind: 'add-ons' | 'apps', bundle: { buffer: Buffer; integrity: string }) => {
      const reply = await staff.post(`/api/v1/${kind}/upload?expectedSha512=${encodeURIComponent(bundle.integrity)}`, bundle.buffer);
      if (![200, 201].includes(reply.status)) throw new Error(`upload: ${JSON.stringify(reply.body).slice(0, 800)}`);
    };
    const released = releasedBundle();
    await put('apps', released);
    const body = { key: released.key, version: released.version, connectionId };
    ok(await staff.post('/api/v1/apps/install', { ...body, planChecksum: ok(await staff.post<{ plan: { checksum: string } }>('/api/v1/apps/plan', body)).plan.checksum }));
    ok(await staff.post('/api/v1/apps/pos/sample-data'));
    await until(async () => (ok(await staff.get<{ loaded: boolean }>('/api/v1/apps/pos/sample-data')).loaded ? true : undefined), 'the sample to be added');
    if (options.under !== undefined) await options.under(doors(staff, connectionId, await readIds(staff, connectionId)));

    await server.stop();
    server = await boot(engine, port, database, { keep: shop });
    staff = await signIn();
    for (const key of options.addOns ?? []) await put('add-ons', addOnBundle(key));
    const app = appBundle();
    await put('apps', app);
    const plan = ok(await staff.post<{ plan: { checksum: string; installable: boolean } }>('/api/v1/apps/plan', { key: app.key, version: app.version, connectionId })).plan;
    const updated = await staff.post('/api/v1/apps/pos/update', { planChecksum: plan.checksum, publicAccess: true, ...((options.addOns ?? []).length === 0 ? {} : { addOns: (options.addOns ?? []).map((key) => ({ key, version: addOnBundle(key).version })) }) });
    if (updated.status !== 200) throw new Error(`the update: ${JSON.stringify(updated.body).slice(0, 2000)}`);
    const ids = await readIds(staff, connectionId);
    return { server, staff, connectionId, ids, d: doors(staff, connectionId, ids) };
  } catch (error) {
    await server.stop();
    throw error;
  }
}
