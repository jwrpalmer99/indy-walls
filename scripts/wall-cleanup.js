const INDY_SHAPE_FLAGS = {
  cubic: "cubicBezier",
  ellipse: "ellipse",
  rectangle: "rectangle",
  polyline: "polyline"
};
let cleanupSceneWallsPromise = null;

export async function cleanupSceneWalls({moduleId, tolerance = 8, respectLevels = true, snapStandaloneTargets = false, simplifyPaths = false} = {}) {
  if (cleanupSceneWallsPromise) return cleanupSceneWallsPromise;
  cleanupSceneWallsPromise = cleanupSceneWallsOnce({moduleId, tolerance, respectLevels, snapStandaloneTargets, simplifyPaths});
  try {
    return await cleanupSceneWallsPromise;
  }
  finally {
    cleanupSceneWallsPromise = null;
  }
}

async function cleanupSceneWallsOnce({moduleId, tolerance = 8, respectLevels = true, snapStandaloneTargets = false, simplifyPaths = false} = {}) {
  if (!game.user?.isGM || !canvas?.scene) return null;

  const wallDocuments = getWallDocuments();
  if (!wallDocuments.length) {
    ui.notifications?.info(game.i18n.localize("indy-walls.Notifications.NoWallsToClean"));
    return {updated: 0, deleted: 0, snappedPoints: 0};
  }

  const records = buildWallRecords(wallDocuments, moduleId);
  const smartResult = smartAdjustWallEndpoints(records, Math.max(0, Number(tolerance) || 0), respectLevels, snapStandaloneTargets);
  const splitResult = splitPlainWallsAtIntersections(records, respectLevels);
  const endpoints = buildWallEndpoints(records);
  const snapResult = snapWallEndpoints(endpoints, Math.max(0, Number(tolerance) || 0), respectLevels);
  applyEndpointPointsToRecords(records, snapResult.pointsByEndpoint);
  const simplifyResult = simplifyPaths
    ? simplifyPlainWallPaths(records, Math.max(0, Number(tolerance) || 0), respectLevels)
    : {simplifiedWallCount: 0};
  const cleanupPlan = buildCleanupPlan(records);
  const shapeMetadataPatches = buildShapeMetadataPatches(moduleId, wallDocuments, cleanupPlan.coordinateByWallId, cleanupPlan.deleteIds);

  const deletions = Array.from(cleanupPlan.deleteIds);
  const updates = mergeWallUpdates(
    cleanupPlan.updates.filter((update) => !cleanupPlan.deleteIds.has(update._id)),
    shapeMetadataPatches
  );

  if (updates.length) await canvas.scene.updateEmbeddedDocuments("Wall", updates);
  const created = cleanupPlan.creates.length
    ? await canvas.scene.createEmbeddedDocuments("Wall", cleanupPlan.creates)
    : [];
  const existingDeletions = deletions.filter((id) => !!canvas.scene.walls?.get?.(id));
  if (existingDeletions.length) await canvas.scene.deleteEmbeddedDocuments("Wall", existingDeletions);

  if (updates.length || cleanupPlan.creates.length || existingDeletions.length) {
    ui.notifications?.info(formatNotification("indy-walls.Notifications.WallsCleaned", {
      updated: updates.length,
      created: created.length,
      deleted: existingDeletions.length,
      snapped: snapResult.snappedEndpointCount + smartResult.adjustedEndpointCount,
      split: splitResult.splitWallCount,
      simplified: simplifyResult.simplifiedWallCount
    }));
  }
  else ui.notifications?.info(game.i18n.localize("indy-walls.Notifications.WallsAlreadyClean"));

  return {
    updated: updates.length,
    created: created.length,
    deleted: existingDeletions.length,
    snappedPoints: snapResult.snappedEndpointCount + smartResult.adjustedEndpointCount,
    splitWalls: splitResult.splitWallCount,
    simplifiedWalls: simplifyResult.simplifiedWallCount
  };
}

function getWallDocuments() {
  const walls = canvas?.scene?.walls?.contents ?? Array.from(canvas?.scene?.walls ?? []);
  return walls.filter((wallDocument) => {
    const c = wallDocument?.c ?? wallDocument?.toObject?.()?.c;
    return Array.isArray(c)
      && c.length === 4
      && c.every(Number.isFinite);
  });
}

function buildWallRecords(wallDocuments, moduleId) {
  return wallDocuments.map((wallDocument, index) => ({
    id: wallDocument.id,
    originalId: wallDocument.id,
    wallDocument,
    baseData: null,
    c: [...wallDocument.c],
    originalC: [...wallDocument.c],
    levelKey: getWallLevelsKey(wallDocument),
    dataKey: getWallDataKey(wallDocument),
    canSplit: !hasIndyShapeFlag(moduleId, wallDocument) && !isDoorWallDocument(wallDocument),
    canSimplify: !hasIndyShapeFlag(moduleId, wallDocument) && !isDoorWallDocument(wallDocument),
    deleted: false,
    sort: index
  }));
}

function hasIndyShapeFlag(moduleId, wallDocument) {
  if (!moduleId) return false;
  return !!(wallDocument.getFlag?.(moduleId, INDY_SHAPE_FLAGS.cubic)
    || wallDocument.getFlag?.(moduleId, INDY_SHAPE_FLAGS.ellipse)
    || wallDocument.getFlag?.(moduleId, INDY_SHAPE_FLAGS.rectangle)
    || wallDocument.getFlag?.(moduleId, INDY_SHAPE_FLAGS.polyline));
}

function isDoorWallDocument(wallDocument) {
  const source = wallDocument?.toObject ? wallDocument.toObject(false) : wallDocument;
  return Number(source?.door ?? wallDocument?.door ?? 0) !== 0;
}

function buildWallEndpoints(records) {
  const endpoints = [];
  for (const record of records) {
    const [x1, y1, x2, y2] = record.c;
    endpoints.push({record, wallId: record.id, endpointIndex: 0, levelKey: record.levelKey, x: x1, y: y1});
    endpoints.push({record, wallId: record.id, endpointIndex: 1, levelKey: record.levelKey, x: x2, y: y2});
  }
  return endpoints;
}

function snapWallEndpoints(endpoints, tolerance, respectLevels=true) {
  const parent = endpoints.map((_, index) => index);
  const buckets = new Map();
  const bucketSize = Math.max(tolerance, 1);

  const find = (index) => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };

  for (let index = 0; index < endpoints.length; index += 1) {
    const endpoint = endpoints[index];
    const bx = Math.floor(endpoint.x / bucketSize);
    const by = Math.floor(endpoint.y / bucketSize);

    if (tolerance > 0) {
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          const bucket = buckets.get(getBucketKey(bx + dx, by + dy));
          if (!bucket) continue;
          for (const candidateIndex of bucket) {
            const candidate = endpoints[candidateIndex];
            if (candidate.record === endpoint.record) continue;
            if (respectLevels && candidate.levelKey !== endpoint.levelKey) continue;
            if (distance(endpoint, candidate) <= tolerance) union(index, candidateIndex);
          }
        }
      }
    }

    const bucketKey = getBucketKey(bx, by);
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    buckets.get(bucketKey).push(index);
  }

  const clusters = new Map();
  for (let index = 0; index < endpoints.length; index += 1) {
    const root = find(index);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(index);
  }

  const snappedPointsByRoot = new Map();
  const grid = getGridSnapInfo();
  let snappedEndpointCount = 0;
  for (const [root, indexes] of clusters.entries()) {
    const snapped = getClusterSnapPoint(indexes.map((index) => endpoints[index]), grid);
    snappedPointsByRoot.set(root, snapped);
    if (indexes.length > 1) snappedEndpointCount += indexes.length;
  }

  const pointsByEndpoint = new Map();
  for (let index = 0; index < endpoints.length; index += 1) {
    pointsByEndpoint.set(index, snappedPointsByRoot.get(find(index)));
  }

  return {pointsByEndpoint, snappedEndpointCount};
}

function smartAdjustWallEndpoints(records, tolerance, respectLevels=true, snapStandaloneTargets=false) {
  if (tolerance <= 0) return {adjustedEndpointCount: 0};

  const grid = snapStandaloneTargets ? getGridSnapInfo() : null;
  const sceneBounds = snapStandaloneTargets ? getSceneBounds() : null;
  let adjustedEndpointCount = 0;

  for (const record of records) {
    for (const endpointIndex of [0, 1]) {
      const endpoint = getRecordEndpoint(record, endpointIndex);
      const opposite = getRecordEndpoint(record, endpointIndex ? 0 : 1);
      const candidates = [];

      for (const target of records) {
        if (target === record) continue;
        if (!areRecordsCompatible(record, target, respectLevels)) continue;
        const projection = getPointProjectionOnSegment(endpoint, getRecordEndpoint(target, 0), getRecordEndpoint(target, 1));
        if (!projection || projection.t < 0 || projection.t > 1) continue;
        const distanceToSegment = distance(endpoint, projection.point);
        if (distanceToSegment <= tolerance) {
          candidates.push({point: projection.point, distance: distanceToSegment, priority: 1});
        }
      }

      if (snapStandaloneTargets) {
        const gridPoint = getEndpointGridLineSnapPoint(endpoint, opposite, grid, tolerance);
        if (gridPoint) candidates.push({point: gridPoint, distance: distance(endpoint, gridPoint), priority: 2});

        const edgePoint = getEndpointMapEdgeSnapPoint(endpoint, opposite, sceneBounds, tolerance);
        if (edgePoint) candidates.push({point: edgePoint, distance: distance(endpoint, edgePoint), priority: 3});
      }

      const best = candidates
        .filter((candidate) => !pointsAlmostEqual(candidate.point, opposite))
        .sort((a, b) => a.distance - b.distance || a.priority - b.priority)[0];
      if (!best || pointsAlmostEqual(endpoint, best.point)) continue;

      setRecordEndpoint(record, endpointIndex, best.point);
      adjustedEndpointCount += 1;
    }
  }

  return {adjustedEndpointCount};
}

function splitPlainWallsAtIntersections(records, respectLevels=true) {
  const splitParamsByRecord = new Map();

  for (let i = 0; i < records.length; i += 1) {
    const a = records[i];
    if (!a.canSplit) continue;
    for (let j = i + 1; j < records.length; j += 1) {
      const b = records[j];
      if (!b.canSplit) continue;
      if (!areRecordsCompatible(a, b, respectLevels)) continue;
      const intersection = getSegmentIntersection(
        getRecordEndpoint(a, 0),
        getRecordEndpoint(a, 1),
        getRecordEndpoint(b, 0),
        getRecordEndpoint(b, 1)
      );
      if (!intersection) continue;
      if (intersection.tA <= 0.0001 || intersection.tA >= 0.9999) continue;
      if (intersection.tB <= 0.0001 || intersection.tB >= 0.9999) continue;
      addSplitParam(splitParamsByRecord, a, intersection.tA);
      addSplitParam(splitParamsByRecord, b, intersection.tB);
    }
  }

  let splitWallCount = 0;
  for (const [record, params] of splitParamsByRecord.entries()) {
    const sorted = [...new Set(params.map((param) => Number(param.toFixed(6))))]
      .filter((param) => param > 0.0001 && param < 0.9999)
      .sort((a, b) => a - b);
    if (!sorted.length) continue;

    const points = [
      getRecordEndpoint(record, 0),
      ...sorted.map((param) => pointOnRecord(record, param)),
      getRecordEndpoint(record, 1)
    ].map(roundPoint);
    const baseData = getBaseWallCreateData(record);
    record.c = pointPairToCoordinates(points[0], points[1]);
    splitWallCount += 1;

    for (let index = 1; index < points.length - 1; index += 1) {
      records.push({
        id: null,
        originalId: record.originalId,
        wallDocument: record.wallDocument,
        baseData,
        c: pointPairToCoordinates(points[index], points[index + 1]),
        originalC: null,
        levelKey: record.levelKey,
        dataKey: record.dataKey,
        canSplit: false,
        canSimplify: record.canSimplify,
        deleted: false,
        sort: record.sort + (index / 100)
      });
    }
  }

  records.sort((a, b) => a.sort - b.sort);
  return {splitWallCount};
}

function addSplitParam(splitParamsByRecord, record, param) {
  if (!splitParamsByRecord.has(record)) splitParamsByRecord.set(record, []);
  splitParamsByRecord.get(record).push(param);
}

function areRecordsCompatible(a, b, respectLevels=true) {
  return !respectLevels || a.levelKey === b.levelKey;
}

function getRecordEndpoint(record, endpointIndex) {
  return endpointIndex
    ? {x: record.c[2], y: record.c[3]}
    : {x: record.c[0], y: record.c[1]};
}

function setRecordEndpoint(record, endpointIndex, point) {
  const rounded = roundPoint(point);
  if (endpointIndex) {
    record.c[2] = rounded.x;
    record.c[3] = rounded.y;
  } else {
    record.c[0] = rounded.x;
    record.c[1] = rounded.y;
  }
}

function getPointProjectionOnSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = (dx * dx) + (dy * dy);
  if (lengthSquared <= 0.0001) return null;
  const t = (((point.x - start.x) * dx) + ((point.y - start.y) * dy)) / lengthSquared;
  return {
    t,
    point: {
      x: start.x + (dx * t),
      y: start.y + (dy * t)
    }
  };
}

function getSegmentIntersection(a, b, c, d) {
  const r = {x: b.x - a.x, y: b.y - a.y};
  const s = {x: d.x - c.x, y: d.y - c.y};
  const denominator = cross(r, s);
  if (Math.abs(denominator) <= 0.0001) return null;

  const cMinusA = {x: c.x - a.x, y: c.y - a.y};
  const tA = cross(cMinusA, s) / denominator;
  const tB = cross(cMinusA, r) / denominator;
  if (tA < -0.0001 || tA > 1.0001 || tB < -0.0001 || tB > 1.0001) return null;

  return {
    tA,
    tB,
    point: {
      x: a.x + (r.x * tA),
      y: a.y + (r.y * tA)
    }
  };
}

function cross(a, b) {
  return (a.x * b.y) - (a.y * b.x);
}

function pointOnRecord(record, t) {
  const a = getRecordEndpoint(record, 0);
  const b = getRecordEndpoint(record, 1);
  return {
    x: a.x + ((b.x - a.x) * t),
    y: a.y + ((b.y - a.y) * t)
  };
}

function getBaseWallCreateData(record) {
  const data = record.wallDocument.toObject(false);
  delete data._id;
  delete data.c;
  return foundry.utils.deepClone(data);
}

function pointPairToCoordinates(a, b) {
  return [a.x, a.y, b.x, b.y];
}

function applyEndpointPointsToRecords(records, pointsByEndpoint) {
  for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
    const start = pointsByEndpoint.get(recordIndex * 2);
    const end = pointsByEndpoint.get((recordIndex * 2) + 1);
    if (!start || !end) continue;
    records[recordIndex].c = pointPairToCoordinates(start, end);
  }
}

function simplifyPlainWallPaths(records, tolerance, respectLevels=true) {
  if (tolerance <= 0) return {simplifiedWallCount: 0};

  let simplifiedWallCount = 0;
  const groups = getSimplifiableRecordGroups(records, respectLevels);
  for (const group of groups) {
    const paths = getSimplifiableRecordPaths(group);
    for (const path of paths) {
      const changed = simplifyRecordPath(path, tolerance);
      if (changed > 0) simplifiedWallCount += changed;
    }
  }
  return {simplifiedWallCount};
}

function getSimplifiableRecordGroups(records, respectLevels=true) {
  const groups = new Map();
  for (const record of records) {
    if (!record.canSimplify || record.deleted || pointsEqual(getRecordEndpoint(record, 0), getRecordEndpoint(record, 1))) continue;
    const key = `${respectLevels ? record.levelKey : ""}::${record.dataKey}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return [...groups.values()].filter((group) => group.length >= 2);
}

function getSimplifiableRecordPaths(group) {
  const byPoint = new Map();
  for (const record of group) {
    for (const point of [getRecordEndpoint(record, 0), getRecordEndpoint(record, 1)]) {
      const key = pointKey(point);
      if (!byPoint.has(key)) byPoint.set(key, []);
      byPoint.get(key).push(record);
    }
  }

  const visited = new Set();
  const paths = [];
  const junctionKeys = [...byPoint.entries()]
    .filter(([, edges]) => edges.length !== 2)
    .map(([key]) => key)
    .sort();

  for (const startKey of junctionKeys) {
    for (const record of byPoint.get(startKey) ?? []) {
      if (visited.has(recordKey(record))) continue;
      paths.push(traceSimplifiableRecordPath(record, startKey, byPoint, visited, false));
    }
  }

  for (const record of group.sort((a, b) => a.sort - b.sort)) {
    if (visited.has(recordKey(record))) continue;
    paths.push(traceSimplifiableRecordPath(record, pointKey(getRecordEndpoint(record, 0)), byPoint, visited, true));
  }

  return paths.filter((path) => path.records.length >= 2 && path.points.length >= 3);
}

function traceSimplifiableRecordPath(firstRecord, startKey, byPoint, visited, allowClosed) {
  const records = [];
  const points = [pointFromKey(startKey)];
  let currentKey = startKey;
  let record = firstRecord;
  let closed = false;

  while (record && !visited.has(recordKey(record))) {
    visited.add(recordKey(record));
    records.push(record);
    const aKey = pointKey(getRecordEndpoint(record, 0));
    const bKey = pointKey(getRecordEndpoint(record, 1));
    const nextKey = aKey === currentKey ? bKey : aKey;
    if (nextKey === startKey && allowClosed) {
      closed = true;
      break;
    }
    points.push(pointFromKey(nextKey));
    currentKey = nextKey;

    const nextRecords = (byPoint.get(currentKey) ?? [])
      .filter((candidate) => !visited.has(recordKey(candidate)))
      .sort((a, b) => a.sort - b.sort);
    if (nextRecords.length !== 1) break;
    record = nextRecords[0];
  }

  return {records, points, closed};
}

function simplifyRecordPath(path, tolerance) {
  if (path.closed) return 0;
  const keepIndexes = simplifyPointIndexes(path.points, tolerance);
  if (keepIndexes.length >= path.points.length) return 0;
  if (keepIndexes.length < 2) return 0;

  let keptRecordIndex = 0;
  for (let index = 0; index < keepIndexes.length - 1; index += 1) {
    const record = path.records[keptRecordIndex++];
    record.c = pointPairToCoordinates(path.points[keepIndexes[index]], path.points[keepIndexes[index + 1]]);
  }

  let removed = 0;
  for (let index = keptRecordIndex; index < path.records.length; index += 1) {
    path.records[index].deleted = true;
    removed += 1;
  }
  return removed;
}

function simplifyPointIndexes(points, tolerance) {
  const keep = new Set([0, points.length - 1]);
  simplifyPointIndexesBetween(points, 0, points.length - 1, tolerance, keep);
  return [...keep].sort((a, b) => a - b);
}

function simplifyPointIndexesBetween(points, startIndex, endIndex, tolerance, keep) {
  if (endIndex <= startIndex + 1) return;
  const start = points[startIndex];
  const end = points[endIndex];
  let maxDistance = -1;
  let maxIndex = -1;
  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const pointDistance = getPointSegmentDistance(points[index], start, end);
    if (pointDistance > maxDistance) {
      maxDistance = pointDistance;
      maxIndex = index;
    }
  }
  if (maxDistance <= tolerance || maxIndex < 0) return;
  keep.add(maxIndex);
  simplifyPointIndexesBetween(points, startIndex, maxIndex, tolerance, keep);
  simplifyPointIndexesBetween(points, maxIndex, endIndex, tolerance, keep);
}

function getPointSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = (dx * dx) + (dy * dy);
  if (lengthSquared <= 0.0001) return distance(point, start);
  const t = Math.min(Math.max((((point.x - start.x) * dx) + ((point.y - start.y) * dy)) / lengthSquared, 0), 1);
  return distance(point, {
    x: start.x + (dx * t),
    y: start.y + (dy * t)
  });
}

function recordKey(record) {
  return record.id ?? `new:${record.sort}:${record.c.join(",")}`;
}

function pointKey(point) {
  return `${point.x},${point.y}`;
}

function pointFromKey(key) {
  const [x, y] = String(key).split(",").map((value) => Number(value) || 0);
  return {x, y};
}

function roundPoint(point) {
  return {x: Math.round(point.x), y: Math.round(point.y)};
}

function pointsAlmostEqual(a, b, epsilon=0.75) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= epsilon;
}

function getEndpointGridLineSnapPoint(endpoint, opposite, grid, tolerance) {
  if (!grid) return null;
  const candidates = [];
  const x = getNearestGridCoordinate(endpoint.x, grid.offsetX, grid.size);
  const y = getNearestGridCoordinate(endpoint.y, grid.offsetY, grid.size);
  if (Math.abs(endpoint.x - x) <= tolerance) candidates.push({x, y: endpoint.y});
  if (Math.abs(endpoint.y - y) <= tolerance) candidates.push({x: endpoint.x, y});
  return candidates
    .filter((point) => !pointsAlmostEqual(point, opposite))
    .sort((a, b) => distance(a, endpoint) - distance(b, endpoint))[0] ?? null;
}

function getEndpointMapEdgeSnapPoint(endpoint, opposite, sceneBounds, tolerance) {
  if (!sceneBounds) return null;
  const dx = endpoint.x - opposite.x;
  const dy = endpoint.y - opposite.y;
  if (Math.hypot(dx, dy) <= 0.0001) return null;

  const candidates = [];
  for (const x of [sceneBounds.minX, sceneBounds.maxX]) {
    if (Math.abs(dx) <= 0.0001) continue;
    const t = (x - opposite.x) / dx;
    if (t < 1) continue;
    const y = opposite.y + (dy * t);
    if (y >= sceneBounds.minY - 0.001 && y <= sceneBounds.maxY + 0.001) candidates.push({x, y, distance: distance(endpoint, {x, y})});
  }
  for (const y of [sceneBounds.minY, sceneBounds.maxY]) {
    if (Math.abs(dy) <= 0.0001) continue;
    const t = (y - opposite.y) / dy;
    if (t < 1) continue;
    const x = opposite.x + (dx * t);
    if (x >= sceneBounds.minX - 0.001 && x <= sceneBounds.maxX + 0.001) candidates.push({x, y, distance: distance(endpoint, {x, y})});
  }

  const best = candidates
    .filter((candidate) => candidate.distance <= tolerance)
    .sort((a, b) => a.distance - b.distance)[0];
  return best ? {x: best.x, y: best.y} : null;
}

function getSceneBounds() {
  const width = Number(canvas?.scene?.dimensions?.sceneWidth ?? canvas?.scene?.width);
  const height = Number(canvas?.scene?.dimensions?.sceneHeight ?? canvas?.scene?.height);
  const x = Number(canvas?.scene?.dimensions?.sceneX ?? 0) || 0;
  const y = Number(canvas?.scene?.dimensions?.sceneY ?? 0) || 0;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return {minX: x, minY: y, maxX: x + width, maxY: y + height};
}

function buildCleanupPlan(records) {
  const updates = [];
  const creates = [];
  const deleteIds = new Set();
  const seenSegments = new Map();
  const coordinateByWallId = new Map();

  const recordEntries = records
    .map((record, recordIndex) => ({record, recordIndex}))
    .sort((a, b) => Number(!a.record.id) - Number(!b.record.id) || a.record.sort - b.record.sort);

  for (const {record, recordIndex} of recordEntries) {
    const c = [...record.c];
    if (record.id) coordinateByWallId.set(record.id, c);

    if (record.deleted || pointsEqual(getRecordEndpoint(record, 0), getRecordEndpoint(record, 1))) {
      if (record.id) deleteIds.add(record.id);
      continue;
    }

    const segmentKey = `${getUndirectedCoordinateKey(c)}::${record.dataKey}`;
    const existingWallId = seenSegments.get(segmentKey);
    if (existingWallId) {
      if (record.id) deleteIds.add(record.id);
      continue;
    }
    seenSegments.set(segmentKey, record.id ?? `new:${recordIndex}`);

    if (record.id) {
      if (!coordinatesEqual(record.originalC, c)) updates.push({_id: record.id, c});
    } else {
      creates.push({...foundry.utils.deepClone(record.baseData), c});
    }
  }

  return {updates, creates, deleteIds, coordinateByWallId};
}

function buildShapeMetadataPatches(moduleId, wallDocuments, coordinateByWallId, deleteIds) {
  if (!moduleId) return [];

  const groups = collectIndyShapeGroups(moduleId, wallDocuments);
  const groupsByWallId = getShapeGroupsByWallId(groups);

  for (const wallDocument of wallDocuments) {
    if (deleteIds.has(wallDocument.id)) continue;
    const c = coordinateByWallId.get(wallDocument.id);
    if (!c || coordinatesEqual(wallDocument.c, c)) continue;

    const movedEndpoints = [
      {from: {x: wallDocument.c[0], y: wallDocument.c[1]}, to: {x: c[0], y: c[1]}},
      {from: {x: wallDocument.c[2], y: wallDocument.c[3]}, to: {x: c[2], y: c[3]}}
    ];

    for (const group of groupsByWallId.get(wallDocument.id) ?? []) {
      for (const endpoint of movedEndpoints) updateShapeGroupPoint(group, endpoint.from, endpoint.to);
    }
  }

  const patches = [];
  for (const group of groups.values()) {
    if (!group.changed) continue;
    const existingIds = [...group.ids].filter((id) => canvas.scene.walls?.has?.(id) && !deleteIds.has(id));
    for (const id of existingIds) {
      patches.push({
        _id: id,
        [`flags.${moduleId}.${group.flag}.wallIds`]: existingIds
      });
      if (group.handles) patches.at(-1)[`flags.${moduleId}.${group.flag}.handles`] = group.handles;
      if (group.points) patches.at(-1)[`flags.${moduleId}.${group.flag}.points`] = group.points;
    }
  }
  return patches;
}

function collectIndyShapeGroups(moduleId, wallDocuments) {
  const groups = new Map();
  for (const wallDocument of wallDocuments) {
    for (const info of getWallShapeInfos(moduleId, wallDocument)) {
      const key = `${info.flag}:${info.shapeId}`;
      if (!groups.has(key)) {
        groups.set(key, {
          type: info.type,
          flag: info.flag,
          shapeId: info.shapeId,
          ids: new Set(),
          handles: clonePointArray(info.data.handles),
          points: clonePointArray(info.data.points),
          changed: false
        });
      }
      const group = groups.get(key);
      group.ids.add(wallDocument.id);
      for (const id of info.data.wallIds ?? []) group.ids.add(id);
    }
  }
  return groups;
}

function getWallShapeInfos(moduleId, wallDocument) {
  const infos = [];
  const cubic = wallDocument.getFlag?.(moduleId, INDY_SHAPE_FLAGS.cubic);
  if (cubic?.curveId) infos.push({type: "cubic", flag: INDY_SHAPE_FLAGS.cubic, shapeId: cubic.curveId, data: cubic});
  const ellipse = wallDocument.getFlag?.(moduleId, INDY_SHAPE_FLAGS.ellipse);
  if (ellipse?.ellipseId) infos.push({type: "ellipse", flag: INDY_SHAPE_FLAGS.ellipse, shapeId: ellipse.ellipseId, data: ellipse});
  const rectangle = wallDocument.getFlag?.(moduleId, INDY_SHAPE_FLAGS.rectangle);
  if (rectangle?.rectangleId) infos.push({type: "rectangle", flag: INDY_SHAPE_FLAGS.rectangle, shapeId: rectangle.rectangleId, data: rectangle});
  const polyline = wallDocument.getFlag?.(moduleId, INDY_SHAPE_FLAGS.polyline);
  if (polyline?.polylineId) infos.push({type: "polyline", flag: INDY_SHAPE_FLAGS.polyline, shapeId: polyline.polylineId, data: polyline});
  return infos;
}

function getShapeGroupsByWallId(groups) {
  const groupsByWallId = new Map();
  for (const group of groups.values()) {
    for (const id of group.ids) {
      if (!groupsByWallId.has(id)) groupsByWallId.set(id, []);
      groupsByWallId.get(id).push(group);
    }
  }
  return groupsByWallId;
}

function updateShapeGroupPoint(group, from, to) {
  if (pointsEqual(from, to)) return;
  if (group.type === "cubic") {
    group.changed = updateMatchingPointIndexes(group.handles, from, to, [0, 3]) || group.changed;
    return;
  }
  if (group.type === "polyline") {
    group.changed = updateMatchingPointIndexes(group.points, from, to) || group.changed;
    return;
  }
  if (group.type === "rectangle" || group.type === "ellipse") {
    group.changed = updateMatchingPointIndexes(group.handles, from, to) || group.changed;
  }
}

function updateMatchingPointIndexes(points, from, to, indexes=null) {
  if (!Array.isArray(points)) return false;
  let changed = false;
  const targetIndexes = indexes ?? points.map((_, index) => index);
  for (const index of targetIndexes) {
    const point = points[index];
    if (!point || Math.hypot(point.x - from.x, point.y - from.y) > 0.75) continue;
    point.x = to.x;
    point.y = to.y;
    changed = true;
  }
  return changed;
}

function clonePointArray(points) {
  if (!Array.isArray(points)) return null;
  return points.map((point) => ({x: Number(point?.x) || 0, y: Number(point?.y) || 0}));
}

function mergeWallUpdates(coordinateUpdates, metadataPatches) {
  const updates = new Map();
  for (const update of [...coordinateUpdates, ...metadataPatches]) {
    const existing = updates.get(update._id) ?? {_id: update._id};
    updates.set(update._id, {...existing, ...update});
  }
  return [...updates.values()];
}

function getWallDataKey(wallDocument) {
  const data = wallDocument.toObject(false);
  delete data._id;
  delete data.c;
  return JSON.stringify(sortObjectKeys(data));
}

function getWallLevelsKey(wallDocument) {
  const source = wallDocument?.toObject ? wallDocument.toObject(false) : wallDocument;
  const levels = source?.levels ?? wallDocument?.levels;
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

function sortObjectKeys(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortObjectKeys(child)])
  );
}

function getUndirectedCoordinateKey(c) {
  const a = `${c[0]},${c[1]}`;
  const b = `${c[2]},${c[3]}`;
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

function getBucketKey(x, y) {
  return `${x},${y}`;
}

function getClusterSnapPoint(points, grid) {
  const average = getAveragePoint(points);
  const gridPoints = points
    .map((point) => getGridIntersectionPoint(point, grid))
    .filter((point) => !!point);

  if (gridPoints.length) {
    return gridPoints
      .sort((a, b) => distance(a, average) - distance(b, average))[0];
  }

  return {x: Math.round(average.x), y: Math.round(average.y)};
}

function getGridSnapInfo() {
  const size = Number(canvas?.grid?.size ?? canvas?.scene?.grid?.size);
  if (!Number.isFinite(size) || size <= 0) return null;
  return {
    size,
    offsetX: Number(canvas?.scene?.grid?.offsetX ?? canvas?.grid?.grid?.options?.x ?? 0) || 0,
    offsetY: Number(canvas?.scene?.grid?.offsetY ?? canvas?.grid?.grid?.options?.y ?? 0) || 0
  };
}

function getGridIntersectionPoint(point, grid) {
  if (!grid) return null;
  const x = getNearestGridCoordinate(point.x, grid.offsetX, grid.size);
  const y = getNearestGridCoordinate(point.y, grid.offsetY, grid.size);
  return Math.abs(point.x - x) <= 0.75 && Math.abs(point.y - y) <= 0.75
    ? {x, y}
    : null;
}

function getNearestGridCoordinate(value, offset, size) {
  return Math.round((value - offset) / size) * size + offset;
}

function getAveragePoint(points) {
  const total = points.reduce((sum, point) => ({x: sum.x + point.x, y: sum.y + point.y}), {x: 0, y: 0});
  return {x: total.x / points.length, y: total.y / points.length};
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointsEqual(a, b) {
  return a.x === b.x && a.y === b.y;
}

function coordinatesEqual(left, right) {
  return Array.isArray(left)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function formatNotification(key, values) {
  const template = game.i18n.localize(key);
  return Object.entries(values).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, value),
    template
  );
}
