import {getQuadraticBezierPoint} from "../curve-common.js";
import {
  destroyPreviewGraphics,
  preparePreviewGraphics
} from "../preview-graphics.js";

export const CUBIC_TOOL = "indyCubicBezier";
export const CUBIC_FLAG = "cubicBezier";
export const CUBIC_EDIT_BUTTONS_ID = "indy-walls-cubic-edit-buttons";
export const DEFAULT_CUBIC_SEGMENTS = 10;
export const CUBIC_CURVE_ARC = "arc";
export const CUBIC_CURVE_BEZIER = "bezier";

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
  wallDataBySegment: {},
  curveMode: CUBIC_CURVE_BEZIER,
  lastSavedCurveMode: CUBIC_CURVE_BEZIER,
  curveModeMemory: {},
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
  if (cubicState.curveMode === CUBIC_CURVE_ARC) {
    initializeCubicArcControl();
    return;
  }

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

function initializeCubicArcControl() {
  const [start, controlA,, end] = cubicState.handles;
  const point = getDefaultCubicArcControlPoint(start, end);
  controlA.x = point.x;
  controlA.y = point.y;
}

function getDefaultCubicArcControlPoint(start, end, amount=0.28) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!length) return {x: start.x, y: start.y};
  return {
    x: (start.x + end.x) / 2 + (dy / length) * length * amount,
    y: (start.y + end.y) / 2 - (dx / length) * length * amount
  };
}

export function getCubicPoints(segments) {
  const [p0, p1, p2, p3] = cubicState.handles;
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    if (cubicState.curveMode === CUBIC_CURVE_ARC) {
      points.push(getQuadraticBezierPoint(p0, p1, p3, t));
      continue;
    }
    const mt = 1 - t;
    points.push({
      x: (mt ** 3 * p0.x) + (3 * mt ** 2 * t * p1.x) + (3 * mt * t ** 2 * p2.x) + (t ** 3 * p3.x),
      y: (mt ** 3 * p0.y) + (3 * mt ** 2 * t * p1.y) + (3 * mt * t ** 2 * p2.y) + (t ** 3 * p3.y)
    });
  }
  return points;
}

function getAllCubicSegments() {
  const points = getCubicPoints(cubicState.segments);
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push({index: i, a: points[i], b: points[i + 1]});
  }
  return segments;
}

function getCubicSegments() {
  const gaps = getCubicSegmentGaps();
  return getAllCubicSegments().filter((segment) => !gaps.includes(segment.index));
}

function getCubicSegmentGaps() {
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

export function changeCubicSegments(delta, deps) {
  if (!deps.isCubicToolActive()) return;
  cubicState.segments = deps.clamp(cubicState.segments + delta, 2, 64);
  cubicState.segmentGaps = reconcileCubicSegmentGaps(cubicState.segmentGaps, cubicState.segments);
  deps.drawCubicPreview();
}

export function drawCubicPreview(deps) {
  const layer = canvas?.walls;
  if (!layer) return;

  const graphics = preparePreviewGraphics(cubicState, layer);
  if (!graphics) return;
  deps.setCubicEditingState(cubicState.placed);
  if (!cubicState.placed) return;

  const style = deps.getPreviewStyle();
  const points = getCubicPoints(cubicState.segments);
  const segments = getCubicSegments();
  const allSegments = getAllCubicSegments();
  const gaps = getCubicSegmentGaps();
  for (const segment of segments) {
    const {a, b} = segment;
    graphics.lineStyle(deps.getScaledRadius(style.wallWidth), deps.getSegmentPreviewColor(cubicState, segment, style), 0.9);
    graphics.moveTo(a.x, a.y);
    graphics.lineTo(b.x, b.y);
  }
  for (const segment of segments) {
    deps.drawSegmentDoorIcon(graphics, cubicState, segment, style);
  }

  for (const segment of allSegments) {
    if (!gaps.includes(segment.index)) continue;
    graphics.lineStyle(
      deps.getScaledRadius(Math.max(style.guideWidth, 1)),
      deps.getSegmentPreviewColor(cubicState, segment, style),
      0.22
    );
    graphics.moveTo(segment.a.x, segment.a.y);
    graphics.lineTo(segment.b.x, segment.b.y);
  }

  const [start, controlA, controlB, end] = cubicState.handles;
  graphics.lineStyle(deps.getScaledRadius(style.guideWidth), style.wallColor, 0.65);
  graphics.moveTo(start.x, start.y);
  graphics.lineTo(controlA.x, controlA.y);
  if (cubicState.curveMode === CUBIC_CURVE_BEZIER) {
    graphics.moveTo(end.x, end.y);
    graphics.lineTo(controlB.x, controlB.y);
  } else {
    graphics.lineTo(end.x, end.y);
  }

  for (const point of points) {
    deps.drawPreviewVertex(graphics, point, style);
  }
  deps.drawEndpoint(graphics, start, style);
  deps.drawEndpoint(graphics, end, style);
  deps.drawBezierHandle(graphics, controlA, style);
  if (cubicState.curveMode === CUBIC_CURVE_BEZIER) deps.drawBezierHandle(graphics, controlB, style);
  deps.drawMoveHandle(graphics, deps.getEditorShapeCenter(CUBIC_TOOL), style);
}

export function getCubicSegmentAt(point, deps) {
  if (!cubicState.placed) return null;
  const style = deps.getPreviewStyle();
  const tolerance = deps.getScaledRadius(Math.max(style.wallWidth + 6, 10));
  let best = null;
  let bestDistance = Infinity;

  for (const segment of getAllCubicSegments()) {
    if (!deps.isPointNearSegmentBounds(point, segment.a, segment.b, tolerance)) continue;
    const distance = deps.getPointSegmentDistance(point, segment.a, segment.b);
    if (distance <= tolerance && distance < bestDistance) {
      best = segment;
      bestDistance = distance;
    }
  }

  return best;
}

export function editCubicSegmentWithUndo(index, remove=false, deps) {
  const snapshot = deps.getEditorSnapshot(cubicState);
  const edited = editCubicSegment(index, remove, deps);
  if (edited) deps.pushEditorUndoSnapshot(cubicState, snapshot);
  return edited;
}

function editCubicSegment(index, remove=false, deps) {
  const gaps = getCubicSegmentGaps();
  if (remove) {
    if (gaps.includes(index)) return false;
    cubicState.segmentGaps = [...gaps, index].sort((a, b) => a - b);
    deps.drawCubicPreview();
    return true;
  }

  if (!gaps.includes(index)) return false;
  cubicState.segmentGaps = gaps.filter((gap) => gap !== index);
  deps.drawCubicPreview();
  return true;
}

export function toggleCubicCurveModeWithUndo(deps) {
  const snapshot = deps.getEditorSnapshot(cubicState);
  const edited = toggleCubicCurveMode(deps);
  if (edited) deps.pushEditorUndoSnapshot(cubicState, snapshot);
  return edited;
}

function toggleCubicCurveMode(deps) {
  if (!cubicState.placed) return false;
  rememberCurrentCubicCurveModeState();
  if (cubicState.curveMode === CUBIC_CURVE_BEZIER) {
    restoreCubicCurveModeState(CUBIC_CURVE_ARC) || convertCubicBezierToArc();
  } else {
    restoreCubicCurveModeState(CUBIC_CURVE_BEZIER) || convertCubicArcToBezier();
  }
  cubicState.segmentGaps = reconcileCubicSegmentGaps(cubicState.segmentGaps, cubicState.segments);
  deps.drawCubicPreview();
  return true;
}

function rememberCurrentCubicCurveModeState() {
  cubicState.curveModeMemory = {
    ...(cubicState.curveModeMemory ?? {}),
    [normalizeCubicCurveMode(cubicState.curveMode)]: {
      handles: cloneCubicHandles(),
      segments: cubicState.segments,
      segmentGaps: [...cubicState.segmentGaps]
    }
  };
}

function restoreCubicCurveModeState(mode) {
  const memory = cubicState.curveModeMemory?.[normalizeCubicCurveMode(mode)];
  if (!memory) return false;
  cubicState.curveMode = normalizeCubicCurveMode(mode);
  cubicState.handles = cloneCubicHandles(memory.handles);
  cubicState.segments = Number(memory.segments) || DEFAULT_CUBIC_SEGMENTS;
  cubicState.segmentGaps = reconcileCubicSegmentGaps(memory.segmentGaps, cubicState.segments);
  return true;
}

export function getCubicInitialCurveMode() {
  return normalizeCubicCurveMode(cubicState.lastSavedCurveMode);
}

function rememberSavedCubicCurveMode() {
  cubicState.lastSavedCurveMode = normalizeCubicCurveMode(cubicState.curveMode);
}

function convertCubicBezierToArc() {
  const [start, controlA, controlB, end] = cubicState.handles;
  cubicState.curveMode = CUBIC_CURVE_ARC;
  cubicState.handles[1] = {
    x: (controlA.x + controlB.x) / 2,
    y: (controlA.y + controlB.y) / 2
  };
  cubicState.handles[2] = {x: cubicState.handles[1].x, y: cubicState.handles[1].y};
  if (Math.hypot(cubicState.handles[1].x - start.x, cubicState.handles[1].y - start.y) < 1
    || Math.hypot(cubicState.handles[1].x - end.x, cubicState.handles[1].y - end.y) < 1) {
    initializeCubicArcControl();
  }
}

function convertCubicArcToBezier() {
  const [start, control,, end] = cubicState.handles;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const mid = {x: (start.x + end.x) / 2, y: (start.y + end.y) / 2};
  const offset = {x: (control.x - mid.x) * 0.8, y: (control.y - mid.y) * 0.8};
  cubicState.curveMode = CUBIC_CURVE_BEZIER;
  cubicState.handles[1] = {
    x: start.x + (dx * 0.35) + offset.x,
    y: start.y + (dy * 0.35) + offset.y
  };
  cubicState.handles[2] = {
    x: end.x - (dx * 0.35) + offset.x,
    y: end.y - (dy * 0.35) + offset.y
  };
}

export function getCubicEditableHandleIndexes() {
  return cubicState.curveMode === CUBIC_CURVE_ARC ? [0, 1, 3] : [0, 1, 2, 3];
}

export function normalizeCubicCurveMode(mode) {
  return mode === CUBIC_CURVE_ARC ? CUBIC_CURVE_ARC : CUBIC_CURVE_BEZIER;
}

export function translateCubicCurveModeMemory(dx=0, dy=0) {
  cubicState.curveModeMemory = cloneCubicCurveModeMemory(cubicState.curveModeMemory);
  for (const value of Object.values(cubicState.curveModeMemory)) {
    value.handles = cloneCubicHandles(value.handles).map((handle) => ({
      x: handle.x + dx,
      y: handle.y + dy
    }));
  }
}

export async function applyCubicWalls(deps) {
  if (!deps.isCubicToolActive() || !cubicState.placed) return;

  rememberSavedCubicCurveMode();
  const segments = getCubicSegments();
  const segmentGaps = getCubicSegmentGaps();
  const curveId = cubicState.curveId ?? foundry.utils.randomID();
  const walls = [];

  for (const segment of segments) {
    const {a, b} = segment;
    const wallData = deps.getSegmentWallData(cubicState, deps.getSegmentKey(segment));
    const c = [Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y)];
    if ((c[0] === c[2]) && (c[1] === c[3])) continue;
    walls.push({
      ...wallData,
      c,
      flags: {
        ...(wallData.flags ?? {}),
        [deps.MODULE_ID]: {
          [CUBIC_FLAG]: {
            curveId,
            index: segment.index,
            wallIds: [],
            handles: cloneHandles(deps),
            curveMode: cubicState.curveMode,
            segments: cubicState.segments,
            segmentGaps,
            wallTypeBySegment: deps.cloneWallTypeBySegment(cubicState.wallTypeBySegment),
            wallDataBySegment: deps.cloneWallDataBySegment(cubicState.wallDataBySegment),
            wallTypeTool: cubicState.wallTypeTool
          }
        }
      }
    });
  }

  const oldWallIds = getExistingCurveWallIds();
  if (!walls.length) {
    if (oldWallIds.length) {
      oldWallIds.forEach((id) => cubicState.replacingWallIds.add(id));
      try {
        await canvas.scene.deleteEmbeddedDocuments("Wall", oldWallIds);
      } finally {
        oldWallIds.forEach((id) => cubicState.replacingWallIds.delete(id));
      }
    }
    deps.clearCubicPreview();
    return;
  }

  const created = await deps.replaceShapeWalls(cubicState, oldWallIds, walls);
  ui.notifications.info(game.i18n.format("indy-walls.Notifications.CubicWallsCreated", {
    count: created.length
  }));
  deps.clearCubicPreview();
}

export function clearCubicPreview(deps) {
  deps.restoreEditSessionWalls();
  deps.clearEditorHistory(cubicState);
  cubicState.placed = false;
  cubicState.initializing = false;
  cubicState.draggingHandle = null;
  cubicState.lastSegmentEditAction = 0;
  cubicState.suppressNextSegmentEditClick = false;
  cubicState.curveId = null;
  cubicState.wallIds = [];
  cubicState.wallTypeBySegment = {};
  cubicState.wallDataBySegment = {};
  cubicState.curveMode = getCubicInitialCurveMode();
  cubicState.curveModeMemory = {};
  cubicState.segmentGaps = [];
  destroyPreviewGraphics(cubicState);
  cubicState.graphics = null;
  deps.setCubicEditingState(false);
}

export function cancelCubicEditingForDeletedWall(wallDocument, deps) {
  if (!cubicState.placed || !cubicState.curveId) return;
  if (cubicState.replacingWallIds.has(wallDocument.id)) return;

  const cubicData = wallDocument.getFlag(deps.MODULE_ID, CUBIC_FLAG);
  const sameCurve = cubicData?.curveId === cubicState.curveId;
  const knownWall = cubicState.wallIds.includes(wallDocument.id);
  if (!sameCurve && !knownWall) return;

  deps.clearCubicPreview();
  if (game.activeTool === CUBIC_TOOL) canvas.walls.activate({tool: "select"});
}

export function loadCubicCurveFromWall(wall, deps) {
  const cubicData = wall.document.getFlag(deps.MODULE_ID, CUBIC_FLAG);
  if (!Array.isArray(cubicData?.handles) || cubicData.handles.length !== 4) return;

  deps.deactivateOtherShapeStates(cubicState);
  cubicState.active = true;
  deps.clearEditorHistory(cubicState);
  cubicState.placed = true;
  cubicState.initializing = false;
  cubicState.draggingHandle = null;
  cubicState.lastSegmentEditAction = 0;
  cubicState.suppressNextSegmentEditClick = false;
  cubicState.curveId = cubicData.curveId ?? null;
  cubicState.wallIds = Array.isArray(cubicData.wallIds) ? [...cubicData.wallIds] : [wall.document.id];
  cubicState.wallTypeTool = deps.getWallTypeToolFromDocument(wall.document) ?? cubicData.wallTypeTool ?? "walls";
  cubicState.curveMode = normalizeCubicCurveMode(cubicData.curveMode);
  cubicState.curveModeMemory = {};
  cubicState.segments = deps.clamp(Number(cubicData.segments) || DEFAULT_CUBIC_SEGMENTS, 2, 64);
  cubicState.segmentGaps = reconcileCubicSegmentGaps(cubicData.segmentGaps, cubicState.segments);
  cubicState.handles = cubicData.handles.map((handle) => ({
    x: Number(handle.x) || 0,
    y: Number(handle.y) || 0
  }));
  cubicState.wallTypeBySegment = {
    ...deps.cloneWallTypeBySegment(cubicData.wallTypeBySegment),
    ...deps.getShapeWallTypeByIndexedFlag(cubicState.wallIds, CUBIC_FLAG)
  };
  cubicState.wallDataBySegment = {
    ...deps.cloneWallDataBySegment(cubicData.wallDataBySegment),
    ...deps.getShapeWallDataByIndexedFlag(cubicState.wallIds, CUBIC_FLAG)
  };

  canvas.walls.activate({tool: CUBIC_TOOL});
  deps.hideEditSessionWalls(cubicState.wallIds);
  deps.drawCubicPreview();
}

function cloneHandles(deps) {
  return deps.clonePoints(cubicState.handles);
}

export function cloneCubicCurveModeMemory(source={}) {
  const result = {};
  for (const [mode, value] of Object.entries(source ?? {})) {
    const normalizedMode = normalizeCubicCurveMode(mode);
    result[normalizedMode] = {
      handles: cloneCubicHandles(value?.handles),
      segments: Number(value?.segments) || DEFAULT_CUBIC_SEGMENTS,
      segmentGaps: reconcileCubicSegmentGaps(value?.segmentGaps, Number(value?.segments) || DEFAULT_CUBIC_SEGMENTS)
    };
  }
  return result;
}

function cloneCubicHandles(source=cubicState.handles) {
  const handles = Array.isArray(source) ? source : cubicState.handles;
  return handles.map((handle) => ({
    x: Number(handle?.x) || 0,
    y: Number(handle?.y) || 0
  }));
}

export function getExistingCurveWallIds() {
  return cubicState.wallIds.filter((id) => canvas.scene.walls.has(id));
}


