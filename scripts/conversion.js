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

let convertingToIndyWalls = false;
let conversionPreviewSession = null;

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

    showConversionPreview(plan);
  } finally {
    convertingToIndyWalls = false;
  }
}

export async function commitConversionPreview() {
  if (!conversionPreviewSession?.plan?.updates?.length || !canvas?.scene) return;
  const plan = conversionPreviewSession.plan;
  clearConversionPreview();
  await canvas.scene.updateEmbeddedDocuments("Wall", plan.updates);
  ui.notifications?.info(game.i18n.format("indy-walls.Notifications.WallsConvertedToIndy", {
    count: plan.updates.length,
    rectangles: plan.rectangleGroups.length,
    ellipses: plan.ellipseGroups.length,
    polylines: plan.polylineGroups.length
  }));
}

export function cancelConversionPreview() {
  clearConversionPreview();
}

export function redrawConversionPreview() {
  if (!conversionPreviewSession) return;
  const plan = getSceneWallConversionPlan();
  if (!plan?.updates.length) {
    clearConversionPreviewGraphics();
    conversionPreviewSession.plan = plan;
    return;
  }
  conversionPreviewSession.plan = plan;
  drawConversionPreview(plan);
}

function getSceneWallConversionPlan() {
  const candidates = getPlainWallConversionCandidates();
  if (!candidates.length) return null;

  const rectangleGroups = detectRectangleConversionGroups(candidates);
  const usedIds = new Set(rectangleGroups.flatMap((group) => group.records.map((record) => record.wall.id)));
  const remaining = candidates.filter((candidate) => !usedIds.has(candidate.wall.id));
  const refinedPolylines = refineConvertedPolylineGroups(detectPolylineConversionGroups(remaining));
  const updates = [
    ...rectangleGroups.flatMap((group) => buildRectangleConversionUpdates(group)),
    ...refinedPolylines.ellipseGroups.flatMap((group) => buildEllipseConversionUpdates(group)),
    ...refinedPolylines.polylineGroups.flatMap((group) => buildPolylineConversionUpdates(group))
  ];

  return {
    updates,
    rectangleGroups,
    ellipseGroups: refinedPolylines.ellipseGroups,
    polylineGroups: refinedPolylines.polylineGroups
  };
}

function showConversionPreview(plan) {
  clearConversionPreview();
  conversionPreviewSession = {plan, graphics: null, controls: null, hoveredGroupId: null};
  drawConversionPreview(plan);
  renderConversionPreviewControls();
  window.addEventListener("pointermove", handleConversionPreviewPointerMove, {capture: true});
  window.addEventListener("pointerleave", handleConversionPreviewPointerLeave, {capture: true});
}

function clearConversionPreview() {
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
    const points = getConvertedPolylineSegmentPoints(a, b, curve, group.curveSegmentsBySegment?.[String(index)]);
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
  const [a, b] = group.handles;
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const rx = Math.abs(b.x - a.x) / 2;
  const ry = Math.abs(b.y - a.y) / 2;
  const points = [];
  for (let index = 0; index <= group.segments; index++) {
    const angle = (Math.PI * 2 * index) / group.segments;
    points.push({
      x: cx + (Math.cos(angle) * rx),
      y: cy + (Math.sin(angle) * ry)
    });
  }
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
  slider.addEventListener("input", () => setConversionTolerance(kind, Number(slider.value)));

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
  setConversionTolerance(kind, getConversionToleranceMultiplier(kind) + delta);
}

async function setConversionTolerance(kind, value) {
  const setting = CONVERSION_TOLERANCE_CONFIG[kind]?.setting;
  if (!setting) return;
  const next = clamp(Number.isFinite(Number(value)) ? Number(value) : 1, 0, 10);
  await game.settings?.set?.(MODULE_ID, setting, next);
  const controls = conversionPreviewSession?.controls?._indyWallsToleranceControls?.[kind];
  if (controls) {
    controls.slider.value = String(next);
    controls.value.textContent = next.toFixed(2);
  }
  redrawConversionPreview();
}

function getConversionToleranceMultiplier(kind) {
  const setting = CONVERSION_TOLERANCE_CONFIG[kind]?.setting;
  const value = setting ? getSettingNumber(setting, null) : null;
  const fallback = getSettingNumber(LEGACY_CONVERSION_TOLERANCE_SETTING, 1);
  const number = Number(value ?? fallback);
  return clamp(Number.isFinite(number) ? number : 1, 0, 10);
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
  plan.ellipseGroups.forEach((group, index) => considerGroup(`ellipse:${index}`, getCoordinateConversionPreviewSegments(getConvertedEllipseWallCoordinates(group))));
  plan.polylineGroups.forEach((group, index) => considerGroup(`polyline:${index}`, getPolylineConversionPreviewSegments(group)));
  return best;
}

function getRectangleConversionPreviewSegments(group) {
  return getCoordinateConversionPreviewSegments(Object.values(getConvertedRectangleWallCoordinates(group)));
}

function getCoordinateConversionPreviewSegments(coordinates) {
  return coordinates
    .filter((coords) => Array.isArray(coords) && coords.length >= 4)
    .map((coords) => [{x: coords[0], y: coords[1]}, {x: coords[2], y: coords[3]}]);
}

function getPolylineConversionPreviewSegments(group) {
  const segments = [];
  const segmentCount = group.closed ? group.points.length : Math.max(group.points.length - 1, 0);
  for (let index = 0; index < segmentCount; index++) {
    const a = group.points[index];
    const b = group.points[index + 1] ?? group.points[0];
    const curve = group.segmentCurves?.[String(index)];
    const points = getConvertedPolylineSegmentPoints(a, b, curve, group.curveSegmentsBySegment?.[String(index)]);
    for (let i = 0; i < points.length - 1; i++) segments.push([points[i], points[i + 1]]);
  }
  return segments;
}

function isPointNearConversionSegmentBounds(point, a, b, tolerance) {
  return point.x >= Math.min(a.x, b.x) - tolerance
    && point.x <= Math.max(a.x, b.x) + tolerance
    && point.y >= Math.min(a.y, b.y) - tolerance
    && point.y <= Math.max(a.y, b.y) + tolerance;
}


function getPlainWallConversionCandidates() {
  return getSceneWallDocuments()
    .filter((wall) => !hasIndyShapeFlag(wall))
    .map(getWallConversionCandidate)
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

function getWallConversionCandidate(wall) {
  const c = wall?.c;
  if (!Array.isArray(c) || c.length < 4) return null;

  const a = {x: Math.round(Number(c[0]) || 0), y: Math.round(Number(c[1]) || 0)};
  const b = {x: Math.round(Number(c[2]) || 0), y: Math.round(Number(c[3]) || 0)};
  if (a.x === b.x && a.y === b.y) return null;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const axisTolerance = getRectangleAxisTolerance(a, b);
  return {
    wall,
    a,
    b,
    aKey: conversionPointKey(a),
    bKey: conversionPointKey(b),
    levelKey: getWallLevelsKey(wall),
    horizontal: Math.abs(dy) <= axisTolerance,
    vertical: Math.abs(dx) <= axisTolerance
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

  const points = component.flatMap((candidate) => [candidate.a, candidate.b]);
  const xs = [...new Set(points.map((point) => point.x))].sort((a, b) => a - b);
  const ys = [...new Set(points.map((point) => point.y))].sort((a, b) => a - b);
  const candidates = [];
  for (let xi = 0; xi < xs.length - 1; xi++) {
    for (let xj = xi + 1; xj < xs.length; xj++) {
      for (let yi = 0; yi < ys.length - 1; yi++) {
        for (let yj = yi + 1; yj < ys.length; yj++) {
          const group = getRectangleConversionGroupForBounds(component, {
            minX: xs[xi],
            maxX: xs[xj],
            minY: ys[yi],
            maxY: ys[yj]
          });
          if (group) candidates.push({
            group,
            area: (xs[xj] - xs[xi]) * (ys[yj] - ys[yi])
          });
        }
      }
    }
  }

  const used = new Set();
  const groups = [];
  for (const {group} of candidates.sort((a, b) => b.area - a.area)) {
    if (group.records.some((record) => used.has(record.wall.id))) continue;
    group.records.forEach((record) => used.add(record.wall.id));
    groups.push(group);
  }
  return groups;
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
    ordered[side].forEach((item, index) => records.push({wall: item.candidate.wall, side, index}));
  }

  return {
    records,
    levelKey: component[0]?.levelKey ?? "",
    handles: [{x: minX, y: minY}, {x: maxX, y: maxY}],
    sideSegments,
    sideRatios,
    sideEnabled: {top: true, right: true, bottom: true, left: true},
    sideGaps
  };
}

function getRectangleSideConversionItem(candidate, bounds, tolerance) {
  const {minX, minY, maxX, maxY} = bounds;
  const lowX = Math.min(candidate.a.x, candidate.b.x);
  const highX = Math.max(candidate.a.x, candidate.b.x);
  const lowY = Math.min(candidate.a.y, candidate.b.y);
  const highY = Math.max(candidate.a.y, candidate.b.y);

  if (candidate.horizontal && Math.abs(candidate.a.y - minY) <= tolerance && lowX >= minX - tolerance && highX <= maxX + tolerance) {
    return {candidate, side: "top", start: clamp(lowX, minX, maxX), end: clamp(highX, minX, maxX)};
  }
  if (candidate.horizontal && Math.abs(candidate.a.y - maxY) <= tolerance && lowX >= minX - tolerance && highX <= maxX + tolerance) {
    return {candidate, side: "bottom", start: clamp(lowX, minX, maxX), end: clamp(highX, minX, maxX)};
  }
  if (candidate.vertical && Math.abs(candidate.a.x - maxX) <= tolerance && lowY >= minY - tolerance && highY <= maxY + tolerance) {
    return {candidate, side: "right", start: clamp(lowY, minY, maxY), end: clamp(highY, minY, maxY)};
  }
  if (candidate.vertical && Math.abs(candidate.a.x - minX) <= tolerance && lowY >= minY - tolerance && highY <= maxY + tolerance) {
    return {candidate, side: "left", start: clamp(lowY, minY, maxY), end: clamp(highY, minY, maxY)};
  }
  return null;
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
    const tool = getWallTypeToolFromDocument(record.wall);
    if (tool) wallTypeBySegment[key] = tool;
    const preserved = getPreservedWallDataFromDocument(record.wall, MODULE_ID);
    if (preserved) wallDataBySegment[key] = preserved;
  }
  const wallTypeTool = getMostCommonWallTypeTool(Object.values(wallTypeBySegment));

  return group.records.map((record, index) => ({
    _id: record.wall.id,
    c: coordinates[getRectangleSegmentKey(record)] ?? record.wall.c,
    [`flags.${MODULE_ID}.${RECTANGLE_FLAG}`]: {
      rectangleId,
      index,
      side: record.side,
      segmentIndex: record.index,
      wallIds,
      handles: clonePoints(group.handles),
      sideSegments: {...group.sideSegments},
      sideRatios: cloneRectangleSideRatios(group.sideRatios),
      sideEnabled: cloneRectangleSideEnabled(group.sideEnabled),
      sideGaps: cloneRectangleSideGaps(group.sideGaps),
      wallTypeBySegment: cloneWallTypeBySegment(wallTypeBySegment),
      wallDataBySegment: cloneWallDataBySegment(wallDataBySegment),
      wallTypeTool
    }
  }));
}

function getConvertedRectangleWallCoordinates(group) {
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
    const ellipse = getEllipseConversionGroup(group);
    if (ellipse) {
      ellipseGroups.push(ellipse);
      continue;
    }
    polylineGroups.push(convertPolylineLineRunsToBezier(group) ?? convertPolylineLineRunsToArcs(group));
  }
  return {ellipseGroups, polylineGroups};
}

function getEllipseConversionGroup(group) {
  if (!group.closed || group.candidates.length < 8 || group.points.length < 8) return null;

  const points = group.points;
  const bounds = getConversionPointBounds(points);
  const rx = (bounds.maxX - bounds.minX) / 2;
  const ry = (bounds.maxY - bounds.minY) / 2;
  if (rx < 1 || ry < 1) return null;

  const center = {x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2};
  const tolerance = getConversionFitTolerance(points, "ellipse");
  let maxError = 0;
  for (const point of points) {
    const normalized = Math.hypot((point.x - center.x) / rx, (point.y - center.y) / ry);
    const radialError = Math.abs(normalized - 1) * Math.min(rx, ry);
    maxError = Math.max(maxError, radialError);
  }
  if (maxError > tolerance) return null;

  const handles = [{x: bounds.minX, y: bounds.minY}, {x: bounds.maxX, y: bounds.maxY}];
  return {
    candidates: group.candidates,
    handles,
    segments: group.candidates.length,
    levelKey: group.levelKey
  };
}

function buildEllipseConversionUpdates(group) {
  const ellipseId = foundry.utils.randomID();
  const wallIds = group.candidates.map((candidate) => candidate.wall.id);
  const coordinates = getConvertedEllipseWallCoordinates(group);
  const wallTypeBySegment = {};
  const wallDataBySegment = {};
  for (let index = 0; index < group.candidates.length; index++) {
    const candidate = group.candidates[index];
    const key = String(index);
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
      index,
      wallIds,
      handles: clonePoints(group.handles),
      segments: group.segments,
      rotation: 0,
      segmentGaps: [],
      wallTypeBySegment: cloneWallTypeBySegment(wallTypeBySegment),
      wallDataBySegment: cloneWallDataBySegment(wallDataBySegment),
      wallTypeTool
    }
  }));
}

function getConvertedEllipseWallCoordinates(group) {
  const [a, b] = group.handles;
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const rx = Math.abs(b.x - a.x) / 2;
  const ry = Math.abs(b.y - a.y) / 2;
  const points = [];
  for (let index = 0; index <= group.segments; index++) {
    const angle = (Math.PI * 2 * index) / group.segments;
    points.push({
      x: cx + (Math.cos(angle) * rx),
      y: cy + (Math.sin(angle) * ry)
    });
  }
  return group.candidates.map((_, index) => getRoundedWallCoordinates(points[index], points[index + 1]));
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
  if (getMaxPointSegmentDistance(points, points[0], points.at(-1)) <= getConversionBaseFitTolerance(points)) return null;
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

  return {handles: [c1, c2], error: maxError};
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

function convertPolylineLineRunsToArcs(group) {
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
    const run = findBestArcConversionRun(group, candidateIndex);
    if (run) {
      if (!outputPoints.length) outputPoints.push({...group.points[pointIndex]});
      outputCandidates.push(...group.candidates.slice(candidateIndex, run.endCandidate));
      for (let i = candidateIndex; i < run.endCandidate; i++) segmentIndexByCandidate.push(segmentIndex);
      outputPoints.push({...group.points[run.endPoint]});
      segmentCurves[String(segmentIndex)] = {
        mode: POLYLINE_SEGMENT_ARC,
        handles: [run.control]
      };
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

function findBestArcConversionRun(group, startCandidate) {
  const minSegments = 3;
  const maxSegments = Math.min(16, group.candidates.length - startCandidate);
  let best = null;
  for (let count = minSegments; count <= maxSegments; count++) {
    const endCandidate = startCandidate + count;
    const endPoint = startCandidate + count;
    const points = group.points.slice(startCandidate, endPoint + 1);
    const fit = getArcFit(points);
    if (!fit) continue;
    if (!canCompressWallDataForCurve(group.candidates.slice(startCandidate, endCandidate))) continue;
    best = {
      endCandidate,
      endPoint,
      control: fit.control,
      error: fit.error
    };
  }
  return best;
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
  return {
    error: maxError,
    control: {
      x: (2 * mid.x) - ((start.x + end.x) / 2),
      y: (2 * mid.y) - ((start.y + end.y) / 2)
    }
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
  const turns = getPolylineTurnAngles(points).map((turn) => Math.abs(turn));
  if (turns.length < 2) return false;

  const totalTurn = turns.reduce((sum, turn) => sum + turn, 0);
  if (totalTurn < Math.PI / 8) return false;
  if (Math.max(...turns) > Math.PI * 0.38) return false;

  const meaningfulTurns = turns.filter((turn) => turn > Math.PI / 72);
  if (meaningfulTurns.length < Math.max(2, Math.ceil(turns.length * 0.5))) return false;

  const median = getMedianNumber(meaningfulTurns);
  if (median <= 0) return false;
  return Math.max(...meaningfulTurns) <= median * 3.5;
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
  const firstTool = getWallTypeToolFromDocument(candidates[0].wall);
  const firstData = getComparablePreservedWallData(candidates[0].wall);
  return candidates.every((candidate) =>
    getWallTypeToolFromDocument(candidate.wall) === firstTool
    && getComparablePreservedWallData(candidate.wall) === firstData);
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
  return getConversionBaseFitTolerance(points) * getConversionToleranceMultiplier(kind);
}

function getConversionBaseFitTolerance(points) {
  const bounds = getConversionPointBounds(points);
  const diagonal = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  return clamp(diagonal * 0.025, 3, 18);
}

function getRectangleAxisTolerance(a, b) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return clamp(length * 0.015, 1.5, 12) * getConversionToleranceMultiplier("rectangle");
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
      wallIds,
      points: clonePoints(group.points),
      closed: group.closed,
      segmentGaps: [],
      segmentCurves: clonePolylineSegmentCurves(group.segmentCurves),
      curveSegments: DEFAULT_POLYLINE_CURVE_SEGMENTS,
      curveSegmentsBySegment: clonePolylineCurveSegmentsBySegment(group.curveSegmentsBySegment),
      wallTypeBySegment: cloneWallTypeBySegment(wallTypeBySegment),
      wallDataBySegment: cloneWallDataBySegment(wallDataBySegment),
      wallTypeTool
    }
  }));
}

function getConvertedPolylineWallCoordinates(group) {
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
