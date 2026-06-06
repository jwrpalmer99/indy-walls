import {
  clamp,
  clonePoints
} from "./curve-common.js";
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
  POLYLINE_SEGMENT_ARC
} from "./shapes/polyline.js";
import {CUBIC_FLAG} from "./shapes/cubic.js";
import {
  cloneWallDataBySegment,
  getPreservedWallDataFromDocument
} from "./wall-preservation.js";
import {getWallTypeToolFromDocument} from "./wall-types.js";

const MODULE_ID = "indy-walls";

let convertingToIndyWalls = false;

export async function convertSceneWallsToIndyWalls() {
  if (!game.user.isGM || !canvas?.scene) return;
  if (convertingToIndyWalls) return;
  convertingToIndyWalls = true;

  try {
    const candidates = getPlainWallConversionCandidates();
    if (!candidates.length) {
      ui.notifications?.info(game.i18n.localize("indy-walls.Notifications.NoWallsToConvert"));
      return;
    }

    const rectangleGroups = detectRectangleConversionGroups(candidates);
    const usedIds = new Set(rectangleGroups.flatMap((group) => group.records.map((record) => record.wall.id)));
    const remaining = candidates.filter((candidate) => !usedIds.has(candidate.wall.id));
    const refinedPolylines = refineConvertedPolylineGroups(detectPolylineConversionGroups(remaining));
    const updates = [
      ...rectangleGroups.flatMap((group) => buildRectangleConversionUpdates(group)),
      ...refinedPolylines.ellipseGroups.flatMap((group) => buildEllipseConversionUpdates(group)),
      ...refinedPolylines.polylineGroups.flatMap((group) => buildPolylineConversionUpdates(group))
    ];

    if (!updates.length) {
      ui.notifications?.info(game.i18n.localize("indy-walls.Notifications.NoWallsToConvert"));
      return;
    }

    await canvas.scene.updateEmbeddedDocuments("Wall", updates);
    ui.notifications?.info(game.i18n.format("indy-walls.Notifications.WallsConvertedToIndy", {
      count: updates.length,
      rectangles: rectangleGroups.length,
      ellipses: refinedPolylines.ellipseGroups.length,
      polylines: refinedPolylines.polylineGroups.length
    }));
  } finally {
    convertingToIndyWalls = false;
  }
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

  return {
    wall,
    a,
    b,
    aKey: conversionPointKey(a),
    bKey: conversionPointKey(b),
    horizontal: a.y === b.y,
    vertical: a.x === b.x
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
  const sideItems = {top: [], right: [], bottom: [], left: []};
  for (const candidate of component) {
    const item = getRectangleSideConversionItem(candidate, {minX, minY, maxX, maxY});
    if (item) sideItems[item.side].push(item);
  }

  if (!rectangleSideFullyCovered(sideItems.top, minX, maxX)
    || !rectangleSideFullyCovered(sideItems.right, minY, maxY)
    || !rectangleSideFullyCovered(sideItems.bottom, minX, maxX)
    || !rectangleSideFullyCovered(sideItems.left, minY, maxY)) return null;

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
    handles: [{x: minX, y: minY}, {x: maxX, y: maxY}],
    sideSegments,
    sideRatios,
    sideEnabled: {top: true, right: true, bottom: true, left: true},
    sideGaps
  };
}

function getRectangleSideConversionItem(candidate, bounds) {
  const {minX, minY, maxX, maxY} = bounds;
  const lowX = Math.min(candidate.a.x, candidate.b.x);
  const highX = Math.max(candidate.a.x, candidate.b.x);
  const lowY = Math.min(candidate.a.y, candidate.b.y);
  const highY = Math.max(candidate.a.y, candidate.b.y);

  if (candidate.horizontal && candidate.a.y === minY && lowX >= minX && highX <= maxX) {
    return {candidate, side: "top", start: lowX, end: highX};
  }
  if (candidate.horizontal && candidate.a.y === maxY && lowX >= minX && highX <= maxX) {
    return {candidate, side: "bottom", start: lowX, end: highX};
  }
  if (candidate.vertical && candidate.a.x === maxX && lowY >= minY && highY <= maxY) {
    return {candidate, side: "right", start: lowY, end: highY};
  }
  if (candidate.vertical && candidate.a.x === minX && lowY >= minY && highY <= maxY) {
    return {candidate, side: "left", start: lowY, end: highY};
  }
  return null;
}

function rectangleSideFullyCovered(items, min, max) {
  if (!items.length) return false;
  const ordered = [...items].sort((a, b) => a.start - b.start);
  let cursor = min;
  for (const item of ordered) {
    if (item.start > cursor) return false;
    cursor = Math.max(cursor, item.end);
  }
  return cursor >= max;
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
      .sort(compareConversionCandidates);
    if (nextEdges.length !== 1) break;
    edge = nextEdges[0];
  }

  return {candidates, points, closed};
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

  const aStart = conversionPointKey(a.points[0]);
  const aEnd = conversionPointKey(a.points.at(-1));
  const bStart = conversionPointKey(b.points[0]);
  const bEnd = conversionPointKey(b.points.at(-1));

  if (aEnd === bStart && canMergePolylineAtEndpoint(a, "end", b, "start")) {
    return {
      candidates: [...a.candidates, ...b.candidates],
      points: [...a.points, ...b.points.slice(1)],
      closed: false
    };
  }
  if (bEnd === aStart && canMergePolylineAtEndpoint(b, "end", a, "start")) {
    return {
      candidates: [...b.candidates, ...a.candidates],
      points: [...b.points, ...a.points.slice(1)],
      closed: false
    };
  }
  if (aStart === bStart && canMergePolylineAtEndpoint(a, "start", b, "start")) {
    return {
      candidates: [...reverseConversionCandidates(a.candidates), ...b.candidates],
      points: [...reverseConversionPoints(a.points), ...b.points.slice(1)],
      closed: false
    };
  }
  if (aEnd === bEnd && canMergePolylineAtEndpoint(a, "end", b, "end")) {
    return {
      candidates: [...a.candidates, ...reverseConversionCandidates(b.candidates)],
      points: [...a.points, ...reverseConversionPoints(b.points).slice(1)],
      closed: false
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
    polylineGroups.push(convertPolylineLineRunsToArcs(group));
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
  const tolerance = getConversionFitTolerance(points);
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
    segments: group.candidates.length
  };
}

function buildEllipseConversionUpdates(group) {
  const ellipseId = foundry.utils.randomID();
  const wallIds = group.candidates.map((candidate) => candidate.wall.id);
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
    if (!canCompressWallDataForArc(group.candidates.slice(startCandidate, endCandidate))) continue;
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

  const tolerance = getConversionFitTolerance(points);
  let maxError = 0;
  for (const point of points) {
    maxError = Math.max(maxError, Math.abs(Math.hypot(point.x - circle.x, point.y - circle.y) - circle.r));
  }
  if (maxError > tolerance) return null;
  if (!hasBalancedArcSegments(points)) return null;

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

function canCompressWallDataForArc(candidates) {
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

function getConversionFitTolerance(points) {
  const bounds = getConversionPointBounds(points);
  const diagonal = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  return clamp(diagonal * 0.025, 3, 18);
}

function buildPolylineConversionUpdates(group) {
  const polylineId = foundry.utils.randomID();
  const wallIds = group.candidates.map((candidate) => candidate.wall.id);
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
