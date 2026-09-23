import { describe, expect, it } from 'vitest';

import { LIVE_TABLES, startLive, type LiveFrame } from './live';

class FakeSource {
  url: string;
  listeners = new Map<string, ((event: MessageEvent) => void)[]>();
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  closed = false;
  constructor(url: string) {
    this.url = url;
  }
  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, data: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(data) } as MessageEvent);
  }
  close() {
    this.closed = true;
  }
}

async function follow() {
  let source!: FakeSource;
  const frames: LiveFrame[] = [];
  let reconnects = 0;
  const stop = await startLive({
    transport: { connection: async () => 'conn-1', tableId: async (name) => `public.${name}` },
    tables: { tickets: 'pos_tickets', ticket_items: 'pos_ticket_items', reservations: 'pos_reservations' },
    onFrame: (frame) => frames.push(frame),
    onReconnect: () => {
      reconnects += 1;
    },
    createSource: (url) => (source = new FakeSource(url)),
  });
  return { source, frames, stop, reconnects: () => reconnects };
}

describe('live updates', () => {
  it('follows the till’s tables on one stream, by their real names', async () => {
    const { source } = await follow();
    const channels = decodeURIComponent(source.url.split('channels=')[1]!).split(',');
    expect(channels).toHaveLength(LIVE_TABLES.length);
    expect(channels).toContain('widget-data:conn-1:public.pos_tickets');
    // A table without a real name of its own keeps its short one.
    expect(channels).toContain('widget-data:conn-1:public.menu_items');
  });

  it('hands on each change with its table, its kind and its key', async () => {
    const { source, frames } = await follow();
    source.emit('record.update', {
      channel: 'widget-data:conn-1:public.pos_tickets',
      type: 'record.update',
      data: { pk: { id: 51 }, row: { id: 51, status: 'sent' } },
    });
    source.emit('record.delete', {
      channel: 'widget-data:conn-1:public.pos_ticket_items',
      data: { pk: { id: 7 }, row: null },
    });
    // Someone else's channel, and a frame that is not JSON: ignored.
    source.emit('record.create', { channel: 'widget-data:conn-9:public.other', data: { pk: { id: 1 } } });
    for (const listener of source.listeners.get('record.create') ?? []) listener({ data: 'not json' } as MessageEvent);
    expect(frames).toEqual([
      { table: 'tickets', kind: 'record.update', id: '51', row: { id: 51, status: 'sent' } },
      { table: 'ticket_items', kind: 'record.delete', id: '7', row: null },
    ]);
  });

  it('asks for the lists again after the connection came back, and not on the first open', async () => {
    const { source, reconnects, stop } = await follow();
    source.onopen?.(new Event('open'));
    expect(reconnects()).toBe(0);
    source.onerror?.(new Event('error'));
    source.onopen?.(new Event('open'));
    expect(reconnects()).toBe(1);
    stop();
    expect(source.closed).toBe(true);
  });
});
