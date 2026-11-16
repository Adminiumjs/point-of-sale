// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Preloaded into the contract's Adminium (`node --import`) when
 * `CONTRACT_READER_PORT` is set: the counter of the engine's demo card reader,
 * spoken to over HTTP on that port, as a customer at the counter acts on it.
 *
 *   GET  /code?pairing=…            the code the reader shows while pairing
 *   POST /tap {card, tip}            the card on the reader: `succeeds` (with a
 *                                    tip) or `declined`
 *   POST /online {online}            the reader drops off the network, or comes back
 *
 * Only the demo reader (test mode, no money) is reached; the server itself is
 * run as built.
 */
import { createServer } from 'node:http';
import { register } from 'node:module';

register('./reader-hooks.mjs', import.meta.url);

const port = Number(process.env.CONTRACT_READER_PORT);
if (Number.isFinite(port) && port > 0) {
  const reader = () => globalThis.__contractDemoReader;
  const body = (request) =>
    new Promise((resolve) => {
      let text = '';
      request.on('data', (chunk) => (text += chunk));
      request.on('end', () => {
        try {
          resolve(text === '' ? {} : JSON.parse(text));
        } catch {
          resolve({});
        }
      });
    });
  const reply = (response, status, value) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(value));
  };
  createServer(async (request, response) => {
    const held = reader();
    if (held === undefined) return reply(response, 409, { error: 'no demo reader yet' });
    const url = new URL(request.url ?? '/', 'http://counter');
    if (request.method === 'GET' && url.pathname === '/code') {
      const pairing = held.pairings.get(url.searchParams.get('pairing') ?? '');
      return pairing === undefined ? reply(response, 404, { error: 'no such pairing' }) : reply(response, 200, { code: pairing.code });
    }
    if (request.method === 'POST' && url.pathname === '/tap') {
      const { card = 'succeeds', tip = '0' } = await body(request);
      const charge = [...held.charges.values()].find((one) => one.state === 'on_reader');
      if (charge === undefined) return reply(response, 409, { error: 'nothing is on the reader' });
      if (card === 'declined') charge.state = 'declined';
      else {
        charge.state = 'succeeded';
        charge.tip = String(tip);
        charge.paymentRef = `tmp_contract_${Date.now().toString(36)}`;
      }
      return reply(response, 200, { ref: charge.ref, state: charge.state });
    }
    if (request.method === 'POST' && url.pathname === '/online') {
      const { online = true } = await body(request);
      for (const [id, one] of held.readers) held.readers.set(id, { ...one, online: online === true, lastSeenAt: online === true ? Date.now() : one.lastSeenAt });
      return reply(response, 200, { online: online === true });
    }
    return reply(response, 404, { error: 'no such door' });
  }).listen(port, '127.0.0.1');
}
