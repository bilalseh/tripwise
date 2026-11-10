import { describe, expect, it } from 'vitest';

import { canRedo, canUndo, createHistory, record, redo, reset, undo } from './history';

describe('undo/redo history', () => {
  it('undoes and redoes in order', () => {
    let h = record(record(createHistory(1), 2), 3);
    expect(h.present).toBe(3);
    h = undo(h);
    expect(h.present).toBe(2);
    h = undo(h);
    expect([h.present, canUndo(h), canRedo(h)]).toEqual([1, false, true]);
    h = redo(redo(h));
    expect([h.present, canRedo(h)]).toEqual([3, false]);
  });

  it('drops the redo stack on a new change', () => {
    const h = record(undo(record(createHistory('a'), 'b')), 'c');
    expect(h.present).toBe('c');
    expect(canRedo(h)).toBe(false);
    expect(h.past).toEqual(['a']);
  });

  it('keeps at most the limit of steps', () => {
    let h = createHistory(0);
    for (let i = 1; i <= 10; i++) h = record(h, i, 3);
    expect(h.past).toEqual([7, 8, 9]);
  });

  it('ignores no-op changes and out-of-range undo/redo', () => {
    const value = { a: 1 };
    const h = createHistory(value);
    expect(record(h, value)).toBe(h);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it('resets the present without adding a step', () => {
    const h = reset(record(createHistory(1), 2), 20);
    expect([h.present, h.past]).toEqual([20, [1]]);
  });
});
