// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Module hooks for the contract's Adminium (registered by `reader.mjs`): the
 * engine's demo card reader keeps what is on it in memory, and a test drives
 * it in process. Over HTTP nothing reaches it, so its module is handed to the
 * contract's counter (`reader.mjs`) as it loads: its readers, pairings and
 * charges become reachable from the counter, and nothing else changes.
 */
export async function load(url, context, nextLoad) {
  const loaded = await nextLoad(url, context);
  if (!/\/add-on-contracts\/dist\/terminal-demo\.js$/.test(url)) return loaded;
  const source = typeof loaded.source === 'string' ? loaded.source : new TextDecoder().decode(loaded.source);
  const anchor = 'const refunds = new Map();';
  if (!source.includes(anchor)) throw new Error('the demo card reader changed shape: the contract counter cannot reach it');
  return { ...loaded, source: source.replace(anchor, `${anchor}\n    globalThis.__contractDemoReader = { readers, pairings, charges };`) };
}
