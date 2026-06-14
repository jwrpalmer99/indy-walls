const WALL_LENGTH_LABEL_FLAG = "_indyWallsLengthLabel";
const MANAGED_PREVIEW_CHILD_FLAG = "_indyWallsPreviewManaged";

export function clearWallLengthLabels(parent) {
  if (!parent?.children?.length) return;

  for (const child of [...parent.children]) {
    if (!child?.[WALL_LENGTH_LABEL_FLAG]) continue;
    try {
      parent.removeChild(child);
    } catch (_error) {
      // The parent may already be in the middle of a Foundry canvas teardown.
    }
    destroyLabelChild(child);
  }
}

export function drawWallLengthLabels(parent, segments, {
  enabled=true,
  combine=false,
  maxLabels=80
}={}) {
  clearWallLengthLabels(parent);
  if (!enabled || !parent) return [];

  const source = Array.isArray(segments) && !isCoordinateArray(segments) ? segments : [segments];
  const labelSegments = combine ? [getCombinedWallLengthLabelSegment(source)].filter(Boolean) : source;
  const labels = [];

  for (const segment of labelSegments) {
    if (labels.length >= maxLabels) break;
    const label = createWallLengthLabel(segment);
    if (!label) continue;
    parent.addChild(label);
    labels.push(label);
  }

  return labels;
}

export function getCombinedWallLengthLabelSegment(segments=[]) {
  const pieces = segments.map((segment) => normalizeWallLengthSegment(segment)).filter(Boolean);
  const totalLength = pieces.reduce((sum, segment) => sum + getWallSegmentPixelLength(segment), 0);
  if (!(totalLength > 0.1)) return null;

  let target = totalLength / 2;
  let selected = pieces[0];
  let selectedLength = getWallSegmentPixelLength(selected);

  for (const piece of pieces) {
    const length = getWallSegmentPixelLength(piece);
    if (target <= length) {
      selected = piece;
      selectedLength = length;
      break;
    }
    target -= length;
  }

  const geometryLength = getWallSegmentGeometryLength(selected);
  const t = geometryLength > 0 ? clamp(target / Math.max(selectedLength, 0.1), 0, 1) : 0.5;
  const labelPoint = {
    x: selected.a.x + ((selected.b.x - selected.a.x) * t),
    y: selected.a.y + ((selected.b.y - selected.a.y) * t)
  };

  return {
    a: selected.a,
    b: selected.b,
    length: totalLength,
    labelPoint,
    labelDirection: {
      x: selected.b.x - selected.a.x,
      y: selected.b.y - selected.a.y
    }
  };
}

export function normalizeWallLengthSegment(segment) {
  if (!segment) return null;

  const coords = Array.isArray(segment)
    ? segment
    : (Array.isArray(segment.c) ? segment.c : null);
  const a = coords
    ? normalizePoint({x: coords[0], y: coords[1]})
    : normalizePoint(segment.a);
  const b = coords
    ? normalizePoint({x: coords[2], y: coords[3]})
    : normalizePoint(segment.b);

  if (!a || !b) return null;

  return {
    ...segment,
    a,
    b,
    labelPoint: normalizePoint(segment.labelPoint),
    labelDirection: normalizeVector(segment.labelDirection)
  };
}

export function getWallSegmentPixelLength(segment) {
  const override = Number(segment?.length);
  if (Number.isFinite(override) && override >= 0) return override;
  return getWallSegmentGeometryLength(segment);
}

function isCoordinateArray(value) {
  return Array.isArray(value)
    && value.length >= 4
    && value.slice(0, 4).every((coordinate) => Number.isFinite(Number(coordinate)));
}

function createWallLengthLabel(segment) {
  const normalized = normalizeWallLengthSegment(segment);
  if (!normalized) return null;

  const pixelLength = getWallSegmentPixelLength(normalized);
  if (!(pixelLength > 0.1)) return null;

  const text = formatWallLength(pixelLength);
  if (!text) return null;

  const position = getLabelPosition(normalized);
  if (!position) return null;

  const container = new PIXI.Container();
  container[WALL_LENGTH_LABEL_FLAG] = true;
  container[MANAGED_PREVIEW_CHILD_FLAG] = true;
  container.eventMode = "none";
  container.interactiveChildren = false;
  container.position.set(position.x, position.y);

  const scale = 1 / getCanvasScale();
  container.scale.set(scale, scale);

  const textObject = new PIXI.Text(text, {
    fill: 0xffffff,
    fontFamily: "Arial, sans-serif",
    fontSize: 13,
    fontWeight: "700"
  });
  textObject.anchor?.set?.(0.5);
  textObject.resolution = Math.max(globalThis.devicePixelRatio ?? 1, 1);

  const width = Math.ceil(Math.max(textObject.width, 1) + 12);
  const height = Math.ceil(Math.max(textObject.height, 1) + 6);
  const background = new PIXI.Graphics();
  background.beginFill(0x101214, 0.82);
  background.lineStyle(1, 0xffffff, 0.28);
  if (typeof background.drawRoundedRect === "function") {
    background.drawRoundedRect(-width / 2, -height / 2, width, height, 4);
  } else {
    background.drawRect(-width / 2, -height / 2, width, height);
  }
  background.endFill();

  container.addChild(background, textObject);
  return container;
}

function getLabelPosition(segment) {
  const length = getWallSegmentGeometryLength(segment);
  if (!(length > 0.1)) return null;

  const midpoint = segment.labelPoint ?? {
    x: (segment.a.x + segment.b.x) / 2,
    y: (segment.a.y + segment.b.y) / 2
  };
  const direction = segment.labelDirection ?? {
    x: segment.b.x - segment.a.x,
    y: segment.b.y - segment.a.y
  };
  const directionLength = Math.hypot(direction.x, direction.y);
  if (!(directionLength > 0.1)) return midpoint;

  let nx = -(direction.y / directionLength);
  let ny = direction.x / directionLength;
  if ((ny > 0) || ((Math.abs(ny) <= 0.001) && (nx < 0))) {
    nx *= -1;
    ny *= -1;
  }

  const offset = 16 / getCanvasScale();
  return {
    x: midpoint.x + (nx * offset),
    y: midpoint.y + (ny * offset)
  };
}

function formatWallLength(pixelLength) {
  const distancePixels = getDistancePixels();
  const value = distancePixels > 0 ? pixelLength / distancePixels : pixelLength;
  const decimals = getDisplayDecimals(value);
  const rounded = Number(value.toFixed(decimals));
  const formatted = formatNumber(rounded, decimals);
  const units = getDistanceUnits();
  return units ? `${formatted} ${units}` : formatted;
}

function getDisplayDecimals(value) {
  if (Math.abs(value - Math.round(value)) < 0.005) return 0;
  const abs = Math.abs(value);
  if (abs < 1) return 2;
  if (abs < 100) return 1;
  return 0;
}

function formatNumber(value, decimals) {
  try {
    return value.toLocaleString(game?.i18n?.lang, {
      maximumFractionDigits: decimals,
      minimumFractionDigits: 0
    });
  } catch (_error) {
    return String(value);
  }
}

function getDistancePixels() {
  const direct = Number(canvas?.dimensions?.distancePixels);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const size = Number(canvas?.dimensions?.size ?? canvas?.grid?.size ?? canvas?.scene?.grid?.size);
  const distance = Number(canvas?.dimensions?.distance ?? canvas?.grid?.distance ?? canvas?.scene?.grid?.distance);
  if (Number.isFinite(size) && size > 0 && Number.isFinite(distance) && distance > 0) return size / distance;

  return 1;
}

function getDistanceUnits() {
  return String(canvas?.grid?.units ?? canvas?.scene?.grid?.units ?? "").trim();
}

function getCanvasScale() {
  const scale = Number(canvas?.stage?.scale?.x ?? canvas?.viewport?.scale ?? 1);
  return Number.isFinite(scale) && scale > 0 ? Math.max(scale, 0.1) : 1;
}

function getWallSegmentGeometryLength(segment) {
  if (!segment?.a || !segment?.b) return 0;
  return Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y);
}

function normalizePoint(point) {
  if (!point) return null;
  const x = Number(point.x ?? point[0]);
  const y = Number(point.y ?? point[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {x, y};
}

function normalizeVector(vector) {
  if (!vector) return null;
  const x = Number(vector.x ?? vector[0]);
  const y = Number(vector.y ?? vector[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {x, y};
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function destroyLabelChild(child) {
  try {
    child.destroy({children: true});
  } catch (_error) {
    try {
      child.destroy?.(true);
    } catch (_recoveryError) {
      // Nothing else to do if PIXI has already destroyed the object.
    }
  }
}
