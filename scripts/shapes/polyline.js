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

  if (!polylineState.graphics || polylineState.graphics._destroyed) {
    polylineState.graphics = new PIXI.Graphics();
    layer.preview.addChild(polylineState.graphics);
  } else if (!polylineState.graphics.parent) {
    layer.preview.addChild(polylineState.graphics);
  }

  const graphics = polylineState.graphics;
  graphics.clear();
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

  for (const segment of allSegments) {
    if (!gaps.includes(segment.index)) continue;
    graphics.lineStyle(
      deps.getScaledRadius(Math.max(style.guideWidth, 1)),
      deps.getSegmentPreviewColor(polylineState, segment, style),
      0.22
    );
    graphics.moveTo(segment.a.x, segment.a.y);
    graphics.lineTo(segment.b.x, segment.b.y);
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

export function getPolylineVertices() {
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

export function getPolylineVertexHitRadius(deps) {
  return deps.getSplitVertexHitRadius(deps.getPreviewStyle());
}

export function setPolylineVertex(index, point) {
  if (!Number.isInteger(index) || !polylineState.points[index]) return;
  polylineState.points[index] = {x: point.x, y: point.y};
}

export function drawPolylineVertex(graphics, vertex, style, deps) {
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
    point,
    remove: event.altKey
  };
}

export function commitPolylineSegmentEdit(edit, event=null, deps) {
  if (!edit) return false;
  const edited = editPolylineSegmentWithUndo(edit.index, edit.remove, edit.point, deps);
  if (edited) {
    deps.debugShapeSelection("polyline segment edit", {
      index: edit.index,
      remove: edit.remove,
      eventType: event?.type
    });
    deps.scheduleEditorInteractionReset(event);
  }
  return edited;
}

export function editPolylineSegmentWithUndo(index, remove=false, point=null, deps) {
  const snapshot = deps.getEditorSnapshot(polylineState);
  const edited = editPolylineSegment(index, remove, point, deps);
  if (edited) deps.pushEditorUndoSnapshot(polylineState, snapshot);
  return edited;
}

export function editPolylineSegment(index, remove=false, point=null, deps) {
  const gaps = getPolylineSegmentGaps();
  if (remove) {
    if (gaps.includes(index)) return false;
    polylineState.segmentGaps = [...gaps, index].sort((a, b) => a - b);
    deps.drawPolylinePreview();
    return true;
  }

  if (gaps.includes(index)) {
    polylineState.segmentGaps = gaps.filter((gap) => gap !== index);
    deps.drawPolylinePreview();
    return true;
  }

  return addPolylineVertexAtSegment(index, point, deps);
}

export function addPolylineVertexAtSegment(index, point, deps) {
  if (!Number.isInteger(index) || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return false;
  if (index < 0 || index >= getPolylineSegmentCount()) return false;

  const segment = getAllPolylineSegments()[index];
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
  polylineState.previewPoint = null;
  deps.drawPolylinePreview();
  return true;
}

export async function applyPolylineWalls(deps) {
  if (!deps.isPolylineToolActive() || !polylineState.placed || polylineState.points.length < 2) return;

  const segments = getPolylineSegments();
  const segmentGaps = getPolylineSegmentGaps();
  const polylineId = polylineState.polylineId ?? foundry.utils.randomID();
  const walls = [];
  const wallSegmentIndexes = [];

  for (const segment of segments) {
    const {a, b} = segment;
    const wallData = deps.getSegmentWallData(polylineState, deps.getSegmentKey(segment));
    const c = [Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y)];
    if ((c[0] === c[2]) && (c[1] === c[3])) continue;
    wallSegmentIndexes.push(segment.index);
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
            wallTypeBySegment: deps.cloneWallTypeBySegment(polylineState.wallTypeBySegment),
            wallTypeTool: polylineState.wallTypeTool
          }
        }
      }
    });
  }

  const oldWallIds = getExistingPolylineWallIds();
  const oldWalls = oldWallIds.map((id) => canvas.scene.walls.get(id)).filter(Boolean);
  if (!walls.length) {
    if (oldWallIds.length) {
      canvas.walls.storeHistory("delete", oldWalls.map((wall) => wall.toObject()));
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

  const created = await canvas.scene.createEmbeddedDocuments("Wall", walls);
  const wallIds = created.map((wall) => wall.id);
  const flagUpdates = created.map((wall, index) => ({
    _id: wall.id,
    [`flags.${deps.MODULE_ID}.${POLYLINE_FLAG}.index`]: wallSegmentIndexes[index] ?? index,
    [`flags.${deps.MODULE_ID}.${POLYLINE_FLAG}.wallIds`]: wallIds
  }));
  await canvas.scene.updateEmbeddedDocuments("Wall", flagUpdates);

  if (oldWallIds.length) {
    canvas.walls.storeHistory("delete", oldWalls.map((wall) => wall.toObject()));
    oldWallIds.forEach((id) => polylineState.replacingWallIds.add(id));
    try {
      await canvas.scene.deleteEmbeddedDocuments("Wall", oldWallIds);
    } finally {
      oldWallIds.forEach((id) => polylineState.replacingWallIds.delete(id));
    }
  }

  canvas.walls.storeHistory("create", created.map((wall) => wall.toObject()));
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
  polylineState.hoveredVertex = null;
  polylineState.polylineId = null;
  polylineState.wallIds = [];
  polylineState.wallTypeBySegment = {};
  polylineState.segmentGaps = [];
  polylineState.closed = false;
  polylineState.previewPoint = null;
  polylineState.points = [];
  polylineState.graphics?.destroy();
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
