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

function getEllipseVertices() {
  return getEllipsePoints(ellipseState.segments)
    .slice(0, -1)
    .map((point, index) => ({index, point}));
}

function getAllEllipseSegments() {
  const points = getEllipsePoints(ellipseState.segments);
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push({index: i, a: points[i], b: points[i + 1]});
  }
  return segments;
}

function getEllipseSegments() {
  const gaps = getEllipseSegmentGaps();
  return getAllEllipseSegments().filter((segment) => !gaps.includes(segment.index));
}

function getEllipseSegmentGaps() {
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

function normalizeAngle(angle) {
  const fullTurn = Math.PI * 2;
  return ((angle % fullTurn) + fullTurn) % fullTurn;
}

export function changeEllipseSegments(delta, deps) {
  if (!deps.isEllipseToolActive()) return;
  ellipseState.segments = deps.clamp(ellipseState.segments + delta, 4, 96);
  ellipseState.segmentGaps = reconcileEllipseSegmentGaps(ellipseState.segmentGaps, ellipseState.segments);
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
    ellipseState.segmentGaps = [...gaps, index].sort((a, b) => a - b);
    deps.drawEllipsePreview();
    return true;
  }

  if (!gaps.includes(index)) return false;
  ellipseState.segmentGaps = gaps.filter((gap) => gap !== index);
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
  const wallSegmentIndexes = [];

  for (const segment of segments) {
    const {a, b} = segment;
    const wallData = deps.getSegmentWallData(ellipseState, deps.getSegmentKey(segment));
    const c = [Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y)];
    if ((c[0] === c[2]) && (c[1] === c[3])) continue;
    wallSegmentIndexes.push(segment.index);
    walls.push({
      ...wallData,
      c,
      flags: {
        [deps.MODULE_ID]: {
          [ELLIPSE_FLAG]: {
            ellipseId,
            index: segment.index,
            wallIds: [],
            handles: deps.clonePoints(ellipseState.handles),
            segments: ellipseState.segments,
            rotation: ellipseState.rotation,
            segmentGaps,
            wallTypeBySegment: deps.cloneWallTypeBySegment(ellipseState.wallTypeBySegment),
            wallTypeTool: ellipseState.wallTypeTool
          }
        }
      }
    });
  }

  const oldWallIds = getExistingEllipseWallIds();
  const oldWalls = oldWallIds.map((id) => canvas.scene.walls.get(id)).filter(Boolean);
  if (!walls.length) {
    if (oldWallIds.length) {
      canvas.walls.storeHistory("delete", oldWalls.map((wall) => wall.toObject()));
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

  const created = await canvas.scene.createEmbeddedDocuments("Wall", walls);
  const wallIds = created.map((wall) => wall.id);
  const flagUpdates = created.map((wall, index) => ({
    _id: wall.id,
    [`flags.${deps.MODULE_ID}.${ELLIPSE_FLAG}.index`]: wallSegmentIndexes[index] ?? index,
    [`flags.${deps.MODULE_ID}.${ELLIPSE_FLAG}.wallIds`]: wallIds
  }));
  await canvas.scene.updateEmbeddedDocuments("Wall", flagUpdates);

  if (oldWallIds.length) {
    canvas.walls.storeHistory("delete", oldWalls.map((wall) => wall.toObject()));
    oldWallIds.forEach((id) => ellipseState.replacingWallIds.add(id));
    try {
      await canvas.scene.deleteEmbeddedDocuments("Wall", oldWallIds);
    } finally {
      oldWallIds.forEach((id) => ellipseState.replacingWallIds.delete(id));
    }
  }

  canvas.walls.storeHistory("create", created.map((wall) => wall.toObject()));
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
  ellipseState.lastSegmentEditAction = 0;
  ellipseState.suppressNextSegmentEditClick = false;
  ellipseState.ellipseId = null;
  ellipseState.wallIds = [];
  ellipseState.wallTypeBySegment = {};
  ellipseState.rotation = 0;
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
  ellipseState.lastSegmentEditAction = 0;
  ellipseState.suppressNextSegmentEditClick = false;
  ellipseState.ellipseId = ellipseData.ellipseId ?? null;
  ellipseState.wallIds = Array.isArray(ellipseData.wallIds) ? [...ellipseData.wallIds] : [wall.document.id];
  ellipseState.wallTypeTool = deps.getWallTypeToolFromDocument(wall.document) ?? ellipseData.wallTypeTool ?? "walls";
  ellipseState.segments = deps.clamp(Number(ellipseData.segments) || DEFAULT_ELLIPSE_SEGMENTS, 4, 96);
  ellipseState.rotation = Number(ellipseData.rotation) || 0;
  ellipseState.segmentGaps = reconcileEllipseSegmentGaps(ellipseData.segmentGaps, ellipseState.segments);
  ellipseState.handles = ellipseData.handles.map((handle) => ({
    x: Number(handle.x) || 0,
    y: Number(handle.y) || 0
  }));
  ellipseState.wallTypeBySegment = {
    ...deps.cloneWallTypeBySegment(ellipseData.wallTypeBySegment),
    ...deps.getShapeWallTypeByIndexedFlag(ellipseState.wallIds, ELLIPSE_FLAG)
  };

  canvas.walls.activate({tool: ELLIPSE_TOOL});
  deps.hideEditSessionWalls(ellipseState.wallIds);
  deps.drawEllipsePreview();
}

export function getExistingEllipseWallIds() {
  return ellipseState.wallIds.filter((id) => canvas.scene.walls.has(id));
}
