/** A bounded undo/redo history of immutable snapshots. */
export interface History<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
}

export const HISTORY_LIMIT = 50;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/** Record a change. A new change clears the redo stack; the oldest steps fall off the end. */
export function record<T>(history: History<T>, next: T, limit = HISTORY_LIMIT): History<T> {
  if (Object.is(next, history.present)) return history;
  const past = [...history.past, history.present].slice(-limit);
  return { past, present: next, future: [] };
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...future] = history.future;
  if (next === undefined) return history;
  return { past: [...history.past, history.present], present: next, future };
}

/** Replace the present without an undo step (for example, the server's saved copy). */
export function reset<T>(history: History<T>, present: T): History<T> {
  return { ...history, present };
}

export const canUndo = <T>(history: History<T>): boolean => history.past.length > 0;
export const canRedo = <T>(history: History<T>): boolean => history.future.length > 0;
