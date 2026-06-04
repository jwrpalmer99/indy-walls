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

export function getPolylineSegmentCount() {
  if (polylineState.closed && polylineState.points.length > 2) return polylineState.points.length;
  return Math.max(polylineState.points.length - 1, 0);
}

export function getAllPolylineSegments() {
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

export function getPolylineSegments() {
  const gaps = getPolylineSegmentGaps();
  return getAllPolylineSegments().filter((segment) => !gaps.includes(segment.index));
}

export function getPolylineSegmentGaps() {
  const gaps = reconcilePolylineSegmentGaps(polylineState.segmentGaps, getPolylineSegmentCount());
  polylineState.segmentGaps = gaps;
  return gaps;
}

export function reconcilePolylineSegmentGaps(source, segmentCount) {
  if (!Array.isArray(source)) return [];
  return [...new Set(source
    .map((index) => Number(index))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < segmentCount))]
    .sort((a, b) => a - b);
}

export function shiftPolylineGapsForInsert(source, splitIndex) {
  return [...new Set((source ?? []).map((gap) => {
    const index = Number(gap);
    if (!Number.isInteger(index)) return null;
    return index > splitIndex ? index + 1 : index;
  }).filter((index) => index !== null))]
    .sort((a, b) => a - b);
}

export function shiftPolylineGapsForRemove(source, vertexIndex, pointCountBefore, closed=false) {
  if (closed) return shiftClosedPolylineGapsForRemove(source, vertexIndex, pointCountBefore);

  const result = new Set();
  const segmentCountBefore = Math.max(pointCountBefore - 1, 0);
  const segmentCountAfter = Math.max(pointCountBefore - 2, 0);
  for (const gap of source ?? []) {
    const index = Number(gap);
    if (!Number.isInteger(index)) continue;
    if (vertexIndex === 0) {
      if (index > 0) result.add(index - 1);
    } else if (vertexIndex === pointCountBefore - 1) {
      if (index < segmentCountBefore - 1) result.add(index);
    } else if (index === vertexIndex || index === vertexIndex - 1) {
      result.add(vertexIndex - 1);
    } else if (index > vertexIndex) {
      result.add(index - 1);
    } else {
      result.add(index);
    }
  }
  return [...result].filter((index) => index >= 0 && index < segmentCountAfter).sort((a, b) => a - b);
}

export function shiftClosedPolylineGapsForRemove(source, vertexIndex, pointCountBefore) {
  const result = new Set();
  const segmentCountAfter = Math.max(pointCountBefore - 1, 0);
  const previousSegment = vertexIndex === 0 ? pointCountBefore - 1 : vertexIndex - 1;
  const nextSegment = vertexIndex;
  const mergedSegment = vertexIndex === 0 ? segmentCountAfter - 1 : vertexIndex - 1;

  for (const gap of source ?? []) {
    const index = Number(gap);
    if (!Number.isInteger(index)) continue;
    if (index === previousSegment || index === nextSegment) {
      result.add(mergedSegment);
    } else if (index > vertexIndex) {
      result.add(index - 1);
    } else {
      result.add(index);
    }
  }
  return [...result].filter((index) => index >= 0 && index < segmentCountAfter).sort((a, b) => a - b);
}

export function shiftPolylineWallTypesForInsert(source={}, splitIndex) {
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

export function shiftPolylineWallTypesForRemove(source={}, vertexIndex, pointCountBefore, closed=false) {
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

export function shiftClosedPolylineWallTypesForRemove(source={}, vertexIndex, pointCountBefore) {
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
