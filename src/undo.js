// undo.js — snapshot-based undo stack.
//
// Each "completed gesture" pushes a full state snapshot onto the stack.
// Pressing Undo pops the current snapshot and re-applies the previous one.
//
// Gesture-end signals (the caller decides what these are):
//   - pointerup at the end of a drag on the canvas
//   - wheel idle (~300 ms after the last wheel event)
//   - 'change' event on a slider (released)
//   - explicit state changes (e.g. enabling the mirror)
//
// We dedupe consecutive identical snapshots so no-op events don't fill the
// stack. The stack is sized for plenty of headroom — snapshots are ~50
// numbers each, so 50 of them is well under 20 KB.
//
// No redo in V1. Add a cursor (current index) if/when needed.

export function createUndoStack({ getState, applyState, maxDepth = 50 }) {
  const stack = [];

  function sameAsTop(s) {
    const top = stack[stack.length - 1];
    return top && JSON.stringify(top) === JSON.stringify(s);
  }

  function snapshot() {
    const s = getState();
    if (sameAsTop(s)) return;
    stack.push(s);
    if (stack.length > maxDepth) stack.shift();
  }

  function undo() {
    if (stack.length < 2) return false;
    stack.pop();  // drop "now"
    applyState(stack[stack.length - 1]);
    return true;
  }

  function canUndo() {
    return stack.length >= 2;
  }

  function reset() {
    stack.length = 0;
  }

  function depth() {
    return stack.length;
  }

  return { snapshot, undo, canUndo, reset, depth };
}
