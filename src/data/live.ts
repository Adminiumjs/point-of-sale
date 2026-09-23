/**
 * Live updates: what other tills, the kitchen screen and the guests change,
 * arriving on this one as it happens.
 *
 * One EventSource on Adminium's event stream, following the tables the till
 * keeps live — tickets, their lines and options, bookings, and the menu (an
 * item sold out at another till). Each `record.create` / `record.update` /
 * `record.delete` frame is handed on with the table it came from, by the
 * manifest's short name, and its key.
 *
 * The hub keeps no history, so a frame missed while the connection was down
 * is gone. After a reconnect `onReconnect` fires, and the caller reads the
 * live lists again rather than trusting what it has.
 *
 * Hosted staff builds only: the stream is the signed-in person's, on
 * Adminium's own origin.
 */
import type { SessionTransport } from './sessionSource';

export type LiveKind = 'record.create' | 'record.update' | 'record.delete';

export interface LiveFrame {
  /** The manifest's short name (`tickets`). */
  table: string;
  kind: LiveKind;
  /** The row's key, as the till holds keys (text). */
  id: string | null;
  /** The row after the change (before, for a delete) — personal fields masked. */
  row: Record<string, unknown> | null;
}

/** The tables the till keeps live. */
export const LIVE_TABLES = ['tickets', 'ticket_items', 'ticket_item_modifiers', 'reservations', 'menu_items'] as const;

/** Adminium's per-stream cap. */
const MAX_CHANNELS = 64;

interface EventSourceLike {
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  onerror: ((event: Event) => void) | null;
  onopen: ((event: Event) => void) | null;
  close(): void;
}

export interface LiveOptions {
  transport: Pick<SessionTransport, 'connection' | 'tableId'>;
  /** Short name → the real table an install made. */
  tables: Readonly<Record<string, string>>;
  onFrame: (frame: LiveFrame) => void;
  onReconnect: () => void;
  /** Test seam. */
  createSource?: (url: string) => EventSourceLike;
}

/** Start following; resolves with the function that stops. */
export async function startLive(opts: LiveOptions): Promise<() => void> {
  const conn = await opts.transport.connection();
  const byChannel = new Map<string, string>();
  for (const short of LIVE_TABLES) {
    const real = opts.tables[short] ?? short;
    const id = await opts.transport.tableId(real);
    byChannel.set(`widget-data:${conn}:${id}`, short);
  }
  const channels = [...byChannel.keys()].slice(0, MAX_CHANNELS);
  const url = `/api/v1/events?channels=${encodeURIComponent(channels.join(','))}`;
  const source =
    opts.createSource?.(url) ?? (new EventSource(url, { withCredentials: true }) as unknown as EventSourceLike);

  let dropped = false;
  source.onerror = () => {
    // The browser reconnects on its own; what it missed meanwhile is gone.
    dropped = true;
  };
  source.onopen = () => {
    if (!dropped) return;
    dropped = false;
    opts.onReconnect();
  };
  const handle = (kind: LiveKind) => (event: MessageEvent) => {
    let frame: { channel?: string; data?: { pk?: Record<string, unknown> | null; row?: Record<string, unknown> | null } };
    try {
      frame = JSON.parse(String(event.data)) as typeof frame;
    } catch {
      return;
    }
    const table = frame.channel === undefined ? undefined : byChannel.get(frame.channel);
    if (table === undefined) return;
    const pk = frame.data?.pk ?? null;
    const key = pk === null ? undefined : Object.values(pk)[0];
    opts.onFrame({
      table,
      kind,
      id: key === undefined || key === null ? null : String(key),
      row: frame.data?.row ?? null,
    });
  };
  for (const kind of ['record.create', 'record.update', 'record.delete'] as const) {
    source.addEventListener(kind, handle(kind));
  }
  return () => source.close();
}
