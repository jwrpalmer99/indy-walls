export const ELLIPSE_TOOL = "indyEllipseWall";
export const ELLIPSE_FLAG = "ellipse";
export const ELLIPSE_EDIT_BUTTONS_ID = "indy-walls-ellipse-edit-buttons";
export const DEFAULT_ELLIPSE_SEGMENTS = 16;

export const ellipseState = {
  active: false,
  placed: false,
  initializing: false,
  initialOrigin: null,
  draggingHandle: null,
  draggingVertex: null,
  lastSegmentEditAction: 0,
  suppressNextSegmentEditClick: false,
  ellipseId: null,
  wallIds: [],
  replacingWallIds: new Set(),
  undoStack: [],
  redoStack: [],
  pendingUndoSnapshot: null,
  wallTypeTool: "walls",
  wallTypeBySegment: {},
  segments: DEFAULT_ELLIPSE_SEGMENTS,
  rotation: 0,
  segmentGaps: [],
  graphics: null,
  handles: [
    {x: 0, y: 0},
    {x: 0, y: 0}
  ]
};
