const INDY_SHAPE_FLAGS = {
  cubic: "cubicBezier",
  ellipse: "ellipse",
  rectangle: "rectangle",
  polyline: "polyline"
};
let cleanupSceneWallsPromise = null;

export async function cleanupSceneWalls({moduleId, tolerance = 8} = {}) {
  if (cleanupSceneWallsPromise) return cleanupSceneWallsPromise;
  cleanupSceneWallsPromise = cleanupSceneWallsOnce({moduleId, tolerance});
  try {
    return await cleanupSceneWallsPromise;
  }
  finally {
    cleanupSceneWallsPromise = null;
  }
}

async function cleanupSceneWallsOnce({moduleId, tolerance = 8} = {}) {
  if (!game.user?.isGM || !canvas?.scene) return null;

  const wallDocuments = getWallDocuments();
  if (!wallDocuments.length) {
    ui.notifications?.info(game.i18n.localize("indy-walls.Notifications.NoWallsToClean"));
    return {updated: 0, deleted: 0, snappedPoints: 0};
  }

  const endpoints = buildWallEndpoints(wallDocuments);
  const snapResult = snapWallEndpoints(endpoints, Math.max(0, Number(tolerance) || 0));
  const cleanupPlan = buildCleanupPlan(wallDocuments, snapResult.pointsByEndpoint);
  const shapeMetadataPatches = buildShapeMetadataPatches(moduleId, wallDocuments, cleanupPlan.coordinateByWallId, cleanupPlan.deleteIds);

  const deletions = Array.from(cleanupPlan.deleteIds);
  const updates = mergeWallUpdates(
    cleanupPlan.updates.filter((update) => !cleanupPlan.deleteIds.has(update._id)),
    shapeMetadataPatches
  );

  if (updates.length) await canvas.scene.updateEmbeddedDocuments("Wall", updates);
  const existingDeletions = deletions.filter((id) => !!canvas.scene.walls?.get?.(id));
  if (existingDeletions.length) await canvas.scene.deleteEmbeddedDocuments("Wall", existingDeletions);

  if (updates.length || existingDeletions.length) {
    ui.notifications?.info(formatNotification("indy-walls.Notifications.WallsCleaned", {
      updated: updates.length,
      deleted: existingDeletions.length,
      snapped: snapResult.snappedEndpointCount
    }));
  }
  else ui.notifications?.info(game.i18n.localize("indy-walls.Notifications.WallsAlreadyClean"));

  return {
    updated: updates.length,
    deleted: existingDeletions.length,
    snappedPoints: snapResult.snappedEndpointCount
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

function buildWallEndpoints(wallDocuments) {
  const endpoints = [];
  for (const wallDocument of wallDocuments) {
    const [x1, y1, x2, y2] = wallDocument.c;
    endpoints.push({wallId: wallDocument.id, endpointIndex: 0, x: x1, y: y1});
    endpoints.push({wallId: wallDocument.id, endpointIndex: 1, x: x2, y: y2});
  }
  return endpoints;
}

function snapWallEndpoints(endpoints, tolerance) {
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
            if (candidate.wallId === endpoint.wallId) continue;
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
  let snappedEndpointCount = 0;
  for (const [root, indexes] of clusters.entries()) {
    const average = getAveragePoint(indexes.map((index) => endpoints[index]));
    const snapped = {x: Math.round(average.x), y: Math.round(average.y)};
    snappedPointsByRoot.set(root, snapped);
    if (indexes.length > 1) snappedEndpointCount += indexes.length;
  }

  const pointsByEndpoint = new Map();
  for (let index = 0; index < endpoints.length; index += 1) {
    pointsByEndpoint.set(index, snappedPointsByRoot.get(find(index)));
  }

  return {pointsByEndpoint, snappedEndpointCount};
}

function buildCleanupPlan(wallDocuments, pointsByEndpoint) {
  const updates = [];
  const deleteIds = new Set();
  const seenSegments = new Map();
  const coordinateByWallId = new Map();

  for (let wallIndex = 0; wallIndex < wallDocuments.length; wallIndex += 1) {
    const wallDocument = wallDocuments[wallIndex];
    const start = pointsByEndpoint.get(wallIndex * 2);
    const end = pointsByEndpoint.get((wallIndex * 2) + 1);
    const c = [start.x, start.y, end.x, end.y];
    coordinateByWallId.set(wallDocument.id, c);

    if (pointsEqual(start, end)) {
      deleteIds.add(wallDocument.id);
      continue;
    }

    const dataKey = getWallDataKey(wallDocument);
    const segmentKey = `${getUndirectedCoordinateKey(c)}::${dataKey}`;
    const existingWallId = seenSegments.get(segmentKey);
    if (existingWallId) {
      deleteIds.add(wallDocument.id);
      continue;
    }
    seenSegments.set(segmentKey, wallDocument.id);

    if (!coordinatesEqual(wallDocument.c, c)) updates.push({_id: wallDocument.id, c});
  }

  return {updates, deleteIds, coordinateByWallId};
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
