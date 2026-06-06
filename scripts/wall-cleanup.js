const INDY_SHAPE_FLAGS = ["cubic", "ellipse", "rectangle", "polyline"];

export async function cleanupSceneWalls({moduleId, tolerance = 8} = {}) {
  if (!game.user?.isGM || !canvas?.scene) return null;

  const wallDocuments = getPlainWallDocuments(moduleId);
  if (!wallDocuments.length) {
    ui.notifications?.info(game.i18n.localize("indy-walls.Notifications.NoWallsToClean"));
    return {updated: 0, deleted: 0, snappedPoints: 0};
  }

  const endpoints = buildWallEndpoints(wallDocuments);
  const snapResult = snapWallEndpoints(endpoints, Math.max(0, Number(tolerance) || 0));
  const cleanupPlan = buildCleanupPlan(wallDocuments, snapResult.pointsByEndpoint);

  const deletions = Array.from(cleanupPlan.deleteIds);
  const updates = cleanupPlan.updates.filter((update) => !cleanupPlan.deleteIds.has(update._id));

  if (updates.length) await canvas.scene.updateEmbeddedDocuments("Wall", updates);
  if (deletions.length) await canvas.scene.deleteEmbeddedDocuments("Wall", deletions);

  if (updates.length || deletions.length) {
    ui.notifications?.info(formatNotification("indy-walls.Notifications.WallsCleaned", {
      updated: updates.length,
      deleted: deletions.length,
      snapped: snapResult.snappedEndpointCount
    }));
  }
  else ui.notifications?.info(game.i18n.localize("indy-walls.Notifications.WallsAlreadyClean"));

  return {
    updated: updates.length,
    deleted: deletions.length,
    snappedPoints: snapResult.snappedEndpointCount
  };
}

function getPlainWallDocuments(moduleId) {
  const walls = canvas?.scene?.walls?.contents ?? Array.from(canvas?.scene?.walls ?? []);
  return walls.filter((wallDocument) => {
    const c = wallDocument?.c ?? wallDocument?.toObject?.()?.c;
    return Array.isArray(c)
      && c.length === 4
      && c.every(Number.isFinite)
      && !hasIndyShapeFlag(wallDocument, moduleId);
  });
}

function hasIndyShapeFlag(wallDocument, moduleId) {
  if (!moduleId) return false;
  return INDY_SHAPE_FLAGS.some((flag) => !!wallDocument?.getFlag?.(moduleId, flag));
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

  for (let wallIndex = 0; wallIndex < wallDocuments.length; wallIndex += 1) {
    const wallDocument = wallDocuments[wallIndex];
    const start = pointsByEndpoint.get(wallIndex * 2);
    const end = pointsByEndpoint.get((wallIndex * 2) + 1);
    const c = [start.x, start.y, end.x, end.y];

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

  return {updates, deleteIds};
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
