export const CUBIC_TOOL = "indyCubicBezier";
export const CUBIC_FLAG = "cubicBezier";
export const CUBIC_EDIT_BUTTONS_ID = "indy-walls-cubic-edit-buttons";
export const DEFAULT_CUBIC_SEGMENTS = 10;

export const cubicState = {
  active: false,
  placed: false,
  initializing: false,
  initialOrigin: null,
  draggingHandle: null,
  lastSegmentEditAction: 0,
  suppressNextSegmentEditClick: false,
  curveId: null,
  wallIds: [],
  replacingWallIds: new Set(),
  undoStack: [],
  redoStack: [],
  pendingUndoSnapshot: null,
  wallTypeTool: "walls",
  wallTypeBySegment: {},
  segments: DEFAULT_CUBIC_SEGMENTS,
  segmentGaps: [],
  graphics: null,
  handles: [
    {x: 0, y: 0},
    {x: 0, y: 0},
    {x: 0, y: 0},
    {x: 0, y: 0}
  ]
};
