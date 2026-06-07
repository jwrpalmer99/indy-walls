import {clonePoints} from "./curve-common.js";
import {
  DEFAULT_ELLIPSE_SEGMENTS,
  ELLIPSE_FLAG
} from "./shapes/ellipse.js";
import {
  cloneRectangleSideEnabled,
  cloneRectangleSideGaps,
  cloneRectangleSideRatios,
  getDefaultRectangleSideEnabled,
  getDefaultRectangleSideGaps,
  getDefaultRectangleSideRatios,
  getRectangleSegmentKey,
  RECTANGLE_FLAG
} from "./shapes/rectangle.js";
import {
  DEFAULT_POLYLINE_CURVE_SEGMENTS,
  POLYLINE_FLAG
} from "./shapes/polyline.js";
import {
  getPreviewStyle
} from "./preview-style.js";
import {
  getScaledRadius
} from "./curve-common.js";

const DEFAULT_WALL_STATE = {
  wallTypeTool: "walls",
  wallTypeBySegment: {},
  wallDataBySegment: {}
};
const MIN_REGION_ELLIPSE_SEGMENTS = 4;
const MAX_REGION_ELLIPSE_SEGMENTS = 96;
const REGION_ELLIPSE_SEGMENT_STEP = 1;

let regionConversionPreviewSession = null;
let creatingRegionIndyWalls = false;

export async function createIndyWallsFromRegions({
  MODULE_ID,
  getSegmentWallData,
  replaceShapeWalls
}={}) {
  if (!game.user?.isGM) return;
  if (creatingRegionIndyWalls) return;
  creatingRegionIndyWalls = true;

  try {
    const ellipseSegments = DEFAULT_ELLIPSE_SEGMENTS;
    const plan = getRegionConversionPlan({MODULE_ID, getSegmentWallData, ellipseSegments});
    if (!plan) return;
    showRegionConversionPreview(plan, {MODULE_ID, getSegmentWallData, replaceShapeWalls, ellipseSegments});
  } finally {
    creatingRegionIndyWalls = false;
  }
}

export function cancelRegionConversionPreview() {
  clearRegionConversionPreview();
}

async function commitRegionConversionPreview() {
  if (!regionConversionPreviewSession?.plan?.wallData?.length || !canvas?.scene) return;
  const {plan, replaceShapeWalls} = regionConversionPreviewSession;
  clearRegionConversionPreview();
  const state = {
    ...DEFAULT_WALL_STATE,
    replacingWallIds: new Set()
  };
  const created = await replaceShapeWalls(state, [], plan.wallData);
  ui.notifications.info(game.i18n.format("indy-walls.Notifications.RegionWallsCreated", {
    count: created.length,
    regions: plan.stats.regions,
    rectangles: plan.stats.rectangles,
    ellipses: plan.stats.ellipses,
    polylines: plan.stats.polylines
  }));
}

function getRegionConversionPlan({MODULE_ID, getSegmentWallData, ellipseSegments=DEFAULT_ELLIPSE_SEGMENTS}={}) {
  ellipseSegments = normalizeRegionEllipseSegments(ellipseSegments);
  if (!canvas?.scene) {
    ui.notifications.warn(game.i18n.localize("indy-walls.Notifications.SceneNotReady"));
    return null;
  }

  const regions = getTargetRegionDocuments();
  if (!regions.length) {
    ui.notifications.warn(game.i18n.localize("indy-walls.Notifications.NoRegionsToConvert"));
    return null;
  }

  const state = {
    ...DEFAULT_WALL_STATE,
    replacingWallIds: new Set()
  };
  const wallData = [];
  const existingWalls = getExistingSceneWallRecords();
  const stats = {
    regions: regions.length,
    rectangles: 0,
    ellipses: 0,
    polylines: 0,
    skipped: 0
  };

  for (const region of regions) {
    const shapes = getRegionDocumentShapes(region);
    const holes = shapes
      .map((shape) => regionShapeToObject(shape))
      .filter((shape) => shape && isRegionShapeHole(shape))
      .flatMap((shape) => getShapeClipContours(shape, ellipseSegments));

    for (const shape of shapes) {
      const data = regionShapeToObject(shape);
      if (!data || isRegionShapeHole(data)) continue;
      const converted = clipWallsByContours(
        buildWallsForRegionShape(data, {MODULE_ID, getSegmentWallData, state, ellipseSegments}),
        holes
      );
      const deduped = rejectExistingWallCandidates(converted, existingWalls);
      if (!deduped.length) {
        stats.skipped += 1;
        continue;
      }
      wallData.push(...deduped);
      const kind = deduped[0]?.flags?.[MODULE_ID]?.[RECTANGLE_FLAG] ? "rectangles"
        : deduped[0]?.flags?.[MODULE_ID]?.[ELLIPSE_FLAG] ? "ellipses"
          : "polylines";
      stats[kind] += 1;
    }
  }

  if (!wallData.length) {
    ui.notifications.warn(game.i18n.localize("indy-walls.Notifications.NoRegionShapesToConvert"));
    return null;
  }

  return {wallData, stats, ellipseSegments};
}

function showRegionConversionPreview(plan, {MODULE_ID, getSegmentWallData, replaceShapeWalls, ellipseSegments=DEFAULT_ELLIPSE_SEGMENTS}={}) {
  clearRegionConversionPreview();
  regionConversionPreviewSession = {
    MODULE_ID,
    getSegmentWallData,
    plan,
    replaceShapeWalls,
    ellipseSegments: normalizeRegionEllipseSegments(ellipseSegments),
    graphics: null,
    controls: null
  };
  drawRegionConversionPreview();
  renderRegionConversionPreviewControls();
}

function clearRegionConversionPreview() {
  clearRegionConversionPreviewGraphics();
  regionConversionPreviewSession?.controls?.remove?.();
  regionConversionPreviewSession = null;
}

function clearRegionConversionPreviewGraphics() {
  try {
    regionConversionPreviewSession?.graphics?.destroy?.();
  } catch (_error) {
    // The canvas may already be tearing down.
  }
  if (regionConversionPreviewSession) regionConversionPreviewSession.graphics = null;
}

function getRegionConversionPreviewGraphics() {
  if (!regionConversionPreviewSession || !canvas?.walls?.preview) return null;
  if (!regionConversionPreviewSession.graphics || regionConversionPreviewSession.graphics._destroyed) {
    regionConversionPreviewSession.graphics = new PIXI.Graphics();
    regionConversionPreviewSession.graphics._onDragEnd = () => {};
    canvas.walls.preview.addChild(regionConversionPreviewSession.graphics);
  } else if (!regionConversionPreviewSession.graphics.parent) {
    canvas.walls.preview.addChild(regionConversionPreviewSession.graphics);
  }
  return regionConversionPreviewSession.graphics;
}

function drawRegionConversionPreview() {
  const graphics = getRegionConversionPreviewGraphics();
  if (!graphics) return;
  graphics.clear();
  const style = getPreviewStyle();
  const vertices = new Map();
  for (const wall of regionConversionPreviewSession.plan.wallData) {
    const c = wall?.c;
    if (!Array.isArray(c) || c.length < 4) continue;
    graphics.lineStyle(getScaledRadius(style.wallWidth), style.wallColor, 0.88);
    graphics.moveTo(c[0], c[1]);
    graphics.lineTo(c[2], c[3]);
    addRegionPreviewVertex(vertices, c[0], c[1]);
    addRegionPreviewVertex(vertices, c[2], c[3]);
  }
  for (const point of vertices.values()) drawRegionPreviewVertex(graphics, point, style);
}

function addRegionPreviewVertex(vertices, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const key = `${Math.round(x)}:${Math.round(y)}`;
  if (!vertices.has(key)) vertices.set(key, {x, y});
}

function drawRegionPreviewVertex(graphics, point, style) {
  graphics.beginFill(style.vertexColor, 0.88);
  graphics.lineStyle(getScaledRadius(style.outlineWidth), style.wallColor, 0.75);
  graphics.drawCircle(point.x, point.y, getScaledRadius(style.vertexSize));
  graphics.endFill();
}

function renderRegionConversionPreviewControls() {
  if (!regionConversionPreviewSession) return;
  regionConversionPreviewSession.controls?.remove?.();

  const anchor = document.querySelector(`[data-tool="indyRegionsToIndyWalls"]`)
    ?? document.querySelector(`[data-control="regions"]`)
    ?? document.querySelector(`[data-control="region"]`);
  const anchorRect = anchor?.getBoundingClientRect?.();
  const controls = document.createElement("div");
  controls.className = "indy-walls-conversion-preview-controls";
  Object.assign(controls.style, {
    position: "fixed",
    left: `${Math.round(anchorRect?.right ?? 72) + 8}px`,
    top: `${Math.round(anchorRect?.top ?? 80)}px`,
    zIndex: 10000
  });

  const save = createRegionConversionControlButton("indy-walls.Controls.SaveConversionPreview", "fa-solid fa-check", () => commitRegionConversionPreview());
  const cancel = createRegionConversionControlButton("indy-walls.Controls.CancelConversionPreview", "fa-solid fa-xmark", () => cancelRegionConversionPreview());
  const actions = document.createElement("div");
  actions.className = "indy-walls-conversion-preview-actions";
  actions.append(save, cancel);

  const detail = createRegionDetailControl();
  controls.append(actions, detail);
  document.body.appendChild(controls);
  regionConversionPreviewSession.controls = controls;
}

function createRegionConversionControlButton(titleKey, icon, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.title = game.i18n.localize(titleKey);
  button.setAttribute("aria-label", button.title);
  button.innerHTML = `<i class="${icon}"></i>`;
  button.className = "indy-walls-conversion-preview-button";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

function createRegionDetailControl() {
  const row = document.createElement("div");
  row.className = "indy-walls-conversion-preview-tolerance-row";

  const text = document.createElement("span");
  text.className = "indy-walls-conversion-preview-tolerance-name";
  text.textContent = game.i18n.localize("indy-walls.Controls.RegionConversionDetail");

  const decrease = createRegionConversionControlButton("indy-walls.Controls.DecreaseSegments", "fa-solid fa-minus", () => adjustRegionConversionDetail(-REGION_ELLIPSE_SEGMENT_STEP));
  const increase = createRegionConversionControlButton("indy-walls.Controls.IncreaseSegments", "fa-solid fa-plus", () => adjustRegionConversionDetail(REGION_ELLIPSE_SEGMENT_STEP));

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(MIN_REGION_ELLIPSE_SEGMENTS);
  slider.max = String(MAX_REGION_ELLIPSE_SEGMENTS);
  slider.step = String(REGION_ELLIPSE_SEGMENT_STEP);
  slider.value = String(regionConversionPreviewSession?.ellipseSegments ?? DEFAULT_ELLIPSE_SEGMENTS);
  slider.title = game.i18n.localize("indy-walls.Tooltips.RegionConversionDetail");
  slider.addEventListener("input", () => setRegionConversionDetail(Number(slider.value), {updateSlider: false}));

  const value = document.createElement("span");
  value.textContent = String(regionConversionPreviewSession?.ellipseSegments ?? DEFAULT_ELLIPSE_SEGMENTS);
  value.className = "indy-walls-conversion-preview-tolerance";

  regionConversionPreviewSession.detailControls = {slider, value};
  row.append(text, decrease, slider, increase, value);
  return row;
}

function adjustRegionConversionDetail(delta) {
  setRegionConversionDetail((regionConversionPreviewSession?.ellipseSegments ?? DEFAULT_ELLIPSE_SEGMENTS) + delta);
}

function setRegionConversionDetail(value, {updateSlider=true}={}) {
  const session = regionConversionPreviewSession;
  if (!session) return;
  const next = normalizeRegionEllipseSegments(value);
  session.ellipseSegments = next;
  if (session.detailControls) {
    if (updateSlider) session.detailControls.slider.value = String(next);
    session.detailControls.value.textContent = String(next);
  }

  const plan = getRegionConversionPlan({
    MODULE_ID: session.MODULE_ID,
    getSegmentWallData: session.getSegmentWallData,
    ellipseSegments: next
  });
  if (!plan) {
    clearRegionConversionPreviewGraphics();
    session.plan = {wallData: [], stats: {regions: 0, rectangles: 0, ellipses: 0, polylines: 0}, ellipseSegments: next};
    return;
  }
  session.plan = plan;
  drawRegionConversionPreview();
}

function getTargetRegionDocuments() {
  const selected = getSelectedRegionDocuments();
  return selected.length ? selected : getAllRegionDocuments();
}

function getSelectedRegionDocuments() {
  const docs = [];
  const add = (region) => {
    const doc = region?.document ?? region;
    if (doc) docs.push(doc);
  };

  for (const region of getLayerPlaceables(canvas?.regions)) {
    if (region?.controlled === true || region?._controlled === true) add(region);
  }
  for (const region of collectionToArray(canvas?.regions?.controlled)) add(region);

  return uniqueDocuments(docs);
}

function getAllRegionDocuments() {
  const docs = [];
  for (const region of getLayerPlaceables(canvas?.regions)) docs.push(region?.document ?? region);
  for (const region of collectionToArray(canvas?.regions?.objects?.children)) docs.push(region?.document ?? region);
  for (const region of collectionToArray(canvas?.scene?.regions)) docs.push(region?.document ?? region);
  return uniqueDocuments(docs.filter(Boolean));
}

function getLayerPlaceables(layer) {
  const placeables = layer?.placeables;
  if (Array.isArray(placeables)) return placeables;
  if (typeof placeables?.values === "function") return Array.from(placeables.values());
  if (typeof layer?.objects?.children?.values === "function") return Array.from(layer.objects.children.values());
  if (Array.isArray(layer?.objects?.children)) return layer.objects.children;
  return [];
}

function collectionToArray(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (typeof collection.values === "function") return Array.from(collection.values());
  if (typeof collection[Symbol.iterator] === "function") return Array.from(collection);
  return [];
}

function uniqueDocuments(docs) {
  const seen = new Set();
  const out = [];
  for (const doc of docs) {
    const id = doc?.id ?? doc?._id ?? null;
    const key = id ?? out.length;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(doc);
  }
  return out;
}

function getRegionDocumentShapes(region) {
  const doc = region?.document ?? region;
  return Array.isArray(doc?.shapes) ? doc.shapes : [];
}

function buildWallsForRegionShape(shape, deps) {
  const data = regionShapeToObject(shape);
  if (!data || isRegionShapeInactive(data)) return [];
  const type = String(data.type ?? data.shape ?? data.kind ?? "").toLowerCase();

  if (type === "rectangle" || type === "rect") {
    const walls = buildRectangleWalls(data, deps);
    return walls.length ? walls : normalizeRegionShapeContours(data).flatMap((points) => buildPolylineWalls(points, deps));
  }
  if (type === "ellipse" || type === "oval" || type === "circle") {
    const walls = buildEllipseWalls(data, deps);
    return walls.length ? walls : normalizeRegionShapeContours(data).flatMap((points) => buildPolylineWalls(points, deps));
  }
  if (type === "polygon" || Array.isArray(data.points) || Array.isArray(data.contours) || Array.isArray(data.clipperPaths)) {
    return normalizeRegionShapeContours(data).flatMap((points) => buildPolylineWalls(points, deps));
  }
  return [];
}

function buildRectangleWalls(data, deps) {
  const bounds = normalizeRectBounds(data);
  if (!bounds) return [];

  const rotation = normalizeRotation(data);
  if (rotation) return buildPolylineWalls(getRotatedRectanglePoints(bounds, rotation), deps);

  const handles = [
    {x: bounds.minX, y: bounds.minY},
    {x: bounds.maxX, y: bounds.maxY}
  ];
  const sideSegments = {top: 1, right: 1, bottom: 1, left: 1};
  const sideRatios = getDefaultRectangleSideRatios();
  const sideEnabled = getDefaultRectangleSideEnabled();
  const sideGaps = getDefaultRectangleSideGaps();
  const rectangleId = foundry.utils.randomID();
  const segments = [
    {side: "top", index: 0, a: {x: bounds.minX, y: bounds.minY}, b: {x: bounds.maxX, y: bounds.minY}},
    {side: "right", index: 0, a: {x: bounds.maxX, y: bounds.minY}, b: {x: bounds.maxX, y: bounds.maxY}},
    {side: "bottom", index: 0, a: {x: bounds.maxX, y: bounds.maxY}, b: {x: bounds.minX, y: bounds.maxY}},
    {side: "left", index: 0, a: {x: bounds.minX, y: bounds.maxY}, b: {x: bounds.minX, y: bounds.minY}}
  ];

  return segments.map((segment, index) => {
    const wallData = deps.getSegmentWallData(deps.state, getRectangleSegmentKey(segment));
    return buildWallDocument(wallData, segment.a, segment.b, {
      [deps.MODULE_ID]: {
        [RECTANGLE_FLAG]: {
          rectangleId,
          index,
          side: segment.side,
          segmentIndex: segment.index,
          wallIds: [],
          handles: clonePoints(handles),
          sideSegments: {...sideSegments},
          sideRatios: cloneRectangleSideRatios(sideRatios),
          sideEnabled: cloneRectangleSideEnabled(sideEnabled),
          sideGaps: cloneRectangleSideGaps(sideGaps),
          wallTypeBySegment: {},
          wallDataBySegment: {},
          wallTypeTool: "walls"
        }
      }
    });
  }).filter(Boolean);
}

function buildEllipseWalls(data, deps) {
  const geometry = normalizeEllipseGeometry(data);
  if (!geometry) return [];

  const segments = normalizeRegionEllipseSegments(deps.ellipseSegments);
  const {cx, cy, rx, ry, rotation} = geometry;
  const handles = [
    {x: cx - rx, y: cy - ry},
    {x: cx + rx, y: cy + ry}
  ];
  const ellipseId = foundry.utils.randomID();
  const points = getEllipsePoints(cx, cy, rx, ry, rotation, segments);
  const walls = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const wallData = deps.getSegmentWallData(deps.state, String(i));
    walls.push(buildWallDocument(wallData, points[i], points[i + 1], {
      [deps.MODULE_ID]: {
        [ELLIPSE_FLAG]: {
          ellipseId,
          index: i,
          wallIds: [],
          handles: clonePoints(handles),
          segments,
          rotation,
          segmentGaps: [],
          wallTypeBySegment: {},
          wallDataBySegment: {},
          wallTypeTool: "walls"
        }
      }
    }));
  }

  return walls.filter(Boolean);
}

function buildPolylineWalls(points, deps) {
  const normalized = removeRepeatedClosingPoint(normalizeRegionShapePoints(points));
  if (normalized.length < 3) return [];

  const polylineId = foundry.utils.randomID();
  const walls = [];
  for (let i = 0; i < normalized.length; i += 1) {
    const a = normalized[i];
    const b = normalized[(i + 1) % normalized.length];
    const wallData = deps.getSegmentWallData(deps.state, String(i));
    walls.push(buildWallDocument(wallData, a, b, {
      [deps.MODULE_ID]: {
        [POLYLINE_FLAG]: {
          polylineId,
          index: i,
          wallIds: [],
          points: clonePoints(normalized),
          closed: true,
          segmentGaps: [],
          segmentCurves: {},
          curveSegments: DEFAULT_POLYLINE_CURVE_SEGMENTS,
          curveSegmentsBySegment: {},
          wallTypeBySegment: {},
          wallDataBySegment: {},
          wallTypeTool: "walls"
        }
      }
    }));
  }
  return walls.filter(Boolean);
}

function buildWallDocument(wallData, a, b, flags) {
  const c = [Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y)];
  if ((c[0] === c[2]) && (c[1] === c[3])) return null;
  return {
    ...wallData,
    c,
    flags: {
      ...(wallData.flags ?? {}),
      ...flags
    }
  };
}

function regionShapeToObject(shape) {
  if (!shape) return null;
  if (typeof shape.toObject === "function") {
    try {
      return shape.toObject();
    } catch (_err) {
      try {
        return shape.toObject(false);
      } catch (_err2) {
        return shape;
      }
    }
  }
  return shape;
}

function isRegionShapeInactive(shape) {
  const op = String(shape?.operation ?? shape?.op ?? shape?.mode ?? "").trim().toLowerCase();
  return shape?.disabled === true || shape?.active === false || op === "disabled";
}

function isRegionShapeHole(shape) {
  const op = String(shape?.operation ?? shape?.op ?? shape?.mode ?? "").trim().toLowerCase();
  return shape?.hole === true
    || shape?.isHole === true
    || shape?.negative === true
    || shape?.positive === false
    || op === "subtract"
    || op === "hole"
    || op === "difference";
}

function getShapeClipContours(shape, ellipseSegments=DEFAULT_ELLIPSE_SEGMENTS) {
  const type = String(shape.type ?? shape.shape ?? shape.kind ?? "").toLowerCase();
  if (type === "rectangle" || type === "rect") {
    const bounds = normalizeRectBounds(shape);
    return bounds ? [getRotatedRectanglePoints(bounds, normalizeRotation(shape))] : [];
  }
  if (type === "ellipse" || type === "oval" || type === "circle") {
    const geometry = normalizeEllipseGeometry(shape);
    return geometry
      ? [getEllipsePoints(
        geometry.cx,
        geometry.cy,
        geometry.rx,
        geometry.ry,
        geometry.rotation,
        normalizeRegionEllipseSegments(ellipseSegments)
      ).slice(0, -1)]
      : [];
  }
  return normalizeRegionShapeContours(shape);
}

function clipWallsByContours(walls, contours) {
  if (!contours.length) return walls;
  const kept = [];
  const removedIndexes = new Set();

  for (const wall of walls) {
    const index = getIndyShapeSegmentIndex(wall);
    if (isWallBlockedByContours(wall, contours)) {
      if (Number.isInteger(index)) removedIndexes.add(index);
      continue;
    }
    kept.push(wall);
  }

  applyRemovedShapeSegments(kept, removedIndexes);
  return kept;
}

function rejectExistingWallCandidates(walls, existingWalls) {
  if (!existingWalls.length) return walls;
  const kept = [];
  const removedIndexes = new Set();

  for (const wall of walls) {
    const index = getIndyShapeSegmentIndex(wall);
    if (existingWalls.some((existing) => isCandidateCoveredByExistingWall(wall, existing))) {
      if (Number.isInteger(index)) removedIndexes.add(index);
      continue;
    }
    kept.push(wall);
  }

  applyRemovedShapeSegments(kept, removedIndexes);
  return kept;
}

function getExistingSceneWallRecords() {
  const walls = canvas?.scene?.walls?.contents ?? Array.from(canvas?.scene?.walls ?? []);
  return walls
    .map((wall) => {
      const c = wall?.c ?? wall?.toObject?.()?.c;
      if (!Array.isArray(c) || c.length !== 4 || !c.every(Number.isFinite)) return null;
      return {
        a: {x: Number(c[0]), y: Number(c[1])},
        b: {x: Number(c[2]), y: Number(c[3])}
      };
    })
    .filter(Boolean);
}

function isCandidateCoveredByExistingWall(wall, existing, tolerance=1.5) {
  const c = wall?.c;
  if (!Array.isArray(c) || c.length < 4) return false;
  const a = {x: Number(c[0]), y: Number(c[1])};
  const b = {x: Number(c[2]), y: Number(c[3])};
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return false;

  if (pointsNear(a, existing.a, tolerance) && pointsNear(b, existing.b, tolerance)) return true;
  if (pointsNear(a, existing.b, tolerance) && pointsNear(b, existing.a, tolerance)) return true;
  return pointNearSegment(a, existing.a, existing.b, tolerance)
    && pointNearSegment(b, existing.a, existing.b, tolerance)
    && areSegmentsNearlyCollinear(a, b, existing.a, existing.b, tolerance);
}

function isWallBlockedByContours(wall, contours) {
  const c = wall?.c;
  if (!Array.isArray(c) || c.length < 4) return false;
  const a = {x: c[0], y: c[1]};
  const b = {x: c[2], y: c[3]};
  const mid = interpolatePoint(a, b, 0.5);
  if (contours.some((contour) => pointInPolygon(mid, contour))) return true;

  for (const contour of contours) {
    for (let i = 0; i < contour.length; i += 1) {
      const p = contour[i];
      const q = contour[(i + 1) % contour.length];
      const t = getSegmentIntersectionParameter(a, b, p, q);
      if (Number.isFinite(t) && t > 0.000001 && t < 0.999999) return true;
    }
  }

  return false;
}

function getIndyShapeSegmentIndex(wall) {
  const moduleFlags = wall?.flags?.["indy-walls"];
  const flag = moduleFlags?.[ELLIPSE_FLAG] ?? moduleFlags?.[POLYLINE_FLAG] ?? moduleFlags?.[RECTANGLE_FLAG];
  const index = Number(flag?.index);
  return Number.isInteger(index) ? index : null;
}

function applyRemovedShapeSegments(walls, removedIndexes) {
  if (!removedIndexes.size) return;
  const gaps = [...removedIndexes].sort((a, b) => a - b);

  for (const wall of walls) {
    const moduleFlags = wall?.flags?.["indy-walls"];
    if (moduleFlags?.[ELLIPSE_FLAG]) {
      moduleFlags[ELLIPSE_FLAG].segmentGaps = gaps;
    } else if (moduleFlags?.[POLYLINE_FLAG]) {
      moduleFlags[POLYLINE_FLAG].segmentGaps = gaps;
    }
  }
}

function getSegmentIntersectionParameter(a, b, p, q) {
  const r = {x: b.x - a.x, y: b.y - a.y};
  const s = {x: q.x - p.x, y: q.y - p.y};
  const denominator = cross(r, s);
  if (Math.abs(denominator) < 0.000001) return null;

  const ap = {x: p.x - a.x, y: p.y - a.y};
  const t = cross(ap, s) / denominator;
  const u = cross(ap, r) / denominator;
  if (t < -0.000001 || t > 1.000001 || u < -0.000001 || u > 1.000001) return null;
  return t;
}

function cross(a, b) {
  return (a.x * b.y) - (a.y * b.x);
}

function interpolatePoint(a, b, t) {
  return {
    x: a.x + ((b.x - a.x) * t),
    y: a.y + ((b.y - a.y) * t)
  };
}

function pointsNear(a, b, tolerance) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
}

function pointNearSegment(point, a, b, tolerance) {
  const projection = getPointProjectionOnSegment(point, a, b);
  if (!projection || projection.t < -0.000001 || projection.t > 1.000001) return false;
  return Math.hypot(point.x - projection.point.x, point.y - projection.point.y) <= tolerance;
}

function getPointProjectionOnSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = (dx * dx) + (dy * dy);
  if (lengthSquared <= 0.000001) return null;
  const t = (((point.x - a.x) * dx) + ((point.y - a.y) * dy)) / lengthSquared;
  return {
    t,
    point: {
      x: a.x + (dx * t),
      y: a.y + (dy * t)
    }
  };
}

function areSegmentsNearlyCollinear(a, b, p, q, tolerance) {
  const candidateLength = Math.hypot(b.x - a.x, b.y - a.y);
  const existingLength = Math.hypot(q.x - p.x, q.y - p.y);
  if (candidateLength <= 0.000001 || existingLength <= 0.000001) return false;
  const areaA = Math.abs(cross({x: b.x - a.x, y: b.y - a.y}, {x: p.x - a.x, y: p.y - a.y})) / candidateLength;
  const areaB = Math.abs(cross({x: b.x - a.x, y: b.y - a.y}, {x: q.x - a.x, y: q.y - a.y})) / candidateLength;
  return areaA <= tolerance && areaB <= tolerance;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersects = ((pi.y > point.y) !== (pj.y > point.y))
      && (point.x < (((pj.x - pi.x) * (point.y - pi.y)) / ((pj.y - pi.y) || 1e-9)) + pi.x);
    if (intersects) inside = !inside;
  }
  return inside;
}

function normalizeRegionShapeContours(shape) {
  const clipperContours = normalizeClipperShapeContours(shape);
  if (clipperContours.length) return clipperContours;

  const rawPoints = Array.isArray(shape?.points) ? shape.points : [];
  const pointsAreContours = Array.isArray(rawPoints[0]) || Array.isArray(rawPoints[0]?.points);
  const rawContours = Array.isArray(shape?.contours)
    ? shape.contours
    : (pointsAreContours
      ? rawPoints
      : (Array.isArray(shape?.holes) ? [shape.points, ...shape.holes] : []));

  const contours = rawContours
    .map((contour) => normalizeRegionShapePoints(Array.isArray(contour?.points) ? contour.points : contour))
    .filter((contour) => contour.length >= 3);
  if (contours.length) return contours;

  const points = normalizeRegionShapePoints(shape);
  return points.length >= 3 ? [points] : [];
}

function normalizeRegionShapePoints(shape) {
  const raw = Array.isArray(shape) ? shape : (Array.isArray(shape?.points) ? shape.points : []);
  if (!raw.length) return [];
  if (typeof raw[0] === "number") {
    const out = [];
    for (let i = 0; i + 1 < raw.length; i += 2) {
      const x = Number(raw[i]);
      const y = Number(raw[i + 1]);
      if (Number.isFinite(x) && Number.isFinite(y)) out.push({x, y});
    }
    return out;
  }
  return raw
    .map((point) => ({x: Number(point?.x), y: Number(point?.y)}))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function normalizeClipperShapeContours(shape) {
  const paths = Array.isArray(shape?.clipperPaths) ? shape.clipperPaths : [];
  if (!paths.length) return [];
  const scale = Number(globalThis.CONST?.CLIPPER_SCALING_FACTOR) || 1;
  return paths
    .map((path) => {
      if (!Array.isArray(path)) return [];
      return path
        .map((point) => {
          const x = Number(point?.X ?? point?.x);
          const y = Number(point?.Y ?? point?.y);
          return {x: x / scale, y: y / scale};
        })
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    })
    .filter((contour) => contour.length >= 3);
}

function normalizeRectBounds(shape) {
  const bounds = shape?.bounds ?? {};
  const x1 = readShapeNumber(shape, ["x1", "left", "minX"], readShapeNumber(bounds, ["x", "left", "minX"]));
  const y1 = readShapeNumber(shape, ["y1", "top", "minY"], readShapeNumber(bounds, ["y", "top", "minY"]));
  const x = readShapeNumber(shape, ["x"], x1);
  const y = readShapeNumber(shape, ["y"], y1);
  const width = readShapeNumber(shape, ["width", "w"], readShapeNumber(bounds, ["width", "w"]));
  const height = readShapeNumber(shape, ["height", "h"], readShapeNumber(bounds, ["height", "h"]));
  const x2 = readShapeNumber(shape, ["x2", "right", "maxX"], Number.isFinite(width) ? x + width : NaN);
  const y2 = readShapeNumber(shape, ["y2", "bottom", "maxY"], Number.isFinite(height) ? y + height : NaN);
  if (![x, y, x2, y2].every(Number.isFinite)) return null;
  return {
    minX: Math.min(x, x2),
    minY: Math.min(y, y2),
    maxX: Math.max(x, x2),
    maxY: Math.max(y, y2)
  };
}

function normalizeEllipseGeometry(shape) {
  const radius = readShapeNumber(shape, ["radius", "r"]);
  const radiusX = readShapeNumber(shape, ["radiusX", "rx"], radius);
  const radiusY = readShapeNumber(shape, ["radiusY", "ry"], radius);
  if (Number.isFinite(radiusX) && Number.isFinite(radiusY) && radiusX > 0 && radiusY > 0) {
    const cx = readShapeNumber(shape, ["centerX", "cx"], readShapeNumber(shape, ["x"]));
    const cy = readShapeNumber(shape, ["centerY", "cy"], readShapeNumber(shape, ["y"]));
    if (Number.isFinite(cx) && Number.isFinite(cy)) {
      return {cx, cy, rx: radiusX, ry: radiusY, rotation: normalizeRotation(shape)};
    }
  }

  const bounds = normalizeRectBounds(shape);
  if (!bounds) return null;
  return {
    cx: (bounds.minX + bounds.maxX) * 0.5,
    cy: (bounds.minY + bounds.maxY) * 0.5,
    rx: Math.abs(bounds.maxX - bounds.minX) * 0.5,
    ry: Math.abs(bounds.maxY - bounds.minY) * 0.5,
    rotation: normalizeRotation(shape)
  };
}

function readShapeNumber(shape, names, fallback=NaN) {
  for (const name of names) {
    const value = Number(shape?.[name]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function normalizeRotation(shape) {
  const raw = readShapeNumber(shape, ["rotation", "angle"], 0);
  if (!Number.isFinite(raw)) return 0;
  return Math.abs(raw) > (Math.PI * 2) ? raw * (Math.PI / 180) : raw;
}

function getRotatedRectanglePoints(bounds, rotation) {
  const cx = (bounds.minX + bounds.maxX) * 0.5;
  const cy = (bounds.minY + bounds.maxY) * 0.5;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return [
    {x: bounds.minX, y: bounds.minY},
    {x: bounds.maxX, y: bounds.minY},
    {x: bounds.maxX, y: bounds.maxY},
    {x: bounds.minX, y: bounds.maxY}
  ].map((point) => {
    const dx = point.x - cx;
    const dy = point.y - cy;
    return {
      x: cx + (dx * cos) - (dy * sin),
      y: cy + (dx * sin) + (dy * cos)
    };
  });
}

function getEllipsePoints(cx, cy, rx, ry, rotation, segments) {
  const cosRotation = Math.cos(rotation);
  const sinRotation = Math.sin(rotation);
  const points = [];

  for (let i = 0; i <= segments; i += 1) {
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

function removeRepeatedClosingPoint(points) {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points.at(-1);
  if (Math.hypot(first.x - last.x, first.y - last.y) < 0.5) return points.slice(0, -1);
  return points;
}

function normalizeRegionEllipseSegments(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return DEFAULT_ELLIPSE_SEGMENTS;
  return Math.max(MIN_REGION_ELLIPSE_SEGMENTS, Math.min(MAX_REGION_ELLIPSE_SEGMENTS, number));
}
