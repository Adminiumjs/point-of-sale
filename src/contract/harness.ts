/**
 * The contract's Adminium: the BUILT server of an Adminium checkout
 * (`ADMINIUM_REPO`), booted by its own e2e script on one engine, with the two
 * add-ons Point of Sale suggests packed from an add-ons checkout
 * (`ADD_ONS_REPO`) and this repo's own `manifest.json` and sample packed as an
 * operator would upload them.
 *
 * Everything is spoken over HTTP, as the dashboard and the till speak it:
 * nothing here reaches into the server's modules.
 *
 * Tests only; nothing that ships imports it.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export type Engine = 'sqlite' | 'postgres' | 'mysql';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const read = (path: string) => readFileSync(path, 'utf8');

// ── what the contract needs, and whether it is here ─────────────────────────

export const ADMINIUM_REPO = process.env['ADMINIUM_REPO'] ?? '';
export const ADD_ONS_REPO = process.env['ADD_ONS_REPO'] ?? join(REPO, '..', 'add-ons');
const E2E_SERVER = join(ADMINIUM_REPO, 'apps', 'e2e', 'scripts', 'e2e-server.mjs');

/** The add-ons the manifest suggests, by key → their package folder. */
export const ADD_ON_DIRS: Readonly<Record<string, string>> = { invoices: 'invoices', 'barcode-labels': 'barcode-labels' };
const dirOf = (key: string) => join(ADD_ONS_REPO, 'packages', ADD_ON_DIRS[key]!);

/** Why the contract cannot run here, or null when it can. */
export function missing(): string | null {
  if (ADMINIUM_REPO === '') return 'ADMINIUM_REPO is not set';
  if (!existsSync(join(ADMINIUM_REPO, 'apps', 'server', 'dist', 'app.js'))) return `no built server in ${ADMINIUM_REPO}`;
  if (!existsSync(join(ADMINIUM_REPO, 'apps', 'dashboard', 'dist', 'index.html'))) return `no built dashboard in ${ADMINIUM_REPO}`;
  if (!existsSync(E2E_SERVER)) return `no e2e server script in ${ADMINIUM_REPO}`;
  for (const key of Object.keys(ADD_ON_DIRS)) {
    if (!existsSync(join(dirOf(key), 'dist', 'server.js'))) return `no built ${key} add-on in ${ADD_ONS_REPO}`;
  }
  return null;
}

/** The engines this run can reach: SQLite always, the others with their URLs. */
export const ENGINES: [Engine, boolean][] = [
  ['sqlite', true],
  ['postgres', (process.env['TEST_POSTGRES_URL'] ?? '') !== ''],
  ['mysql', (process.env['TEST_MYSQL_URL'] ?? '') !== ''],
];

// ── the packages, as an operator uploads them ───────────────────────────────

const BLOCK = 512;

/** An npm-shaped tarball (`package/…` members), which is what the server's hardened unpacker reads. */
function tarball(files: Record<string, Buffer>): Buffer {
  const members: Buffer[] = [];
  const put = (block: Buffer, at: number, length: number, value: string) => Buffer.from(value, 'latin1').subarray(0, length).copy(block, at);
  for (const [path, body] of Object.entries(files)) {
    const header = Buffer.alloc(BLOCK);
    put(header, 0, 100, `package/${path}`);
    put(header, 100, 8, '0000644\0');
    put(header, 124, 12, `${body.length.toString(8).padStart(11, '0')}\0`);
    put(header, 136, 12, '00000000000\0');
    put(header, 156, 1, '0');
    put(header, 257, 6, 'ustar\0');
    put(header, 263, 2, '00');
    header.fill(0x20, 148, 156);
    let sum = 0;
    for (const byte of header) sum += byte;
    put(header, 148, 8, `${sum.toString(8).padStart(6, '0')}\0 `);
    members.push(header, body, Buffer.alloc((BLOCK - (body.length % BLOCK)) % BLOCK));
  }
  members.push(Buffer.alloc(BLOCK * 2));
  return gzipSync(Buffer.concat(members), { mtime: 0 } as never);
}

export interface Bundle {
  buffer: Buffer;
  integrity: string;
}

const bundle = (files: Record<string, Buffer>): Bundle => {
  const buffer = tarball(files);
  return { buffer, integrity: `sha512-${createHash('sha512').update(buffer).digest('base64')}` };
};

const newer = (a: string, b: string) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i += 1) if (x![i] !== y![i]) return x![i]! > y![i]!;
  return false;
};

/**
 * The version an add-on is packed as, and the one its checkout carries.
 *
 * The checkout is the add-ons' NEXT release before its release stamps the
 * number. When the app already asks for that next number (`>=x.y.z`), the
 * checkout is packed as it — a rehearsal of the release, said in the test's
 * name — rather than failing on a number nobody has stamped yet.
 */
export function packedVersion(key: string): { version: string; checkout: string; rehearsed: boolean } {
  const app = JSON.parse(read(join(REPO, 'manifest.json'))) as { addOns?: { suggests?: { key: string; range: string }[] } };
  const range = app.addOns?.suggests?.find((s) => s.key === key)?.range ?? '';
  const floor = /^>=\s*(\d+\.\d+\.\d+)$/.exec(range.trim())?.[1] ?? null;
  const checkout = (JSON.parse(read(join(dirOf(key), 'manifest.json'))) as { version: string }).version;
  if (floor !== null && newer(floor, checkout)) return { version: floor, checkout, rehearsed: true };
  return { version: checkout, checkout, rehearsed: false };
}

/** An add-on, packed as its release packs it: `files[]`, the name rewritten, no dev-only fields. */
export function addOnBundle(key: string): Bundle & { key: string; version: string } {
  const dir = dirOf(key);
  const pkg = JSON.parse(read(join(dir, 'package.json'))) as Record<string, unknown> & { name: string; version: string; files: string[] };
  const files: Record<string, Buffer> = {};
  const add = (path: string) => {
    const absolute = join(dir, path);
    if (!existsSync(absolute)) return;
    if (statSync(absolute).isDirectory()) {
      for (const name of readdirSync(absolute)) add(join(path, name));
      return;
    }
    files[relative(dir, absolute).split('\\').join('/')] = readFileSync(absolute);
  };
  for (const entry of pkg.files) add(entry);
  const { version } = packedVersion(key);
  const { devDependencies: _dev, scripts: _scripts, ...shipped } = pkg;
  files['package.json'] = Buffer.from(JSON.stringify({ ...shipped, name: pkg.name.replace(/^@adminium\//, '@adminiumjs/'), version }));
  const manifest = JSON.parse(read(join(dir, 'manifest.json'))) as { key: string; version: string };
  files['manifest.json'] = Buffer.from(JSON.stringify({ ...manifest, version }));
  return { ...bundle(files), key: manifest.key, version };
}

/** The version of the Adminium checkout the contract boots (its server package). */
export function adminiumVersion(): string {
  return (JSON.parse(read(join(ADMINIUM_REPO, 'apps', 'server', 'package.json'))) as { version: string }).version;
}

/**
 * The floor the app is packed with, and whether that is a rehearsal.
 *
 * The same rule as the add-ons': a checkout of Adminium's main that carries
 * the next release before the release stamps its number reads as the version
 * before it. When the app already asks for that next release, the manifest is
 * packed with the checkout's own number — said in the test's name — rather
 * than refused for a number nobody has stamped yet. Only ever lowered to the
 * checkout's version, never below it.
 */
export function packedFloor(): { floor: string; asked: string; rehearsed: boolean } {
  const asked = (JSON.parse(read(join(REPO, 'manifest.json'))) as { compatibility: { minAdminiumVersion: string } }).compatibility.minAdminiumVersion;
  const server = adminiumVersion();
  return newer(asked, server) ? { floor: server, asked, rehearsed: true } : { floor: asked, asked, rehearsed: false };
}

/**
 * This repo's app: its manifest, its sample, and each side — the built
 * surfaces when `dist-surface/pos` is there (a browser can then open the
 * till), a stand-in page otherwise (the contract speaks only HTTP).
 */
export function appBundle(): Bundle & { key: string; version: string; built: boolean } {
  const manifest = JSON.parse(read(join(REPO, 'manifest.json'))) as { key: string; version: string; sampleData?: { file: string }; compatibility: Record<string, unknown> };
  const { floor, rehearsed } = packedFloor();
  const files: Record<string, Buffer> = {
    'package.json': Buffer.from(JSON.stringify({ name: `@adminiumjs/app-${manifest.key}`, version: manifest.version })),
    'manifest.json': rehearsed
      ? Buffer.from(`${JSON.stringify({ ...manifest, compatibility: { ...manifest.compatibility, minAdminiumVersion: floor } }, null, 2)}\n`)
      : readFileSync(join(REPO, 'manifest.json')),
  };
  const built = join(REPO, 'dist-surface', manifest.key);
  const hasBuild = ['staff', 'customer'].every((side) => existsSync(join(built, side, 'index.html')));
  for (const side of ['staff', 'customer']) {
    if (!hasBuild) {
      files[`${side}/index.html`] = Buffer.from(`<!doctype html><html><body data-app="pos-${side}"></body></html>`);
      continue;
    }
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else files[`${side}/${relative(join(built, side), path).split('\\').join('/')}`] = readFileSync(path);
      }
    };
    walk(join(built, side));
  }
  if (manifest.sampleData !== undefined) files[manifest.sampleData.file] = readFileSync(join(REPO, manifest.sampleData.file));
  return { ...bundle(files), key: manifest.key, version: manifest.version, built: hasBuild };
}

// ── the server ──────────────────────────────────────────────────────────────

export interface Server {
  base: string;
  /** The SMTP sink's reader: every email the server sent. */
  sink: string;
  /** What the server has said so far (its log), for a failure to show. */
  log(): string;
  stop(): Promise<void>;
}

/**
 * Boot the built Adminium on one engine; resolves once it serves.
 *
 * Every port it opens is named (the server, the SMTP sink, the sink's reader,
 * the scripted model), so a run keeps to the four it was given.
 */
export async function boot(engine: Engine, port: number, database: string): Promise<Server> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    E2E_ENGINE: engine,
    E2E_PORT: String(port),
    E2E_SMTP_PORT: String(port + 1),
    E2E_SINK_PORT: String(port + 2),
    E2E_FAKE_LLM_PORT: String(port + 3),
    // Its own database, so a contract never meets another run's rows.
    E2E_DATABASE: database,
  };
  const child: ChildProcess = spawn(process.execPath, [E2E_SERVER], { cwd: join(ADMINIUM_REPO, 'apps', 'e2e'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout?.on('data', (chunk: Buffer) => (log += chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => (log += chunk.toString()));
  const base = `http://127.0.0.1:${String(port)}`;
  const deadline = Date.now() + 180_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`the ${engine} server exited:\n${log.slice(-4000)}`);
    try {
      const res = await fetch(`${base}/api/v1/healthz`);
      if (res.ok) break;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) {
      child.kill('SIGKILL');
      throw new Error(`the ${engine} server never answered:\n${log.slice(-4000)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return {
    base,
    sink: `http://127.0.0.1:${String(port + 2)}`,
    log: () => log,
    stop: () =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5_000);
      }),
  };
}

// ── speaking to it ──────────────────────────────────────────────────────────

export interface Reply<T = unknown> {
  status: number;
  body: T;
  code: string | undefined;
  message: string;
  details: Record<string, unknown>;
  bytes: Buffer;
  contentType: string;
}

/** A caller: the operator (a session cookie), or a stranger with a browser key. */
export class Caller {
  private cookie = '';
  private csrf = '';
  readonly base: string;
  private readonly headers: Record<string, string>;
  constructor(base: string, headers: Record<string, string> = {}) {
    this.base = base;
    this.headers = headers;
  }

  /** The session cookie, for a browser that should open the till signed in as this caller. */
  get session(): string {
    return this.cookie;
  }

  async send<T = unknown>(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<Reply<T>> {
    for (let attempt = 0; ; attempt += 1) {
      const res = await fetch(`${this.base}${path}`, {
        method,
        headers: {
          ...this.headers,
          ...(this.cookie === '' ? {} : { cookie: this.cookie }),
          ...(this.csrf === '' || method === 'GET' ? {} : { 'x-adminium-csrf': this.csrf }),
          ...(body === undefined ? {} : Buffer.isBuffer(body) ? { 'content-type': 'application/octet-stream' } : { 'content-type': 'application/json' }),
          ...extra,
        },
        ...(body === undefined ? {} : { body: Buffer.isBuffer(body) ? new Uint8Array(body) : JSON.stringify(body) }),
      });
      const set = res.headers.getSetCookie?.() ?? [];
      if (set.length > 0) this.cookie = set.map((c) => c.split(';')[0]).join('; ');
      // A burst the rate limit refused is the limit's, not the contract's: wait it out.
      if (res.status === 429 && attempt < 6) {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        continue;
      }
      const bytes = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') ?? '';
      let parsed: unknown = null;
      if (contentType.includes('json')) {
        try {
          parsed = bytes.length === 0 ? null : JSON.parse(bytes.toString('utf8'));
        } catch {
          parsed = bytes.toString('utf8');
        }
      }
      const error = (parsed as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null)?.error;
      return { status: res.status, body: parsed as T, code: error?.code, message: error?.message ?? '', details: error?.details ?? {}, bytes, contentType };
    }
  }

  /** Sign in as the operator, and take the session's write token as the dashboard does. */
  async signIn(email: string, password: string): Promise<void> {
    ok(await this.post('/api/v1/auth/login', { email, password }));
    this.csrf = ok(await this.get<{ data: { csrfToken: string } }>('/api/v1/bootstrap')).data.csrfToken;
  }

  get = <T = unknown>(path: string, extra?: Record<string, string>) => this.send<T>('GET', path, undefined, extra);
  post = <T = unknown>(path: string, body?: unknown, extra?: Record<string, string>) => this.send<T>('POST', path, body ?? {}, extra);
  patch = <T = unknown>(path: string, body: unknown, extra?: Record<string, string>) => this.send<T>('PATCH', path, body, extra);
  put = <T = unknown>(path: string, body: unknown, extra?: Record<string, string>) => this.send<T>('PUT', path, body, extra);
}

/** Expect a status, and hand back the body. */
export function ok<T>(reply: Reply<T>, status = 200): T {
  if (reply.status !== status) throw new Error(`expected ${String(status)}, got ${String(reply.status)}: ${JSON.stringify(reply.body ?? reply.bytes.toString('utf8').slice(0, 300)).slice(0, 1500)}`);
  return reply.body;
}

export const until = async <T>(read: () => Promise<T | undefined>, label: string, ms = 120_000): Promise<T> => {
  const deadline = Date.now() + ms;
  for (;;) {
    const found = await read();
    if (found !== undefined) return found;
    if (Date.now() > deadline) throw new Error(`waited ${String(ms / 1000)} s for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
};

/** An email the SMTP sink holds. */
export interface SunkMail {
  to: string[];
  subject: string;
  text: string;
  html: string;
  attachments: { filename: string; contentType: string; size: number; related: boolean }[];
}

/** What a person would see as attached: not the email's own inline images (the brand mark). */
export const attachedFiles = (mail: SunkMail) => mail.attachments.filter((a) => !a.related);

export async function mailbox(server: Server): Promise<SunkMail[]> {
  return (await (await fetch(`${server.sink}/messages`)).json()) as SunkMail[];
}
