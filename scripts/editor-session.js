export function beginEditorOperation(state, getSnapshot, includeUnplaced=false) {
  if (!state || (!state.placed && !includeUnplaced) || state.pendingUndoSnapshot) return;
  state.pendingUndoSnapshot = getSnapshot(state);
}

export function commitEditorOperation(state, getSnapshot, onChange=null) {
  if (!state?.pendingUndoSnapshot) return;

  const before = state.pendingUndoSnapshot;
  state.pendingUndoSnapshot = null;
  const after = getSnapshot(state);
  if (snapshotsEqual(before, after)) return;

  state.undoStack.push(before);
  state.redoStack = [];
  onChange?.();
}

export function cancelEditorOperation(state) {
  if (state) state.pendingUndoSnapshot = null;
}

export function clearEditorHistory(state, onChange=null) {
  if (!state) return;
  state.undoStack = [];
  state.redoStack = [];
  state.pendingUndoSnapshot = null;
  onChange?.();
}

export function pushEditorUndoSnapshot(state, snapshot, getSnapshot, onChange=null) {
  if (!state || !snapshot || snapshotsEqual(snapshot, getSnapshot(state))) return;
  state.undoStack.push(snapshot);
  state.redoStack = [];
  onChange?.();
}

export function snapshotsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function cloneWallTypeBySegment(source={}) {
  return {...(source ?? {})};
}
