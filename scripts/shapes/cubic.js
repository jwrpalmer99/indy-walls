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

export function setHandle(index, point) {
  cubicState.handles[index] = {x: point.x, y: point.y};
}

export function initializeCubicControls() {
  const [start, controlA, controlB, end] = cubicState.handles;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!length) return;

  const nx = dy / length;
  const ny = -dx / length;

  controlA.x = start.x + (dx * 0.35) + (nx * length * 0.25);
  controlA.y = start.y + (dy * 0.35) + (ny * length * 0.25);
  controlB.x = end.x - (dx * 0.10) + (nx * length * 0.35);
  controlB.y = end.y - (dy * 0.10) + (ny * length * 0.35);
}

export function getCubicPoints(segments) {
  const [p0, p1, p2, p3] = cubicState.handles;
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    points.push({
      x: (mt ** 3 * p0.x) + (3 * mt ** 2 * t * p1.x) + (3 * mt * t ** 2 * p2.x) + (t ** 3 * p3.x),
      y: (mt ** 3 * p0.y) + (3 * mt ** 2 * t * p1.y) + (3 * mt * t ** 2 * p2.y) + (t ** 3 * p3.y)
    });
  }
  return points;
}

export function getAllCubicSegments() {
  const points = getCubicPoints(cubicState.segments);
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push({index: i, a: points[i], b: points[i + 1]});
  }
  return segments;
}

export function getCubicSegments() {
  const gaps = getCubicSegmentGaps();
  return getAllCubicSegments().filter((segment) => !gaps.includes(segment.index));
}

export function getCubicSegmentGaps() {
  const gaps = reconcileCubicSegmentGaps(cubicState.segmentGaps, cubicState.segments);
  cubicState.segmentGaps = gaps;
  return gaps;
}

export function reconcileCubicSegmentGaps(source, segmentCount) {
  if (!Array.isArray(source)) return [];
  return [...new Set(source
    .map((index) => Number(index))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < segmentCount))]
    .sort((a, b) => a - b);
}
