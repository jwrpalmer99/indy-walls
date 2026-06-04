import {clamp} from "../curve-common.js";

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

export function setRectangleHandle(index, point) {
  rectangleState.handles[index] = {x: point.x, y: point.y};
}

export function setRectangleVertex(vertex, point) {
  const ratios = getRectangleSideRatios(vertex.side);
  const ratio = getRectangleRatioForPoint(vertex.side, point);
  const previous = vertex.index > 0 ? ratios[vertex.index - 1] : 0;
  const next = vertex.index < ratios.length - 1 ? ratios[vertex.index + 1] : 1;
  const spacing = getRectangleRatioSpacing(rectangleState.sideSegments[vertex.side]);
  if ((next - previous) <= (spacing * 2)) return;
  ratios[vertex.index] = clamp(ratio, previous + spacing, next - spacing);
  rectangleState.sideRatios[vertex.side] = ratios;
}

export function getRectangleBounds() {
  const [a, b] = rectangleState.handles;
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x, b.x);
  const maxY = Math.max(a.y, b.y);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

export function getDefaultRectangleSideRatios() {
  return {
    top: [],
    right: [],
    bottom: [],
    left: []
  };
}

export function getDefaultRectangleSideEnabled() {
  return {
    top: true,
    right: true,
    bottom: true,
    left: true
  };
}

export function getDefaultRectangleSideGaps() {
  return {
    top: [],
    right: [],
    bottom: [],
    left: []
  };
}

export function cloneRectangleSideRatios(source) {
  return {
    top: [...(source?.top ?? [])],
    right: [...(source?.right ?? [])],
    bottom: [...(source?.bottom ?? [])],
    left: [...(source?.left ?? [])]
  };
}

export function cloneRectangleSideGaps(source) {
  return {
    top: [...(source?.top ?? [])],
    right: [...(source?.right ?? [])],
    bottom: [...(source?.bottom ?? [])],
    left: [...(source?.left ?? [])]
  };
}

export function cloneRectangleSideEnabled(source) {
  return {
    top: source?.top !== false,
    right: source?.right !== false,
    bottom: source?.bottom !== false,
    left: source?.left !== false
  };
}

export function getRectangleSideRatios(side) {
  const count = rectangleState.sideSegments[side] ?? DEFAULT_RECTANGLE_SEGMENTS;
  const ratios = reconcileRectangleSideRatios(rectangleState.sideRatios?.[side], count);
  rectangleState.sideRatios[side] = ratios;
  return ratios;
}

export function reconcileRectangleSideRatios(source, segmentCount) {
  const vertexCount = Math.max(segmentCount - 1, 0);
  const ratios = Array.isArray(source)
    ? source.map((ratio) => Number(ratio)).filter((ratio) => Number.isFinite(ratio))
    : [];

  ratios.sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < vertexCount; i++) {
    result.push(clamp(ratios[i] ?? ((i + 1) / segmentCount), 0, 1));
  }

  const spacing = getRectangleRatioSpacing(segmentCount);
  for (let i = 0; i < result.length; i++) {
    const min = i === 0 ? spacing : result[i - 1] + spacing;
    const max = i === result.length - 1 ? 1 - spacing : result[i + 1] - spacing;
    result[i] = clamp(result[i], min, max);
  }

  return result;
}

export function reconcileRectangleSideGaps(source, segmentCount) {
  if (!Array.isArray(source)) return [];
  return [...new Set(source
    .map((index) => Number(index))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < segmentCount))]
    .sort((a, b) => a - b);
}

export function getRectangleRatioSpacing(segmentCount) {
  return Math.min(0.02, 0.45 / Math.max(segmentCount, 1));
}

export function getRectangleRatioForPoint(side, point) {
  const bounds = getRectangleBounds();
  if (side === "top") return getBoundedRatio(point.x, bounds.minX, bounds.maxX);
  if (side === "right") return getBoundedRatio(point.y, bounds.minY, bounds.maxY);
  if (side === "bottom") return getBoundedRatio(point.x, bounds.maxX, bounds.minX);
  return getBoundedRatio(point.y, bounds.maxY, bounds.minY);
}

export function getBoundedRatio(value, start, end) {
  const length = end - start;
  if (!length) return 0;
  return clamp((value - start) / length, 0, 1);
}

export function getRectangleSegments() {
  const bounds = getRectangleBounds();
  return getRectangleBoundsSides(bounds).flatMap(([side, start, end]) => getSideSegments(side, start, end));
}

export function getRectangleSideVertices() {
  const bounds = getRectangleBounds();
  return getRectangleBoundsSides(bounds).flatMap(([side, start, end]) => getSideVertices(side, start, end));
}

export function getRectangleBoundsSides(bounds) {
  return [
    ["top", {x: bounds.minX, y: bounds.minY}, {x: bounds.maxX, y: bounds.minY}],
    ["right", {x: bounds.maxX, y: bounds.minY}, {x: bounds.maxX, y: bounds.maxY}],
    ["bottom", {x: bounds.maxX, y: bounds.maxY}, {x: bounds.minX, y: bounds.maxY}],
    ["left", {x: bounds.minX, y: bounds.maxY}, {x: bounds.minX, y: bounds.minY}]
  ];
}

export function getRectangleSegmentKey(segment) {
  return `${segment.side}:${segment.index}`;
}

export function getSideSegments(side, start, end) {
  if (!rectangleState.sideEnabled[side]) return [];

  const gaps = getRectangleSideGaps(side);
  return getAllSideSegments(side, start, end).filter((segment) => !gaps.includes(segment.index));
}

export function getAllSideSegments(side, start, end) {
  const points = getSidePoints(side, start, end);
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push({side, index: i, a: points[i], b: points[i + 1]});
  }
  return segments;
}

export function getSideVertices(side, start, end) {
  if (!rectangleState.sideEnabled[side]) return [];
  return getSidePoints(side, start, end).slice(1, -1).map((point, index) => ({side, index, point}));
}

export function getSidePoints(side, start, end) {
  return [
    start,
    ...getRectangleSideRatios(side).map((ratio) => ({
      x: start.x + ((end.x - start.x) * ratio),
      y: start.y + ((end.y - start.y) * ratio)
    })),
    end
  ];
}

export function getRectangleSideGaps(side) {
  const gaps = reconcileRectangleSideGaps(rectangleState.sideGaps?.[side], rectangleState.sideSegments[side]);
  rectangleState.sideGaps[side] = gaps;
  return gaps;
}

export function getRectangleSegmentIndexAt(side, ratio) {
  const ratios = getRectangleSideRatios(side);
  const points = [0, ...ratios, 1];
  for (let i = 0; i < points.length - 1; i++) {
    if (ratio >= points[i] && ratio <= points[i + 1]) return i;
  }
  return Math.max(rectangleState.sideSegments[side] - 1, 0);
}

export function getRectangleSideAt(point, tolerance) {
  const bounds = getRectangleBounds();
  const hits = [
    {
      side: "top",
      distance: Math.abs(point.y - bounds.minY),
      ratio: getBoundedRatio(point.x, bounds.minX, bounds.maxX),
      inRange: isBetween(point.x, bounds.minX, bounds.maxX)
    },
    {
      side: "right",
      distance: Math.abs(point.x - bounds.maxX),
      ratio: getBoundedRatio(point.y, bounds.minY, bounds.maxY),
      inRange: isBetween(point.y, bounds.minY, bounds.maxY)
    },
    {
      side: "bottom",
      distance: Math.abs(point.y - bounds.maxY),
      ratio: getBoundedRatio(point.x, bounds.maxX, bounds.minX),
      inRange: isBetween(point.x, bounds.minX, bounds.maxX)
    },
    {
      side: "left",
      distance: Math.abs(point.x - bounds.minX),
      ratio: getBoundedRatio(point.y, bounds.maxY, bounds.minY),
      inRange: isBetween(point.y, bounds.minY, bounds.maxY)
    }
  ].filter((hit) => hit.inRange && hit.distance <= tolerance);

  hits.sort((a, b) => a.distance - b.distance);
  const hit = hits[0];
  return hit ? {side: hit.side, ratio: hit.ratio} : null;
}

export function isBetween(value, a, b) {
  return value >= Math.min(a, b) && value <= Math.max(a, b);
}
