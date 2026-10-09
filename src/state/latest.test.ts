import { describe, expect, it } from 'vitest';

import { answered, latest } from './latest';

describe('answers that arrive out of order', () => {
  it('ten percent, then twenty: the ten percent answer, arriving last, is dropped', async () => {
    const seq = latest();
    let answerTen!: (figure: string) => void;
    let answerTwenty!: (figure: string) => void;
    const shown: string[] = [];
    const show = (got: { answer: string } | undefined) => {
      if (got !== undefined) shown.push(got.answer);
    };
    const ten = answered(seq, () => new Promise<string>((resolve) => (answerTen = resolve))).then(show);
    const twenty = answered(seq, () => new Promise<string>((resolve) => (answerTwenty = resolve))).then(show);
    // The later question is answered first; the earlier one lands after it.
    answerTwenty('−$7.57');
    await twenty;
    answerTen('−$3.78');
    await ten;
    expect(shown).toEqual(['−$7.57']);
  });

  it('a question nobody asked over is answered as it came', async () => {
    const seq = latest();
    expect(await answered(seq, async () => 'ok')).toEqual({ answer: 'ok' });
  });

  it('asking again makes every earlier number stale', () => {
    const seq = latest();
    const first = seq.ask();
    const second = seq.ask();
    expect([seq.is(first), seq.is(second)]).toEqual([false, true]);
  });
});
