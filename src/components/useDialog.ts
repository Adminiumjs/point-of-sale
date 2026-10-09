import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The elements of a dialog a keyboard can reach, in order. */
export const focusablesIn = (root: ParentNode): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];

/** Where Tab goes from `at` among `count` stops, held inside them: past the last is the first, before the first is the last. */
export const nextStop = (at: number, count: number, back: boolean): number => (count === 0 ? -1 : back ? (at <= 0 ? count - 1 : at - 1) : at < 0 || at >= count - 1 ? 0 : at + 1);

/**
 * A dialog that behaves as one: focus moves into it when it opens and goes
 * back where it was when it closes, Tab stays inside it (what is behind it is
 * not reachable), and Escape closes it — unless it has no way out (`onClose`
 * left out: "Reload the till").
 *
 * Listened for once, for as long as the dialog is up: a listener swapped
 * while a key is being handled never hears that key.
 */
export function useDialog<T extends HTMLElement>(onClose?: () => void): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const closing = useRef(onClose);
  closing.current = onClose;
  useEffect(() => {
    const root = ref.current;
    if (root === null) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!root.contains(document.activeElement)) root.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closing.current !== undefined) {
        closing.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const stops = focusablesIn(root);
      const to = nextStop(stops.indexOf(document.activeElement as HTMLElement), stops.length, e.shiftKey);
      e.preventDefault();
      (to < 0 ? root : stops[to]!).focus();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      before?.focus();
    };
  }, []);
  return ref;
}
