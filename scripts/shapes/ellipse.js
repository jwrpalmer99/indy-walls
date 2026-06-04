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

export function setEllipseHandle(index, point) {
  ellipseState.handles[index] = {x: point.x, y: point.y};
}

export function setEllipseResizeHandle(index, point, alt=false) {
  if (!alt) {
    setEllipseHandle(index, point);
    return;
  }

  const oppositeIndex = index === 0 ? 1 : 0;
  const opposite = ellipseState.handles[oppositeIndex];
  const dx = point.x - opposite.x;
  const dy = point.y - opposite.y;
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  setEllipseHandle(index, {
    x: opposite.x + Math.sign(dx || 1) * size,
    y: opposite.y + Math.sign(dy || 1) * size
  });
}

export function updateEllipseInitialHandles({alt=false, ctrl=false}={}) {
  const origin = ellipseState.initialOrigin ?? ellipseState.handles[0];
  const destination = ellipseState.handles[1];
  const dx = destination.x - origin.x;
  const dy = destination.y - origin.y;

  if (ctrl) {
    let rx = Math.abs(dx);
    let ry = Math.abs(dy);
    if (alt) rx = ry = Math.max(rx, ry);
    ellipseState.handles[0] = {x: origin.x - rx, y: origin.y - ry};
    ellipseState.handles[1] = {x: origin.x + rx, y: origin.y + ry};
    return;
  }

  if (alt) {
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    ellipseState.handles[1] = {
      x: origin.x + Math.sign(dx || 1) * size,
      y: origin.y + Math.sign(dy || 1) * size
    };
  }
}

export function getEllipsePoints(segments) {
  const {cx, cy, rx, ry} = getEllipseGeometry();
  const rotation = Number(ellipseState.rotation) || 0;
  const cosRotation = Math.cos(rotation);
  const sinRotation = Math.sin(rotation);
  const points = [];

  for (let i = 0; i <= segments; i++) {
    const angle = (Math.PI * 2 * i) / segments;
    const x = Math.cos(angle) * rx;
    const y = Math.sin(angle) * ry;
    points.push({
      x: cx + (x * cosRotation) - (y * sinRotation),
      y: cy + (x * sinRotation) + (y * cosRotation)
    });
  }

  return points;
}

export function getEllipseGeometry() {
  const [a, b] = ellipseState.handles;
  return {
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2,
    rx: Math.abs(b.x - a.x) / 2,
    ry: Math.abs(b.y - a.y) / 2
  };
}

export function getEllipseVertices() {
  return getEllipsePoints(ellipseState.segments)
    .slice(0, -1)
    .map((point, index) => ({index, point}));
}

export function getAllEllipseSegments() {
  const points = getEllipsePoints(ellipseState.segments);
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push({index: i, a: points[i], b: points[i + 1]});
  }
  return segments;
}

export function getEllipseSegments() {
  const gaps = getEllipseSegmentGaps();
  return getAllEllipseSegments().filter((segment) => !gaps.includes(segment.index));
}

export function getEllipseSegmentGaps() {
  const gaps = reconcileEllipseSegmentGaps(ellipseState.segmentGaps, ellipseState.segments);
  ellipseState.segmentGaps = gaps;
  return gaps;
}

export function reconcileEllipseSegmentGaps(source, segmentCount) {
  if (!Array.isArray(source)) return [];
  return [...new Set(source
    .map((index) => Number(index))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < segmentCount))]
    .sort((a, b) => a - b);
}

export function setEllipseRotationFromVertex(vertex, point) {
  if (!vertex || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
  const {cx, cy, rx, ry} = getEllipseGeometry();
  const pointerAngle = Math.atan2(point.y - cy, point.x - cx);
  const vertexAngle = (Math.PI * 2 * vertex.index) / ellipseState.segments;
  const baseAngle = Math.atan2(Math.sin(vertexAngle) * ry, Math.cos(vertexAngle) * rx);
  ellipseState.rotation = normalizeAngle(pointerAngle - baseAngle);
}

export function normalizeAngle(angle) {
  const fullTurn = Math.PI * 2;
  return ((angle % fullTurn) + fullTurn) % fullTurn;
}
