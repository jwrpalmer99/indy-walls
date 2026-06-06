const OMITTED_WALL_DATA_KEYS = new Set(["_id", "c"]);

export function mergePreservedWallData(baseData, state, key, typePatch=baseData) {
  const preserved = state?.wallDataBySegment?.[key];
  if (!preserved || typeof preserved !== "object") return baseData;

  const merged = foundry.utils.mergeObject(
    foundry.utils.deepClone(baseData),
    foundry.utils.deepClone(preserved),
    {inplace: false}
  );

  return foundry.utils.mergeObject(
    merged,
    foundry.utils.deepClone(typePatch ?? {}),
    {inplace: false}
  );
}

export function getPreservedWallDataFromDocument(wallDocument, moduleId) {
  const source = wallDocument?.toObject
    ? wallDocument.toObject()
    : foundry.utils.deepClone(wallDocument ?? {});
  if (!source || typeof source !== "object") return null;

  const data = {};
  for (const [key, value] of Object.entries(source)) {
    if (OMITTED_WALL_DATA_KEYS.has(key)) continue;
    data[key] = foundry.utils.deepClone(value);
  }

  if (data.flags && typeof data.flags === "object") {
    delete data.flags[moduleId];
    if (!Object.keys(data.flags).length) delete data.flags;
  }

  return Object.keys(data).length ? data : null;
}

export function cloneWallDataBySegment(source={}) {
  const result = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    if (!value || typeof value !== "object") continue;
    result[key] = foundry.utils.deepClone(value);
  }
  return result;
}


