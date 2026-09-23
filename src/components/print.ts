/**
 * Print one part of the till — the receipt, or the end-of-day report — and
 * nothing around it.
 *
 * There is no printer driver: `window.print()` goes to whatever printer the
 * tablet can reach, an 80 mm receipt printer included (D11). The print
 * stylesheet (app.css) shows only the part named here, sized for the paper.
 */
export function printOnly(part: 'receipt' | 'report'): void {
  const body = document.body;
  body.dataset.print = part;
  const done = () => {
    delete body.dataset.print;
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}
