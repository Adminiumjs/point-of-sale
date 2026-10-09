/**
 * The till's door for bringing its gift cards into Offers (`move.ts`): the
 * three calls the move makes, spoken through the till's own session. A save
 * the server refuses is a `MoveRefused`; no answer at all is thrown as it is,
 * so the run stops and can be pressed again.
 */
import type { Desk } from '../data/desk';
import { asSinkError, type RowId } from '../data/sink';
import { MoveRefused, type MoveDoor } from './move';

const refusal = (raw: unknown): never => {
  const error = asSinkError(raw);
  if (error.kind === 'refused' || error.kind === 'signed-out') throw new MoveRefused(error.status, error.code, error.reason);
  throw error;
};

export function moveDoorOf(d: Desk): MoveDoor {
  return {
    // Every row, however many: a card left out of the count would be a card's money lost.
    rows: (table) => d.rows(table, undefined, Number.MAX_SAFE_INTEGER).catch(refusal),
    patch: async (table, id, values) => {
      await d.patch(table, id as RowId, values).catch(refusal);
    },
    oneByOne: (table, ids, values) => d.oneByOne(table, ids, values).catch(refusal),
  };
}
