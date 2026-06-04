export const RECTANGLE_TOOL = "indyRectangleWall";
export const RECTANGLE_FLAG = "rectangle";
export const RECTANGLE_EDIT_BUTTONS_ID = "indy-walls-rectangle-edit-buttons";
export const DEFAULT_RECTANGLE_SEGMENTS = 1;

export const rectangleState = {
  active: false,
  placed: false,
  initializing: false,
  draggingHandle: null,
  draggingVertex: null,
  hoveredVertex: null,
  lastSideEditAction: 0,
  suppressNextSideEditClick: false,
  rectangleId: null,
  wallIds: [],
  replacingWallIds: new Set(),
  undoStack: [],
  redoStack: [],
  pendingUndoSnapshot: null,
  wallTypeTool: "walls",
  wallTypeBySegment: {},
  sideSegments: {
    top: DEFAULT_RECTANGLE_SEGMENTS,
    right: DEFAULT_RECTANGLE_SEGMENTS,
    bottom: DEFAULT_RECTANGLE_SEGMENTS,
    left: DEFAULT_RECTANGLE_SEGMENTS
  },
  sideRatios: {
    top: [],
    right: [],
    bottom: [],
    left: []
  },
  sideEnabled: {
    top: true,
    right: true,
    bottom: true,
    left: true
  },
  sideGaps: {
    top: [],
    right: [],
    bottom: [],
    left: []
  },
  graphics: null,
  handles: [
    {x: 0, y: 0},
    {x: 0, y: 0}
  ]
};
