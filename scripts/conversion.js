import {
  clamp,
  clonePoints,
  getCubicBezierPoint,
  getScaledRadius
} from "./curve-common.js";
import {getPreviewStyle} from "./preview-style.js";
import {getClientInteractionPoint} from "./interaction.js";
import {cloneWallTypeBySegment} from "./editor-session.js";
import {ELLIPSE_FLAG} from "./shapes/ellipse.js";
import {
  cloneRectangleSideEnabled,
  cloneRectangleSideGaps,
  cloneRectangleSideRatios,
  getRectangleSegmentKey,
  RECTANGLE_FLAG
} from "./shapes/rectangle.js";
import {
  clonePolylineCurveSegmentsBySegment,
  clonePolylineSegmentCurves,
  DEFAULT_POLYLINE_CURVE_SEGMENTS,
  POLYLINE_FLAG,
  POLYLINE_SEGMENT_ARC,
  POLYLINE_SEGMENT_BEZIER
} from "./shapes/polyline.js";
import {CUBIC_FLAG} from "./shapes/cubic.js";
import {
  cloneWallDataBySegment,
  getPreservedWallDataFromDocument
} from "./wall-preservation.js";
import {getWallTypeToolFromDocument} from "./wall-types.js";
import {
  compactWallShapeMetadata,
  getShapeMetadataEntriesFromWallData,
  mergeSceneShapeMetadata
} from "./shape-metadata.js";

const MODULE_ID = "indy-walls";
const LEGACY_CONVERSION_TOLERANCE_SETTING = "conversionTolerance";
const RECTANGLE_CONVERSION_TOLERANCE_SETTING = "rectangleConversionTolerance";
const ELLIPSE_CONVERSION_TOLERANCE_SETTING = "ellipseConversionTolerance";
const ARC_CONVERSION_TOLERANCE_SETTING = "arcConversionTolerance";
const BEZIER_CONVERSION_TOLERANCE_SETTING = "bezierConversionTolerance";
const CONVERSION_TOLERANCE_CONFIG = {
  rectangle: {
    setting: RECTANGLE_CONVERSION_TOLERANCE_SETTING,
    label: "indy-walls.Controls.RectangleConversionTolerance",
    title: "indy-walls.Settings.RectangleConversionTolerance.Name"
  },
  ellipse: {
    setting: ELLIPSE_CONVERSION_TOLERANCE_SETTING,
    label: "indy-walls.Controls.EllipseConversionTolerance",
    title: "indy-walls.Settings.EllipseConversionTolerance.Name"
  },
  arc: {
    setting: ARC_CONVERSION_TOLERANCE_SETTING,
    label: "indy-walls.Controls.ArcConversionTolerance",
    title: "indy-walls.Settings.ArcConversionTolerance.Name"
  },
  bezier: {
    setting: BEZIER_CONVERSION_TOLERANCE_SETTING,
    label: "indy-walls.Controls.BezierConversionTolerance",
    title: "indy-walls.Settings.BezierConversionTolerance.Name"
  }
};
const CONVERSION_FIT_TOLERANCE_PIXEL_CAPS = {
  arc: 24,
  bezier: 32
};
const ELLIPSE_ROTATION_SWEEP_ERROR_MULTIPLIER = 10;
const RECTANGLE_BRUTE_FORCE_BOUNDS_LIMIT = 100000;

let convertingToIndyWalls = false;
let conversionPreviewSession = null;
let conversionPreviewRedrawTimeout = null;
const pendingConversionToleranceSettingSaves = new Map();
let activeConversionTiming = null;

export async function convertSceneWallsToIndyWalls() {
  if (!game.user.isGM || !canvas?.scene) return;
  if (convertingToIndyWalls) return;
  convertingToIndyWalls = true;

  try {
    const plan = getSceneWallConversionPlan();
    if (!plan?.updates.length) {
      ui.notifications?.info(game.i18n.localize("indy-walls.Notifications.NoWallsToConvert"));
      return;
    }

    logConversionTiming("plan", plan.timing);
    showConversionPreview(plan);
  } finally {
    convertingToIndyWalls = false;
  }
}

export async function commitConversionPreview() {
  if (!conversionPreviewSession?.plan?.updates?.length || !canvas?.scene) return;
  flushScheduledConversionPreviewRedraw();
  const plan = conversionPreviewSession.plan;
  clearConversionPreview();
  const timing = createConversionTiming();
  const wallData = [...(plan.updates ?? []), ...(plan.creates ?? [])];
  const metadataEntries = measureConversionTiming(timing, "metadata.extract", () => getShapeMetadataEntriesFromWallData(wallData, MODULE_ID));
  await measureConversionTimingAsync(timing, "metadata.mergeSceneFlag", () => mergeSceneShapeMetadata(canvas.scene, MODULE_ID, metadataEntries));
  const updates = measureConversionTiming(timing, "metadata.compactWallFlags", () => (plan.updates ?? []).map((update) => {
    const data = foundry.utils.deepClone(update);
    compactWallShapeMetadata(data, MODULE_ID);
    return data;
  }));
  const creates = measureConversionTiming(timing, "metadata.compactNewWallFlags", () => (plan.creates ?? []).map((create) => {
    const data = foundry.utils.deepClone(create);
    compactWallShapeMetadata(data, MODULE_ID);
    return data;
  }));
  const deletes = plan.deletes ?? [];
  if (deletes.length) await measureConversionTimingAsync(timing, "foundry.deleteWalls", () => canvas.scene.deleteEmbeddedDocuments("Wall", deletes));
  if (updates.length) await measureConversionTimingAsync(timing, "foundry.updateWalls", () => canvas.scene.updateEmbeddedDocuments("Wall", updates));
  if (creates.length) await measureConversionTimingAsync(timing, "foundry.createWalls", () => canvas.scene.createEmbeddedDocuments("Wall", creates));
  logConversionTiming("commit", {
    ...timing,
    counts: {
      updates: plan.updates.length,
      creates: plan.creates?.length ?? 0,
      deletes: deletes.length,
      metadataEntries: Object.keys(metadataEntries ?? {}).length
    }
  });
  ui.notifications?.info(game.i18n.format("indy-walls.Notifications.WallsConvertedToIndy", {
    count: plan.updates.length + (plan.creates?.length ?? 0),
    rectangles: plan.rectangleGroups.length,
    ellipses: plan.ellipseGroups.length,
    polylines: plan.polylineGroups.length
  }));
}

function createConversionTiming() {
  return {
    startedAt: getConversionNow(),
    timings: {},
    counts: {}
  };
}

function getConversionNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function measureConversionTiming(timing, key, fn) {
  const started = getConversionNow();
  try {
    return fn();
  } finally {
    addConversionTiming(timing, key, getConversionNow() - started);
  }
}

async function measureConversionTimingAsync(timing, key, fn) {
  const started = getConversionNow();
  try {
    return await fn();
  } finally {
    addConversionTiming(timing, key, getConversionNow() - started);
  }
}

function measureActiveConversionTiming(key, fn) {
  if (!activeConversionTiming) return fn();
  return measureConversionTiming(activeConversionTiming, key, fn);
}

function addConversionTiming(timing, key, elapsed) {
  if (!timing || !Number.isFinite(elapsed)) return;
  timing.timings[key] = (timing.timings[key] ?? 0) + elapsed;
}

function logConversionTiming(stage, timing) {
  if (!timing) return;
  const timings = Object.fromEntries(Object.entries(timing.timings ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => [key, roundTiming(value)]));
  const totalMs = roundTiming(getConversionNow() - (timing.startedAt ?? getConversionNow()));
  const metadataMs = roundTiming(Object.entries(timing.timings ?? {})
    .filter(([key]) => key.startsWith("metadata."))
    .reduce((sum, [, value]) => sum + value, 0));
  console.debug(`${MODULE_ID} | conversion timing`, {
    stage,
    totalMs,
    metadataMs,
    timings,
    counts: timing.counts ?? {}
  });
}

function roundTiming(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function cancelConversionPreview() {
  clearConversionPreview();
}

export function redrawConversionPreview() {
  if (!conversionPreviewSession) return;
  const plan = getSceneWallConversionPlan(conversionPreviewSession.candidates);
  if (!plan?.updates.length) {
    clearConversionPreviewGraphics();
    conversionPreviewSession.plan = plan;
    return;
  }
  conversionPreviewSession.plan = plan;
  drawConversionPreview(plan);
}

function getSceneWallConversionPlan(baseCandidates=null) {
  const previousTiming = activeConversionTiming;
  const timing = createConversionTiming();
  activeConversionTiming = timing;
  try {
    const candidates = measureConversionTiming(timing, "candidates", () => getPlainWallConversionCandidates(baseCandidates));
    timing.counts.candidates = candidates.length;
    if (!candidates.length) return null;

    const rectangleGroups = measureConversionTiming(timing, "rectangles.detect", () => detectRectangleConversionGroups(candidates));
    timing.counts.rectangles = rectangleGroups.length;
    debugRectangleConversionGroups(rectangleGroups);
    const usedIds = new Set(rectangleGroups.flatMap((group) => group.records.map((record) => record.wall.id)));
    const remaining = measureConversionTiming(timing, "rectangles.filterRemaining", () => candidates.filter((candidate) => !usedIds.has(candidate.wall.id)));
    timing.counts.remaining = remaining.length;
    const polylineBaseGroups = measureConversionTiming(timing, "polylines.group", () => detectPolylineConversionGroups(remaining));
    timing.counts.polylineBaseGroups = polylineBaseGroups.length;
    const refinedPolylines = measureConversionTiming(timing, "polylines.refine", () => refineConvertedPolylineGroups(polylineBaseGroups));
    timing.counts.ellipses = refinedPolylines.ellipseGroups.length;
    timing.counts.polylines = refinedPolylines.polylineGroups.length;
    const rectangleWallData = measureConversionTiming(timing, "rectangles.updates.build", () => rectangleGroups.flatMap((group) => buildRectangleConversionUpdates(group)));
    const updates = measureConversionTiming(timing, "updates.build", () => [
      ...rectangleWallData.filter((data) => !data._create),
      ...refinedPolylines.ellipseGroups.flatMap((group) => buildEllipseConversionUpdates(group)),
      ...refinedPolylines.polylineGroups.flatMap((group) => buildPolylineConversionUpdates(group))
    ]);
    const creates = rectangleWallData.filter((data) => data._create).map(({_create, ...data}) => data);
    const deletes = [...new Set(rectangleGroups.flatMap((group) => group.deleteWallIds ?? []))];
    timing.counts.updates = updates.length;
    timing.counts.creates = creates.length;
    timing.counts.deletes = deletes.length;

    return {
      updates,
      creates,
      deletes,
      rectangleGroups,
      ellipseGroups: refinedPolylines.ellipseGroups,
      polylineGroups: refinedPolylines.polylineGroups,
      timing
    };
  } finally {
    activeConversionTiming = previousTiming;
  }
}

function debugRectangleConversionGroups(groups) {
  if (!isConversionDebugEnabled()) return;
  console.debug(`${MODULE_ID} | rectangle conversion groups`, groups.map((group, index) => ({
    index,
    bounds: getRectangleGroupBounds(group),
    records: group.records.map((record) => ({
      id: record.wall.id,
      side: record.side,
      index: record.index,
      c: record.wall.c
    })),
    sideSegments: group.sideSegments,
    sideRatios: group.sideRatios,
    sideGaps: group.sideGaps
  })));
}

function getRectangleGroupBounds(group) {
  const [a, b] = group.handles ?? [];
  if (!a || !b) return null;
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y)
  };
}

function isConversionDebugEnabled() {
  try {
    return game?.settings?.get?.(MODULE_ID, "debugShapeSelection") === true;
  } catch (_error) {
    return false;
  }
}

function showConversionPreview(plan) {
  clearConversionPreview();
  conversionPreviewSession = {
    plan,
    candidates: getPlainWallConversionBaseCandidates(),
    toleranceOverrides: {},
    graphics: null,
    controls: null,
    hoveredGroupId: null
  };
  drawConversionPreview(plan);
  renderConversionPreviewControls();
  window.addEventListener("pointermove", handleConversionPreviewPointerMove, {capture: true});
  window.addEventListener("pointerleave", handleConversionPreviewPointerLeave, {capture: true});
}

function clearConversionPreview() {
  clearScheduledConversionPreviewRedraw();
  flushPendingConversionToleranceSettingSaves();
  window.removeEventListener("pointermove", handleConversionPreviewPointerMove, {capture: true});
  window.removeEventListener("pointerleave", handleConversionPreviewPointerLeave, {capture: true});
  clearConversionPreviewGraphics();
  conversionPreviewSession?.controls?.remove?.();
  conversionPreviewSession = null;
}

function clearConversionPreviewGraphics() {
  try {
    conversionPreviewSession?.graphics?.destroy?.();
  } catch (_error) {
    // The canvas may have already torn down the PIXI object.
  }
  if (conversionPreviewSession) conversionPreviewSession.graphics = null;
}

function drawConversionPreview(plan) {
  const graphics = getConversionPreviewGraphics();
  if (!graphics) return;

  graphics.clear();
  const style = getPreviewStyle();
  plan.rectangleGroups.forEach((group, index) => drawRectangleConversionPreview(graphics, group, style, getConversionPreviewGroupAlpha(`rectangle:${index}`)));
  plan.ellipseGroups.forEach((group, index) => drawEllipseConversionPreview(graphics, group, style, getConversionPreviewGroupAlpha(`ellipse:${index}`)));
  plan.polylineGroups.forEach((group, index) => drawPolylineConversionPreview(graphics, group, style, getConversionPreviewGroupAlpha(`polyline:${index}`)));
}

function getConversionPreviewGraphics() {
  if (!conversionPreviewSession || !canvas?.walls?.preview) return null;
  if (!conversionPreviewSession.graphics || conversionPreviewSession.graphics._destroyed) {
    conversionPreviewSession.graphics = new PIXI.Graphics();
    conversionPreviewSession.graphics._onDragEnd = () => {};
    canvas.walls.preview.addChild(conversionPreviewSession.graphics);
  } else if (!conversionPreviewSession.graphics.parent) {
    canvas.walls.preview.addChild(conversionPreviewSession.graphics);
  }
  return conversionPreviewSession.graphics;
}

function getConversionPreviewGroupAlpha(groupId) {
  const hovered = conversionPreviewSession?.hoveredGroupId;
  return hovered && hovered !== groupId ? 0.22 : 0.88;
}

function drawRectangleConversionPreview(graphics, group, style, alpha=0.88) {
  const coordinates = getConvertedRectangleWallCoordinates(group);
  for (const record of group.records) drawWallCoordinatePreview(graphics, coordinates[getRectangleSegmentKey(record)] ?? record.wall.c, style, alpha);
  const [a, b] = group.handles;
  const corners = [
    {x: a.x, y: a.y},
    {x: b.x, y: a.y},
    {x: b.x, y: b.y},
    {x: a.x, y: b.y}
  ];
  for (const corner of corners) drawConversionEndpoint(graphics, corner, style, alpha);
  drawConversionMoveHandle(graphics, getConversionPointsCenter(corners), style, alpha);
}

function drawEllipseConversionPreview(graphics, group, style, alpha=0.88) {
  for (const coords of getConvertedEllipseWallCoordinates(group)) drawWallCoordinatePreview(graphics, coords, style, alpha);
  const [a, b] = group.handles;
  drawConversionEndpoint(graphics, a, style, alpha);
  drawConversionEndpoint(graphics, b, style, alpha);
  drawConversionMoveHandle(graphics, getConversionPointsCenter([a, b]), style, alpha);
  const points = getConvertedEllipsePoints(group);
  for (let index = 0; index < points.length - 1; index++) drawConversionVertex(graphics, points[index], style, alpha);
}

function drawPolylineConversionPreview(graphics, group, style, alpha=0.88) {
  const segmentCount = group.closed ? group.points.length : Math.max(group.points.length - 1, 0);
  for (let index = 0; index < segmentCount; index++) {
    const a = group.points[index];
    const b = group.points[index + 1] ?? group.points[0];
    const curve = group.segmentCurves?.[String(index)];
    const points = getCachedConvertedPolylineSegmentPoints(group, index, a, b, curve);
    graphics.lineStyle(getScaledRadius(style.wallWidth), style.wallColor, alpha);
    graphics.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) graphics.lineTo(point.x, point.y);
    for (const point of points.slice(1, -1)) drawSmallConversionVertex(graphics, point, style, alpha);

    if (curve?.mode === POLYLINE_SEGMENT_ARC && curve.handles?.[0]) {
      graphics.lineStyle(getScaledRadius(style.guideWidth), style.wallColor, alpha * 0.52);
      graphics.moveTo(a.x, a.y);
      graphics.lineTo(curve.handles[0].x, curve.handles[0].y);
      graphics.lineTo(b.x, b.y);
      drawConversionBezierHandle(graphics, curve.handles[0], style, alpha);
    } else if (curve?.mode === POLYLINE_SEGMENT_BEZIER && curve.handles?.length >= 2) {
      graphics.lineStyle(getScaledRadius(style.guideWidth), style.wallColor, alpha * 0.52);
      graphics.moveTo(a.x, a.y);
      graphics.lineTo(curve.handles[0].x, curve.handles[0].y);
      graphics.moveTo(b.x, b.y);
      graphics.lineTo(curve.handles[1].x, curve.handles[1].y);
      drawConversionBezierHandle(graphics, curve.handles[0], style, alpha);
      drawConversionBezierHandle(graphics, curve.handles[1], style, alpha);
    }
  }

  for (const point of group.points) drawConversionVertex(graphics, point, style, alpha);
  if (group.points.length > 1) drawConversionMoveHandle(graphics, getConversionPointsCenter(group.points), style, alpha);
}

function drawWallCoordinatePreview(graphics, coords, style, alpha=0.88) {
  if (!Array.isArray(coords) || coords.length < 4) return;
  graphics.lineStyle(getScaledRadius(style.wallWidth), style.wallColor, alpha);
  graphics.moveTo(coords[0], coords[1]);
  graphics.lineTo(coords[2], coords[3]);
}

function drawSmallConversionVertex(graphics, point, style, alpha=0.88) {
  const radius = getScaledRadius(Math.max(style.vertexSize * 0.55, 2));
  const outlineWidth = getScaledRadius(Math.max(style.outlineWidth * 0.6, 0.75));
  graphics.beginFill(style.vertexColor, alpha * 0.88);
  graphics.lineStyle(outlineWidth, style.wallColor, alpha * 0.74);
  graphics.drawCircle(point.x, point.y, radius);
  graphics.endFill();
}

function drawConversionVertex(graphics, point, style, alpha=0.88) {
  drawConversionCircle(graphics, point, style.vertexColor, style.vertexSize, style.outlineColor, style.outlineWidth, alpha);
}

function drawConversionEndpoint(graphics, point, style, alpha=0.88) {
  drawConversionCircle(graphics, point, style.endpointColor, style.endpointSize, style.outlineColor, style.outlineWidth, alpha);
}

function drawConversionBezierHandle(graphics, point, style, alpha=0.88) {
  drawConversionCircle(graphics, point, style.handleColor, style.handleSize, style.outlineColor, style.outlineWidth, alpha);
}

function drawConversionMoveHandle(graphics, point, style, alpha=0.88) {
  drawConversionCircle(graphics, point, style.moveHandleColor, style.moveHandleSize, style.outlineColor, style.outlineWidth, alpha);
}

function drawConversionCircle(graphics, point, color, radius, outlineColor, outlineWidth, alpha=0.88) {
  graphics.beginFill(color, alpha * 0.95);
  graphics.lineStyle(getScaledRadius(outlineWidth), outlineColor, alpha * 0.9);
  graphics.drawCircle(point.x, point.y, getScaledRadius(radius));
  graphics.endFill();
}

function getConvertedEllipsePoints(group) {
  if (group._convertedEllipsePoints) return group._convertedEllipsePoints;
  const [a, b] = group.handles;
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const rx = Math.abs(b.x - a.x) / 2;
  const ry = Math.abs(b.y - a.y) / 2;
  const rotation = Number(group.rotation) || 0;
  const points = [];
  for (let index = 0; index <= group.segments; index++) {
    const angle = (Math.PI * 2 * index) / group.segments;
    const x = Math.cos(angle) * rx;
    const y = Math.sin(angle) * ry;
    points.push({
      x: cx + (x * Math.cos(rotation)) - (y * Math.sin(rotation)),
      y: cy + (x * Math.sin(rotation)) + (y * Math.cos(rotation))
    });
  }
  group._convertedEllipsePoints = points;
  return points;
}

function getConvertedPolylineSegmentPoints(a, b, curve, subdivisions=DEFAULT_POLYLINE_CURVE_SEGMENTS) {
  const count = Math.max(Number(subdivisions) || DEFAULT_POLYLINE_CURVE_SEGMENTS, 1);
  if (curve?.mode !== POLYLINE_SEGMENT_ARC && curve?.mode !== POLYLINE_SEGMENT_BEZIER) return [a, b];

  const points = [];
  for (let step = 0; step <= count; step++) {
    const t = step / count;
    points.push(curve.mode === POLYLINE_SEGMENT_BEZIER && curve.handles?.length >= 2
      ? getCubicBezierPoint(a, curve.handles[0], curve.handles[1], b, t)
      : getQuadraticBezierPoint(a, curve.handles?.[0] ?? getConversionPointsCenter([a, b]), b, t));
  }
  return points;
}

function getCachedConvertedPolylineSegmentPoints(group, index, a, b, curve) {
  const key = String(index);
  group._convertedPolylineSegmentPoints ??= {};
  if (!group._convertedPolylineSegmentPoints[key]) {
    group._convertedPolylineSegmentPoints[key] = getConvertedPolylineSegmentPoints(a, b, curve, group.curveSegmentsBySegment?.[key]);
  }
  return group._convertedPolylineSegmentPoints[key];
}

function getConversionPointsCenter(points) {
  const bounds = points.reduce((result, point) => ({
    minX: Math.min(result.minX, point.x),
    minY: Math.min(result.minY, point.y),
    maxX: Math.max(result.maxX, point.x),
    maxY: Math.max(result.maxY, point.y)
  }), {
    minX: points[0]?.x ?? 0,
    minY: points[0]?.y ?? 0,
    maxX: points[0]?.x ?? 0,
    maxY: points[0]?.y ?? 0
  });
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2
  };
}

function renderConversionPreviewControls() {
  if (!conversionPreviewSession) return;
  conversionPreviewSession.controls?.remove?.();

  const toolSelector = getConversionToolSelectorValue();
  const anchor = document.querySelector(`[data-tool="${toolSelector}"]`)
    ?? document.querySelector(`[data-control="${toolSelector}"]`);
  const anchorRect = anchor?.getBoundingClientRect?.();
  const controls = document.createElement("div");
  controls.className = "indy-walls-conversion-preview-controls";
  Object.assign(controls.style, {
    position: "fixed",
    left: `${Math.round(anchorRect?.right ?? 72) + 8}px`,
    top: `${Math.round(anchorRect?.top ?? 80)}px`,
    zIndex: 10000
  });

  const save = createConversionControlButton("indy-walls.Controls.SaveConversionPreview", "fa-solid fa-check", () => commitConversionPreview());
  const cancel = createConversionControlButton("indy-walls.Controls.CancelConversionPreview", "fa-solid fa-xmark", () => cancelConversionPreview());
  const actions = document.createElement("div");
  actions.className = "indy-walls-conversion-preview-actions";
  actions.append(save, cancel);

  const tolerances = document.createElement("div");
  tolerances.className = "indy-walls-conversion-preview-tolerances";
  controls._indyWallsToleranceControls = {};
  for (const kind of ["rectangle", "ellipse", "arc", "bezier"]) {
    tolerances.append(createConversionToleranceControl(kind, controls));
  }

  controls.append(actions, tolerances);
  document.body.appendChild(controls);
  conversionPreviewSession.controls = controls;
}

function createConversionToleranceControl(kind, controls) {
  const config = CONVERSION_TOLERANCE_CONFIG[kind];
  const row = document.createElement("div");
  row.className = "indy-walls-conversion-preview-tolerance-row";

  const text = document.createElement("span");
  text.className = "indy-walls-conversion-preview-tolerance-name";
  text.textContent = game.i18n.localize(config.label);

  const decrease = createConversionControlButton("indy-walls.Controls.DecreaseConversionTolerance", "fa-solid fa-minus", () => adjustConversionTolerance(kind, -0.05));
  const increase = createConversionControlButton("indy-walls.Controls.IncreaseConversionTolerance", "fa-solid fa-plus", () => adjustConversionTolerance(kind, 0.05));

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "10";
  slider.step = "0.05";
  slider.value = String(getConversionToleranceMultiplier(kind));
  slider.title = game.i18n.localize(config.title);
  slider.addEventListener("input", () => setConversionTolerance(kind, Number(slider.value), {updateSlider: false}));
  slider.addEventListener("change", () => setConversionTolerance(kind, Number(slider.value), {updateSlider: false, persist: true}));

  const value = document.createElement("span");
  value.textContent = getConversionToleranceMultiplier(kind).toFixed(2);
  value.className = "indy-walls-conversion-preview-tolerance";

  controls._indyWallsToleranceControls[kind] = {slider, value};
  row.append(text, decrease, slider, increase, value);
  return row;
}

function createConversionControlButton(titleKey, icon, onClick) {
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

function adjustConversionTolerance(kind, delta) {
  setConversionTolerance(kind, getConversionToleranceMultiplier(kind) + delta, {persist: true});
}

function setConversionTolerance(kind, value, {updateSlider=true, persist=false} = {}) {
  const setting = CONVERSION_TOLERANCE_CONFIG[kind]?.setting;
  if (!setting) return;
  const next = clamp(Number.isFinite(Number(value)) ? Number(value) : 1, 0, 10);
  if (conversionPreviewSession) conversionPreviewSession.toleranceOverrides[kind] = next;
  const controls = conversionPreviewSession?.controls?._indyWallsToleranceControls?.[kind];
  if (controls) {
    if (updateSlider) controls.slider.value = String(next);
    controls.value.textContent = next.toFixed(2);
  }
  queueConversionToleranceSettingSave(kind, setting, next);
  if (persist) flushConversionToleranceSettingSave(kind);
  scheduleConversionPreviewRedraw();
}

function getConversionToleranceMultiplier(kind) {
  const override = conversionPreviewSession?.toleranceOverrides?.[kind];
  if (Number.isFinite(Number(override))) return clamp(Number(override), 0, 10);
  const setting = CONVERSION_TOLERANCE_CONFIG[kind]?.setting;
  const value = setting ? getSettingNumber(setting, null) : null;
  const fallback = getSettingNumber(LEGACY_CONVERSION_TOLERANCE_SETTING, 1);
  const number = Number(value ?? fallback);
  return clamp(Number.isFinite(number) ? number : 1, 0, 10);
}

function scheduleConversionPreviewRedraw() {
  clearScheduledConversionPreviewRedraw();
  conversionPreviewRedrawTimeout = window.setTimeout(() => {
    conversionPreviewRedrawTimeout = null;
    redrawConversionPreview();
  }, 90);
}

function flushScheduledConversionPreviewRedraw() {
  if (!conversionPreviewRedrawTimeout) return;
  clearScheduledConversionPreviewRedraw();
  redrawConversionPreview();
}

function clearScheduledConversionPreviewRedraw() {
  if (!conversionPreviewRedrawTimeout) return;
  window.clearTimeout(conversionPreviewRedrawTimeout);
  conversionPreviewRedrawTimeout = null;
}

function queueConversionToleranceSettingSave(kind, setting, value) {
  pendingConversionToleranceSettingSaves.set(kind, {setting, value});
}

function flushConversionToleranceSettingSave(kind) {
  const pending = pendingConversionToleranceSettingSaves.get(kind);
  if (!pending) return;
  pendingConversionToleranceSettingSaves.delete(kind);
  writeConversionToleranceSetting(pending.setting, pending.value);
}

function flushPendingConversionToleranceSettingSaves() {
  for (const {setting, value} of pendingConversionToleranceSettingSaves.values()) {
    writeConversionToleranceSetting(setting, value);
  }
  pendingConversionToleranceSettingSaves.clear();
}

function writeConversionToleranceSetting(setting, value) {
  try {
    const result = game.settings?.set?.(MODULE_ID, setting, value);
    result?.catch?.(() => {});
  } catch (_error) {
    // Preview values were already applied locally.
  }
}

function getSettingNumber(setting, fallback) {
  try {
    const value = Number(game.settings?.get?.(MODULE_ID, setting));
    return Number.isFinite(value) ? value : fallback;
  } catch (_error) {
    return fallback;
  }
}

function getConversionToolSelectorValue() {
  return globalThis.CSS?.escape?.("indyConvertToIndyWalls") ?? "indyConvertToIndyWalls";
}

function handleConversionPreviewPointerMove(event) {
  if (!conversionPreviewSession) return;
  if (event.target instanceof Element && event.target.closest(".indy-walls-conversion-preview-controls")) return;

  const point = getClientInteractionPoint(event);
  const hoveredGroupId = point ? getConversionPreviewHoveredGroupId(point, conversionPreviewSession.plan) : null;
  if (hoveredGroupId === conversionPreviewSession.hoveredGroupId) return;

  conversionPreviewSession.hoveredGroupId = hoveredGroupId;
  drawConversionPreview(conversionPreviewSession.plan);
}

function handleConversionPreviewPointerLeave() {
  if (!conversionPreviewSession?.hoveredGroupId) return;
  conversionPreviewSession.hoveredGroupId = null;
  drawConversionPreview(conversionPreviewSession.plan);
}

function getConversionPreviewHoveredGroupId(point, plan) {
  const style = getPreviewStyle();
  const tolerance = getScaledRadius(Math.max(style.wallWidth + 8, 12));
  let best = null;
  let bestDistance = Infinity;

  const considerGroup = (groupId, segments) => {
    for (const [a, b] of segments) {
      if (!isPointNearConversionSegmentBounds(point, a, b, tolerance)) continue;
      const distance = getPointSegmentDistance(point, a, b);
      if (distance <= tolerance && distance < bestDistance) {
        best = groupId;
        bestDistance = distance;
      }
    }
  };

  plan.rectangleGroups.forEach((group, index) => considerGroup(`rectangle:${index}`, getRectangleConversionPreviewSegments(group)));
  plan.ellipseGroups.forEach((group, index) => considerGroup(`ellipse:${index}`, getEllipseConversionPreviewSegments(group)));
  plan.polylineGroups.forEach((group, index) => considerGroup(`polyline:${index}`, getPolylineConversionPreviewSegments(group)));
  return best;
}

function getRectangleConversionPreviewSegments(group) {
  if (!group._previewSegments) {
    group._previewSegments = getCoordinateConversionPreviewSegments(Object.values(getConvertedRectangleWallCoordinates(group)));
  }
  return group._previewSegments;
}

function getEllipseConversionPreviewSegments(group) {
  if (!group._previewSegments) {
    group._previewSegments = getCoordinateConversionPreviewSegments(getConvertedEllipseWallCoordinates(group));
  }
  return group._previewSegments;
}

function getCoordinateConversionPreviewSegments(coordinates) {
  return coordinates
    .filter((coords) => Array.isArray(coords) && coords.length >= 4)
    .map((coords) => [{x: coords[0], y: coords[1]}, {x: coords[2], y: coords[3]}]);
}

function getPolylineConversionPreviewSegments(group) {
  if (group._previewSegments) return group._previewSegments;
  const segments = [];
  const segmentCount = group.closed ? group.points.length : Math.max(group.points.length - 1, 0);
  for (let index = 0; index < segmentCount; index++) {
    const a = group.points[index];
    const b = group.points[index + 1] ?? group.points[0];
    const curve = group.segmentCurves?.[String(index)];
    const points = getCachedConvertedPolylineSegmentPoints(group, index, a, b, curve);
    for (let i = 0; i < points.length - 1; i++) segments.push([points[i], points[i + 1]]);
  }
  group._previewSegments = segments;
  return segments;
}

function isPointNearConversionSegmentBounds(point, a, b, tolerance) {
  return point.x >= Math.min(a.x, b.x) - tolerance
    && point.x <= Math.max(a.x, b.x) + tolerance
    && point.y >= Math.min(a.y, b.y) - tolerance
    && point.y <= Math.max(a.y, b.y) + tolerance;
}


function getPlainWallConversionCandidates(baseCandidates=null) {
  return (baseCandidates ?? getPlainWallConversionBaseCandidates())
    .map(getWallConversionCandidateWithCurrentTolerance)
    .filter((candidate) => candidate !== null);
}

function getPlainWallConversionBaseCandidates() {
  return getSceneWallDocuments()
    .filter((wall) => !hasIndyShapeFlag(wall))
    .map(getBaseWallConversionCandidate)
    .filter((candidate) => candidate !== null);
}

function getSceneWallDocuments() {
  const walls = canvas?.scene?.walls;
  if (!walls) return [];
  if (Array.isArray(walls.contents)) return walls.contents;
  return Array.from(walls);
}

function hasIndyShapeFlag(wallDocument) {
  return !!(wallDocument?.getFlag(MODULE_ID, CUBIC_FLAG)
    || wallDocument?.getFlag(MODULE_ID, ELLIPSE_FLAG)
    || wallDocument?.getFlag(MODULE_ID, RECTANGLE_FLAG)
    || wallDocument?.getFlag(MODULE_ID, POLYLINE_FLAG));
}

function getBaseWallConversionCandidate(wall) {
  const c = wall?.c;
  if (!Array.isArray(c) || c.length < 4) return null;

  const a = {x: Math.round(Number(c[0]) || 0), y: Math.round(Number(c[1]) || 0)};
  const b = {x: Math.round(Number(c[2]) || 0), y: Math.round(Number(c[3]) || 0)};
  if (a.x === b.x && a.y === b.y) return null;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return {
    wall,
    a,
    b,
    aKey: conversionPointKey(a),
    bKey: conversionPointKey(b),
    levelKey: getWallLevelsKey(wall),
    wallTypeTool: getWallTypeToolFromDocument(wall),
    comparableWallData: getComparablePreservedWallData(wall),
    dx,
    dy,
    length: Math.hypot(dx, dy)
  };
}

function getWallConversionCandidateWithCurrentTolerance(base) {
  if (!base) return null;
  const axisTolerance = getRectangleAxisToleranceFromLength(base.length);
  return {
    ...base,
    horizontal: Math.abs(base.dy) <= axisTolerance,
    vertical: Math.abs(base.dx) <= axisTolerance
  };
}

function detectRectangleConversionGroups(candidates) {
  const groups = [];
  for (const component of getWallConversionComponents(candidates.filter((candidate) => candidate.horizontal || candidate.vertical))) {
    groups.push(...getRectangleConversionGroupsFromComponent(component));
  }
  return groups;
}

function getWallConversionComponents(candidates) {
  const byPoint = new Map();
  for (const candidate of candidates) {
    for (const key of [candidate.aKey, candidate.bKey]) {
      if (!byPoint.has(key)) byPoint.set(key, []);
      byPoint.get(key).push(candidate);
    }
  }

  const visited = new Set();
  const components = [];
  for (const candidate of candidates) {
    if (visited.has(candidate.wall.id)) continue;

    const component = [];
    const stack = [candidate];
    visited.add(candidate.wall.id);
    while (stack.length) {
      const current = stack.pop();
      component.push(current);
      for (const key of [current.aKey, current.bKey]) {
        for (const next of byPoint.get(key) ?? []) {
          if (visited.has(next.wall.id)) continue;
          if (next.levelKey !== current.levelKey) continue;
          visited.add(next.wall.id);
          stack.push(next);
        }
      }
    }
    components.push(component);
  }
  return components;
}

function getRectangleConversionGroupsFromComponent(component) {
  if (component.length < 4 || component.some((candidate) => !(candidate.horizontal || candidate.vertical))) return [];

  const xs = getRectangleCandidateBoundaryValues(component, "x");
  const ys = getRectangleCandidateBoundaryValues(component, "y");
  if (xs.length < 2 || ys.length < 2) return [];

  const candidates = [];
  for (const bounds of getRectangleBoundsCandidates(component, xs, ys)) {
    const group = getRectangleConversionGroupForBounds(component, bounds);
    if (group) {
      candidates.push({
        group,
        area: (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY)
      });
    }
  }

  const used = new Set();
  const groups = [];
  for (const {group} of candidates.sort((a, b) => a.area - b.area)) {
    const wallIds = new Set(group.records.map((record) => record.wall.id));
    if (![...wallIds].some((id) => !used.has(id))) continue;
    wallIds.forEach((id) => used.add(id));
    groups.push({...group, allRecords: group.records});
  }
  return applySharedRectangleConversionGaps(groups);
}

function getRectangleCandidateBoundaryValues(component, axis) {
  const source = axis === "x"
    ? component.filter((candidate) => candidate.vertical).flatMap((candidate) => [candidate.a.x, candidate.b.x])
    : component.filter((candidate) => candidate.horizontal).flatMap((candidate) => [candidate.a.y, candidate.b.y]);
  return [...new Set(source)].sort((a, b) => a - b);
}

function getRectangleBoundsCandidates(component, xs, ys) {
  const xPairs = (xs.length * (xs.length - 1)) / 2;
  const yPairs = (ys.length * (ys.length - 1)) / 2;
  const bruteForceCount = xPairs * yPairs;
  if (bruteForceCount <= RECTANGLE_BRUTE_FORCE_BOUNDS_LIMIT) {
    activeConversionTiming && (activeConversionTiming.counts.rectangleBruteForceBounds = (activeConversionTiming.counts.rectangleBruteForceBounds ?? 0) + bruteForceCount);
    const bounds = [];
    for (let xi = 0; xi < xs.length - 1; xi++) {
      for (let xj = xi + 1; xj < xs.length; xj++) {
        for (let yi = 0; yi < ys.length - 1; yi++) {
          for (let yj = yi + 1; yj < ys.length; yj++) {
            bounds.push({minX: xs[xi], maxX: xs[xj], minY: ys[yi], maxY: ys[yj]});
          }
        }
      }
    }
    return bounds;
  }

  activeConversionTiming && (activeConversionTiming.counts.rectangleBruteForceSkipped = (activeConversionTiming.counts.rectangleBruteForceSkipped ?? 0) + 1);
  activeConversionTiming && (activeConversionTiming.counts.rectangleBruteForceCandidatesSkipped = (activeConversionTiming.counts.rectangleBruteForceCandidatesSkipped ?? 0) + bruteForceCount);

  const bounds = new Map();
  const addBounds = ({minX, maxX, minY, maxY}) => {
    if (minX === maxX || minY === maxY) return;
    bounds.set(`${minX},${minY},${maxX},${maxY}`, {minX, minY, maxX, maxY});
  };

  addBounds({
    minX: xs[0],
    maxX: xs.at(-1),
    minY: ys[0],
    maxY: ys.at(-1)
  });

  const horizontals = component
    .filter((candidate) => candidate.horizontal)
    .map((candidate) => ({
      y: Math.round((candidate.a.y + candidate.b.y) / 2),
      minX: Math.min(candidate.a.x, candidate.b.x),
      maxX: Math.max(candidate.a.x, candidate.b.x)
    }))
    .filter((item) => item.minX !== item.maxX);
  const verticals = component
    .filter((candidate) => candidate.vertical)
    .map((candidate) => ({
      x: Math.round((candidate.a.x + candidate.b.x) / 2),
      minY: Math.min(candidate.a.y, candidate.b.y),
      maxY: Math.max(candidate.a.y, candidate.b.y)
    }))
    .filter((item) => item.minY !== item.maxY);

  for (let i = 0; i < horizontals.length - 1; i++) {
    for (let j = i + 1; j < horizontals.length; j++) {
      const a = horizontals[i];
      const b = horizontals[j];
      if (a.y === b.y || a.minX !== b.minX || a.maxX !== b.maxX) continue;
      addBounds({
        minX: a.minX,
        maxX: a.maxX,
        minY: Math.min(a.y, b.y),
        maxY: Math.max(a.y, b.y)
      });
    }
  }

  for (let i = 0; i < verticals.length - 1; i++) {
    for (let j = i + 1; j < verticals.length; j++) {
      const a = verticals[i];
      const b = verticals[j];
      if (a.x === b.x || a.minY !== b.minY || a.maxY !== b.maxY) continue;
      addBounds({
        minX: Math.min(a.x, b.x),
        maxX: Math.max(a.x, b.x),
        minY: a.minY,
        maxY: a.maxY
      });
    }
  }

  activeConversionTiming && (activeConversionTiming.counts.rectangleLikelyBounds = (activeConversionTiming.counts.rectangleLikelyBounds ?? 0) + bounds.size);
  return [...bounds.values()];
}

function getRectangleConversionGroupForBounds(component, {minX, minY, maxX, maxY}) {
  if (minX === maxX || minY === maxY) return null;
  const tolerance = getRectangleBoundsTolerance({minX, minY, maxX, maxY});
  const sideItems = {top: [], right: [], bottom: [], left: []};
  for (const candidate of component) {
    const item = getRectangleSideConversionItem(candidate, {minX, minY, maxX, maxY}, tolerance);
    if (item) sideItems[item.side].push(item);
  }

  if (!rectangleSideFullyCovered(sideItems.top, minX, maxX, tolerance)
    || !rectangleSideFullyCovered(sideItems.right, minY, maxY, tolerance)
    || !rectangleSideFullyCovered(sideItems.bottom, minX, maxX, tolerance)
    || !rectangleSideFullyCovered(sideItems.left, minY, maxY, tolerance)) return null;

  const ordered = {
    top: sideItems.top.sort((a, b) => a.start - b.start),
    right: sideItems.right.sort((a, b) => a.start - b.start),
    bottom: sideItems.bottom.sort((a, b) => b.end - a.end),
    left: sideItems.left.sort((a, b) => b.end - a.end)
  };
  const sideSegments = {
    top: ordered.top.length,
    right: ordered.right.length,
    bottom: ordered.bottom.length,
    left: ordered.left.length
  };
  const sideRatios = {
    top: rectangleSideRatios(ordered.top, minX, maxX, "forward"),
    right: rectangleSideRatios(ordered.right, minY, maxY, "forward"),
    bottom: rectangleSideRatios(ordered.bottom, minX, maxX, "reverse"),
    left: rectangleSideRatios(ordered.left, minY, maxY, "reverse")
  };
  const sideGaps = {top: [], right: [], bottom: [], left: []};
  const records = [];
  for (const side of ["top", "right", "bottom", "left"]) {
    ordered[side].forEach((item, index) => records.push({
      wall: item.candidate.wall,
      sourceWall: item.candidate.wall,
      side,
      index,
      start: item.start,
      end: item.end
    }));
  }

  return {
    records,
    allRecords: records,
    levelKey: component[0]?.levelKey ?? "",
    handles: [{x: minX, y: minY}, {x: maxX, y: maxY}],
    sideSegments,
    sideRatios,
    sideEnabled: {top: true, right: true, bottom: true, left: true},
    sideGaps
  };
}

function applySharedRectangleConversionGaps(groups) {
  const ownerByWallId = new Map();
  const recordsByWallId = new Map();
  for (const group of groups) {
    for (const record of group.allRecords ?? group.records ?? []) {
      if (!ownerByWallId.has(record.wall.id)) ownerByWallId.set(record.wall.id, group);
      if (!recordsByWallId.has(record.wall.id)) recordsByWallId.set(record.wall.id, []);
      recordsByWallId.get(record.wall.id).push({group, record});
    }
  }

  const groupOrder = new Map(groups.map((group, index) => [group, index]));
  const hiddenIntervalsByRecord = getSharedRectangleHiddenIntervals(groups, groupOrder);
  const originalWallAllocated = new Set();

  return groups.map((group) => {
    const hiddenIntervals = {top: [], right: [], bottom: [], left: []};
    const deleteWallIds = [];
    const records = [];
    for (const record of group.allRecords ?? group.records ?? []) {
      const recordHiddenIntervals = mergeRectangleConversionIntervals(hiddenIntervalsByRecord.get(record) ?? []);
      hiddenIntervals[record.side].push(...recordHiddenIntervals);
      const visibleIntervals = getRectangleRecordVisibleIntervals(record, recordHiddenIntervals);
      if (!visibleIntervals.length && recordHiddenIntervals.length && ownerByWallId.get(record.wall.id) === group) {
        deleteWallIds.push(record.wall.id);
      }
      const originalInterval = !originalWallAllocated.has(record.wall.id)
        ? getLongestRectangleInterval(visibleIntervals)
        : null;
      for (const interval of visibleIntervals) {
        const keepOriginal = interval === originalInterval;
        if (keepOriginal) originalWallAllocated.add(record.wall.id);
        records.push({
          ...(keepOriginal ? record : getCreatedRectangleRecord(record)),
          start: interval[0],
          end: interval[1]
        });
      }
    }
    const sideState = getRectangleSideStateFromRecords(group, records, hiddenIntervals);
    return {
      ...group,
      records: sideState.records,
      deleteWallIds,
      sideSegments: sideState.sideSegments,
      sideRatios: sideState.sideRatios,
      sideGaps: sideState.sideGaps
    };
  }).filter((group) => group.records.length);
}

function getSharedRectangleHiddenIntervals(groups, groupOrder) {
  const result = new WeakMap();
  const records = groups.flatMap((group) => (group.allRecords ?? group.records ?? []).map((record) => ({group, record})));
  for (let i = 0; i < records.length - 1; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const a = records[i];
      const b = records[j];
      if (a.group === b.group) continue;
      const overlap = getRectangleSideRecordOverlap(a.group, a.record, b.group, b.record);
      if (!overlap) continue;

      const hide = (groupOrder.get(a.group) ?? 0) <= (groupOrder.get(b.group) ?? 0) ? b : a;
      if (!result.has(hide.record)) result.set(hide.record, []);
      result.get(hide.record).push(overlap);
    }
  }
  return result;
}

function getRectangleSideRecordOverlap(aGroup, aRecord, bGroup, bRecord) {
  const aLine = getRectangleSideRecordLine(aGroup, aRecord);
  const bLine = getRectangleSideRecordLine(bGroup, bRecord);
  if (!aLine || !bLine || aLine.axis !== bLine.axis) return null;
  const tolerance = Math.max(aLine.tolerance, bLine.tolerance, 1);
  if (Math.abs(aLine.line - bLine.line) > tolerance) return null;
  return getRectangleRecordOverlapInterval(aRecord, bRecord, tolerance);
}

function getRectangleSideRecordLine(group, record) {
  const bounds = getRectangleGroupBounds(group);
  if (!bounds) return null;
  const tolerance = getRectangleBoundsTolerance(bounds);
  if (record.side === "top") return {axis: "x", line: bounds.minY, tolerance};
  if (record.side === "bottom") return {axis: "x", line: bounds.maxY, tolerance};
  if (record.side === "right") return {axis: "y", line: bounds.maxX, tolerance};
  if (record.side === "left") return {axis: "y", line: bounds.minX, tolerance};
  return null;
}

function getCreatedRectangleRecord(record) {
  return {
    ...record,
    wallId: foundry.utils.randomID(),
    create: true,
    sourceWall: record.sourceWall ?? record.wall
  };
}

function getRectangleRecordOverlapInterval(record, other, tolerance=0.0001) {
  if (!record || !other) return null;
  const start = Math.max(Math.min(record.start, record.end), Math.min(other.start, other.end));
  const end = Math.min(Math.max(record.start, record.end), Math.max(other.start, other.end));
  if (end <= start + tolerance) return null;
  return [start, end];
}

function getRectangleRecordVisibleIntervals(record, hiddenIntervals) {
  if (!record) return [];
  let intervals = [[Math.min(record.start, record.end), Math.max(record.start, record.end)]];
  for (const hidden of hiddenIntervals ?? []) {
    intervals = intervals.flatMap((interval) => subtractRectangleInterval(interval, hidden));
  }
  return intervals.filter(([a, b]) => b > a + 0.0001);
}

function subtractRectangleInterval(interval, hidden) {
  const start = interval[0];
  const end = interval[1];
  const hiddenStart = Math.max(start, Math.min(hidden[0], hidden[1]));
  const hiddenEnd = Math.min(end, Math.max(hidden[0], hidden[1]));
  if (hiddenEnd <= hiddenStart + 0.0001) return [interval];
  return [
    [start, hiddenStart],
    [hiddenEnd, end]
  ].filter(([a, b]) => b > a + 0.0001);
}

function getLongestRectangleInterval(intervals) {
  return [...(intervals ?? [])].sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0] ?? null;
}

function mergeRectangleConversionIntervals(intervals) {
  const ordered = (intervals ?? [])
    .map(([start, end]) => [Math.min(start, end), Math.max(start, end)])
    .filter(([start, end]) => end > start + 0.0001)
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const interval of ordered) {
    const previous = merged.at(-1);
    if (previous && interval[0] <= previous[1] + 0.0001) previous[1] = Math.max(previous[1], interval[1]);
    else merged.push([...interval]);
  }
  return merged;
}

function getRectangleSideStateFromRecords(group, records, hiddenIntervals) {
  const sideSegments = {...group.sideSegments};
  const sideRatios = cloneRectangleSideRatios(group.sideRatios);
  const sideGaps = cloneRectangleSideGaps(group.sideGaps);
  const recordsBySide = {top: [], right: [], bottom: [], left: []};
  for (const record of records) recordsBySide[record.side]?.push(record);

  for (const side of ["top", "right", "bottom", "left"]) {
    const intervals = [...(hiddenIntervals[side] ?? [])];
    const sideRecords = recordsBySide[side];
    if (!intervals.length) continue;

    const points = new Set([0, 1]);
    for (const ratio of sideRatios[side] ?? []) points.add(clamp(ratio, 0, 1));
    for (const record of sideRecords) {
      for (const ratio of getRectangleRecordIntervalRatios(group, side, [record.start, record.end])) {
        points.add(ratio);
      }
    }
    for (const interval of intervals) {
      for (const ratio of getRectangleRecordIntervalRatios(group, side, interval)) {
        points.add(ratio);
      }
    }

    const ordered = [...points].filter((ratio) => Number.isFinite(ratio)).sort((a, b) => a - b);
    sideRatios[side] = ordered.slice(1, -1);
    sideSegments[side] = Math.max(ordered.length - 1, 1);
    const hiddenRatioIntervals = intervals.map((interval) => getRectangleRecordIntervalRatios(group, side, interval));
    sideGaps[side] = [];
    for (let index = 0; index < ordered.length - 1; index++) {
      const center = (ordered[index] + ordered[index + 1]) / 2;
      if (hiddenRatioIntervals.some(([start, end]) => center >= Math.min(start, end) && center <= Math.max(start, end))) {
        sideGaps[side].push(index);
      }
    }
    for (const record of sideRecords) {
      const [start, end] = getRectangleRecordIntervalRatios(group, side, [record.start, record.end]);
      const center = (start + end) / 2;
      record.index = Math.max(ordered.findIndex((ratio, index) => index < ordered.length - 1 && center >= ratio && center <= ordered[index + 1]), 0);
    }
  }

  return {records, sideSegments, sideRatios, sideGaps};
}

function getRectangleRecordIntervalRatios(group, side, interval) {
  const bounds = getRectangleGroupBounds(group);
  if (!bounds || !interval) return [0, 1];
  const [start, end] = interval;
  const min = side === "top" || side === "bottom" ? bounds.minX : bounds.minY;
  const max = side === "top" || side === "bottom" ? bounds.maxX : bounds.maxY;
  const length = max - min;
  if (length <= 0) return [0, 1];
  const forward = side === "top" || side === "right";
  const ratioA = forward ? (start - min) / length : (max - start) / length;
  const ratioB = forward ? (end - min) / length : (max - end) / length;
  return [clamp(ratioA, 0, 1), clamp(ratioB, 0, 1)].sort((a, b) => a - b);
}

function getRectangleSideConversionItem(candidate, bounds, tolerance) {
  const {minX, minY, maxX, maxY} = bounds;
  const lowX = Math.min(candidate.a.x, candidate.b.x);
  const highX = Math.max(candidate.a.x, candidate.b.x);
  const lowY = Math.min(candidate.a.y, candidate.b.y);
  const highY = Math.max(candidate.a.y, candidate.b.y);

  if (candidate.horizontal && Math.abs(candidate.a.y - minY) <= tolerance) {
    const item = getRectangleOverlappingSideItem(candidate, "top", lowX, highX, minX, maxX, tolerance);
    if (item) return item;
  }
  if (candidate.horizontal && Math.abs(candidate.a.y - maxY) <= tolerance) {
    const item = getRectangleOverlappingSideItem(candidate, "bottom", lowX, highX, minX, maxX, tolerance);
    if (item) return item;
  }
  if (candidate.vertical && Math.abs(candidate.a.x - maxX) <= tolerance) {
    const item = getRectangleOverlappingSideItem(candidate, "right", lowY, highY, minY, maxY, tolerance);
    if (item) return item;
  }
  if (candidate.vertical && Math.abs(candidate.a.x - minX) <= tolerance) {
    const item = getRectangleOverlappingSideItem(candidate, "left", lowY, highY, minY, maxY, tolerance);
    if (item) return item;
  }
  return null;
}

function getRectangleOverlappingSideItem(candidate, side, low, high, min, max, tolerance) {
  const start = Math.max(low, min);
  const end = Math.min(high, max);
  if (end <= start + tolerance) return null;
  return {
    candidate,
    side,
    start: clamp(start, min, max),
    end: clamp(end, min, max)
  };
}

function rectangleSideFullyCovered(items, min, max, tolerance) {
  if (!items.length) return false;
  const ordered = [...items].sort((a, b) => a.start - b.start);
  let cursor = min;
  for (const item of ordered) {
    if (item.start > cursor + tolerance) return false;
    cursor = Math.max(cursor, item.end);
  }
  return cursor >= max - tolerance;
}

function rectangleSideRatios(items, min, max, direction) {
  const length = max - min;
  if (length <= 0 || items.length <= 1) return [];
  return items.slice(0, -1)
    .map((item) => direction === "reverse" ? (max - item.start) / length : (item.end - min) / length)
    .filter((ratio) => ratio > 0 && ratio < 1);
}

function buildRectangleConversionUpdates(group) {
  const rectangleId = foundry.utils.randomID();
  const wallIds = group.records.map((record) => record.wall.id);
  const coordinates = getConvertedRectangleWallCoordinates(group);
  const wallTypeBySegment = {};
  const wallDataBySegment = {};
  for (const record of group.records) {
    const key = getRectangleSegmentKey(record);
    const sourceWall = record.sourceWall ?? record.wall;
    const tool = getWallTypeToolFromDocument(sourceWall);
    if (tool) wallTypeBySegment[key] = tool;
    const preserved = getPreservedWallDataFromDocument(sourceWall, MODULE_ID);
    if (preserved) wallDataBySegment[key] = preserved;
  }
  const wallTypeTool = getMostCommonWallTypeTool(Object.values(wallTypeBySegment));

  return group.records.map((record, index) => {
    const sourceWall = record.sourceWall ?? record.wall;
    const wallId = record.wallId ?? record.wall.id;
    const rectangleFlag = {
      rectangleId,
      index,
      side: record.side,
      segmentIndex: record.index,
      wallIds: [],
      handles: clonePoints(group.handles),
      sideSegments: {...group.sideSegments},
      sideRatios: cloneRectangleSideRatios(group.sideRatios),
      sideEnabled: cloneRectangleSideEnabled(group.sideEnabled),
      sideGaps: cloneRectangleSideGaps(group.sideGaps),
      wallTypeBySegment: index === 0 ? cloneWallTypeBySegment(wallTypeBySegment) : {},
      wallDataBySegment: index === 0 ? cloneWallDataBySegment(wallDataBySegment) : {},
      wallTypeTool
    };
    const data = record.create
      ? {
        ...getWallSourceData(sourceWall),
        _id: wallId,
        _create: true,
        c: coordinates[getRectangleSegmentKey(record)] ?? sourceWall.c,
        flags: {
          ...(getWallSourceData(sourceWall).flags ?? {}),
          [MODULE_ID]: {
            ...(getWallSourceData(sourceWall).flags?.[MODULE_ID] ?? {}),
            [RECTANGLE_FLAG]: rectangleFlag
          }
        }
      }
      : {
        _id: wallId,
        c: coordinates[getRectangleSegmentKey(record)] ?? sourceWall.c,
        [`flags.${MODULE_ID}.${RECTANGLE_FLAG}`]: rectangleFlag
      };
    return data;
  });
}

function getWallSourceData(wall) {
  return wall?.toObject ? wall.toObject(false) : foundry.utils.deepClone(wall ?? {});
}

function getConvertedRectangleWallCoordinates(group) {
  if (group._convertedRectangleWallCoordinates) return group._convertedRectangleWallCoordinates;
  const [a, b] = group.handles;
  const bounds = {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y)
  };
  const sides = {
    top: [{x: bounds.minX, y: bounds.minY}, {x: bounds.maxX, y: bounds.minY}],
    right: [{x: bounds.maxX, y: bounds.minY}, {x: bounds.maxX, y: bounds.maxY}],
    bottom: [{x: bounds.maxX, y: bounds.maxY}, {x: bounds.minX, y: bounds.maxY}],
    left: [{x: bounds.minX, y: bounds.maxY}, {x: bounds.minX, y: bounds.minY}]
  };
  const coordinates = {};
  for (const [side, [start, end]] of Object.entries(sides)) {
    const ratios = [...(group.sideRatios?.[side] ?? [])].sort((x, y) => x - y);
    const points = [
      start,
      ...ratios.map((ratio) => ({
        x: start.x + ((end.x - start.x) * ratio),
        y: start.y + ((end.y - start.y) * ratio)
      })),
      end
    ];
    for (let index = 0; index < points.length - 1; index++) {
      coordinates[`${side}:${index}`] = getRoundedWallCoordinates(points[index], points[index + 1]);
    }
  }
  group._convertedRectangleWallCoordinates = coordinates;
  return coordinates;
}

function detectPolylineConversionGroups(candidates) {
  const groups = [];
  for (const component of getWallConversionComponents(candidates)) {
    groups.push(...getPolylineConversionGroups(component));
  }
  return mergeCompatiblePolylineConversionGroups(groups);
}

function getPolylineConversionGroups(component) {
  if (!component.length) return [];
  const byPoint = new Map();
  for (const candidate of component) {
    for (const key of [candidate.aKey, candidate.bKey]) {
      if (!byPoint.has(key)) byPoint.set(key, []);
      byPoint.get(key).push(candidate);
    }
  }

  const used = new Set();
  const groups = [];
  const junctionKeys = [...byPoint.entries()]
    .filter(([, edges]) => edges.length !== 2)
    .map(([key]) => key)
    .sort();

  for (const startKey of junctionKeys) {
    const edges = [...(byPoint.get(startKey) ?? [])].sort(compareConversionCandidates);
    for (const edge of edges) {
      if (used.has(edge.wall.id)) continue;
      groups.push(tracePolylineConversionPath(edge, startKey, byPoint, used, false));
    }
  }

  for (const candidate of component.sort(compareConversionCandidates)) {
    if (used.has(candidate.wall.id)) continue;
    groups.push(tracePolylineConversionPath(candidate, candidate.aKey, byPoint, used, true));
  }

  return groups.filter((group) => group.candidates.length && group.points.length >= 2);
}

function tracePolylineConversionPath(firstEdge, startKey, byPoint, used, allowClosed) {
  const candidates = [];
  const points = [conversionPointFromKey(startKey)];
  let currentKey = startKey;
  let edge = firstEdge;
  let closed = false;

  while (edge && !used.has(edge.wall.id)) {
    used.add(edge.wall.id);
    candidates.push(edge);
    const nextKey = edge.aKey === currentKey ? edge.bKey : edge.aKey;
    if (nextKey === startKey && allowClosed) {
      closed = true;
      break;
    }
    points.push(conversionPointFromKey(nextKey));
    currentKey = nextKey;

    const nextEdges = (byPoint.get(currentKey) ?? [])
      .filter((candidate) => !used.has(candidate.wall.id))
      .filter((candidate) => candidate.levelKey === firstEdge.levelKey)
      .sort(compareConversionCandidates);
    if (nextEdges.length !== 1) break;
    edge = nextEdges[0];
  }

  return {candidates, points, closed, levelKey: firstEdge.levelKey};
}

function compareConversionCandidates(a, b) {
  return String(a.wall.id).localeCompare(String(b.wall.id));
}

function mergeCompatiblePolylineConversionGroups(groups) {
  let result = groups;
  let changed = true;
  while (changed) {
    changed = false;
    const next = [];
    const used = new Set();

    for (let i = 0; i < result.length; i++) {
      if (used.has(i)) continue;

      let group = result[i];
      for (let j = i + 1; j < result.length; j++) {
        if (used.has(j)) continue;
        const merged = mergePolylineConversionGroups(group, result[j]);
        if (!merged) continue;

        group = merged;
        used.add(j);
        changed = true;
      }

      used.add(i);
      next.push(group);
    }

    result = next;
  }
  return result;
}

function mergePolylineConversionGroups(a, b) {
  if (a.closed || b.closed || a.points.length < 2 || b.points.length < 2) return null;
  if (a.levelKey !== b.levelKey) return null;

  const aStart = conversionPointKey(a.points[0]);
  const aEnd = conversionPointKey(a.points.at(-1));
  const bStart = conversionPointKey(b.points[0]);
  const bEnd = conversionPointKey(b.points.at(-1));

  if (aEnd === bStart && canMergePolylineAtEndpoint(a, "end", b, "start")) {
    return {
      candidates: [...a.candidates, ...b.candidates],
      points: [...a.points, ...b.points.slice(1)],
      closed: false,
      levelKey: a.levelKey
    };
  }
  if (bEnd === aStart && canMergePolylineAtEndpoint(b, "end", a, "start")) {
    return {
      candidates: [...b.candidates, ...a.candidates],
      points: [...b.points, ...a.points.slice(1)],
      closed: false,
      levelKey: a.levelKey
    };
  }
  if (aStart === bStart && canMergePolylineAtEndpoint(a, "start", b, "start")) {
    return {
      candidates: [...reverseConversionCandidates(a.candidates), ...b.candidates],
      points: [...reverseConversionPoints(a.points), ...b.points.slice(1)],
      closed: false,
      levelKey: a.levelKey
    };
  }
  if (aEnd === bEnd && canMergePolylineAtEndpoint(a, "end", b, "end")) {
    return {
      candidates: [...a.candidates, ...reverseConversionCandidates(b.candidates)],
      points: [...a.points, ...reverseConversionPoints(b.points).slice(1)],
      closed: false,
      levelKey: a.levelKey
    };
  }

  return null;
}

function canMergePolylineAtEndpoint(a, aSide, b, bSide) {
  const aVector = getPolylineTerminalVector(a.points, aSide);
  const bVector = getPolylineTerminalVector(b.points, bSide);
  if (!aVector || !bVector) return false;

  const cross = (aVector.x * bVector.y) - (aVector.y * bVector.x);
  const dot = (aVector.x * bVector.x) + (aVector.y * bVector.y);
  return Math.abs(cross) < 0.0001 && dot < 0;
}

function getPolylineTerminalVector(points, side) {
  if (points.length < 2) return null;
  const endpoint = side === "start" ? points[0] : points.at(-1);
  const next = side === "start" ? points[1] : points.at(-2);
  const dx = next.x - endpoint.x;
  const dy = next.y - endpoint.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.1) return null;
  return {x: dx / length, y: dy / length};
}

function reverseConversionPoints(points) {
  return [...points].reverse().map((point) => ({x: point.x, y: point.y}));
}

function reverseConversionCandidates(candidates) {
  return [...candidates].reverse();
}

function refineConvertedPolylineGroups(groups) {
  const ellipseGroups = [];
  const polylineGroups = [];
  for (const group of groups) {
    activeConversionTiming && (activeConversionTiming.counts.ellipseChecks = (activeConversionTiming.counts.ellipseChecks ?? 0) + 1);
    const ellipse = measureActiveConversionTiming("ellipses.consider", () => getEllipseConversionGroup(group));
    if (ellipse) {
      ellipseGroups.push(ellipse);
      continue;
    }
    const bezier = measureActiveConversionTiming("beziers.considerWholeGroup", () => convertPolylineLineRunsToBezier(group));
    if (bezier) {
      polylineGroups.push(bezier);
      continue;
    }
    polylineGroups.push(measureActiveConversionTiming("polylines.convertRuns", () => convertPolylineLineRunsToCurves(group)));
  }
  return {ellipseGroups, polylineGroups};
}

function getEllipseConversionGroup(group) {
  if (group.closed) {
    if (group.candidates.length < 8 || group.points.length < 8) return null;
  } else if (group.candidates.length < 5 || group.points.length < 6) {
    return null;
  }

  const points = group.points;
  const fit = getBestEllipseConversionFit(points, group.closed);
  if (!fit) return null;

  if (!group.closed) {
    const gapData = getOpenEllipseConversionGapData(group, fit);
    if (!gapData) return null;
    return {
      candidates: group.candidates,
      handles: fit.handles,
      rotation: fit.rotation,
      segments: gapData.segments,
      levelKey: group.levelKey,
      angleGaps: gapData.angleGaps,
      candidateIntervals: gapData.candidateIntervals,
      segmentIndexByCandidate: gapData.segmentIndexByCandidate
    };
  }

  return {
    candidates: group.candidates,
    handles: fit.handles,
    rotation: fit.rotation,
    segments: group.candidates.length,
    levelKey: group.levelKey,
    angleGaps: []
  };
}

function getBestEllipseConversionFit(points, closed=false) {
  const tolerance = getConversionFitTolerance(points, "ellipse");
  const directFit = getDirectEllipseConversionFit(points);
  const directReverseError = directFit && closed ? getMaxSampledEllipsePolylineDistance(directFit, points, true) : 0;
  if (directFit && directFit.error <= tolerance && (!closed || directReverseError <= tolerance)) {
    return directFit;
  }
  if (directFit && directFit.error > tolerance * ELLIPSE_ROTATION_SWEEP_ERROR_MULTIPLIER) {
    return null;
  }

  let best = null;
  const angles = getEllipseFitCandidateRotations(points);
  for (const rotation of angles) {
    const fit = getEllipseConversionFitAtRotation(points, rotation);
    if (!fit) continue;
    if (fit.error > tolerance) continue;
    const reverseError = closed ? getMaxSampledEllipsePolylineDistance(fit, points, true) : 0;
    if (closed && reverseError > tolerance) continue;
    if (!best || fit.error < best.error) best = fit;
  }
  return best;
}

function getDirectEllipseConversionFit(points) {
  if (!Array.isArray(points) || points.length < 6) return null;
  const bounds = getConversionPointBounds(points);
  const origin = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2
  };
  const scale = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 1);
  const normalizedPoints = points.map((point) => ({
    x: (point.x - origin.x) / scale,
    y: (point.y - origin.y) / scale
  }));
  const normal = Array.from({length: 5}, () => Array(5).fill(0));
  const rhs = Array(5).fill(0);
  for (const point of normalizedPoints) {
    const row = [
      point.x * point.x,
      point.x * point.y,
      point.y * point.y,
      point.x,
      point.y
    ];
    for (let r = 0; r < row.length; r += 1) {
      rhs[r] += row[r];
      for (let c = 0; c < row.length; c += 1) {
        normal[r][c] += row[r] * row[c];
      }
    }
  }

  const solution = solveLinearSystem(normal, rhs);
  if (!solution) return null;
  const [a, b, c, d, e] = solution;
  if (((b * b) - (4 * a * c)) >= 0) return null;

  const centerDenominator = (4 * a * c) - (b * b);
  if (Math.abs(centerDenominator) < 0.0001) return null;
  const normalizedCenter = {
    x: ((b * e) - (2 * c * d)) / centerDenominator,
    y: ((b * d) - (2 * a * e)) / centerDenominator
  };
  if (!isFiniteConversionPoint(normalizedCenter)) return null;

  const q11 = a;
  const q12 = b / 2;
  const q22 = c;
  const trace = (q11 + q22) / 2;
  const delta = Math.hypot((q11 - q22) / 2, q12);
  const lambdaA = trace + delta;
  const lambdaB = trace - delta;
  if (lambdaA <= 0 || lambdaB <= 0) return null;

  const centerValue = (a * normalizedCenter.x * normalizedCenter.x)
    + (b * normalizedCenter.x * normalizedCenter.y)
    + (c * normalizedCenter.y * normalizedCenter.y)
    + (d * normalizedCenter.x)
    + (e * normalizedCenter.y)
    - 1;
  if (centerValue >= 0) return null;

  const rotation = Math.atan2(q12, lambdaA - q11);
  const rx = Math.sqrt(-centerValue / lambdaA) * scale;
  const ry = Math.sqrt(-centerValue / lambdaB) * scale;
  const center = {
    x: origin.x + (normalizedCenter.x * scale),
    y: origin.y + (normalizedCenter.y * scale)
  };
  if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx < 1 || ry < 1) return null;

  const fit = {
    handles: [{x: center.x - rx, y: center.y - ry}, {x: center.x + rx, y: center.y + ry}],
    rotation: normalizeHalfTurn(rotation),
    center,
    rx,
    ry
  };
  fit.error = getEllipseFitError(points, fit);
  return fit;
}

function solveLinearSystem(matrix, values) {
  const n = values.length;
  const augmented = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 0.0000001) return null;
    if (pivot !== column) [augmented[pivot], augmented[column]] = [augmented[column], augmented[pivot]];

    const divisor = augmented[column][column];
    for (let col = column; col <= n; col += 1) augmented[column][col] /= divisor;

    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let col = column; col <= n; col += 1) {
        augmented[row][col] -= factor * augmented[column][col];
      }
    }
  }
  return augmented.map((row) => row[n]);
}

function getEllipseFitCandidateRotations(points) {
  const rotations = [0, Math.PI / 4, Math.PI / 2, Math.PI * 0.75];
  const coarseStep = Math.PI / 18;
  for (let index = 0; index < 18; index += 1) {
    rotations.push(index * coarseStep);
  }
  const pca = getPointCloudPrincipalAxisRotation(points);
  if (Number.isFinite(pca)) {
    for (const offset of [-Math.PI / 6, -Math.PI / 12, 0, Math.PI / 12, Math.PI / 6]) {
      rotations.push(pca + offset, pca + (Math.PI / 2) + offset);
    }
  }
  return [...new Set(rotations.map((angle) => Math.round(normalizeHalfTurn(angle) * 1000000) / 1000000))];
}

function getPointCloudPrincipalAxisRotation(points) {
  if (!Array.isArray(points) || points.length < 3) return null;
  const center = getConversionPointsCenter(points);
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const point of points) {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  if (Math.abs(xx) < 0.0001 && Math.abs(yy) < 0.0001) return null;
  return Math.atan2(2 * xy, xx - yy) / 2;
}

function getEllipseConversionFitAtRotation(points, rotation) {
  const local = points.map((point) => rotateConversionPoint(point, -rotation));
  const bounds = getConversionPointBounds(local);
  const localCenter = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2
  };
  const boundsFit = getEllipseFitFromLocalGeometry(local, rotation, localCenter, (bounds.maxX - bounds.minX) / 2, (bounds.maxY - bounds.minY) / 2);
  const radii = getLeastSquaresEllipseRadii(local, localCenter);
  const leastSquaresFit = radii ? getEllipseFitFromLocalGeometry(local, rotation, localCenter, radii.rx, radii.ry) : null;
  if (!boundsFit) return leastSquaresFit;
  if (!leastSquaresFit) return boundsFit;
  return leastSquaresFit.error < boundsFit.error ? leastSquaresFit : boundsFit;
}

function getLeastSquaresEllipseRadii(localPoints, localCenter) {
  let xx = 0;
  let xy = 0;
  let yy = 0;
  let x1 = 0;
  let y1 = 0;
  for (const point of localPoints) {
    const x = (point.x - localCenter.x) ** 2;
    const y = (point.y - localCenter.y) ** 2;
    xx += x * x;
    xy += x * y;
    yy += y * y;
    x1 += x;
    y1 += y;
  }

  const determinant = (xx * yy) - (xy * xy);
  if (Math.abs(determinant) < 0.0001) return null;
  const a = ((x1 * yy) - (y1 * xy)) / determinant;
  const b = ((xx * y1) - (xy * x1)) / determinant;
  if (a <= 0 || b <= 0) return null;

  const rx = 1 / Math.sqrt(a);
  const ry = 1 / Math.sqrt(b);
  if (!Number.isFinite(rx) || !Number.isFinite(ry)) return null;
  return {rx, ry};
}

function getEllipseFitFromLocalGeometry(localPoints, rotation, localCenter, rx, ry) {
  if (rx < 1 || ry < 1) return null;
  const center = rotateConversionPoint(localCenter, rotation);
  const fit = {
    handles: [{x: center.x - rx, y: center.y - ry}, {x: center.x + rx, y: center.y + ry}],
    rotation: normalizeHalfTurn(rotation),
    center,
    rx,
    ry
  };
  fit.error = getEllipseFitError(localPoints.map((point) => rotateConversionPoint(point, rotation)), fit);
  return fit;
}

function getEllipseFitError(points, fit) {
  let maxError = 0;
  const center = fit.center ?? getEllipseFitCenter(fit.handles);
  const rx = Math.max(Number(fit.rx) || Math.abs(fit.handles[1].x - fit.handles[0].x) / 2, 0.0001);
  const ry = Math.max(Number(fit.ry) || Math.abs(fit.handles[1].y - fit.handles[0].y) / 2, 0.0001);
  const rotation = Number(fit.rotation) || 0;
  for (const point of points) {
    const local = rotateConversionPoint({x: point.x - center.x, y: point.y - center.y}, -rotation);
    const normalized = Math.hypot(local.x / rx, local.y / ry);
    const radialError = Math.abs(normalized - 1) * Math.min(rx, ry);
    maxError = Math.max(maxError, radialError);
  }
  return maxError;
}

function getMaxSampledEllipsePolylineDistance(fit, points, closed=false) {
  const samples = Math.max(24, Math.min(160, points.length * 6));
  const path = closed ? [...points, points[0]] : points;
  let maxDistance = 0;
  for (let step = 0; step < samples; step += 1) {
    maxDistance = Math.max(maxDistance, getPointPolylineDistance(getEllipseFitPointAtFraction(fit, step / samples), path));
  }
  return maxDistance;
}

function rotateConversionPoint(point, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: (point.x * cos) - (point.y * sin),
    y: (point.x * sin) + (point.y * cos)
  };
}

function normalizeHalfTurn(angle) {
  const halfTurn = Math.PI;
  return ((angle % halfTurn) + halfTurn) % halfTurn;
}

function getOpenEllipseConversionGapData(group, fit) {
  const intervalData = getOpenEllipseCandidateIntervals(group, fit);
  if (!intervalData?.intervals?.length) return null;
  const {intervals, direction} = intervalData;

  const visibleSweep = intervals.reduce((total, interval) => total + Math.abs(interval.end - interval.start), 0);
  if (visibleSweep < 0.18 || visibleSweep >= 0.985) return null;

  const first = intervals[0];
  const last = intervals.at(-1);
  const gap = direction > 0
    ? normalizeAngleGap(last.end, first.start)
    : normalizeAngleGap(first.start, last.end);
  if (!gap || getAngleGapSize(gap) < 0.015) return null;

  const estimatedSegments = Math.round(group.candidates.length / clamp(visibleSweep, 0.2, 0.98));
  const segments = clamp(Math.max(8, estimatedSegments), group.candidates.length + 1, 96);
  return {
    segments,
    angleGaps: [gap],
    candidateIntervals: intervals.map((interval) => ({
      start: modulo(interval.start, 1),
      end: modulo(interval.end, 1)
    })),
    segmentIndexByCandidate: intervals.map((interval) => Math.floor(modulo((interval.start + interval.end) / 2, 1) * segments))
  };
}

function getOpenEllipseCandidateIntervals(group, fit) {
  if (group.points.length !== group.candidates.length + 1) return null;
  const unwrapped = getUnwrappedEllipseFractions(group.points, fit);
  if (!unwrapped?.values) return null;
  return {
    direction: unwrapped.direction,
    intervals: group.candidates.map((_, index) => ({
      start: unwrapped.values[index],
      end: unwrapped.values[index + 1]
    }))
  };
}

function getUnwrappedEllipseFractions(points, fit) {
  if (points.length < 2) return null;
  const fractions = points.map((point) => getEllipsePointAngleFraction(point, fit));
  const forward = unwrapEllipseFractions(fractions, 1);
  const backward = unwrapEllipseFractions(fractions, -1);
  if (!forward || !backward) return null;
  return forward.sweep <= backward.sweep ? forward : backward;
}

function unwrapEllipseFractions(fractions, direction) {
  const values = [fractions[0]];
  for (let index = 1; index < fractions.length; index++) {
    let value = fractions[index];
    const previous = values[index - 1];
    if (direction > 0) {
      while (value < previous) value += 1;
    } else {
      while (value > previous) value -= 1;
    }
    values.push(value);
  }
  const sweep = Math.abs(values.at(-1) - values[0]);
  if (!Number.isFinite(sweep)) return null;
  return {values, sweep, direction};
}

function getEllipsePointAngleFraction(point, fit) {
  const center = fit.center ?? getEllipseFitCenter(fit.handles);
  const rx = Math.max(Number(fit.rx) || Math.abs(fit.handles[1].x - fit.handles[0].x) / 2, 0.0001);
  const ry = Math.max(Number(fit.ry) || Math.abs(fit.handles[1].y - fit.handles[0].y) / 2, 0.0001);
  const rotation = Number(fit.rotation) || 0;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const local = rotateConversionPoint({x: dx, y: dy}, -rotation);
  return modulo(Math.atan2(local.y / ry, local.x / rx) / (Math.PI * 2), 1);
}

function normalizeAngleGap(start, end) {
  const normalized = {
    start: modulo(start, 1),
    end: modulo(end, 1)
  };
  return getAngleGapSize(normalized) > 0 ? normalized : null;
}

function getAngleGapSize(gap) {
  return modulo((Number(gap?.end) || 0) - (Number(gap?.start) || 0), 1);
}

function buildEllipseConversionUpdates(group) {
  const ellipseId = foundry.utils.randomID();
  const wallIds = group.candidates.map((candidate) => candidate.wall.id);
  const coordinates = getConvertedEllipseWallCoordinates(group);
  const wallTypeBySegment = {};
  const wallDataBySegment = {};
  for (let index = 0; index < group.candidates.length; index++) {
    const candidate = group.candidates[index];
    const key = String(group.segmentIndexByCandidate?.[index] ?? index);
    const tool = getWallTypeToolFromDocument(candidate.wall);
    if (tool) wallTypeBySegment[key] = tool;
    const preserved = getPreservedWallDataFromDocument(candidate.wall, MODULE_ID);
    if (preserved) wallDataBySegment[key] = preserved;
  }
  const wallTypeTool = getMostCommonWallTypeTool(Object.values(wallTypeBySegment));

  return group.candidates.map((candidate, index) => ({
    _id: candidate.wall.id,
    c: coordinates[index] ?? candidate.wall.c,
    [`flags.${MODULE_ID}.${ELLIPSE_FLAG}`]: {
      ellipseId,
      index: group.segmentIndexByCandidate?.[index] ?? index,
      segmentIndex: group.segmentIndexByCandidate?.[index] ?? index,
      wallIds: [],
      handles: clonePoints(group.handles),
      segments: group.segments,
      rotation: Number(group.rotation) || 0,
      segmentGaps: [],
      angleGaps: cloneAngleGaps(group.angleGaps),
      wallTypeBySegment: index === 0 ? cloneWallTypeBySegment(wallTypeBySegment) : {},
      wallDataBySegment: index === 0 ? cloneWallDataBySegment(wallDataBySegment) : {},
      wallTypeTool
    }
  }));
}

function getConvertedEllipseWallCoordinates(group) {
  if (group._convertedEllipseWallCoordinates) return group._convertedEllipseWallCoordinates;
  const [a, b] = group.handles;
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const rx = Math.abs(b.x - a.x) / 2;
  const ry = Math.abs(b.y - a.y) / 2;
  const fit = {
    handles: group.handles,
    center: {x: cx, y: cy},
    rx,
    ry,
    rotation: Number(group.rotation) || 0
  };
  if (Array.isArray(group.candidateIntervals) && group.candidateIntervals.length === group.candidates.length) {
    group._convertedEllipseWallCoordinates = group.candidateIntervals.map((interval) => {
      const start = getEllipseFitPointAtFraction(fit, interval.start);
      const end = getEllipseFitPointAtFraction(fit, interval.end);
      return getRoundedWallCoordinates(start, end);
    });
    return group._convertedEllipseWallCoordinates;
  }

  const points = [];
  for (let index = 0; index <= group.segments; index++) {
    points.push(getEllipseFitPointAtFraction(fit, index / group.segments));
  }
  group._convertedEllipseWallCoordinates = group.candidates.map((_, index) => getRoundedWallCoordinates(points[index], points[index + 1]));
  return group._convertedEllipseWallCoordinates;
}

function getEllipseFitCenter(handles) {
  const [a, b] = handles;
  return {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
}

function getEllipseFitPointAtFraction(fit, fraction) {
  const center = fit.center ?? getEllipseFitCenter(fit.handles);
  const rx = Number(fit.rx) || Math.abs(fit.handles[1].x - fit.handles[0].x) / 2;
  const ry = Number(fit.ry) || Math.abs(fit.handles[1].y - fit.handles[0].y) / 2;
  const rotation = Number(fit.rotation) || 0;
  const angle = Math.PI * 2 * fraction;
  const x = Math.cos(angle) * rx;
  const y = Math.sin(angle) * ry;
  return {
    x: center.x + (x * Math.cos(rotation)) - (y * Math.sin(rotation)),
    y: center.y + (x * Math.sin(rotation)) + (y * Math.cos(rotation))
  };
}

function cloneAngleGaps(gaps) {
  return (Array.isArray(gaps) ? gaps : [])
    .map((gap) => ({
      start: modulo(Number(gap?.start) || 0, 1),
      end: modulo(Number(gap?.end) || 0, 1)
    }))
    .filter((gap) => getAngleGapSize(gap) > 0.000001);
}

function convertPolylineLineRunsToBezier(group) {
  if (group.closed || group.candidates.length < 5 || group.points.length < 6) return null;
  if (!canCompressWallDataForCurve(group.candidates)) return null;

  const fit = getCubicBezierFit(group.points);
  if (!fit) return null;
  return {
    ...group,
    points: [cloneConversionPoint(group.points[0]), cloneConversionPoint(group.points.at(-1))],
    segmentCurves: {
      "0": {
        mode: POLYLINE_SEGMENT_BEZIER,
        handles: fit.handles
      }
    },
    curveSegmentsBySegment: {
      "0": group.candidates.length
    },
    segmentIndexByCandidate: group.candidates.map(() => 0)
  };
}

function getCubicBezierFit(points) {
  if (getMaxPointSegmentDistance(points, points[0], points.at(-1)) <= getConversionBaseFitTolerance(points)) return null;
  if (!hasSmoothBezierTurns(points)) return null;

  const parameterSets = [
    getUniformParameters(points),
    getChordLengthParameters(points),
    getCentripetalParameters(points)
  ].filter(Boolean);

  let best = null;
  for (const parameters of parameterSets) {
    const fit = getCubicBezierFitForParameters(points, parameters);
    if (!fit) continue;
    if (!best || fit.error < best.error) best = fit;
  }
  if (!best) return null;
  if (best.error > getConversionFitTolerance(points, "bezier") * 1.2) return null;

  return best;
}

function getCubicBezierFitForParameters(points, parameters) {
  if (!Array.isArray(parameters) || parameters.length !== points.length) return null;

  const p0 = points[0];
  const p3 = points.at(-1);
  let aa = 0;
  let ab = 0;
  let bb = 0;
  let rxA = 0;
  let rxB = 0;
  let ryA = 0;
  let ryB = 0;

  for (let index = 1; index < points.length - 1; index++) {
    const t = parameters[index];
    const inv = 1 - t;
    const a = 3 * inv * inv * t;
    const b = 3 * inv * t * t;
    const baseX = (inv * inv * inv * p0.x) + (t * t * t * p3.x);
    const baseY = (inv * inv * inv * p0.y) + (t * t * t * p3.y);
    const targetX = points[index].x - baseX;
    const targetY = points[index].y - baseY;
    aa += a * a;
    ab += a * b;
    bb += b * b;
    rxA += a * targetX;
    rxB += b * targetX;
    ryA += a * targetY;
    ryB += b * targetY;
  }

  const determinant = (aa * bb) - (ab * ab);
  if (Math.abs(determinant) < 0.0001) return null;

  const c1 = {
    x: ((rxA * bb) - (rxB * ab)) / determinant,
    y: ((ryA * bb) - (ryB * ab)) / determinant
  };
  const c2 = {
    x: ((aa * rxB) - (ab * rxA)) / determinant,
    y: ((aa * ryB) - (ab * ryA)) / determinant
  };
  if (!isFiniteConversionPoint(c1) || !isFiniteConversionPoint(c2)) return null;

  let maxError = 0;
  for (let index = 1; index < points.length - 1; index++) {
    const point = getCubicBezierPoint(p0, c1, c2, p3, parameters[index]);
    maxError = Math.max(maxError, Math.hypot(point.x - points[index].x, point.y - points[index].y));
  }
  const reverseError = getMaxSampledCurvePolylineDistance(points, (t) => getCubicBezierPoint(p0, c1, c2, p3, t));

  return {handles: [c1, c2], error: Math.max(maxError, reverseError), vertexError: maxError, reverseError};
}

function getUniformParameters(points) {
  const last = points.length - 1;
  if (last <= 0) return null;
  return points.map((_, index) => index / last);
}

function getChordLengthParameters(points) {
  return getDistanceWeightedParameters(points, 1);
}

function getCentripetalParameters(points) {
  return getDistanceWeightedParameters(points, 0.5);
}

function getDistanceWeightedParameters(points, power) {
  const lengths = getPolylineSegmentLengths(points).map((length) => Math.pow(length, power));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total < 0.1) return null;

  const parameters = [0];
  let distance = 0;
  for (const length of lengths) {
    distance += length;
    parameters.push(distance / total);
  }
  return parameters;
}

function convertPolylineLineRunsToCurves(group) {
  if (group.closed || group.candidates.length < 3 || group.points.length < 4) return group;

  const outputPoints = [];
  const outputCandidates = [];
  const segmentCurves = {};
  const curveSegmentsBySegment = {};
  const segmentIndexByCandidate = [];
  let pointIndex = 0;
  let candidateIndex = 0;
  let segmentIndex = 0;

  while (candidateIndex < group.candidates.length) {
    const bezierRun = measureActiveConversionTiming("beziers.findRuns", () => findBestBezierConversionRun(group, candidateIndex));
    const run = bezierRun ?? measureActiveConversionTiming("arcs.findRuns", () => findBestArcConversionRun(group, candidateIndex));
    if (run) {
      if (!outputPoints.length) outputPoints.push({...group.points[pointIndex]});
      outputCandidates.push(...group.candidates.slice(candidateIndex, run.endCandidate));
      for (let i = candidateIndex; i < run.endCandidate; i++) segmentIndexByCandidate.push(segmentIndex);
      outputPoints.push({...group.points[run.endPoint]});
      segmentCurves[String(segmentIndex)] = run.curve;
      curveSegmentsBySegment[String(segmentIndex)] = run.endCandidate - candidateIndex;
      candidateIndex = run.endCandidate;
      pointIndex = run.endPoint;
      segmentIndex++;
      continue;
    }

    if (!outputPoints.length) outputPoints.push({...group.points[pointIndex]});
    outputCandidates.push(group.candidates[candidateIndex]);
    segmentIndexByCandidate.push(segmentIndex);
    outputPoints.push({...group.points[pointIndex + 1]});
    candidateIndex++;
    pointIndex++;
    segmentIndex++;
  }

  return {
    ...group,
    candidates: outputCandidates,
    points: outputPoints,
    segmentCurves,
    curveSegmentsBySegment,
    segmentIndexByCandidate
  };
}

function findBestBezierConversionRun(group, startCandidate) {
  activeConversionTiming && (activeConversionTiming.counts.bezierRunChecks = (activeConversionTiming.counts.bezierRunChecks ?? 0) + 1);
  const minSegments = 5;
  const maxSegments = Math.min(24, group.candidates.length - startCandidate);
  let best = null;
  for (let count = maxSegments; count >= minSegments; count--) {
    const endCandidate = startCandidate + count;
    if (!canCompressWallDataForCandidateRange(group.candidates, startCandidate, endCandidate)) continue;

    const endPoint = startCandidate + count;
    const points = group.points.slice(startCandidate, endPoint + 1);
    const fit = getCubicBezierFit(points);
    if (!fit) continue;

    const run = {
      endCandidate,
      endPoint,
      curve: {
        mode: POLYLINE_SEGMENT_BEZIER,
        handles: fit.handles
      },
      error: fit.error,
      score: getCurveRunScore(fit.error, count, "bezier")
    };
    if (!best || run.score < best.score) best = run;
  }
  return best;
}

function findBestArcConversionRun(group, startCandidate) {
  activeConversionTiming && (activeConversionTiming.counts.arcRunChecks = (activeConversionTiming.counts.arcRunChecks ?? 0) + 1);
  const minSegments = 3;
  const maxSegments = Math.min(16, group.candidates.length - startCandidate);
  let best = null;
  for (let count = maxSegments; count >= minSegments; count--) {
    const endCandidate = startCandidate + count;
    if (!canCompressWallDataForCandidateRange(group.candidates, startCandidate, endCandidate)) continue;

    const endPoint = startCandidate + count;
    const points = group.points.slice(startCandidate, endPoint + 1);
    const fit = getArcFit(points);
    if (!fit) continue;

    const run = {
      endCandidate,
      endPoint,
      curve: {
        mode: POLYLINE_SEGMENT_ARC,
        handles: [fit.control]
      },
      error: fit.error,
      score: getCurveRunScore(fit.error, count, "arc")
    };
    if (!best || run.score < best.score) best = run;
  }
  return best;
}

function getCurveRunScore(error, segmentCount, kind) {
  const lengthBias = kind === "bezier" ? 0.35 : 0.25;
  return error - (segmentCount * lengthBias);
}

function getArcFit(points) {
  if (points.length < 4) return null;
  const circle = fitCircleFromThreePoints(points[0], points[Math.floor(points.length / 2)], points.at(-1));
  if (!circle) return null;

  const tolerance = getConversionFitTolerance(points, "arc");
  let maxError = 0;
  for (const point of points) {
    maxError = Math.max(maxError, Math.abs(Math.hypot(point.x - circle.x, point.y - circle.y) - circle.r));
  }
  if (maxError > tolerance) return null;
  if (!hasBalancedArcSegments(points)) return null;
  if (!hasSmoothArcTurns(points)) return null;

  const startAngle = Math.atan2(points[0].y - circle.y, points[0].x - circle.x);
  const endAngle = Math.atan2(points.at(-1).y - circle.y, points.at(-1).x - circle.x);
  const midAngle = Math.atan2(points[Math.floor(points.length / 2)].y - circle.y, points[Math.floor(points.length / 2)].x - circle.x);
  const sweep = getArcSweepThroughMidpoint(startAngle, midAngle, endAngle);
  if (Math.abs(sweep) < Math.PI / 8 || Math.abs(sweep) > Math.PI * 1.35) return null;
  if (!hasBalancedArcAngles(points, circle, startAngle, sweep)) return null;

  const mid = {
    x: circle.x + Math.cos(startAngle + (sweep / 2)) * circle.r,
    y: circle.y + Math.sin(startAngle + (sweep / 2)) * circle.r
  };
  const start = points[0];
  const end = points.at(-1);
  const control = {
    x: (2 * mid.x) - ((start.x + end.x) / 2),
    y: (2 * mid.y) - ((start.y + end.y) / 2)
  };
  const reverseError = getMaxSampledCurvePolylineDistance(points, (t) => getQuadraticBezierPoint(start, control, end, t));
  if (reverseError > tolerance) return null;

  return {
    error: Math.max(maxError, reverseError),
    vertexError: maxError,
    reverseError,
    control
  };
}

function hasBalancedArcSegments(points) {
  const lengths = getPolylineSegmentLengths(points);
  if (lengths.length < 3) return false;
  const median = getMedianNumber(lengths);
  if (median < 0.1) return false;

  const maxLength = Math.max(...lengths);
  return maxLength <= median * 2.4;
}

function hasSmoothArcTurns(points) {
  return hasDistributedCurveTurns(points, {
    minTotalTurn: Math.PI / 8,
    maxTurn: Math.PI * 0.32,
    minMeaningfulRatio: 0.55,
    maxTailRatio: 0.35,
    maxTurnRatio: 2.5
  });
}

function hasSmoothBezierTurns(points) {
  return hasDistributedCurveTurns(points, {
    minTotalTurn: Math.PI / 9,
    maxTurn: Math.PI * 0.42,
    minMeaningfulRatio: 0.4,
    maxTailRatio: 0.45,
    maxTurnRatio: 3
  });
}

function hasDistributedCurveTurns(points, {
  minTotalTurn,
  maxTurn,
  minMeaningfulRatio,
  maxTailRatio,
  maxTurnRatio
}) {
  const turns = getPolylineTurnAngles(points);
  if (turns.length < 2) return false;

  const absoluteTurns = turns.map((turn) => Math.abs(turn));
  const totalTurn = absoluteTurns.reduce((sum, turn) => sum + turn, 0);
  if (totalTurn < minTotalTurn) return false;
  if (Math.max(...absoluteTurns) > maxTurn) return false;

  const meaningfulTurns = turns
    .map((turn, index) => ({turn, index, absolute: Math.abs(turn)}))
    .filter((turn) => turn.absolute > Math.PI / 72);
  if (meaningfulTurns.length < Math.max(2, Math.ceil(turns.length * minMeaningfulRatio))) return false;
  if (hasOpposingMeaningfulTurns(meaningfulTurns)) return false;
  if (hasLongStraightCurveTail(points, meaningfulTurns, maxTailRatio)) return false;

  const median = getMedianNumber(meaningfulTurns.map((turn) => turn.absolute));
  if (median <= 0) return false;
  return Math.max(...meaningfulTurns.map((turn) => turn.absolute)) <= median * maxTurnRatio;
}

function hasOpposingMeaningfulTurns(turns) {
  let sign = 0;
  for (const turn of turns) {
    const current = Math.sign(turn.turn);
    if (!current) continue;
    if (!sign) {
      sign = current;
      continue;
    }
    if (sign !== current) return true;
  }
  return false;
}

function hasLongStraightCurveTail(points, meaningfulTurns, maxTailRatio) {
  const lengths = getPolylineSegmentLengths(points);
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  if (totalLength < 0.1 || !meaningfulTurns.length) return true;

  const firstTurnIndex = Math.min(...meaningfulTurns.map((turn) => turn.index));
  const lastTurnIndex = Math.max(...meaningfulTurns.map((turn) => turn.index));
  const leadingLength = lengths.slice(0, firstTurnIndex + 1).reduce((sum, length) => sum + length, 0);
  const trailingLength = lengths.slice(lastTurnIndex + 1).reduce((sum, length) => sum + length, 0);
  return leadingLength / totalLength > maxTailRatio || trailingLength / totalLength > maxTailRatio;
}

function getPolylineTurnAngles(points) {
  const turns = [];
  for (let index = 1; index < points.length - 1; index++) {
    const ax = points[index].x - points[index - 1].x;
    const ay = points[index].y - points[index - 1].y;
    const bx = points[index + 1].x - points[index].x;
    const by = points[index + 1].y - points[index].y;
    const aLength = Math.hypot(ax, ay);
    const bLength = Math.hypot(bx, by);
    if (aLength < 0.1 || bLength < 0.1) continue;
    const cross = (ax * by) - (ay * bx);
    const dot = (ax * bx) + (ay * by);
    turns.push(Math.atan2(cross, dot));
  }
  return turns;
}

function hasBalancedArcAngles(points, circle, startAngle, sweep) {
  const angles = points.map((point) =>
    getAngleProgress(startAngle, Math.atan2(point.y - circle.y, point.x - circle.x), sweep));
  const deltas = [];
  for (let i = 0; i < angles.length - 1; i++) {
    const delta = angles[i + 1] - angles[i];
    if (delta <= 0) return false;
    deltas.push(delta);
  }

  const median = getMedianNumber(deltas);
  if (median <= 0) return false;
  return Math.max(...deltas) <= median * 2.4;
}

function getPolylineSegmentLengths(points) {
  const lengths = [];
  for (let i = 0; i < points.length - 1; i++) {
    lengths.push(Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y));
  }
  return lengths;
}

function getMedianNumber(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function getAngleProgress(start, angle, sweep) {
  if (sweep >= 0) return normalizeAngle(angle - start);
  return -normalizeAngle(start - angle);
}

function fitCircleFromThreePoints(a, b, c) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 0.0001) return null;
  const a2 = (a.x * a.x) + (a.y * a.y);
  const b2 = (b.x * b.x) + (b.y * b.y);
  const c2 = (c.x * c.x) + (c.y * c.y);
  const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  const r = Math.hypot(a.x - x, a.y - y);
  if (!Number.isFinite(r) || r < 1) return null;
  return {x, y, r};
}

function getArcSweepThroughMidpoint(start, mid, end) {
  const ccwSweep = normalizeAngle(end - start);
  const ccwMid = normalizeAngle(mid - start);
  if (ccwMid > 0 && ccwMid < ccwSweep) return ccwSweep;
  return ccwSweep - (Math.PI * 2);
}

function normalizeAngle(angle) {
  let result = angle % (Math.PI * 2);
  if (result < 0) result += Math.PI * 2;
  return result;
}

function canCompressWallDataForCurve(candidates) {
  if (candidates.length < 3) return false;
  return canCompressWallDataForCandidateRange(candidates, 0, candidates.length);
}

function canCompressWallDataForCandidateRange(candidates, start, end) {
  if (end - start < 3) return false;
  const first = candidates[start];
  if (!first) return false;
  for (let index = start + 1; index < end; index++) {
    const candidate = candidates[index];
    if (candidate?.wallTypeTool !== first.wallTypeTool || candidate.comparableWallData !== first.comparableWallData) return false;
  }
  return true;
}

function getComparablePreservedWallData(wall) {
  return JSON.stringify(getPreservedWallDataFromDocument(wall, MODULE_ID) ?? {});
}

function getWallLevelsKey(wall) {
  const source = wall?.toObject ? wall.toObject(false) : wall;
  const levels = source?.levels ?? wall?.levels;
  if (!levels) return "";

  const values = levels instanceof Set
    ? [...levels]
    : Array.isArray(levels)
      ? levels
      : Object.values(levels);

  return values
    .map((level) => String(level))
    .filter((level) => level.length)
    .sort((a, b) => a.localeCompare(b))
    .join("|");
}

function getConversionPointBounds(points) {
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y)
  }), {
    minX: points[0]?.x ?? 0,
    minY: points[0]?.y ?? 0,
    maxX: points[0]?.x ?? 0,
    maxY: points[0]?.y ?? 0
  });
}

function getConversionFitTolerance(points, kind) {
  const tolerance = getConversionBaseFitTolerance(points) * getConversionToleranceMultiplier(kind);
  const cap = CONVERSION_FIT_TOLERANCE_PIXEL_CAPS[kind];
  return Number.isFinite(cap) ? Math.min(tolerance, cap) : tolerance;
}

function getConversionBaseFitTolerance(points) {
  const bounds = getConversionPointBounds(points);
  const diagonal = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  return clamp(diagonal * 0.025, 3, 18);
}

function getRectangleAxisToleranceFromLength(length) {
  return clamp(length * 0.03, 3, 24) * getConversionToleranceMultiplier("rectangle");
}

function getRectangleBoundsTolerance({minX, minY, maxX, maxY}) {
  const diagonal = Math.hypot(maxX - minX, maxY - minY);
  return clamp(diagonal * 0.015, 1.5, 18) * getConversionToleranceMultiplier("rectangle");
}

function getMaxPointSegmentDistance(points, a, b) {
  return points.reduce((max, point) => Math.max(max, getPointSegmentDistance(point, a, b)), 0);
}

function getPointSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = (dx * dx) + (dy * dy);
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);

  const t = clamp((((point.x - start.x) * dx) + ((point.y - start.y) * dy)) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

function getMaxSampledCurvePolylineDistance(points, getPoint) {
  const samples = Math.max(12, Math.min(96, (points.length - 1) * 6));
  let maxDistance = 0;
  for (let step = 1; step < samples; step++) {
    maxDistance = Math.max(maxDistance, getPointPolylineDistance(getPoint(step / samples), points));
  }
  return maxDistance;
}

function getPointPolylineDistance(point, points) {
  let minDistance = Infinity;
  for (let index = 0; index < points.length - 1; index++) {
    minDistance = Math.min(minDistance, getPointSegmentDistance(point, points[index], points[index + 1]));
  }
  return Number.isFinite(minDistance) ? minDistance : 0;
}

function buildPolylineConversionUpdates(group) {
  const polylineId = foundry.utils.randomID();
  const wallIds = group.candidates.map((candidate) => candidate.wall.id);
  const coordinates = getConvertedPolylineWallCoordinates(group);
  const wallTypeBySegment = {};
  const wallDataBySegment = {};
  for (let index = 0; index < group.candidates.length; index++) {
    const candidate = group.candidates[index];
    const key = String(group.segmentIndexByCandidate?.[index] ?? index);
    const tool = getWallTypeToolFromDocument(candidate.wall);
    if (tool) wallTypeBySegment[key] = tool;
    const preserved = getPreservedWallDataFromDocument(candidate.wall, MODULE_ID);
    if (preserved) wallDataBySegment[key] = preserved;
  }
  const wallTypeTool = getMostCommonWallTypeTool(Object.values(wallTypeBySegment));

  return group.candidates.map((candidate, index) => ({
    _id: candidate.wall.id,
    c: coordinates[index] ?? candidate.wall.c,
    [`flags.${MODULE_ID}.${POLYLINE_FLAG}`]: {
      polylineId,
      index: group.segmentIndexByCandidate?.[index] ?? index,
      wallIds: [],
      points: index === 0 ? clonePoints(group.points) : [],
      closed: group.closed,
      segmentGaps: [],
      segmentCurves: index === 0 ? clonePolylineSegmentCurves(group.segmentCurves) : {},
      curveSegments: DEFAULT_POLYLINE_CURVE_SEGMENTS,
      curveSegmentsBySegment: index === 0 ? clonePolylineCurveSegmentsBySegment(group.curveSegmentsBySegment) : {},
      wallTypeBySegment: index === 0 ? cloneWallTypeBySegment(wallTypeBySegment) : {},
      wallDataBySegment: index === 0 ? cloneWallDataBySegment(wallDataBySegment) : {},
      wallTypeTool
    }
  }));
}

function getConvertedPolylineWallCoordinates(group) {
  if (group._convertedPolylineWallCoordinates) return group._convertedPolylineWallCoordinates;
  const coordinates = [];
  const segmentCount = group.closed ? group.points.length : Math.max(group.points.length - 1, 0);
  for (let index = 0; index < segmentCount; index++) {
    const a = group.points[index];
    const b = group.points[index + 1] ?? group.points[0];
    const curve = group.segmentCurves?.[String(index)];
    if (curve?.mode === POLYLINE_SEGMENT_ARC && curve.handles?.[0]) {
      const subdivisions = Math.max(Number(group.curveSegmentsBySegment?.[String(index)]) || DEFAULT_POLYLINE_CURVE_SEGMENTS, 1);
      let previous = a;
      for (let step = 1; step <= subdivisions; step++) {
        const next = getQuadraticBezierPoint(a, curve.handles[0], b, step / subdivisions);
        coordinates.push(getRoundedWallCoordinates(previous, next));
        previous = next;
      }
      continue;
    }
    if (curve?.mode === POLYLINE_SEGMENT_BEZIER && curve.handles?.length >= 2) {
      const subdivisions = Math.max(Number(group.curveSegmentsBySegment?.[String(index)]) || DEFAULT_POLYLINE_CURVE_SEGMENTS, 1);
      let previous = a;
      for (let step = 1; step <= subdivisions; step++) {
        const next = getCubicBezierPoint(a, curve.handles[0], curve.handles[1], b, step / subdivisions);
        coordinates.push(getRoundedWallCoordinates(previous, next));
        previous = next;
      }
      continue;
    }
    coordinates.push(getRoundedWallCoordinates(a, b));
  }
  group._convertedPolylineWallCoordinates = coordinates;
  return coordinates;
}

function getQuadraticBezierPoint(a, control, b, t) {
  const inv = 1 - t;
  return {
    x: (inv * inv * a.x) + (2 * inv * t * control.x) + (t * t * b.x),
    y: (inv * inv * a.y) + (2 * inv * t * control.y) + (t * t * b.y)
  };
}

function getRoundedWallCoordinates(a, b) {
  return [
    Math.round(a.x),
    Math.round(a.y),
    Math.round(b.x),
    Math.round(b.y)
  ];
}

function cloneConversionPoint(point) {
  return {x: Number(point?.x) || 0, y: Number(point?.y) || 0};
}

function isFiniteConversionPoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

function getMostCommonWallTypeTool(tools) {
  const counts = new Map();
  for (const tool of tools) {
    if (!tool) continue;
    counts.set(tool, (counts.get(tool) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "walls";
}

function conversionPointKey(point) {
  return `${Math.round(point.x)},${Math.round(point.y)}`;
}

function conversionPointFromKey(key) {
  const [x, y] = String(key).split(",").map((value) => Number(value) || 0);
  return {x, y};
}

function modulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}
