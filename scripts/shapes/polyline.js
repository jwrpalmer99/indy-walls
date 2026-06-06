import {
  getCubicBezierPoint,
  getQuadraticBezierPoint
} from "../curve-common.js";
import {
  destroyPreviewGraphics,
  preparePreviewGraphics
} from "../preview-graphics.js";

export const POLYLINE_TOOL = "indyPolylineWall";
export const POLYLINE_FLAG = "polyline";
export const POLYLINE_EDIT_BUTTONS_ID = "indy-walls-polyline-edit-buttons";
export const DEFAULT_POLYLINE_CURVE_SEGMENTS = 10;
export const POLYLINE_SEGMENT_LINE = "line";
export const POLYLINE_SEGMENT_ARC = "arc";
export const POLYLINE_SEGMENT_BEZIER = "bezier";

export const polylineState = {
  active: false,
  placed: false,
  drawing: false,
  closed: false,
  draggingVertex: null,
  draggingCurveHandle: null,
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
  segmentCurves: {},
  curveSegments: DEFAULT_POLYLINE_CURVE_SEGMENTS,
  curveSegmentsBySegment: {},
  segmentModeMemory: {},
  graphics: null,
  previewPoint: null,
  points: []
};

export function getPolylineSegmentCount() {
  if (polylineState.closed && polylineState.points.length > 2) return polylineState.points.length;
  return Math.max(polylineState.points.length - 1, 0);
}

function getAllPolylineSegments() {
  const segments = [];
  for (const segment of getPolylineBaseSegments()) {
    segments.push(...getPolylineWallSegmentsForBaseSegment(segment));
  }
  return segments;
}

function getPolylineBaseSegments() {
  const segments = [];
  for (let i = 0; i < polylineState.points.length - 1; i++) {
    segments.push({index: i, a: polylineState.points[i], b: polylineState.points[i + 1]});
  }
  if (polylineState.closed && polylineState.points.length > 2) {
    segments.push({
      index: polylineState.points.length - 1,
      a: polylineState.points.at(-1),
      b: polylineState.points[0]
    });
  }
  return segments;
}

function getPolylineSegments() {
  const gaps = getPolylineSegmentGaps();
  return getAllPolylineSegments().filter((segment) => !isPolylineSegmentHidden(segment, gaps));
}

function getPolylineSegmentGaps() {
  const gaps = reconcilePolylineSegmentGaps(polylineState.segmentGaps, getPolylineSegmentCount());
  polylineState.segmentGaps = gaps;
  return gaps;
}

export function reconcilePolylineSegmentGaps(source, segmentCount) {
  if (!Array.isArray(source)) return [];
  return [...new Set(source
    .map((gap) => normalizePolylineGapKey(gap, segmentCount))
    .filter((gap) => gap !== null))]
    .sort(comparePolylineGapKeys);
}

function normalizePolylineGapKey(gap, segmentCount=Infinity) {
  const text = String(gap);
  const subsegmentMatch = text.match(/^(\d+):(\d+)$/);
  if (subsegmentMatch) {
    const index = Number(subsegmentMatch[1]);
    const curveIndex = Number(subsegmentMatch[2]);
    if (!Number.isInteger(index) || !Number.isInteger(curveIndex) || index < 0 || curveIndex < 0 || index >= segmentCount) return null;
    return `${index}:${curveIndex}`;
  }

  const index = Number(gap);
  if (!Number.isInteger(index) || index < 0 || index >= segmentCount) return null;
  return String(index);
}

function comparePolylineGapKeys(a, b) {
  const parsedA = parsePolylineGapKey(a);
  const parsedB = parsePolylineGapKey(b);
  if (parsedA.index !== parsedB.index) return parsedA.index - parsedB.index;
  return parsedA.curveIndex - parsedB.curveIndex;
}

function parsePolylineGapKey(gap) {
  const [index, curveIndex] = String(gap).split(":").map((value) => Number(value));
  return {
    index: Number.isInteger(index) ? index : -1,
    curveIndex: Number.isInteger(curveIndex) ? curveIndex : -1
  };
}

function formatPolylineGapKey(index, curveIndex=-1) {
  return curveIndex >= 0 ? `${index}:${curveIndex}` : String(index);
}

function getPolylineSegmentGapKey(segment) {
  const index = Number(segment?.sourceIndex ?? segment?.index);
  if (!Number.isInteger(index)) return null;
  const curveIndex = Number(segment?.curveIndex);
  const curveSegments = Number(segment?.curveSegments);
  if (curveSegments > 1 && Number.isInteger(curveIndex) && curveIndex >= 0) return `${index}:${curveIndex}`;
  return String(index);
}

function isPolylineSegmentHidden(segment, gaps=getPolylineSegmentGaps()) {
  const index = Number(segment?.sourceIndex ?? segment?.index);
  if (!Number.isInteger(index)) return false;
  return gaps.includes(String(index)) || gaps.includes(getPolylineSegmentGapKey(segment));
}

function getPolylineSegmentCurve(index) {
  const curves = reconcilePolylineSegmentCurves(polylineState.segmentCurves, getPolylineSegmentCount());
  polylineState.segmentCurves = curves;
  return curves[String(index)] ?? null;
}

export function reconcilePolylineSegmentCurves(source={}, segmentCount=getPolylineSegmentCount()) {
  const result = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= segmentCount) continue;
    const curve = normalizePolylineSegmentCurve(value);
    if (curve) result[String(index)] = curve;
  }
  return result;
}

function normalizePolylineSegmentCurve(value) {
  const mode = value?.mode;
  if (mode !== POLYLINE_SEGMENT_ARC && mode !== POLYLINE_SEGMENT_BEZIER) return null;
  const handles = Array.isArray(value.handles) ? value.handles : [];
  const count = mode === POLYLINE_SEGMENT_ARC ? 1 : 2;
  if (handles.length < count) return null;
  const normalized = handles.slice(0, count).map((handle) => ({
    x: Number(handle?.x) || 0,
    y: Number(handle?.y) || 0
  }));
  return {mode, handles: normalized};
}

export function clonePolylineSegmentCurves(source={}) {
  return reconcilePolylineSegmentCurves(source, Infinity);
}

export function reconcilePolylineCurveSegmentsBySegment(source={}, segmentCount=getPolylineSegmentCount(), fallback=polylineState.curveSegments, deps={}) {
  const result = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= segmentCount) continue;
    const count = clampPolylineCurveSegmentCount(Number(value) || fallback, deps);
    result[String(index)] = count;
  }
  return result;
}

export function clonePolylineCurveSegmentsBySegment(source={}) {
  return reconcilePolylineCurveSegmentsBySegment(source, Infinity);
}

export function changePolylineCurveSegments(delta, deps, point=null) {
  if (!deps.isPolylineToolActive() || !hasPolylineCurvedSegments()) return;

  const segment = point ? getPolylineSegmentAt(point, deps) : null;
  const segmentIndex = Number(segment?.sourceIndex ?? segment?.index);
  const curve = Number.isInteger(segmentIndex) ? getPolylineSegmentCurve(segmentIndex) : null;
  if (curve) {
    const key = String(segmentIndex);
    const current = getPolylineSegmentSubdivisionCount(segmentIndex, deps);
    polylineState.curveSegmentsBySegment = {
      ...reconcilePolylineCurveSegmentsBySegment(polylineState.curveSegmentsBySegment, getPolylineSegmentCount(), polylineState.curveSegments, deps),
      [key]: deps.clamp(current + delta, 2, 64)
    };
  } else {
    polylineState.curveSegments = deps.clamp(polylineState.curveSegments + delta, 2, 64);
    polylineState.curveSegmentsBySegment = reconcilePolylineCurveSegmentsBySegment(
      polylineState.curveSegmentsBySegment,
      getPolylineSegmentCount(),
      polylineState.curveSegments,
      deps
    );
  }
  deps.drawPolylinePreview();
}

function hasPolylineCurvedSegments() {
  return Object.keys(reconcilePolylineSegmentCurves(polylineState.segmentCurves, getPolylineSegmentCount())).length > 0;
}

function getPolylineWallSegmentsForBaseSegment(segment) {
  const curve = getPolylineSegmentCurve(segment.index);
  if (!curve) return [{...segment, sourceIndex: segment.index, curveIndex: 0, curveSegments: 1}];

  const points = getPolylineSegmentPoints(segment, curve, getPolylineSegmentSubdivisionCount(segment.index));
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push({
      index: segment.index,
      sourceIndex: segment.index,
      curveIndex: i,
      curveSegments: points.length - 1,
      a: points[i],
      b: points[i + 1]
    });
  }
  return segments;
}

function getPolylineSegmentPoints(segment, curve=getPolylineSegmentCurve(segment.index), subdivisions=polylineState.curveSegments) {
  const count = Math.max(Number(subdivisions) || DEFAULT_POLYLINE_CURVE_SEGMENTS, 1);
  if (!curve) return [segment.a, segment.b];

  const points = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    points.push(curve.mode === POLYLINE_SEGMENT_BEZIER
      ? getCubicBezierPoint(segment.a, curve.handles[0], curve.handles[1], segment.b, t)
      : getQuadraticBezierPoint(segment.a, curve.handles[0], segment.b, t));
  }
  return points;
}

function getPolylineSegmentSubdivisionCount(index, deps={}) {
  const key = String(index);
  const count = polylineState.curveSegmentsBySegment?.[key] ?? polylineState.curveSegments;
  return clampPolylineCurveSegmentCount(Number(count) || polylineState.curveSegments || DEFAULT_POLYLINE_CURVE_SEGMENTS, deps);
}

function clampPolylineCurveSegmentCount(value, deps={}) {
  const clampFn = deps.clamp ?? ((number, min, max) => Math.min(Math.max(number, min), max));
  return clampFn(Number(value) || DEFAULT_POLYLINE_CURVE_SEGMENTS, 2, 64);
}

function shiftPolylineGapsForInsert(source, splitIndex) {
  return [...new Set((source ?? []).map((gap) => {
    const {index, curveIndex} = parsePolylineGapKey(gap);
    if (!Number.isInteger(index) || index < 0 || index === splitIndex) return null;
    return formatPolylineGapKey(index > splitIndex ? index + 1 : index, curveIndex);
  }).filter((gap) => gap !== null))]
    .sort(comparePolylineGapKeys);
}

function shiftPolylineCurvesForInsert(source={}, splitIndex) {
  const result = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    const index = Number(key);
    if (!Number.isInteger(index) || index === splitIndex) continue;
    result[String(index > splitIndex ? index + 1 : index)] = clonePolylineCurve(value);
  }
  return result;
}

function shiftPolylineCurveSegmentsForInsert(source={}, splitIndex) {
  const result = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    const index = Number(key);
    if (!Number.isInteger(index) || index === splitIndex) continue;
    result[String(index > splitIndex ? index + 1 : index)] = value;
  }
  return result;
}

function shiftPolylineSegmentModeMemoryForInsert(source={}, splitIndex) {
  const result = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    const index = Number(key);
    if (!Number.isInteger(index) || index === splitIndex) continue;
    result[String(index > splitIndex ? index + 1 : index)] = clonePolylineSegmentModeMemoryEntry(value);
  }
  return result;
}

function shiftPolylineGapsForRemove(source, vertexIndex, pointCountBefore, closed=false) {
  if (closed) return shiftClosedPolylineGapsForRemove(source, vertexIndex, pointCountBefore);

  const result = new Set();
  const segmentCountBefore = Math.max(pointCountBefore - 1, 0);
  const segmentCountAfter = Math.max(pointCountBefore - 2, 0);
  for (const gap of source ?? []) {
    const {index, curveIndex} = parsePolylineGapKey(gap);
    if (!Number.isInteger(index) || index < 0) continue;
    const keyFor = (nextIndex) => {
      if (nextIndex < 0 || nextIndex >= segmentCountAfter) return;
      result.add(formatPolylineGapKey(nextIndex, curveIndex));
    };
    const baseKeyFor = (nextIndex) => {
      if (nextIndex < 0 || nextIndex >= segmentCountAfter) return;
      result.add(formatPolylineGapKey(nextIndex));
    };

    if (vertexIndex === 0) {
      if (index > 0) keyFor(index - 1);
    } else if (vertexIndex === pointCountBefore - 1) {
      if (index < segmentCountBefore - 1) keyFor(index);
    } else if (index === vertexIndex || index === vertexIndex - 1) {
      if (curveIndex < 0) baseKeyFor(vertexIndex - 1);
    } else if (index > vertexIndex) {
      keyFor(index - 1);
    } else {
      keyFor(index);
    }
  }
  return [...result]
    .filter((gap) => normalizePolylineGapKey(gap, segmentCountAfter) !== null)
    .sort(comparePolylineGapKeys);
}

function shiftPolylineCurvesForRemove(source={}, vertexIndex, pointCountBefore, closed=false) {
  if (closed) return shiftClosedPolylineCurvesForRemove(source, vertexIndex, pointCountBefore);

  const result = {};
  const segmentCountBefore = Math.max(pointCountBefore - 1, 0);
  const segmentCountAfter = Math.max(pointCountBefore - 2, 0);
  for (const [key, value] of Object.entries(source ?? {})) {
    const index = Number(key);
    if (!Number.isInteger(index)) continue;
    if (vertexIndex === 0) {
      if (index > 0) result[String(index - 1)] = clonePolylineCurve(value);
    } else if (vertexIndex === pointCountBefore - 1) {
      if (index < segmentCountBefore - 1) result[String(index)] = clonePolylineCurve(value);
    } else if (index === vertexIndex || index === vertexIndex - 1) {
      continue;
    } else {
      result[String(index > vertexIndex ? index - 1 : index)] = clonePolylineCurve(value);
    }
  }
  return Object.fromEntries(Object.entries(result)
    .filter(([key]) => {
      const index = Number(key);
      return Number.isInteger(index) && index >= 0 && index < segmentCountAfter;
    }));
}

function shiftPolylineCurveSegmentsForRemove(source={}, vertexIndex, pointCountBefore, closed=false) {
  if (closed) return shiftClosedPolylineCurveSegmentsForRemove(source, vertexIndex, pointCountBefore);

  const result = {};
  const segmentCountBefore = Math.max(pointCountBefore - 1, 0);
  const segmentCountAfter = Math.max(pointCountBefore - 2, 0);
  for (const [key, value] of Object.entries(source ?? {})) {
    const index = Number(key);
    if (!Number.isInteger(index)) continue;
    if (vertexIndex === 0) {
      if (index > 0) result[String(index - 1)] = value;
    } else if (vertexIndex === pointCountBefore - 1) {
      if (index < segmentCountBefore - 1) result[String(index)] = value;
    } else if (index === vertexIndex || index === vertexIndex - 1) {
      result[String(vertexIndex - 1)] ??= value;
    } else if (index > vertexIndex) {
      result[String(index - 1)] = value;
    } else {
      result[String(index)] = value;
    }
  }
  return Object.fromEntries(Object.entries(result).filter(([key]) => {
    const index = Number(key);
    return Number.isInteger(index) && index >= 0 && index < segmentCountAfter;
  }));
}

function shiftPolylineSegmentModeMemoryForRemove(source={}, vertexIndex, pointCountBefore, closed=false) {
  if (closed) return shiftClosedPolylineSegmentModeMemoryForRemove(source, vertexIndex, pointCountBefore);

  const result = {};
  const segmentCountBefore = Math.max(pointCountBefore - 1, 0);
  const segmentCountAfter = Math.max(pointCountBefore - 2, 0);
  for (const [key, value] of Object.entries(source ?? {})) {
    const index = Number(key);
    if (!Number.isInteger(index)) continue;
    if (vertexIndex === 0) {
      if (index > 0) result[String(index - 1)] = clonePolylineSegmentModeMemoryEntry(value);
    } else if (vertexIndex === pointCountBefore - 1) {
      if (index < segmentCountBefore - 1) result[String(index)] = clonePolylineSegmentModeMemoryEntry(value);
    } else if (index === vertexIndex || index === vertexIndex - 1) {
      continue;
    } else {
      result[String(index > vertexIndex ? index - 1 : index)] = clonePolylineSegmentModeMemoryEntry(value);
    }
  }
  return Object.fromEntries(Object.entries(result).filter(([key]) => {
    const index = Number(key);
    return Number.isInteger(index) && index >= 0 && index < segmentCountAfter;
  }));
}

function shiftClosedPolylineCurvesForRemove(source={}, vertexIndex, pointCountBefore) {
  const result = {};
  const segmentCountAfter = Math.max(pointCountBefore - 1, 0);
  const previousSegment = vertexIndex === 0 ? pointCountBefore - 1 : vertexIndex - 1;
  const nextSegment = vertexIndex;

  for (const [key, value] of Object.entries(source ?? {})) {
    const index = Number(key);
    if (!Number.isInteger(index)) continue;
    if (index === previousSegment || index === nextSegment) continue;
    result[String(index > vertexIndex ? index - 1 : index)] = clonePolylineCurve(value);
  }
  return Object.fromEntries(Object.entries(result)
    .filter(([key]) => {
      const index = Number(key);
      return Number.isInteger(index) && index >= 0 && index < segmentCountAfter;
    }));
}

function shiftClosedPolylineCurveSegmentsForRemove(source={}, vertexIndex, pointCountBefore) {
  const result = {};
  const segmentCountAfter = Math.max(pointCountBefore - 1, 0);
  const previousSegment = vertexIndex === 0 ? pointCountBefore - 1 : vertexIndex - 1;
  const nextSegment = vertexIndex;
  const mergedSegment = vertexIndex === 0 ? segmentCountAfter - 1 : vertexIndex - 1;
  const mergedCount = source?.[String(previousSegment)] ?? source?.[String(nextSegment)];

  for (const [key, value] of Object.entries(source ?? {})) {
    const index = Number(key);
    if (!Number.isInteger(index)) continue;
    if (index === previousSegment || index === nextSegment) continue;
    result[String(index > vertexIndex ? index - 1 : index)] = value;
  }
  if (mergedCount) result[String(mergedSegment)] = mergedCount;
  return Object.fromEntries(Object.entries(result).filter(([key]) => {
    const index = Number(key);
    return Number.isInteger(index) && index >= 0 && index < segmentCountAfter;
  }));
}

function shiftClosedPolylineSegmentModeMemoryForRemove(source={}, vertexIndex, pointCountBefore) {
  const result = {};
  const segmentCountAfter = Math.max(pointCountBefore - 1, 0);
  const previousSegment = vertexIndex === 0 ? pointCountBefore - 1 : vertexIndex - 1;
  const nextSegment = vertexIndex;

  for (const [key, value] of Object.entries(source ?? {})) {
    const index = Number(key);
    if (!Number.isInteger(index)) continue;
    if (index === previousSegment || index === nextSegment) continue;
    result[String(index > vertexIndex ? index - 1 : index)] = clonePolylineSegmentModeMemoryEntry(value);
  }
  return Object.fromEntries(Object.entries(result).filter(([key]) => {
    const index = Number(key);
    return Number.isInteger(index) && index >= 0 && index < segmentCountAfter;
  }));
}

function clonePolylineCurve(curve) {
  const normalized = normalizePolylineSegmentCurve(curve);
  return normalized ? {mode: normalized.mode, handles: normalized.handles.map((point) => ({x: point.x, y: point.y}))} : null;
}

function shiftClosedPolylineGapsForRemove(source, vertexIndex, pointCountBefore) {
  const result = new Set();
  const segmentCountAfter = Math.max(pointCountBefore - 1, 0);
  const previousSegment = vertexIndex === 0 ? pointCountBefore - 1 : vertexIndex - 1;
  const nextSegment = vertexIndex;
  const mergedSegment = vertexIndex === 0 ? segmentCountAfter - 1 : vertexIndex - 1;

  for (const gap of source ?? []) {
    const {index, curveIndex} = parsePolylineGapKey(gap);
    if (!Number.isInteger(index) || index < 0) continue;
    if (index === previousSegment || index === nextSegment) {
      if (curveIndex < 0) result.add(formatPolylineGapKey(mergedSegment));
    } else if (index > vertexIndex) {
      result.add(formatPolylineGapKey(index - 1, curveIndex));
    } else {
      result.add(formatPolylineGapKey(index, curveIndex));
    }
  }
  return [...result]
    .filter((gap) => normalizePolylineGapKey(gap, segmentCountAfter) !== null)
    .sort(comparePolylineGapKeys);
}

function shiftPolylineWallTypesForInsert(source={}, splitIndex) {
  const result = {};
  const splitKey = String(splitIndex);
  const splitType = source?.[splitKey];
  for (const [key, value] of Object.entries(source ?? {})) {
    const index = Number(key);
    if (!Number.isInteger(index)) continue;
    result[String(index > splitIndex ? index + 1 : index)] = value;
  }
  if (splitType) result[String(splitIndex + 1)] = splitType;
  return result;
}

function shiftPolylineWallTypesForRemove(source={}, vertexIndex, pointCountBefore, closed=false) {
  if (closed) return shiftClosedPolylineWallTypesForRemove(source, vertexIndex, pointCountBefore);

  const result = {};
  const segmentCountBefore = Math.max(pointCountBefore - 1, 0);
  const segmentCountAfter = Math.max(pointCountBefore - 2, 0);
  const previousType = source?.[String(vertexIndex - 1)];
  const nextType = source?.[String(vertexIndex)];
  for (const [key, value] of Object.entries(source ?? {})) {
    const index = Number(key);
    if (!Number.isInteger(index)) continue;
    if (vertexIndex === 0) {
      if (index > 0) result[String(index - 1)] = value;
    } else if (vertexIndex === pointCountBefore - 1) {
      if (index < segmentCountBefore - 1) result[String(index)] = value;
    } else if (index === vertexIndex || index === vertexIndex - 1) {
      continue;
    } else {
      result[String(index > vertexIndex ? index - 1 : index)] = value;
    }
  }
  const mergedType = previousType ?? nextType;
  if (mergedType && vertexIndex > 0 && vertexIndex < pointCountBefore - 1) result[String(vertexIndex - 1)] = mergedType;
  return Object.fromEntries(Object.entries(result)
    .filter(([key]) => {
      const index = Number(key);
      return Number.isInteger(index) && index >= 0 && index < segmentCountAfter;
    }));
}

function shiftClosedPolylineWallTypesForRemove(source={}, vertexIndex, pointCountBefore) {
  const result = {};
  const segmentCountAfter = Math.max(pointCountBefore - 1, 0);
  const previousSegment = vertexIndex === 0 ? pointCountBefore - 1 : vertexIndex - 1;
  const nextSegment = vertexIndex;
  const mergedSegment = vertexIndex === 0 ? segmentCountAfter - 1 : vertexIndex - 1;
  const mergedType = source?.[String(previousSegment)] ?? source?.[String(nextSegment)];

  for (const [key, value] of Object.entries(source ?? {})) {
    const index = Number(key);
    if (!Number.isInteger(index)) continue;
    if (index === previousSegment || index === nextSegment) continue;
    result[String(index > vertexIndex ? index - 1 : index)] = value;
  }
  if (mergedType) result[String(mergedSegment)] = mergedType;
  return Object.fromEntries(Object.entries(result)
    .filter(([key]) => {
      const index = Number(key);
      return Number.isInteger(index) && index >= 0 && index < segmentCountAfter;
    }));
}

export function handlePolylineCanvasClick(event, deps) {
  const point = deps.getClientInteractionPoint(event);
  if (!point) return false;

  const snapshot = deps.getEditorSnapshot(polylineState);
  if (!polylineState.placed) {
    polylineState.placed = true;
    polylineState.drawing = true;
    polylineState.polylineId = null;
    polylineState.wallIds = [];
    polylineState.wallTypeBySegment = {};
    polylineState.segmentGaps = [];
    polylineState.segmentCurves = {};
    polylineState.curveSegments = DEFAULT_POLYLINE_CURVE_SEGMENTS;
    polylineState.curveSegmentsBySegment = {};
    polylineState.segmentModeMemory = {};
    polylineState.closed = false;
    polylineState.points = [point];
    polylineState.previewPoint = point;
    deps.clearEditorHistory(polylineState);
    deps.drawPolylinePreview();
    return true;
  }

  if (!polylineState.drawing) return false;
  if (polylineState.points.length >= 3 && isPolylineClosePoint(point, deps)) {
    polylineState.previewPoint = polylineState.points[0];
    deps.drawPolylinePreview();
    return true;
  }

  const last = polylineState.points.at(-1);
  const minDistance = deps.getScaledRadius(Math.max(deps.getPreviewStyle().vertexSize, 4));
  if (!last || Math.hypot(last.x - point.x, last.y - point.y) > minDistance) {
    polylineState.points = [...polylineState.points, point];
    polylineState.segmentGaps = reconcilePolylineSegmentGaps(polylineState.segmentGaps, getPolylineSegmentCount());
    deps.pushEditorUndoSnapshot(polylineState, snapshot);
  }
  polylineState.previewPoint = point;
  deps.drawPolylinePreview();
  return true;
}

export function isPolylineClosePoint(point, deps) {
  if (polylineState.points.length < 3) return false;
  const first = polylineState.points[0];
  const radius = deps.getScaledRadius(Math.max(deps.getPreviewStyle().endpointSize, 12));
  return Math.hypot(first.x - point.x, first.y - point.y) <= radius;
}

export function closePolyline(deps) {
  if (polylineState.points.length < 3) return false;
  if (isPolylineClosePoint(polylineState.points.at(-1), deps)) polylineState.points.pop();
  if (polylineState.points.length < 3) return false;
  polylineState.closed = true;
  polylineState.drawing = false;
  polylineState.previewPoint = null;
  polylineState.segmentGaps = reconcilePolylineSegmentGaps(polylineState.segmentGaps, getPolylineSegmentCount());
  deps.drawPolylinePreview();
  return true;
}

export function drawPolylinePreview(deps) {
  const layer = canvas?.walls;
  if (!layer) return;

  const graphics = preparePreviewGraphics(polylineState, layer);
  if (!graphics) return;
  deps.setPolylineEditingState(polylineState.placed);
  if (!polylineState.placed) return;

  const style = deps.getPreviewStyle();
  const segments = getPolylineSegments();
  const allSegments = getAllPolylineSegments();
  const gaps = getPolylineSegmentGaps();
  for (const segment of segments) {
    graphics.lineStyle(deps.getScaledRadius(style.wallWidth), deps.getSegmentPreviewColor(polylineState, segment, style), 0.9);
    graphics.moveTo(segment.a.x, segment.a.y);
    graphics.lineTo(segment.b.x, segment.b.y);
  }
  for (const segment of getPolylineDoorIconSegments(gaps)) {
    deps.drawSegmentDoorIcon(graphics, polylineState, segment, style);
  }

  for (const segment of allSegments) {
    if (!isPolylineSegmentHidden(segment, gaps)) continue;
    graphics.lineStyle(
      deps.getScaledRadius(Math.max(style.guideWidth, 1)),
      deps.getSegmentPreviewColor(polylineState, segment, style),
      0.22
    );
    graphics.moveTo(segment.a.x, segment.a.y);
    graphics.lineTo(segment.b.x, segment.b.y);
  }

  for (const segment of getPolylineBaseSegments()) {
    const curve = getPolylineSegmentCurve(segment.index);
    if (!curve) continue;
    drawPolylineCurveControls(graphics, segment, curve, style, deps);
    drawPolylineCurveIntermediatePoints(graphics, segment, curve, style, deps, isPolylineBaseSegmentFullyHidden(segment.index, gaps));
  }

  const last = polylineState.points.at(-1);
  const preview = polylineState.previewPoint;
  if (polylineState.drawing && last && preview && Math.hypot(last.x - preview.x, last.y - preview.y) > 0.1) {
    const previewSegment = {index: getPolylineSegmentCount(), a: last, b: preview};
    graphics.lineStyle(deps.getScaledRadius(style.wallWidth), deps.getSegmentPreviewColor(polylineState, previewSegment, style), 0.55);
    graphics.moveTo(last.x, last.y);
    graphics.lineTo(preview.x, preview.y);
    deps.drawPreviewVertex(graphics, preview, style);
  }

  for (const vertex of getPolylineVertices()) {
    drawPolylineVertex(graphics, vertex, style, deps);
  }
  if (polylineState.points.length > 1) deps.drawMoveHandle(graphics, deps.getEditorShapeCenter(POLYLINE_TOOL), style);
}

function getPolylineDoorIconSegments(gaps) {
  const segments = [];
  for (const segment of getPolylineBaseSegments()) {
    const visibleSegments = getPolylineWallSegmentsForBaseSegment(segment).filter((piece) => !isPolylineSegmentHidden(piece, gaps));
    if (!visibleSegments.length) continue;
    segments.push(visibleSegments[Math.floor(visibleSegments.length / 2)]);
  }
  return segments;
}

function isPolylineBaseSegmentFullyHidden(index, gaps=getPolylineSegmentGaps()) {
  const baseSegment = getPolylineBaseSegments()[index];
  if (!baseSegment) return false;
  const baseSegments = getPolylineWallSegmentsForBaseSegment(baseSegment).filter(Boolean);
  return !!baseSegments.length && baseSegments.every((segment) => isPolylineSegmentHidden(segment, gaps));
}

function getPolylineSubsegmentGapKeys(index) {
  const baseSegment = getPolylineBaseSegments()[index];
  if (!baseSegment) return [];
  return getPolylineWallSegmentsForBaseSegment(baseSegment)
    .map((segment) => getPolylineSegmentGapKey(segment))
    .filter((key) => key?.includes(":"));
}

function getPolylineVertices() {
  return polylineState.points.map((point, index) => ({index, point}));
}

export function getPolylineVertexAt(point, deps) {
  if (!polylineState.placed) return null;
  const radius = getPolylineVertexHitRadius(deps);
  for (const vertex of getPolylineVertices()) {
    if (Math.hypot(vertex.point.x - point.x, vertex.point.y - point.y) <= radius) {
      return vertex;
    }
  }
  return null;
}

function getPolylineVertexHitRadius(deps) {
  return deps.getSplitVertexHitRadius(deps.getPreviewStyle());
}

export function setPolylineVertex(index, point) {
  if (!Number.isInteger(index) || !polylineState.points[index]) return;
  polylineState.points[index] = {x: point.x, y: point.y};
}

export function getPolylineCurveHandleAt(point, deps) {
  if (!polylineState.placed) return null;
  const style = deps.getPreviewStyle();
  const radius = deps.getScaledRadius(style.handleSize + style.outlineWidth + 8);
  let best = null;
  let bestDistance = Infinity;

  for (const [segmentIndex, curve] of Object.entries(reconcilePolylineSegmentCurves(polylineState.segmentCurves, getPolylineSegmentCount()))) {
    for (let handleIndex = 0; handleIndex < curve.handles.length; handleIndex++) {
      const handle = curve.handles[handleIndex];
      const distance = Math.hypot(handle.x - point.x, handle.y - point.y);
      if (distance <= radius && distance < bestDistance) {
        best = {segmentIndex: Number(segmentIndex), handleIndex, point: handle};
        bestDistance = distance;
      }
    }
  }

  return best;
}

export function setPolylineCurveHandle(handle, point) {
  if (!handle || !Number.isInteger(handle.segmentIndex) || !Number.isInteger(handle.handleIndex)) return;
  const curve = getPolylineSegmentCurve(handle.segmentIndex);
  if (!curve?.handles?.[handle.handleIndex]) return;
  curve.handles[handle.handleIndex] = {x: point.x, y: point.y};
  polylineState.segmentCurves = {
    ...polylineState.segmentCurves,
    [String(handle.segmentIndex)]: curve
  };
}

export function translatePolylineSegmentCurves(dx, dy) {
  const result = {};
  for (const [key, curve] of Object.entries(reconcilePolylineSegmentCurves(polylineState.segmentCurves, getPolylineSegmentCount()))) {
    result[key] = {
      mode: curve.mode,
      handles: curve.handles.map((handle) => ({x: handle.x + dx, y: handle.y + dy}))
    };
  }
  polylineState.segmentCurves = result;
  polylineState.segmentModeMemory = translatePolylineSegmentModeMemory(polylineState.segmentModeMemory, dx, dy);
}

function translatePolylineSegmentModeMemory(source={}, dx=0, dy=0) {
  const result = clonePolylineSegmentModeMemory(source);
  for (const entry of Object.values(result)) {
    for (const modeState of Object.values(entry)) {
      if (!modeState.curve?.handles) continue;
      modeState.curve.handles = modeState.curve.handles.map((handle) => ({
        x: handle.x + dx,
        y: handle.y + dy
      }));
    }
  }
  return result;
}

function drawPolylineVertex(graphics, vertex, style, deps) {
  const radius = deps.getScaledRadius(style.splitVertexSize);
  const highlighted = polylineState.draggingVertex?.index === vertex.index || polylineState.hoveredVertex?.index === vertex.index;
  graphics.beginFill(highlighted ? style.vertexActiveColor : style.vertexColor, 0.98);
  graphics.lineStyle(
    deps.getScaledRadius(style.outlineWidth),
    highlighted ? style.outlineColor : style.wallColor,
    0.95
  );
  graphics.drawCircle(vertex.point.x, vertex.point.y, radius);
  graphics.endFill();
}

function drawPolylineCurveIntermediatePoints(graphics, segment, curve, style, deps, missing=false) {
  const points = getPolylineSegmentPoints(segment, curve, getPolylineSegmentSubdivisionCount(segment.index, deps)).slice(1, -1);
  if (!points.length) return;

  const radius = deps.getScaledRadius(Math.max(style.vertexSize * 0.55, 2));
  const outlineWidth = deps.getScaledRadius(Math.max(style.outlineWidth * 0.6, 0.75));
  for (const point of points) {
    graphics.beginFill(style.vertexColor, missing ? 0.28 : 0.82);
    graphics.lineStyle(outlineWidth, style.wallColor, missing ? 0.2 : 0.7);
    graphics.drawCircle(point.x, point.y, radius);
    graphics.endFill();
  }
}

function drawPolylineCurveControls(graphics, segment, curve, style, deps) {
  const handles = curve.handles ?? [];
  graphics.lineStyle(deps.getScaledRadius(style.guideWidth), style.wallColor, 0.55);
  if (curve.mode === POLYLINE_SEGMENT_ARC) {
    const [control] = handles;
    graphics.moveTo(segment.a.x, segment.a.y);
    graphics.lineTo(control.x, control.y);
    graphics.lineTo(segment.b.x, segment.b.y);
    deps.drawBezierHandle(graphics, control, style);
    return;
  }

  const [controlA, controlB] = handles;
  graphics.moveTo(segment.a.x, segment.a.y);
  graphics.lineTo(controlA.x, controlA.y);
  graphics.moveTo(segment.b.x, segment.b.y);
  graphics.lineTo(controlB.x, controlB.y);
  deps.drawBezierHandle(graphics, controlA, style);
  deps.drawBezierHandle(graphics, controlB, style);
}

export function getPolylineSegmentAt(point, deps) {
  if (!polylineState.placed) return null;
  const style = deps.getPreviewStyle();
  const tolerance = deps.getScaledRadius(Math.max(style.wallWidth + 6, 10));
  let best = null;
  let bestDistance = Infinity;

  for (const segment of getAllPolylineSegments()) {
    if (!deps.isPointNearSegmentBounds(point, segment.a, segment.b, tolerance)) continue;
    const distance = deps.getPointSegmentDistance(point, segment.a, segment.b);
    if (distance <= tolerance && distance < bestDistance) {
      best = segment;
      bestDistance = distance;
    }
  }

  return best;
}

export function getPolylineSegmentEditFromEvent(event, deps) {
  const point = deps.getClientInteractionPoint(event);
  const segment = point ? getPolylineSegmentAt(point, deps) : null;
  if (!segment) return null;
  return {
    index: segment.index,
    gapKey: getPolylineSegmentGapKey(segment),
    point,
    remove: event.altKey
  };
}

export function commitPolylineSegmentEdit(edit, event=null, deps) {
  if (!edit) return false;
  const edited = editPolylineSegmentWithUndo(edit.index, edit.remove, edit.point, deps, edit.gapKey);
  if (edited) {
    deps.debugShapeSelection("polyline segment edit", {
      index: edit.index,
      gapKey: edit.gapKey,
      remove: edit.remove,
      eventType: event?.type
    });
    deps.scheduleEditorInteractionReset(event);
  }
  return edited;
}

export function editPolylineSegmentWithUndo(index, remove=false, point=null, deps, gapKey=null) {
  const snapshot = deps.getEditorSnapshot(polylineState);
  const edited = editPolylineSegment(index, remove, point, deps, gapKey);
  if (edited) deps.pushEditorUndoSnapshot(polylineState, snapshot);
  return edited;
}

function editPolylineSegment(index, remove=false, point=null, deps, gapKey=null) {
  const gaps = getPolylineSegmentGaps();
  const key = normalizePolylineGapKey(gapKey ?? index, getPolylineSegmentCount());
  if (!key) return false;
  const baseKey = String(index);
  if (remove) {
    if (gaps.includes(baseKey)) return false;
    if (gaps.includes(key)) return false;
    polylineState.segmentGaps = [...gaps, key].sort(comparePolylineGapKeys);
    deps.drawPolylinePreview();
    return true;
  }

  if (gaps.includes(key)) {
    polylineState.segmentGaps = gaps.filter((gap) => gap !== key);
    deps.drawPolylinePreview();
    return true;
  }

  if (gaps.includes(baseKey)) {
    const siblingKeys = getPolylineSubsegmentGapKeys(index);
    polylineState.segmentGaps = [
      ...gaps.filter((gap) => gap !== baseKey),
      ...siblingKeys.filter((siblingKey) => siblingKey !== key)
    ].sort(comparePolylineGapKeys);
    deps.drawPolylinePreview();
    return true;
  }

  return addPolylineVertexAtSegment(index, point, deps);
}

export function cyclePolylineSegmentCurveWithUndo(index, deps) {
  const snapshot = deps.getEditorSnapshot(polylineState);
  const edited = cyclePolylineSegmentCurve(index, deps);
  if (edited) deps.pushEditorUndoSnapshot(polylineState, snapshot);
  return edited;
}

function cyclePolylineSegmentCurve(index, deps) {
  if (!Number.isInteger(index) || index < 0 || index >= getPolylineSegmentCount()) return false;
  const segment = getPolylineBaseSegments()[index];
  if (!segment) return false;

  const current = getPolylineSegmentCurve(index);
  const currentMode = current?.mode ?? POLYLINE_SEGMENT_LINE;
  rememberPolylineSegmentModeState(index, currentMode, deps);
  if (!current) {
    restorePolylineSegmentModeState(index, POLYLINE_SEGMENT_ARC, deps) || setPolylineSegmentCurveMode(index, createDefaultPolylineArc(segment), deps);
  } else if (current.mode === POLYLINE_SEGMENT_ARC) {
    restorePolylineSegmentModeState(index, POLYLINE_SEGMENT_BEZIER, deps) || setPolylineSegmentCurveMode(index, createDefaultPolylineBezier(segment, current.handles[0]), deps);
  } else {
    restorePolylineSegmentModeState(index, POLYLINE_SEGMENT_LINE, deps) || setPolylineSegmentLineMode(index, deps);
  }

  deps.drawPolylinePreview();
  return true;
}

function rememberPolylineSegmentModeState(index, mode, deps) {
  const key = String(index);
  const normalizedMode = normalizePolylineSegmentMode(mode);
  polylineState.segmentModeMemory = {
    ...(polylineState.segmentModeMemory ?? {}),
    [key]: {
      ...(polylineState.segmentModeMemory?.[key] ?? {}),
      [normalizedMode]: getPolylineSegmentModeState(index, normalizedMode, deps)
    }
  };
}

function getPolylineSegmentModeState(index, mode, deps) {
  const normalizedMode = normalizePolylineSegmentMode(mode);
  const curve = normalizedMode === POLYLINE_SEGMENT_LINE ? null : getPolylineSegmentCurve(index);
  const state = {
    gaps: getPolylineSegmentGapKeys(index)
  };
  if (curve) state.curve = clonePolylineCurve(curve);
  if (normalizedMode !== POLYLINE_SEGMENT_LINE) state.curveSegments = getPolylineSegmentSubdivisionCount(index, deps);
  return state;
}

function restorePolylineSegmentModeState(index, mode, deps) {
  const normalizedMode = normalizePolylineSegmentMode(mode);
  const memory = polylineState.segmentModeMemory?.[String(index)]?.[normalizedMode];
  if (!memory) return false;
  if (normalizedMode === POLYLINE_SEGMENT_LINE) setPolylineSegmentLineMode(index, deps);
  else {
    const curve = clonePolylineCurve(memory.curve);
    if (!curve || curve.mode !== normalizedMode) return false;
    setPolylineSegmentCurveMode(index, curve, deps, memory.curveSegments);
  }
  replacePolylineSegmentGapKeys(index, memory.gaps);
  return true;
}

function setPolylineSegmentCurveMode(index, curve, deps, curveSegments=null) {
  polylineState.segmentCurves = {
    ...polylineState.segmentCurves,
    [String(index)]: curve
  };
  if (curveSegments !== null) {
    polylineState.curveSegmentsBySegment = {
      ...reconcilePolylineCurveSegmentsBySegment(polylineState.curveSegmentsBySegment, getPolylineSegmentCount(), polylineState.curveSegments, deps),
      [String(index)]: clampPolylineCurveSegmentCount(curveSegments, deps)
    };
  }
}

function setPolylineSegmentLineMode(index, deps) {
  const nextCurves = {...polylineState.segmentCurves};
  delete nextCurves[String(index)];
  polylineState.segmentCurves = nextCurves;
  const nextSegments = {...polylineState.curveSegmentsBySegment};
  delete nextSegments[String(index)];
  polylineState.curveSegmentsBySegment = reconcilePolylineCurveSegmentsBySegment(nextSegments, getPolylineSegmentCount(), polylineState.curveSegments, deps);
}

function getPolylineSegmentGapKeys(index) {
  return getPolylineSegmentGaps().filter((gap) => parsePolylineGapKey(gap).index === index);
}

function replacePolylineSegmentGapKeys(index, gaps) {
  const current = getPolylineSegmentGaps().filter((gap) => parsePolylineGapKey(gap).index !== index);
  const restored = (Array.isArray(gaps) ? gaps : [])
    .map((gap) => normalizePolylineGapKey(gap, getPolylineSegmentCount()))
    .filter((gap) => gap !== null && parsePolylineGapKey(gap).index === index);
  polylineState.segmentGaps = [...new Set([...current, ...restored])].sort(comparePolylineGapKeys);
}

function normalizePolylineSegmentMode(mode) {
  if (mode === POLYLINE_SEGMENT_ARC || mode === POLYLINE_SEGMENT_BEZIER) return mode;
  return POLYLINE_SEGMENT_LINE;
}

export function clonePolylineSegmentModeMemory(source={}) {
  const result = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0) continue;
    result[String(index)] = clonePolylineSegmentModeMemoryEntry(value);
  }
  return result;
}

function clonePolylineSegmentModeMemoryEntry(source={}) {
  const result = {};
  for (const mode of [POLYLINE_SEGMENT_LINE, POLYLINE_SEGMENT_ARC, POLYLINE_SEGMENT_BEZIER]) {
    const value = source?.[mode];
    if (!value) continue;
    result[mode] = {
      gaps: reconcilePolylineSegmentGaps(value.gaps, Infinity)
    };
    const curve = clonePolylineCurve(value.curve);
    if (curve) result[mode].curve = curve;
    if (value.curveSegments !== undefined) result[mode].curveSegments = clampPolylineCurveSegmentCount(value.curveSegments);
  }
  return result;
}

function createDefaultPolylineArc(segment) {
  const control = getDefaultCurveControlPoint(segment, 0.28);
  return {mode: POLYLINE_SEGMENT_ARC, handles: [control]};
}

function createDefaultPolylineBezier(segment, existingControl=null) {
  const control = existingControl ?? getDefaultCurveControlPoint(segment, 0.28);
  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  return {
    mode: POLYLINE_SEGMENT_BEZIER,
    handles: [
      {
        x: segment.a.x + (dx * 0.35) + ((control.x - ((segment.a.x + segment.b.x) / 2)) * 0.8),
        y: segment.a.y + (dy * 0.35) + ((control.y - ((segment.a.y + segment.b.y) / 2)) * 0.8)
      },
      {
        x: segment.b.x - (dx * 0.35) + ((control.x - ((segment.a.x + segment.b.x) / 2)) * 0.8),
        y: segment.b.y - (dy * 0.35) + ((control.y - ((segment.a.y + segment.b.y) / 2)) * 0.8)
      }
    ]
  };
}

function getDefaultCurveControlPoint(segment, amount=0.25) {
  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  const length = Math.hypot(dx, dy);
  if (!length) return {x: segment.a.x, y: segment.a.y};
  return {
    x: (segment.a.x + segment.b.x) / 2 + (dy / length) * length * amount,
    y: (segment.a.y + segment.b.y) / 2 - (dx / length) * length * amount
  };
}

function addPolylineVertexAtSegment(index, point, deps) {
  if (!Number.isInteger(index) || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return false;
  if (index < 0 || index >= getPolylineSegmentCount()) return false;

  const segment = getPolylineBaseSegments()[index];
  if (!segment) return false;
  const minDistance = deps.getScaledRadius(Math.max(deps.getPreviewStyle().vertexSize, 4));
  if (Math.hypot(segment.a.x - point.x, segment.a.y - point.y) <= minDistance) return false;
  if (Math.hypot(segment.b.x - point.x, segment.b.y - point.y) <= minDistance) return false;

  const insertIndex = polylineState.closed && index === polylineState.points.length - 1
    ? polylineState.points.length
    : index + 1;
  polylineState.points.splice(insertIndex, 0, {x: point.x, y: point.y});
  polylineState.segmentGaps = shiftPolylineGapsForInsert(polylineState.segmentGaps, index);
  polylineState.wallTypeBySegment = shiftPolylineWallTypesForInsert(polylineState.wallTypeBySegment, index);
  polylineState.segmentCurves = shiftPolylineCurvesForInsert(polylineState.segmentCurves, index);
  polylineState.curveSegmentsBySegment = shiftPolylineCurveSegmentsForInsert(polylineState.curveSegmentsBySegment, index);
  polylineState.segmentModeMemory = shiftPolylineSegmentModeMemoryForInsert(polylineState.segmentModeMemory, index);
  polylineState.previewPoint = null;
  deps.drawPolylinePreview();
  return true;
}

export function removePolylineVertex(index, deps) {
  if (!Number.isInteger(index) || !polylineState.points[index]) return false;
  if (polylineState.points.length <= (polylineState.closed ? 3 : 2)) return false;

  const pointCountBefore = polylineState.points.length;
  const closed = polylineState.closed;
  polylineState.points.splice(index, 1);
  polylineState.segmentGaps = shiftPolylineGapsForRemove(polylineState.segmentGaps, index, pointCountBefore, closed);
  polylineState.wallTypeBySegment = shiftPolylineWallTypesForRemove(polylineState.wallTypeBySegment, index, pointCountBefore, closed);
  polylineState.segmentCurves = shiftPolylineCurvesForRemove(polylineState.segmentCurves, index, pointCountBefore, closed);
  polylineState.curveSegmentsBySegment = shiftPolylineCurveSegmentsForRemove(polylineState.curveSegmentsBySegment, index, pointCountBefore, closed);
  polylineState.segmentModeMemory = shiftPolylineSegmentModeMemoryForRemove(polylineState.segmentModeMemory, index, pointCountBefore, closed);
  polylineState.previewPoint = null;
  deps.drawPolylinePreview();
  return true;
}

export async function applyPolylineWalls(deps) {
  if (!deps.isPolylineToolActive() || !polylineState.placed || polylineState.points.length < 2) return;

  const segments = getPolylineSegments();
  const segmentGaps = getPolylineSegmentGaps();
  const segmentCurves = reconcilePolylineSegmentCurves(polylineState.segmentCurves, getPolylineSegmentCount());
  const curveSegmentsBySegment = reconcilePolylineCurveSegmentsBySegment(polylineState.curveSegmentsBySegment, getPolylineSegmentCount(), polylineState.curveSegments, deps);
  const polylineId = polylineState.polylineId ?? foundry.utils.randomID();
  const walls = [];

  for (const segment of segments) {
    const {a, b} = segment;
    const wallData = deps.getSegmentWallData(polylineState, deps.getSegmentKey(segment));
    const c = [Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y)];
    if ((c[0] === c[2]) && (c[1] === c[3])) continue;
    walls.push({
      ...wallData,
      c,
      flags: {
        [deps.MODULE_ID]: {
          [POLYLINE_FLAG]: {
            polylineId,
            index: segment.index,
            wallIds: [],
            points: deps.clonePoints(polylineState.points),
            closed: polylineState.closed,
            segmentGaps,
            segmentCurves,
            curveSegments: polylineState.curveSegments,
            curveSegmentsBySegment,
            wallTypeBySegment: deps.cloneWallTypeBySegment(polylineState.wallTypeBySegment),
            wallTypeTool: polylineState.wallTypeTool
          }
        }
      }
    });
  }

  const oldWallIds = getExistingPolylineWallIds();
  if (!walls.length) {
    if (oldWallIds.length) {
      oldWallIds.forEach((id) => polylineState.replacingWallIds.add(id));
      try {
        await canvas.scene.deleteEmbeddedDocuments("Wall", oldWallIds);
      } finally {
        oldWallIds.forEach((id) => polylineState.replacingWallIds.delete(id));
      }
    }
    deps.clearPolylinePreview();
    return;
  }

  const created = await deps.replaceShapeWalls(polylineState, oldWallIds, walls);
  ui.notifications.info(game.i18n.format("indy-walls.Notifications.PolylineWallsCreated", {
    count: created.length
  }));
  deps.clearPolylinePreview();
}

export function clearPolylinePreview(deps) {
  deps.restoreEditSessionWalls();
  deps.clearEditorHistory(polylineState);
  polylineState.placed = false;
  polylineState.drawing = false;
  polylineState.draggingVertex = null;
  polylineState.draggingCurveHandle = null;
  polylineState.hoveredVertex = null;
  polylineState.polylineId = null;
  polylineState.wallIds = [];
  polylineState.wallTypeBySegment = {};
  polylineState.segmentGaps = [];
  polylineState.segmentCurves = {};
  polylineState.curveSegments = DEFAULT_POLYLINE_CURVE_SEGMENTS;
  polylineState.curveSegmentsBySegment = {};
  polylineState.segmentModeMemory = {};
  polylineState.closed = false;
  polylineState.previewPoint = null;
  polylineState.points = [];
  destroyPreviewGraphics(polylineState);
  polylineState.graphics = null;
  deps.setPolylineEditingState(false);
}

export function cancelPolylineEditingForDeletedWall(wallDocument, deps) {
  if (!polylineState.placed || !polylineState.polylineId) return;
  if (polylineState.replacingWallIds.has(wallDocument.id)) return;

  const polylineData = wallDocument.getFlag(deps.MODULE_ID, POLYLINE_FLAG);
  const samePolyline = polylineData?.polylineId === polylineState.polylineId;
  const knownWall = polylineState.wallIds.includes(wallDocument.id);
  if (!samePolyline && !knownWall) return;

  deps.clearPolylinePreview();
  if (game.activeTool === POLYLINE_TOOL) canvas.walls.activate({tool: "select"});
}

export function loadPolylineFromWall(wall, deps) {
  const polylineData = wall.document.getFlag(deps.MODULE_ID, POLYLINE_FLAG);
  if (!Array.isArray(polylineData?.points) || polylineData.points.length < 2) return;

  deps.deactivateOtherShapeStates(polylineState);
  polylineState.active = true;
  deps.clearEditorHistory(polylineState);
  polylineState.placed = true;
  polylineState.drawing = false;
  polylineState.draggingVertex = null;
  polylineState.draggingCurveHandle = null;
  polylineState.hoveredVertex = null;
  polylineState.polylineId = polylineData.polylineId ?? null;
  polylineState.wallIds = Array.isArray(polylineData.wallIds) ? [...polylineData.wallIds] : [wall.document.id];
  polylineState.wallTypeTool = deps.getWallTypeToolFromDocument(wall.document) ?? polylineData.wallTypeTool ?? "walls";
  polylineState.points = polylineData.points.map((point) => ({
    x: Number(point.x) || 0,
    y: Number(point.y) || 0
  }));
  polylineState.closed = !!polylineData.closed;
  polylineState.segmentGaps = reconcilePolylineSegmentGaps(polylineData.segmentGaps, getPolylineSegmentCount());
  polylineState.segmentCurves = reconcilePolylineSegmentCurves(polylineData.segmentCurves, getPolylineSegmentCount());
  polylineState.curveSegments = deps.clamp(Number(polylineData.curveSegments) || DEFAULT_POLYLINE_CURVE_SEGMENTS, 2, 64);
  polylineState.curveSegmentsBySegment = reconcilePolylineCurveSegmentsBySegment(
    polylineData.curveSegmentsBySegment,
    getPolylineSegmentCount(),
    polylineState.curveSegments,
    deps
  );
  polylineState.segmentModeMemory = {};
  polylineState.previewPoint = null;
  polylineState.wallTypeBySegment = {
    ...deps.cloneWallTypeBySegment(polylineData.wallTypeBySegment),
    ...deps.getShapeWallTypeByIndexedFlag(polylineState.wallIds, POLYLINE_FLAG)
  };

  canvas.walls.activate({tool: POLYLINE_TOOL});
  deps.hideEditSessionWalls(polylineState.wallIds);
  deps.drawPolylinePreview();
}

export function getExistingPolylineWallIds() {
  return polylineState.wallIds.filter((id) => canvas.scene.walls.has(id));
}
