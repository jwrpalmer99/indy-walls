export const POLYLINE_TOOL = "indyPolylineWall";
export const POLYLINE_FLAG = "polyline";
export const POLYLINE_EDIT_BUTTONS_ID = "indy-walls-polyline-edit-buttons";

export const polylineState = {
  active: false,
  placed: false,
  drawing: false,
  closed: false,
  draggingVertex: null,
  hoveredVertex: null,
  polylineId: null,
  wallIds: [],
  replacingWallIds: new Set(),
  undoStack: [],
  redoStack: [],
  pendingUndoSnapshot: null,
  wallTypeTool: "walls",
  wallTypeBySegment: {},
  segmentGaps: [],
  graphics: null,
  previewPoint: null,
  points: []
};
