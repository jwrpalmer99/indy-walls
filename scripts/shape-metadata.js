export const SHAPE_METADATA_FLAG = "shapeMetadata";

const SHAPE_ID_FIELDS = {
  cubic: "curveId",
  ellipse: "ellipseId",
  rectangle: "rectangleId",
  polyline: "polylineId"
};

const PER_WALL_FIELDS = new Set(["index", "segmentIndex", "side"]);

export function getShapeIdField(flagName) {
  return SHAPE_ID_FIELDS[flagName] ?? null;
}

export function getShapeMetadataKey(flagName, shapeId) {
  return shapeId ? `${flagName}:${shapeId}` : null;
}

export function getShapeSharedMetadataFromFlag(flagName, flagData) {
  if (!flagData || typeof flagData !== "object") return null;
  const idField = getShapeIdField(flagName);
  const shapeId = idField ? flagData[idField] : null;
  const key = getShapeMetadataKey(flagName, shapeId);
  if (!key) return null;

  const shared = {};
  for (const [field, value] of Object.entries(flagData)) {
    if (PER_WALL_FIELDS.has(field)) continue;
    if (isEmptyMetadataValue(value)) continue;
    shared[field] = cloneMetadataValue(value);
  }
  return {key, value: shared};
}

export function getShapeMetadataEntriesFromWallData(wallData, moduleId) {
  const entries = {};
  for (const wall of wallData ?? []) {
    for (const [flagName, flagData] of getWallShapeFlagEntries(wall, moduleId)) {
      const entry = getShapeSharedMetadataFromFlag(flagName, flagData);
      if (entry) entries[entry.key] = {
        ...(entries[entry.key] ?? {}),
        ...entry.value
      };
    }
  }
  return entries;
}

export function compactWallShapeMetadata(wallData, moduleId) {
  for (const [, shapeData] of getWallShapeFlagEntries(wallData, moduleId)) {
    if (!shapeData || typeof shapeData !== "object") continue;
    compactShapeFlagData(shapeData);
  }
}

export async function mergeSceneShapeMetadata(scene, moduleId, entries) {
  if (!scene || !entries || !Object.keys(entries).length) return;
  const current = scene.getFlag(moduleId, SHAPE_METADATA_FLAG) ?? {};
  await scene.setFlag(moduleId, SHAPE_METADATA_FLAG, {
    ...cloneMetadataValue(current),
    ...cloneMetadataValue(entries)
  });
}

export async function pruneSceneShapeMetadata(scene, moduleId, {excludeWallIds=[], debug=null, reason=""}={}) {
  if (!scene) {
    return;
  }
  const current = scene.getFlag(moduleId, SHAPE_METADATA_FLAG) ?? {};
  if (!current || typeof current !== "object" || !Object.keys(current).length) {
    return;
  }

  const excluded = new Set(excludeWallIds ?? []);
  const liveKeys = new Set();
  const metadataKeys = Object.keys(current);
  const walls = getSceneWallDocuments(scene);
  for (const wall of walls) {
    const document = wall?.document ?? wall;
    if (excluded.has(document?.id ?? document?._id)) continue;
    const moduleFlags = document?.flags?.[moduleId] ?? document?.getFlag?.(moduleId);
    for (const [flagName, flagData] of Object.entries(moduleFlags ?? {})) {
      const idField = getShapeIdField(flagName);
      const key = getShapeMetadataKey(flagName, idField ? flagData?.[idField] : null);
      if (key) liveKeys.add(key);
    }
  }

  const next = {};
  const removed = [];
  for (const [key, value] of Object.entries(current)) {
    if (liveKeys.has(key)) next[key] = value;
    else removed.push(key);
  }
  if (Object.keys(next).length === Object.keys(current).length) {
    return;
  }
  const update = {};
  for (const key of removed) {
    update[`flags.${moduleId}.${SHAPE_METADATA_FLAG}.-=${key}`] = null;
  }
  await scene.update(update);
  debug?.("shape metadata prune saved", {
    reason,
    removedCount: removed.length,
    remainingCount: Object.keys(next).length
  });
}

export function getSceneShapeMetadata(scene, moduleId, flagName, shapeId) {
  const key = getShapeMetadataKey(flagName, shapeId);
  if (!key) return null;
  return scene?.getFlag?.(moduleId, SHAPE_METADATA_FLAG)?.[key] ?? null;
}

function compactShapeFlagData(shapeData) {
  for (const field of Object.keys(shapeData)) {
    if (PER_WALL_FIELDS.has(field)) continue;
    if (Object.values(SHAPE_ID_FIELDS).includes(field)) continue;
    delete shapeData[field];
  }
}

function getWallShapeFlagEntries(wallData, moduleId) {
  const entries = [];
  const moduleFlags = wallData?.flags?.[moduleId];
  if (moduleFlags && typeof moduleFlags === "object") {
    entries.push(...Object.entries(moduleFlags));
  }

  const prefix = `flags.${moduleId}.`;
  for (const [key, value] of Object.entries(wallData ?? {})) {
    if (!key.startsWith(prefix)) continue;
    const flagName = key.slice(prefix.length).split(".")[0];
    if (!flagName || !value || typeof value !== "object") continue;
    entries.push([flagName, value]);
  }
  return entries;
}

function getSceneWallDocuments(scene) {
  const walls = scene?.walls;
  if (!walls) return [];
  if (Array.isArray(walls.contents)) return walls.contents;
  if (typeof walls.values === "function") return Array.from(walls.values());
  if (typeof walls[Symbol.iterator] === "function") return Array.from(walls);
  return [];
}

function cloneMetadataValue(value) {
  if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(value);
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function isEmptyMetadataValue(value) {
  if (Array.isArray(value)) return value.length === 0;
  return value && typeof value === "object" && Object.keys(value).length === 0;
}
