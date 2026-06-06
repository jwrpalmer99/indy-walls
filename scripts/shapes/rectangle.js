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
  if (index === 0 || index === 1) {
    rectangleState.handles[index] = {x: point.x, y: point.y};
    return;
  }

  const [a, b] = rectangleState.handles;
  if (index === 2) {
    rectangleState.handles[0] = {x: point.x, y: a.y};
    rectangleState.handles[1] = {x: b.x, y: point.y};
  } else if (index === 3) {
    rectangleState.handles[0] = {x: a.x, y: point.y};
    rectangleState.handles[1] = {x: point.x, y: b.y};
  }
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

export function getRectangleCornerHandles() {
  const [a, b] = rectangleState.handles;
  return [
    {index: 0, point: a},
    {index: 1, point: b},
    {index: 2, point: {x: a.x, y: b.y}},
    {index: 3, point: {x: b.x, y: a.y}}
  ];
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

export function getRectangleHandleAt(point, deps) {
  if (!rectangleState.placed) return null;
  const style = deps.getPreviewStyle();
  const radius = getRectangleCornerHitRadius(style, deps);
  let bestIndex = null;
  let bestDistance = Infinity;
  for (const handle of getRectangleCornerHandles()) {
    const distance = Math.hypot(handle.point.x - point.x, handle.point.y - point.y);
    if (distance <= radius && distance < bestDistance) {
      bestIndex = handle.index;
      bestDistance = distance;
    }
  }
  return bestIndex;
}

export function getRectangleVertexAt(point, deps) {
  if (!rectangleState.placed) return null;
  const radius = getRectangleVertexHitRadius(deps);
  const vertices = getRectangleSideVertices();
  for (const vertex of vertices) {
    if (Math.hypot(vertex.point.x - point.x, vertex.point.y - point.y) <= radius) {
      return {side: vertex.side, index: vertex.index, point: vertex.point};
    }
  }
  return null;
}

export function changeRectangleSegments(delta, side=null, deps) {
  if (!deps.isRectangleToolActive()) return;
  const sides = side ? [side] : ["top", "right", "bottom", "left"];
  for (const key of sides) {
    rectangleState.sideSegments[key] = deps.clamp(rectangleState.sideSegments[key] + delta, 1, 64);
    rectangleState.sideRatios[key] = reconcileRectangleSideRatios(
      rectangleState.sideRatios[key],
      rectangleState.sideSegments[key]
    );
  }
  deps.drawRectanglePreview();
}

export function getRectangleSideAtWithStyle(point, deps) {
  const style = deps.getPreviewStyle();
  const tolerance = deps.getScaledRadius(Math.max(style.wallWidth + 6, 10));
  return getRectangleSideAt(point, tolerance);
}

export function getRectangleSideEditFromEvent(event, deps) {
  if (!deps.isRectangleToolActive() || !rectangleState.placed) return null;
  const point = getRectangleSidePointFromEvent(event, deps);
  if (!point) return null;

  return {
    point: {x: point.x, y: point.y},
    remove: deps.isAltInteraction(event)
  };
}

export function commitRectangleSideEdit(edit, event=null, deps) {
  if (!deps.isRectangleToolActive() || !rectangleState.placed) return false;
  deps.debugInteractionManagers("before rectangle canvas click commit", event, {edit});
  if (!editRectangleSideWithUndo(edit.point, edit.remove, deps)) return false;

  rectangleState.draggingHandle = null;
  rectangleState.draggingVertex = null;
  rectangleState.lastSideEditAction = Date.now();
  rectangleState.suppressNextSideEditClick = false;
  deps.debugInteractionManagers("after rectangle canvas click commit", event, {edit});
  deps.scheduleEditorInteractionReset(event);
  return true;
}

function getRectangleSidePointFromEvent(event, deps) {
  for (const point of deps.getCanvasClickCandidatePoints(event)) {
    if (getRectangleSideAtWithStyle({x: point.x, y: point.y}, deps)) return {x: point.x, y: point.y};
  }
  return null;
}

function editRectangleSideAt(point, remove=false, deps) {
  if (!rectangleState.placed) return false;
  if (isNearRectangleCorner(point, deps)) return false;

  const hit = getRectangleSideAtWithStyle(point, deps);
  if (!hit) return false;

  if (remove) return removeRectangleVertexAt(hit, deps);
  return addRectangleVertexAt(hit, deps);
}

function editRectangleSideWithUndo(point, remove=false, deps) {
  const snapshot = deps.getEditorSnapshot(rectangleState);
  const edited = editRectangleSideAt(point, remove, deps);
  if (edited) deps.pushEditorUndoSnapshot(rectangleState, snapshot);
  return edited;
}

function addRectangleVertexAt({side, ratio}, deps) {
  if (!rectangleState.sideEnabled[side]) {
    rectangleState.sideEnabled[side] = true;
    rectangleState.sideSegments[side] = DEFAULT_RECTANGLE_SEGMENTS;
    rectangleState.sideRatios[side] = [];
    rectangleState.sideGaps[side] = [];
    deps.drawRectanglePreview();
    return true;
  }

  if (restoreRectangleSegmentAt({side, ratio}, deps)) return true;

  if (rectangleState.sideSegments[side] >= 64) return false;

  const ratios = getRectangleSideRatios(side);
  const spacing = getRectangleRatioSpacing(rectangleState.sideSegments[side] + 1);
  if (ratio < spacing || ratio > (1 - spacing)) return false;
  if (ratios.some((existing) => Math.abs(existing - ratio) < spacing)) return false;

  rectangleState.sideSegments[side] += 1;
  rectangleState.sideRatios[side] = reconcileRectangleSideRatios([...ratios, ratio], rectangleState.sideSegments[side]);
  rectangleState.sideGaps[side] = reconcileRectangleSideGaps(rectangleState.sideGaps[side], rectangleState.sideSegments[side]);
  deps.drawRectanglePreview();
  return true;
}

function removeRectangleVertexAt({side, ratio}, deps) {
  const ratios = getRectangleSideRatios(side);
  if (!ratios.length) return disableRectangleSide(side, deps);
  return removeRectangleSegmentAt({side, ratio}, deps);
}

function removeRectangleSegmentAt({side, ratio}, deps) {
  const index = getRectangleSegmentIndexAt(side, ratio);
  const gaps = getRectangleSideGaps(side);
  if (gaps.includes(index)) return false;

  rectangleState.sideGaps[side] = [...gaps, index].sort((a, b) => a - b);
  deps.drawRectanglePreview();
  return true;
}

function restoreRectangleSegmentAt({side, ratio}, deps) {
  const index = getRectangleSegmentIndexAt(side, ratio);
  const gaps = getRectangleSideGaps(side);
  if (!gaps.includes(index)) return false;

  rectangleState.sideGaps[side] = gaps.filter((gap) => gap !== index);
  deps.drawRectanglePreview();
  return true;
}

export function removeRectangleVertex(vertex, deps) {
  const {side, index} = vertex;
  const ratios = getRectangleSideRatios(side);
  if (ratios[index] === undefined) return false;

  ratios.splice(index, 1);
  rectangleState.sideSegments[side] -= 1;
  rectangleState.sideRatios[side] = reconcileRectangleSideRatios(ratios, rectangleState.sideSegments[side]);
  rectangleState.sideGaps[side] = reconcileRectangleSideGaps(rectangleState.sideGaps[side], rectangleState.sideSegments[side]);
  rectangleState.hoveredVertex = null;
  deps.drawRectanglePreview();
  return true;
}

function disableRectangleSide(side, deps) {
  if (!rectangleState.sideEnabled[side]) return false;

  rectangleState.sideEnabled[side] = false;
  rectangleState.sideSegments[side] = DEFAULT_RECTANGLE_SEGMENTS;
  rectangleState.sideRatios[side] = [];
  rectangleState.sideGaps[side] = [];
  rectangleState.hoveredVertex = null;
  deps.drawRectanglePreview();
  return true;
}

export function drawRectanglePreview(deps) {
  const layer = canvas?.walls;
  if (!layer) return;

  const graphics = deps.prepareRectanglePreviewGraphics(layer);
  if (!graphics) return;
  deps.setRectangleEditingState(rectangleState.placed);
  if (!rectangleState.placed) return;

  const style = deps.getPreviewStyle();
  const segments = getRectangleSegments();
  drawRectangleInteractionHits(graphics, style, deps);
  for (const segment of segments) {
    const {a, b} = segment;
    graphics.lineStyle(deps.getScaledRadius(style.wallWidth), deps.getSegmentPreviewColor(rectangleState, segment, style), 0.9);
    graphics.moveTo(a.x, a.y);
    graphics.lineTo(b.x, b.y);
  }
  for (const segment of segments) {
    deps.drawSegmentDoorIcon(graphics, rectangleState, segment, style);
  }

  const bounds = getRectangleBounds();
  drawRectangleBoundsGuide(graphics, bounds, style, deps);

  for (const {a: start} of segments) {
    deps.drawPreviewVertex(graphics, start, style);
  }
  deps.drawPreviewVertex(graphics, segments.at(-1)?.b ?? rectangleState.handles[0], style);
  for (const vertex of getRectangleSideVertices()) {
    drawRectangleSplitVertex(graphics, vertex, style, deps);
  }
  for (const handle of getRectangleCornerHandles()) {
    deps.drawEndpoint(graphics, handle.point, style);
  }
  deps.drawMoveHandle(graphics, deps.getEditorShapeCenter(RECTANGLE_TOOL), style);
}

function drawRectangleInteractionHits(graphics, style, deps) {
  const width = deps.getScaledRadius(Math.max(style.wallWidth + 18, 24));
  graphics.lineStyle(width, 0xffffff, 0.001);
  for (const [, start, end] of getRectangleBoundsSides(getRectangleBounds())) {
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(end.x, end.y);
  }
}

function drawRectangleBoundsGuide(graphics, bounds, style, deps) {
  for (const [side, start, end] of getRectangleBoundsSides(bounds)) {
    if (!rectangleState.sideEnabled[side]) {
      graphics.lineStyle(deps.getScaledRadius(Math.max(style.guideWidth, 1)), style.outlineColor, 0.22);
      graphics.moveTo(start.x, start.y);
      graphics.lineTo(end.x, end.y);
      continue;
    }

    const gaps = getRectangleSideGaps(side);
    for (const segment of getAllSideSegments(side, start, end)) {
      const missing = gaps.includes(segment.index);
      const color = deps.getSegmentPreviewColor(rectangleState, segment, style);
      graphics.lineStyle(
        deps.getScaledRadius(missing ? Math.max(style.guideWidth, 1) : style.guideWidth),
        color,
        missing ? 0.22 : 0.45
      );
      graphics.moveTo(segment.a.x, segment.a.y);
      graphics.lineTo(segment.b.x, segment.b.y);
    }
  }
}

function getRectangleVertexHitRadius(deps) {
  const style = deps.getPreviewStyle();
  return deps.getSplitVertexHitRadius(style);
}

function getRectangleCornerHitRadius(style, deps) {
  return deps.getScaledRadius(Math.max(style.endpointSize + style.outlineWidth + 8, style.wallWidth + 16));
}

function isNearRectangleCorner(point, deps) {
  if (!rectangleState.placed) return false;
  const radius = getRectangleCornerHitRadius(deps.getPreviewStyle(), deps);
  return getRectangleCornerHandles().some((handle) => {
    return Math.hypot(handle.point.x - point.x, handle.point.y - point.y) <= radius;
  });
}

function drawRectangleSplitVertex(graphics, vertex, style, deps) {
  const radius = deps.getScaledRadius(style.splitVertexSize);
  const highlighted = isHighlightedRectangleVertex(vertex);
  graphics.beginFill(highlighted ? style.vertexActiveColor : style.vertexColor, 0.98);
  graphics.lineStyle(
    deps.getScaledRadius(style.outlineWidth),
    highlighted ? style.outlineColor : style.wallColor,
    0.95
  );
  const {point} = vertex;
  graphics.drawCircle(point.x, point.y, radius);
  graphics.endFill();
}

function isHighlightedRectangleVertex(vertex) {
  return sameRectangleVertex(rectangleState.draggingVertex, vertex)
    || sameRectangleVertex(rectangleState.hoveredVertex, vertex);
}

function sameRectangleVertex(a, b) {
  return !!a && !!b && a.side === b.side && a.index === b.index;
}

export async function applyRectangleWalls(deps) {
  if (!deps.isRectangleToolActive() || !rectangleState.placed) return;

  const rectangleId = rectangleState.rectangleId ?? foundry.utils.randomID();
  const segments = getRectangleSegments();
  const walls = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const {a, b} = segment;
    const wallData = deps.getSegmentWallData(rectangleState, deps.getSegmentKey(segment));
    const c = [Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y)];
    if ((c[0] === c[2]) && (c[1] === c[3])) continue;
    walls.push({
      ...wallData,
      c,
      flags: {
        [deps.MODULE_ID]: {
          [RECTANGLE_FLAG]: {
            rectangleId,
            index: i,
            side: segment.side,
            segmentIndex: segment.index,
            wallIds: [],
            handles: deps.clonePoints(rectangleState.handles),
            sideSegments: {...rectangleState.sideSegments},
            sideRatios: cloneRectangleSideRatios(rectangleState.sideRatios),
            sideEnabled: cloneRectangleSideEnabled(rectangleState.sideEnabled),
            sideGaps: cloneRectangleSideGaps(rectangleState.sideGaps),
            wallTypeBySegment: deps.cloneWallTypeBySegment(rectangleState.wallTypeBySegment),
            wallTypeTool: rectangleState.wallTypeTool
          }
        }
      }
    });
  }

  const oldWallIds = getExistingRectangleWallIds();
  if (!walls.length) {
    if (oldWallIds.length) {
      oldWallIds.forEach((id) => rectangleState.replacingWallIds.add(id));
      try {
        await canvas.scene.deleteEmbeddedDocuments("Wall", oldWallIds);
      } finally {
        oldWallIds.forEach((id) => rectangleState.replacingWallIds.delete(id));
      }
    }
    deps.clearRectanglePreview();
    return;
  }

  const created = await deps.replaceShapeWalls(rectangleState, oldWallIds, walls);
  ui.notifications.info(game.i18n.format("indy-walls.Notifications.RectangleWallsCreated", {
    count: created.length
  }));
  deps.clearRectanglePreview();
}

export function clearRectanglePreview(deps) {
  deps.restoreEditSessionWalls();
  deps.clearEditorHistory(rectangleState);
  rectangleState.placed = false;
  rectangleState.initializing = false;
  rectangleState.draggingHandle = null;
  rectangleState.draggingVertex = null;
  rectangleState.hoveredVertex = null;
  rectangleState.rectangleId = null;
  rectangleState.wallIds = [];
  rectangleState.wallTypeBySegment = {};
  rectangleState.sideRatios = getDefaultRectangleSideRatios();
  rectangleState.sideEnabled = getDefaultRectangleSideEnabled();
  rectangleState.sideGaps = getDefaultRectangleSideGaps();
  deps.destroyRectanglePreviewGraphics();
  rectangleState.graphics = null;
  deps.setRectangleEditingState(false);
}

export function cancelRectangleEditingForDeletedWall(wallDocument, deps) {
  if (!rectangleState.placed || !rectangleState.rectangleId) return;
  if (rectangleState.replacingWallIds.has(wallDocument.id)) return;

  const rectangleData = wallDocument.getFlag(deps.MODULE_ID, RECTANGLE_FLAG);
  const sameRectangle = rectangleData?.rectangleId === rectangleState.rectangleId;
  const knownWall = rectangleState.wallIds.includes(wallDocument.id);
  if (!sameRectangle && !knownWall) return;

  deps.clearRectanglePreview();
  if (game.activeTool === RECTANGLE_TOOL) canvas.walls.activate({tool: "select"});
}

export function loadRectangleFromWall(wall, deps) {
  const rectangleData = wall.document.getFlag(deps.MODULE_ID, RECTANGLE_FLAG);
  if (!Array.isArray(rectangleData?.handles) || rectangleData.handles.length !== 2) return;

  deps.deactivateOtherShapeStates(rectangleState);
  rectangleState.active = true;
  deps.clearEditorHistory(rectangleState);
  rectangleState.placed = true;
  rectangleState.initializing = false;
  rectangleState.draggingHandle = null;
  rectangleState.draggingVertex = null;
  rectangleState.hoveredVertex = null;
  rectangleState.rectangleId = rectangleData.rectangleId ?? null;
  rectangleState.wallIds = Array.isArray(rectangleData.wallIds) ? [...rectangleData.wallIds] : [wall.document.id];
  rectangleState.wallTypeTool = deps.getWallTypeToolFromDocument(wall.document) ?? rectangleData.wallTypeTool ?? "walls";
  rectangleState.sideSegments = normalizeRectangleSideSegments(rectangleData.sideSegments);
  rectangleState.sideRatios = normalizeRectangleSideRatios(rectangleData.sideRatios, rectangleState.sideSegments);
  rectangleState.sideEnabled = normalizeRectangleSideEnabled(rectangleData.sideEnabled);
  rectangleState.sideGaps = normalizeRectangleSideGaps(rectangleData.sideGaps, rectangleState.sideSegments);
  rectangleState.handles = rectangleData.handles.map((handle) => ({
    x: Number(handle.x) || 0,
    y: Number(handle.y) || 0
  }));
  rectangleState.wallTypeBySegment = {
    ...deps.cloneWallTypeBySegment(rectangleData.wallTypeBySegment),
    ...deps.getRectangleWallTypeBySegment(rectangleState.wallIds)
  };

  canvas.walls.activate({tool: RECTANGLE_TOOL});
  deps.hideEditSessionWalls(rectangleState.wallIds);
  deps.drawRectanglePreview();
}

export function getExistingRectangleWallIds() {
  return rectangleState.wallIds.filter((id) => canvas.scene.walls.has(id));
}

function normalizeRectangleSideSegments(source={}) {
  return {
    top: clamp(Number(source.top) || DEFAULT_RECTANGLE_SEGMENTS, 1, 64),
    right: clamp(Number(source.right) || DEFAULT_RECTANGLE_SEGMENTS, 1, 64),
    bottom: clamp(Number(source.bottom) || DEFAULT_RECTANGLE_SEGMENTS, 1, 64),
    left: clamp(Number(source.left) || DEFAULT_RECTANGLE_SEGMENTS, 1, 64)
  };
}

function normalizeRectangleSideRatios(source={}, sideSegments=normalizeRectangleSideSegments()) {
  return {
    top: reconcileRectangleSideRatios(source.top, sideSegments.top),
    right: reconcileRectangleSideRatios(source.right, sideSegments.right),
    bottom: reconcileRectangleSideRatios(source.bottom, sideSegments.bottom),
    left: reconcileRectangleSideRatios(source.left, sideSegments.left)
  };
}

function normalizeRectangleSideEnabled(source={}) {
  return cloneRectangleSideEnabled(source);
}

function normalizeRectangleSideGaps(source={}, sideSegments=normalizeRectangleSideSegments()) {
  return {
    top: reconcileRectangleSideGaps(source.top, sideSegments.top),
    right: reconcileRectangleSideGaps(source.right, sideSegments.right),
    bottom: reconcileRectangleSideGaps(source.bottom, sideSegments.bottom),
    left: reconcileRectangleSideGaps(source.left, sideSegments.left)
  };
}
