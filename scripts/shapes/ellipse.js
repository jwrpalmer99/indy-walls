import {
  destroyPreviewGraphics,
  preparePreviewGraphics
} from "../preview-graphics.js";

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
  draggingGapHandle: null,
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
  wallDataBySegment: {},
  segments: DEFAULT_ELLIPSE_SEGMENTS,
  rotation: 0,
  angleGaps: [],
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

function getEllipseVertices() {
  return getEllipsePoints(ellipseState.segments)
    .slice(0, -1)
    .map((point, index) => ({index, point}));
}

function getAllEllipseSegments() {
  const segments = [];
  for (let i = 0; i < ellipseState.segments; i++) {
    const start = i / ellipseState.segments;
    const end = (i + 1) / ellipseState.segments;
    segments.push({
      index: i,
      a: getEllipsePointForAngleFraction(start),
      b: getEllipsePointForAngleFraction(end),
      start,
      end,
      baseIndex: i
    });
  }
  return segments;
}

function getEllipseSegments() {
  getEllipseSegmentGaps();
  return getVisibleEllipseSegments();
}

function getEllipseSegmentGaps() {
  const angleGaps = reconcileEllipseAngleGaps(ellipseState.angleGaps);
  ellipseState.angleGaps = angleGaps;
  const gaps = getEllipseSegmentGapsFromAngleGaps(angleGaps, ellipseState.segments);
  ellipseState.segmentGaps = gaps;
  return gaps;
}

function getVisibleEllipseSegments() {
  const cuts = getEllipseIntervalCuts();
  const segments = [];

  for (let i = 0; i < cuts.length - 1; i += 1) {
    const start = cuts[i];
    const end = cuts[i + 1];
    if ((end - start) < 0.000001) continue;
    const center = (start + end) * 0.5;
    if (ellipseState.angleGaps.some((gap) => isAngleFractionInGap(center, gap))) continue;
    const baseIndex = Math.max(0, Math.min(ellipseState.segments - 1, Math.floor(center * ellipseState.segments)));
    segments.push({
      index: baseIndex,
      a: getEllipsePointForAngleFraction(start),
      b: getEllipsePointForAngleFraction(end),
      start,
      end,
      baseIndex
    });
  }

  return segments;
}

function getEllipseIntervalCuts() {
  const cuts = new Set([0, 1]);
  for (let i = 1; i < ellipseState.segments; i += 1) cuts.add(i / ellipseState.segments);
  for (const gap of ellipseState.angleGaps) {
    addWrappedIntervalBoundaryCuts(cuts, gap.start, gap.end);
  }
  return [...cuts]
    .map((value) => Math.round(normalizeIntervalCut(value) * 1000000) / 1000000)
    .map((value) => value === 0 ? 0 : value)
    .sort((a, b) => a - b);
}

function normalizeIntervalCut(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  if (Math.abs(number - 1) < 0.000001) return 1;
  return normalizeFraction(number);
}

function addWrappedIntervalBoundaryCuts(cuts, start, end) {
  const s = normalizeFraction(start);
  const e = normalizeFraction(end);
  cuts.add(s);
  cuts.add(e);
  if (s > e) {
    cuts.add(0);
    cuts.add(1);
  }
}

export function reconcileEllipseSegmentGaps(source, segmentCount) {
  if (!Array.isArray(source)) return [];
  return [...new Set(source
    .map((index) => Number(index))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < segmentCount))]
    .sort((a, b) => a - b);
}

function remapEllipseSegmentGaps(source, oldSegmentCount, newSegmentCount) {
  const oldCount = Number(oldSegmentCount);
  const newCount = Number(newSegmentCount);
  if (!Number.isInteger(oldCount) || !Number.isInteger(newCount) || oldCount <= 0 || newCount <= 0) {
    return reconcileEllipseSegmentGaps(source, newSegmentCount);
  }
  if (oldCount === newCount) return reconcileEllipseSegmentGaps(source, newCount);

  const oldGaps = reconcileEllipseSegmentGaps(source, oldCount);
  if (!oldGaps.length) return [];

  const next = new Set();
  for (const run of getContiguousEllipseGapRuns(oldGaps, oldCount)) {
    const first = Math.round((run.start / oldCount) * newCount);
    const end = Math.round(((run.start + run.length) / oldCount) * newCount);
    const newLength = Math.max(1, Math.min(newCount, end - first));
    for (let offset = 0; offset < newLength; offset += 1) {
      next.add(modulo(first + offset, newCount));
    }
  }

  return [...next].sort((a, b) => a - b);
}

function getEllipseSegmentGapsFromAngleGaps(angleGaps, segmentCount) {
  const count = Number(segmentCount);
  if (!Number.isInteger(count) || count <= 0) return [];
  const gaps = [];
  for (let index = 0; index < count; index += 1) {
    const center = (index + 0.5) / count;
    if (angleGaps.some((gap) => isAngleFractionInGap(center, gap))) gaps.push(index);
  }
  return gaps;
}

function reconcileEllipseAngleGaps(source) {
  if (!Array.isArray(source)) return [];
  return source
    .map((gap) => {
      const start = normalizeFraction(gap?.start);
      const end = normalizeFraction(gap?.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || almostEqualFractions(start, end)) return null;
      return {start, end};
    })
    .filter(Boolean);
}

function isAngleFractionInGap(value, gap) {
  const v = normalizeFraction(value);
  const start = normalizeFraction(gap.start);
  const end = normalizeFraction(gap.end);
  if (start < end) return v >= start && v < end;
  return v >= start || v < end;
}

function normalizeFraction(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return NaN;
  return ((number % 1) + 1) % 1;
}

function almostEqualFractions(a, b) {
  const diff = Math.abs(normalizeFraction(a) - normalizeFraction(b));
  return Math.min(diff, 1 - diff) < 0.000001;
}

function getContiguousEllipseGapRuns(gaps, segmentCount) {
  if (!gaps.length) return [];
  if (gaps.length === segmentCount) return [{start: 0, length: segmentCount}];

  const gapSet = new Set(gaps);
  const starts = gaps.filter((index) => !gapSet.has(modulo(index - 1, segmentCount)));
  return starts.map((start) => {
    let length = 1;
    while (gapSet.has(modulo(start + length, segmentCount))) length += 1;
    return {start, length};
  });
}

function modulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

export function setEllipseRotationFromVertex(vertex, point) {
  if (!vertex || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
  const {cx, cy, rx, ry} = getEllipseGeometry();
  const pointerAngle = Math.atan2(point.y - cy, point.x - cx);
  const vertexAngle = (Math.PI * 2 * vertex.index) / ellipseState.segments;
  const baseAngle = Math.atan2(Math.sin(vertexAngle) * ry, Math.cos(vertexAngle) * rx);
  ellipseState.rotation = normalizeAngle(pointerAngle - baseAngle);
}

function normalizeAngle(angle) {
  const fullTurn = Math.PI * 2;
  return ((angle % fullTurn) + fullTurn) % fullTurn;
}

export function changeEllipseSegments(delta, deps) {
  if (!deps.isEllipseToolActive()) return;
  const oldSegments = ellipseState.segments;
  const nextSegments = deps.clamp(oldSegments + delta, 4, 96);
  if (nextSegments === oldSegments) return;
  ellipseState.segments = nextSegments;
  ellipseState.segmentGaps = getEllipseSegmentGaps();
  deps.drawEllipsePreview();
}

export function drawEllipsePreview(deps) {
  const layer = canvas?.walls;
  if (!layer) return;

  const graphics = preparePreviewGraphics(ellipseState, layer);
  if (!graphics) return;
  deps.setEllipseEditingState(ellipseState.placed);
  if (!ellipseState.placed) return;

  const style = deps.getPreviewStyle();
  const segments = getEllipseSegments();
  const allSegments = getAllEllipseSegments();
  const gaps = getEllipseSegmentGaps();
  for (const segment of segments) {
    const {a, b} = segment;
    graphics.lineStyle(deps.getScaledRadius(style.wallWidth), deps.getSegmentPreviewColor(ellipseState, segment, style), 0.9);
    graphics.moveTo(a.x, a.y);
    graphics.lineTo(b.x, b.y);
  }
  for (const segment of segments) {
    deps.drawSegmentDoorIcon(graphics, ellipseState, segment, style);
  }

  for (const segment of allSegments) {
    if (!gaps.includes(segment.index)) continue;
    graphics.lineStyle(
      deps.getScaledRadius(Math.max(style.guideWidth, 1)),
      deps.getSegmentPreviewColor(ellipseState, segment, style),
      0.22
    );
    graphics.moveTo(segment.a.x, segment.a.y);
    graphics.lineTo(segment.b.x, segment.b.y);
  }

  const [a, b] = ellipseState.handles;
  graphics.lineStyle(deps.getScaledRadius(style.guideWidth), style.wallColor, 0.45);
  graphics.drawRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));

  for (const vertex of getEllipseVertices()) {
    drawEllipseSplitVertex(graphics, vertex, style, deps);
  }
  deps.drawEndpoint(graphics, a, style);
  deps.drawEndpoint(graphics, b, style);
  deps.drawMoveHandle(graphics, deps.getEditorShapeCenter(ELLIPSE_TOOL), style);
  drawEllipseGapHandles(graphics, style, deps);
}

function drawEllipseGapHandles(graphics, style, deps) {
  const {cx, cy} = getEllipseGeometry();
  const center = {x: cx, y: cy};
  for (let index = 0; index < ellipseState.angleGaps.length; index += 1) {
    const gap = ellipseState.angleGaps[index];
    for (const side of ["start", "end"]) {
      const point = getEllipsePointForAngleFraction(gap[side]);
      const highlighted = ellipseState.draggingGapHandle?.index === index && ellipseState.draggingGapHandle?.side === side;
      graphics.lineStyle(deps.getScaledRadius(style.guideWidth), style.handleColor, highlighted ? 0.75 : 0.42);
      graphics.moveTo(center.x, center.y);
      graphics.lineTo(point.x, point.y);
      graphics.beginFill(highlighted ? style.vertexActiveColor : style.handleColor, 0.96);
      graphics.lineStyle(deps.getScaledRadius(style.outlineWidth), style.outlineColor, 0.9);
      graphics.drawCircle(point.x, point.y, deps.getScaledRadius(style.handleSize));
      graphics.endFill();
    }
  }
}

function getEllipsePointForAngleFraction(fraction) {
  const {cx, cy, rx, ry} = getEllipseGeometry();
  const angle = normalizeFraction(fraction) * Math.PI * 2;
  const rotation = Number(ellipseState.rotation) || 0;
  const cosRotation = Math.cos(rotation);
  const sinRotation = Math.sin(rotation);
  const x = Math.cos(angle) * rx;
  const y = Math.sin(angle) * ry;
  return {
    x: cx + (x * cosRotation) - (y * sinRotation),
    y: cy + (x * sinRotation) + (y * cosRotation)
  };
}

export function getEllipseVertexAt(point, deps) {
  if (!ellipseState.placed) return null;
  const radius = getEllipseVertexHitRadius(deps);
  for (const vertex of getEllipseVertices()) {
    if (Math.hypot(vertex.point.x - point.x, vertex.point.y - point.y) <= radius) {
      return vertex;
    }
  }
  return null;
}

export function getEllipseGapHandleAt(point, deps) {
  if (!ellipseState.placed) return null;
  const style = deps.getPreviewStyle();
  const hitRadius = deps.getScaledRadius(style.handleSize + style.outlineWidth + 8);
  for (let index = 0; index < ellipseState.angleGaps.length; index += 1) {
    const gap = ellipseState.angleGaps[index];
    for (const side of ["start", "end"]) {
      const handlePoint = getEllipsePointForAngleFraction(gap[side]);
      if (Math.hypot(handlePoint.x - point.x, handlePoint.y - point.y) <= hitRadius) return {index, side};
    }
  }
  return null;
}

export function setEllipseGapHandle(handle, point) {
  if (!handle || !ellipseState.angleGaps[handle.index]) return;
  const fraction = getEllipseAngleFractionForPoint(point);
  if (!Number.isFinite(fraction)) return;
  ellipseState.angleGaps[handle.index] = {
    ...ellipseState.angleGaps[handle.index],
    [handle.side]: fraction
  };
  ellipseState.angleGaps = reconcileEllipseAngleGaps(ellipseState.angleGaps);
  ellipseState.segmentGaps = getEllipseSegmentGaps();
}

function getEllipseAngleFractionForPoint(point) {
  const {cx, cy, rx, ry} = getEllipseGeometry();
  if (rx <= 0 || ry <= 0) return NaN;
  const rotation = Number(ellipseState.rotation) || 0;
  const dx = point.x - cx;
  const dy = point.y - cy;
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  const x = ((dx * cos) - (dy * sin)) / rx;
  const y = ((dx * sin) + (dy * cos)) / ry;
  return normalizeFraction(Math.atan2(y, x) / (Math.PI * 2));
}

function getEllipseVertexHitRadius(deps) {
  const style = deps.getPreviewStyle();
  return deps.getSplitVertexHitRadius(style);
}

export function getEllipseSegmentAt(point, deps) {
  if (!ellipseState.placed) return null;
  const style = deps.getPreviewStyle();
  const tolerance = deps.getScaledRadius(Math.max(style.wallWidth + 6, 10));
  let best = null;
  let bestDistance = Infinity;

  for (const segment of getAllEllipseSegments()) {
    if (!deps.isPointNearSegmentBounds(point, segment.a, segment.b, tolerance)) continue;
    const distance = deps.getPointSegmentDistance(point, segment.a, segment.b);
    if (distance <= tolerance && distance < bestDistance) {
      best = segment;
      bestDistance = distance;
    }
  }

  return best;
}

export function editEllipseSegmentWithUndo(index, remove=false, deps) {
  const snapshot = deps.getEditorSnapshot(ellipseState);
  const edited = editEllipseSegment(index, remove, deps);
  if (edited) deps.pushEditorUndoSnapshot(ellipseState, snapshot);
  return edited;
}

function editEllipseSegment(index, remove=false, deps) {
  const gaps = getEllipseSegmentGaps();
  if (remove) {
    if (gaps.includes(index)) return false;
    ellipseState.angleGaps = reconcileEllipseAngleGaps([
      ...ellipseState.angleGaps,
      {start: index / ellipseState.segments, end: (index + 1) / ellipseState.segments}
    ]);
    ellipseState.segmentGaps = getEllipseSegmentGaps();
    deps.drawEllipsePreview();
    return true;
  }

  if (!gaps.includes(index)) return false;
  const center = (index + 0.5) / ellipseState.segments;
  ellipseState.angleGaps = ellipseState.angleGaps.filter((gap) => !isAngleFractionInGap(center, gap));
  ellipseState.segmentGaps = getEllipseSegmentGaps();
  deps.drawEllipsePreview();
  return true;
}

function drawEllipseSplitVertex(graphics, vertex, style, deps) {
  const radius = deps.getScaledRadius(style.splitVertexSize);
  const highlighted = ellipseState.draggingVertex?.index === vertex.index;
  graphics.beginFill(highlighted ? style.vertexActiveColor : style.vertexColor, 0.98);
  graphics.lineStyle(
    deps.getScaledRadius(style.outlineWidth),
    highlighted ? style.outlineColor : style.wallColor,
    0.95
  );
  graphics.drawCircle(vertex.point.x, vertex.point.y, radius);
  graphics.endFill();
}

export async function applyEllipseWalls(deps) {
  if (!deps.isEllipseToolActive() || !ellipseState.placed) return;

  const segments = getEllipseSegments();
  const segmentGaps = getEllipseSegmentGaps();
  const ellipseId = ellipseState.ellipseId ?? foundry.utils.randomID();
  const walls = [];

  for (const segment of segments) {
    const {a, b} = segment;
    const wallData = deps.getSegmentWallData(ellipseState, String(segment.baseIndex ?? segment.index));
    const c = [Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y)];
    if ((c[0] === c[2]) && (c[1] === c[3])) continue;
    walls.push({
      ...wallData,
      c,
      flags: {
        ...(wallData.flags ?? {}),
        [deps.MODULE_ID]: {
          [ELLIPSE_FLAG]: {
            ellipseId,
            index: walls.length,
            segmentIndex: segment.baseIndex ?? segment.index,
            wallIds: [],
            handles: deps.clonePoints(ellipseState.handles),
            segments: ellipseState.segments,
            rotation: ellipseState.rotation,
            segmentGaps,
            angleGaps: reconcileEllipseAngleGaps(ellipseState.angleGaps),
            wallTypeBySegment: deps.cloneWallTypeBySegment(ellipseState.wallTypeBySegment),
            wallDataBySegment: deps.cloneWallDataBySegment(ellipseState.wallDataBySegment),
            wallTypeTool: ellipseState.wallTypeTool
          }
        }
      }
    });
  }

  const oldWallIds = getExistingEllipseWallIds();
  if (!walls.length) {
    if (oldWallIds.length) {
      oldWallIds.forEach((id) => ellipseState.replacingWallIds.add(id));
      try {
        await canvas.scene.deleteEmbeddedDocuments("Wall", oldWallIds);
      } finally {
        oldWallIds.forEach((id) => ellipseState.replacingWallIds.delete(id));
      }
    }
    deps.clearEllipsePreview();
    return;
  }

  const created = await deps.replaceShapeWalls(ellipseState, oldWallIds, walls);
  ui.notifications.info(game.i18n.format("indy-walls.Notifications.EllipseWallsCreated", {
    count: created.length
  }));
  deps.clearEllipsePreview();
}

export function clearEllipsePreview(deps) {
  deps.restoreEditSessionWalls();
  deps.clearEditorHistory(ellipseState);
  ellipseState.placed = false;
  ellipseState.initializing = false;
  ellipseState.initialOrigin = null;
  ellipseState.draggingHandle = null;
  ellipseState.draggingVertex = null;
  ellipseState.draggingGapHandle = null;
  ellipseState.lastSegmentEditAction = 0;
  ellipseState.suppressNextSegmentEditClick = false;
  ellipseState.ellipseId = null;
  ellipseState.wallIds = [];
  ellipseState.wallTypeBySegment = {};
  ellipseState.wallDataBySegment = {};
  ellipseState.rotation = 0;
  ellipseState.angleGaps = [];
  ellipseState.segmentGaps = [];
  destroyPreviewGraphics(ellipseState);
  ellipseState.graphics = null;
  deps.setEllipseEditingState(false);
}

export function cancelEllipseEditingForDeletedWall(wallDocument, deps) {
  if (!ellipseState.placed || !ellipseState.ellipseId) return;
  if (ellipseState.replacingWallIds.has(wallDocument.id)) return;

  const ellipseData = wallDocument.getFlag(deps.MODULE_ID, ELLIPSE_FLAG);
  const sameEllipse = ellipseData?.ellipseId === ellipseState.ellipseId;
  const knownWall = ellipseState.wallIds.includes(wallDocument.id);
  if (!sameEllipse && !knownWall) return;

  deps.clearEllipsePreview();
  if (game.activeTool === ELLIPSE_TOOL) canvas.walls.activate({tool: "select"});
}

export function loadEllipseFromWall(wall, deps) {
  const ellipseData = wall.document.getFlag(deps.MODULE_ID, ELLIPSE_FLAG);
  if (!Array.isArray(ellipseData?.handles) || ellipseData.handles.length !== 2) return;

  deps.deactivateOtherShapeStates(ellipseState);
  ellipseState.active = true;
  deps.clearEditorHistory(ellipseState);
  ellipseState.placed = true;
  ellipseState.initializing = false;
  ellipseState.initialOrigin = null;
  ellipseState.draggingHandle = null;
  ellipseState.draggingVertex = null;
  ellipseState.draggingGapHandle = null;
  ellipseState.lastSegmentEditAction = 0;
  ellipseState.suppressNextSegmentEditClick = false;
  ellipseState.ellipseId = ellipseData.ellipseId ?? null;
  ellipseState.wallIds = Array.isArray(ellipseData.wallIds) ? [...ellipseData.wallIds] : [wall.document.id];
  ellipseState.wallTypeTool = deps.getWallTypeToolFromDocument(wall.document) ?? ellipseData.wallTypeTool ?? "walls";
  ellipseState.segments = deps.clamp(Number(ellipseData.segments) || DEFAULT_ELLIPSE_SEGMENTS, 4, 96);
  ellipseState.rotation = Number(ellipseData.rotation) || 0;
  ellipseState.angleGaps = reconcileEllipseAngleGaps(ellipseData.angleGaps);
  ellipseState.segmentGaps = getEllipseSegmentGaps();
  ellipseState.handles = ellipseData.handles.map((handle) => ({
    x: Number(handle.x) || 0,
    y: Number(handle.y) || 0
  }));
  ellipseState.wallTypeBySegment = {
    ...deps.cloneWallTypeBySegment(ellipseData.wallTypeBySegment),
    ...deps.getShapeWallTypeByIndexedFlag(ellipseState.wallIds, ELLIPSE_FLAG)
  };
  ellipseState.wallDataBySegment = {
    ...deps.cloneWallDataBySegment(ellipseData.wallDataBySegment),
    ...deps.getShapeWallDataByIndexedFlag(ellipseState.wallIds, ELLIPSE_FLAG)
  };

  canvas.walls.activate({tool: ELLIPSE_TOOL});
  deps.hideEditSessionWalls(ellipseState.wallIds);
  deps.drawEllipsePreview();
}

export function getExistingEllipseWallIds() {
  return ellipseState.wallIds.filter((id) => canvas.scene.walls.has(id));
}


