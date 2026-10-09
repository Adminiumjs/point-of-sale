/**
 * ONLY THE LATEST ANSWER COUNTS.
 *
 * A screen that asks again before the last answer is in (ten percent, then
 * twenty) must not show the earlier answer when it arrives late — the figure
 * on the button would be for a discount other than the one chosen. Each
 * question takes a number; an answer is used only if its number is still the
 * newest.
 */
export interface Latest {
  /** A new question: its number. Every earlier one is now stale. */
  ask(): number;
  /** Whether this question is still the newest. */
  is(asked: number): boolean;
}

export function latest(): Latest {
  let newest = 0;
  return {
    ask: () => (newest += 1),
    is: (asked) => asked === newest,
  };
}

/** The answer of the newest question only: an older one, arriving late, is dropped (`undefined`). */
export async function answered<T>(seq: Latest, question: () => Promise<T>): Promise<{ answer: T } | undefined> {
  const asked = seq.ask();
  const answer = await question();
  return seq.is(asked) ? { answer } : undefined;
}
