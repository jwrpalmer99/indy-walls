import {
  clamp,
  clonePoints,
  drawHandle,
  drawVertex,
  ensureEditButtons,
  getEventPoint,
  getHandleAt as getHandleIndexAt,
  isEditableTarget,
  positionEditButtons,
  setEditButtonsVisible
} from "./curve-common.js";

const MODULE_ID = "indy-walls";
const QUICK_WALL_TYPE_SETTING = "quickWallTypeChange";
const CUBIC_TOOL = "indyCubicBezier";
const ELLIPSE_TOOL = "indyEllipseWall";
const DEFAULT_CUBIC_SEGMENTS = 10;
const DEFAULT_ELLIPSE_SEGMENTS = 16;
const CUBIC_FLAG = "cubicBezier";
const ELLIPSE_FLAG = "ellipse";
const CUBIC_EDIT_BUTTONS_ID = "indy-walls-cubic-edit-buttons";
const ELLIPSE_EDIT_BUTTONS_ID = "indy-walls-ellipse-edit-buttons";

const WALL_TYPE_DATA = {
  walls: () => ({
    light: CONST.WALL_SENSE_TYPES.NORMAL,
    sight: CONST.WALL_SENSE_TYPES.NORMAL,
    sound: CONST.WALL_SENSE_TYPES.NORMAL,
    move: CONST.WALL_MOVEMENT_TYPES.NORMAL,
    door: CONST.WALL_DOOR_TYPES.NONE,
    ds: CONST.WALL_DOOR_STATES.CLOSED
  }),
  terrain: () => ({
    light: CONST.WALL_SENSE_TYPES.LIMITED,
    sight: CONST.WALL_SENSE_TYPES.LIMITED,
    sound: CONST.WALL_SENSE_TYPES.LIMITED,
    move: CONST.WALL_MOVEMENT_TYPES.NORMAL,
    door: CONST.WALL_DOOR_TYPES.NONE,
    ds: CONST.WALL_DOOR_STATES.CLOSED
  }),
  invisible: () => ({
    light: CONST.WALL_SENSE_TYPES.NONE,
    sight: CONST.WALL_SENSE_TYPES.NONE,
    sound: CONST.WALL_SENSE_TYPES.NONE,
    move: CONST.WALL_MOVEMENT_TYPES.NORMAL,
    door: CONST.WALL_DOOR_TYPES.NONE,
    ds: CONST.WALL_DOOR_STATES.CLOSED
  }),
  ethereal: () => ({
    light: CONST.WALL_SENSE_TYPES.NORMAL,
    sight: CONST.WALL_SENSE_TYPES.NORMAL,
    sound: CONST.WALL_SENSE_TYPES.NONE,
    move: CONST.WALL_MOVEMENT_TYPES.NONE,
    door: CONST.WALL_DOOR_TYPES.NONE,
    ds: CONST.WALL_DOOR_STATES.CLOSED
  }),
  doors: () => ({
    light: CONST.WALL_SENSE_TYPES.NORMAL,
    sight: CONST.WALL_SENSE_TYPES.NORMAL,
    sound: CONST.WALL_SENSE_TYPES.NORMAL,
    move: CONST.WALL_MOVEMENT_TYPES.NORMAL,
    door: CONST.WALL_DOOR_TYPES.DOOR,
    ds: CONST.WALL_DOOR_STATES.CLOSED
  }),
  secret: () => ({
    light: CONST.WALL_SENSE_TYPES.NORMAL,
    sight: CONST.WALL_SENSE_TYPES.NORMAL,
    sound: CONST.WALL_SENSE_TYPES.NORMAL,
    move: CONST.WALL_MOVEMENT_TYPES.NORMAL,
    door: CONST.WALL_DOOR_TYPES.SECRET,
    ds: CONST.WALL_DOOR_STATES.CLOSED
  })
};

const cubicState = {
  active: false,
  placed: false,
  initializing: false,
  initialOrigin: null,
  draggingHandle: null,
  curveId: null,
  wallIds: [],
  replacingWallIds: new Set(),
  wallTypeTool: "walls",
  segments: DEFAULT_CUBIC_SEGMENTS,
  graphics: null,
  handles: [
    {x: 0, y: 0},
    {x: 0, y: 0},
    {x: 0, y: 0},
    {x: 0, y: 0}
  ]
};

const ellipseState = {
  active: false,
  placed: false,
  initializing: false,
  draggingHandle: null,
  ellipseId: null,
  wallIds: [],
  replacingWallIds: new Set(),
  wallTypeTool: "walls",
  segments: DEFAULT_ELLIPSE_SEGMENTS,
  graphics: null,
  handles: [
    {x: 0, y: 0},
    {x: 0, y: 0}
  ]
};

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, QUICK_WALL_TYPE_SETTING, {
    name: game.i18n.localize("indy-walls.Settings.QuickWallTypeChange.Name"),
    hint: game.i18n.localize("indy-walls.Settings.QuickWallTypeChange.Hint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  patchWallsLayer();
  registerCurveEditorShortcuts();
});

Hooks.on("controlWall", (wall, controlled) => {
  if (!controlled || !game.user.isGM) return;
  loadCubicCurveFromWall(wall);
  loadEllipseFromWall(wall);
});

Hooks.on("deleteWall", (wallDocument) => {
  cancelCubicEditingForDeletedWall(wallDocument);
  cancelEllipseEditingForDeletedWall(wallDocument);
});

Hooks.on("getSceneControlButtons", (controls) => {
  const wallTools = controls.walls?.tools;
  if (!wallTools) return;

  for (const toolName of Object.keys(WALL_TYPE_DATA)) {
    const tool = wallTools[toolName];
    if (!tool || tool._indyWallsWrapped) continue;

    const originalOnChange = tool.onChange;
    tool.onChange = async (event, active) => {
      originalOnChange?.(event, active);
      if (!active) return;
      cubicState.wallTypeTool = toolName;
      ellipseState.wallTypeTool = toolName;
      await updateSelectedWalls(toolName);
    };
    tool._indyWallsWrapped = true;
  }

  wallTools[CUBIC_TOOL] = {
    name: CUBIC_TOOL,
    order: 13,
    title: "indy-walls.Controls.CubicBezier",
    icon: "fa-solid fa-bezier-curve",
    onChange: (event, active) => {
      cubicState.active = active;
      if (active) {
        clearEllipsePreview();
        canvas.walls.activate();
      }
      else clearCubicPreview();
    },
    toolclip: {
      heading: "indy-walls.Controls.CubicBezier",
      items: [
        {paragraph: "indy-walls.Tooltips.CubicBezier"}
      ]
    }
  };

  wallTools[ELLIPSE_TOOL] = {
    name: ELLIPSE_TOOL,
    order: 14,
    title: "indy-walls.Controls.Ellipse",
    icon: "fa-solid fa-circle",
    onChange: (event, active) => {
      ellipseState.active = active;
      if (active) {
        clearCubicPreview();
        canvas.walls.activate();
      }
      else clearEllipsePreview();
    },
    toolclip: {
      heading: "indy-walls.Controls.Ellipse",
      items: [
        {paragraph: "indy-walls.Tooltips.Ellipse"}
      ]
    }
  };
});

Hooks.on("renderSceneControls", () => {
  positionCubicEditButtons();
  positionEllipseEditButtons();
});

async function updateSelectedWalls(toolName) {
  if (!game.user.isGM) return;
  if (!game.settings.get(MODULE_ID, QUICK_WALL_TYPE_SETTING)) return;

  const selectedWalls = canvas?.walls?.controlled ?? [];
  if (!selectedWalls.length) return;

  const wallData = WALL_TYPE_DATA[toolName]?.();
  if (!wallData) return;

  const updates = selectedWalls.map((wall) => {
    const update = {
      _id: wall.document.id,
      ...wallData
    };
    const cubicData = wall.document.getFlag(MODULE_ID, CUBIC_FLAG);
    if (cubicData) update[`flags.${MODULE_ID}.${CUBIC_FLAG}.wallTypeTool`] = toolName;
    const ellipseData = wall.document.getFlag(MODULE_ID, ELLIPSE_FLAG);
    if (ellipseData) update[`flags.${MODULE_ID}.${ELLIPSE_FLAG}.wallTypeTool`] = toolName;
    return update;
  });

  await canvas.scene.updateEmbeddedDocuments("Wall", updates);
  ui.notifications.info(game.i18n.format("indy-walls.Notifications.WallTypesUpdated", {
    count: selectedWalls.length
  }));
}

function patchWallsLayer() {
  const WallsLayer = CONFIG.Canvas.layers.walls?.layerClass;
  if (!WallsLayer || WallsLayer.prototype._indyWallsCubicPatched) return;

  const originalDragStart = WallsLayer.prototype._onDragLeftStart;
  const originalDragMove = WallsLayer.prototype._onDragLeftMove;
  const originalDragDrop = WallsLayer.prototype._onDragLeftDrop;
  const originalDragCancel = WallsLayer.prototype._onDragLeftCancel;
  const originalMouseWheel = WallsLayer.prototype._onMouseWheel;

  WallsLayer.prototype._onDragLeftStart = function(event) {
    if (!isCubicToolActive() && !isEllipseToolActive()) return originalDragStart.call(this, event);

    event.interactionData.clearPreviewContainer = false;
    const origin = event.interactionData.origin;
    const point = getEventPoint(this, origin, event);

    if (isEllipseToolActive()) {
      ellipseState.draggingHandle = getEllipseHandleAt({x: origin.x, y: origin.y});
      if (ellipseState.draggingHandle === null) {
        ellipseState.placed = false;
        ellipseState.initializing = true;
        ellipseState.initialOrigin = point;
        ellipseState.draggingHandle = 1;
        setEllipseHandle(0, point);
        setEllipseHandle(1, point);
      }
      drawEllipsePreview();
      return;
    }

    cubicState.draggingHandle = getCubicHandleAt({x: origin.x, y: origin.y});
    if (cubicState.draggingHandle === null) {
      cubicState.placed = false;
      cubicState.initializing = true;
      cubicState.draggingHandle = 3;
      setHandle(0, point);
      setHandle(1, point);
      setHandle(2, point);
      setHandle(3, point);
    }

    drawCubicPreview();
  };

  WallsLayer.prototype._onDragLeftMove = function(event) {
    if (!isCubicToolActive() && !isEllipseToolActive()) return originalDragMove.call(this, event);

    if (isEllipseToolActive()) {
      if (ellipseState.draggingHandle === null) return;
      const point = getEventPoint(this, event.interactionData.destination, event);
      setEllipseHandle(ellipseState.draggingHandle, point);
      if (ellipseState.initializing) {
        updateEllipseInitialHandles(event);
      }
      ellipseState.placed = true;
      drawEllipsePreview();
      return;
    }

    if (cubicState.draggingHandle === null) return;

    const point = getEventPoint(this, event.interactionData.destination, event);
    setHandle(cubicState.draggingHandle, point);

    if (cubicState.initializing && cubicState.draggingHandle === 3) {
      initializeCubicControls();
    }

    cubicState.placed = true;
    drawCubicPreview();
  };

  WallsLayer.prototype._onDragLeftDrop = function(event) {
    if (!isCubicToolActive() && !isEllipseToolActive()) return originalDragDrop.call(this, event);
    if (isEllipseToolActive()) {
      ellipseState.draggingHandle = null;
      ellipseState.initializing = false;
      ellipseState.initialOrigin = null;
      event.interactionData.clearPreviewContainer = false;
      drawEllipsePreview();
      return;
    }

    cubicState.draggingHandle = null;
    cubicState.initializing = false;
    event.interactionData.clearPreviewContainer = false;
    drawCubicPreview();
  };

  WallsLayer.prototype._onDragLeftCancel = function(event) {
    if (!isCubicToolActive() && !isEllipseToolActive()) return originalDragCancel.call(this, event);
    if (isEllipseToolActive()) {
      ellipseState.draggingHandle = null;
      ellipseState.initializing = false;
      ellipseState.initialOrigin = null;
      event.interactionData.clearPreviewContainer = false;
      drawEllipsePreview();
      return;
    }

    cubicState.draggingHandle = null;
    cubicState.initializing = false;
    event.interactionData.clearPreviewContainer = false;
    drawCubicPreview();
  };

  WallsLayer.prototype._onMouseWheel = function(event) {
    if (!getActiveEditorState()?.placed || !event.ctrlKey) {
      return originalMouseWheel.call(this, event);
    }

    event.preventDefault();
    const delta = Math.sign(event.deltaY ?? event.delta);
    changeActiveSegments(delta < 0 ? 1 : -1);
  };

  WallsLayer.prototype._indyWallsCubicPatched = true;
}

function registerCurveEditorShortcuts() {
  window.addEventListener("wheel", (event) => {
    if (!getActiveEditorState()?.placed || !event.ctrlKey) return;

    event.preventDefault();
    event.stopPropagation();
    changeActiveSegments(event.deltaY < 0 ? 1 : -1);
  }, {capture: true, passive: false});

  window.addEventListener("keydown", (event) => {
    if (!getActiveEditorState()?.placed || isEditableTarget(event.target)) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      clearActivePreview();
      canvas.walls.activate({tool: "select"});
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      applyActiveWalls();
    }
  }, {capture: true});
}

function isCubicToolActive() {
  return game.user.isGM && game.activeTool === CUBIC_TOOL && cubicState.active;
}

function isEllipseToolActive() {
  return game.user.isGM && game.activeTool === ELLIPSE_TOOL && ellipseState.active;
}

function getActiveEditorState() {
  if (isCubicToolActive()) return cubicState;
  if (isEllipseToolActive()) return ellipseState;
  return null;
}

function changeActiveSegments(delta) {
  if (isCubicToolActive()) changeCubicSegments(delta);
  else if (isEllipseToolActive()) changeEllipseSegments(delta);
}

function applyActiveWalls() {
  if (isCubicToolActive()) applyCubicWalls();
  else if (isEllipseToolActive()) applyEllipseWalls();
}

function clearActivePreview() {
  if (isCubicToolActive()) clearCubicPreview();
  else if (isEllipseToolActive()) clearEllipsePreview();
}

function setHandle(index, point) {
  cubicState.handles[index] = {x: point.x, y: point.y};
}

function initializeCubicControls() {
  const [start, controlA, controlB, end] = cubicState.handles;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!length) return;

  const nx = dy / length;
  const ny = -dx / length;

  controlA.x = start.x + (dx * 0.35) + (nx * length * 0.25);
  controlA.y = start.y + (dy * 0.35) + (ny * length * 0.25);
  controlB.x = end.x - (dx * 0.10) + (nx * length * 0.35);
  controlB.y = end.y - (dy * 0.10) + (ny * length * 0.35);
}

function getCubicHandleAt(point) {
  if (!cubicState.placed) return null;
  const index = getHandleIndexAt(cubicState.handles, point);
  return index < 0 ? null : index;
}

function changeCubicSegments(delta) {
  if (!isCubicToolActive()) return;
  cubicState.segments = clamp(cubicState.segments + delta, 2, 64);
  drawCubicPreview();
}

function drawCubicPreview() {
  const layer = canvas?.walls;
  if (!layer) return;

  if (!cubicState.graphics || cubicState.graphics._destroyed) {
    cubicState.graphics = new PIXI.Graphics();
    layer.preview.addChild(cubicState.graphics);
  } else if (!cubicState.graphics.parent) {
    layer.preview.addChild(cubicState.graphics);
  }

  const graphics = cubicState.graphics;
  graphics.clear();
  setCubicEditingState(cubicState.placed);
  if (!cubicState.placed) return;

  const points = getCubicPoints(cubicState.segments);
  graphics.lineStyle(4, 0xffaacc, 0.9);
  graphics.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    graphics.lineTo(points[i].x, points[i].y);
  }

  const [start, controlA, controlB, end] = cubicState.handles;
  graphics.lineStyle(2, 0xffaacc, 0.65);
  graphics.moveTo(start.x, start.y);
  graphics.lineTo(controlA.x, controlA.y);
  graphics.moveTo(end.x, end.y);
  graphics.lineTo(controlB.x, controlB.y);

  for (const point of points) {
    drawVertex(graphics, point);
  }
  drawHandle(graphics, start, 0xff4444);
  drawHandle(graphics, end, 0xff4444);
  drawHandle(graphics, controlA, 0xaaff44);
  drawHandle(graphics, controlB, 0xaaff44);
}

function getCubicPoints(segments) {
  const [p0, p1, p2, p3] = cubicState.handles;
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    points.push({
      x: (mt ** 3 * p0.x) + (3 * mt ** 2 * t * p1.x) + (3 * mt * t ** 2 * p2.x) + (t ** 3 * p3.x),
      y: (mt ** 3 * p0.y) + (3 * mt ** 2 * t * p1.y) + (3 * mt * t ** 2 * p2.y) + (t ** 3 * p3.y)
    });
  }
  return points;
}

function setEllipseHandle(index, point) {
  ellipseState.handles[index] = {x: point.x, y: point.y};
}

function getEllipseHandleAt(point) {
  if (!ellipseState.placed) return null;
  const index = getHandleIndexAt(ellipseState.handles, point);
  return index < 0 ? null : index;
}

function updateEllipseInitialHandles(event) {
  const origin = ellipseState.initialOrigin ?? ellipseState.handles[0];
  const destination = ellipseState.handles[1];
  const dx = destination.x - origin.x;
  const dy = destination.y - origin.y;

  if (event.ctrlKey) {
    let rx = Math.abs(dx);
    let ry = Math.abs(dy);
    if (event.altKey) rx = ry = Math.max(rx, ry);
    ellipseState.handles[0] = {x: origin.x - rx, y: origin.y - ry};
    ellipseState.handles[1] = {x: origin.x + rx, y: origin.y + ry};
    return;
  }

  if (event.altKey) {
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    ellipseState.handles[1] = {
      x: origin.x + Math.sign(dx || 1) * size,
      y: origin.y + Math.sign(dy || 1) * size
    };
  }
}

function changeEllipseSegments(delta) {
  if (!isEllipseToolActive()) return;
  ellipseState.segments = clamp(ellipseState.segments + delta, 4, 96);
  drawEllipsePreview();
}

function drawEllipsePreview() {
  const layer = canvas?.walls;
  if (!layer) return;

  if (!ellipseState.graphics || ellipseState.graphics._destroyed) {
    ellipseState.graphics = new PIXI.Graphics();
    layer.preview.addChild(ellipseState.graphics);
  } else if (!ellipseState.graphics.parent) {
    layer.preview.addChild(ellipseState.graphics);
  }

  const graphics = ellipseState.graphics;
  graphics.clear();
  setEllipseEditingState(ellipseState.placed);
  if (!ellipseState.placed) return;

  const points = getEllipsePoints(ellipseState.segments);
  graphics.lineStyle(4, 0xffaacc, 0.9);
  graphics.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    graphics.lineTo(points[i].x, points[i].y);
  }

  const [a, b] = ellipseState.handles;
  graphics.lineStyle(2, 0xffaacc, 0.45);
  graphics.drawRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));

  for (const point of points) {
    drawVertex(graphics, point);
  }
  drawHandle(graphics, a, 0xff4444);
  drawHandle(graphics, b, 0xff4444);
}

function getEllipsePoints(segments) {
  const [a, b] = ellipseState.handles;
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const rx = Math.abs(b.x - a.x) / 2;
  const ry = Math.abs(b.y - a.y) / 2;
  const points = [];

  for (let i = 0; i <= segments; i++) {
    const angle = (Math.PI * 2 * i) / segments;
    points.push({
      x: cx + Math.cos(angle) * rx,
      y: cy + Math.sin(angle) * ry
    });
  }

  return points;
}

async function applyEllipseWalls() {
  if (!isEllipseToolActive() || !ellipseState.placed) return;

  const wallData = WALL_TYPE_DATA[ellipseState.wallTypeTool]?.() ?? WALL_TYPE_DATA.walls();
  const points = getEllipsePoints(ellipseState.segments);
  const ellipseId = ellipseState.ellipseId ?? foundry.utils.randomID();
  const walls = [];

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const c = [Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y)];
    if ((c[0] === c[2]) && (c[1] === c[3])) continue;
    walls.push({
      ...wallData,
      c,
      flags: {
        [MODULE_ID]: {
          [ELLIPSE_FLAG]: {
            ellipseId,
            index: i,
            wallIds: [],
            handles: clonePoints(ellipseState.handles),
            segments: ellipseState.segments,
            wallTypeTool: ellipseState.wallTypeTool
          }
        }
      }
    });
  }

  if (!walls.length) return;

  const oldWallIds = getExistingEllipseWallIds();
  const oldWalls = oldWallIds.map((id) => canvas.scene.walls.get(id)).filter(Boolean);
  const created = await canvas.scene.createEmbeddedDocuments("Wall", walls);
  const wallIds = created.map((wall) => wall.id);
  const flagUpdates = created.map((wall, index) => ({
    _id: wall.id,
    [`flags.${MODULE_ID}.${ELLIPSE_FLAG}.index`]: index,
    [`flags.${MODULE_ID}.${ELLIPSE_FLAG}.wallIds`]: wallIds
  }));
  await canvas.scene.updateEmbeddedDocuments("Wall", flagUpdates);

  if (oldWallIds.length) {
    canvas.walls.storeHistory("delete", oldWalls.map((wall) => wall.toObject()));
    oldWallIds.forEach((id) => ellipseState.replacingWallIds.add(id));
    try {
      await canvas.scene.deleteEmbeddedDocuments("Wall", oldWallIds);
    } finally {
      oldWallIds.forEach((id) => ellipseState.replacingWallIds.delete(id));
    }
  }

  canvas.walls.storeHistory("create", created.map((wall) => wall.toObject()));
  ui.notifications.info(game.i18n.format("indy-walls.Notifications.EllipseWallsCreated", {
    count: created.length
  }));
  clearEllipsePreview();
}

async function applyCubicWalls() {
  if (!isCubicToolActive() || !cubicState.placed) return;

  const wallData = WALL_TYPE_DATA[cubicState.wallTypeTool]?.() ?? WALL_TYPE_DATA.walls();
  const points = getCubicPoints(cubicState.segments);
  const curveId = cubicState.curveId ?? foundry.utils.randomID();
  const walls = [];

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const c = [Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y)];
    if ((c[0] === c[2]) && (c[1] === c[3])) continue;
    walls.push({
      ...wallData,
      c,
      flags: {
        [MODULE_ID]: {
          [CUBIC_FLAG]: {
            curveId,
            index: i,
            wallIds: [],
            handles: cloneHandles(),
            segments: cubicState.segments,
            wallTypeTool: cubicState.wallTypeTool
          }
        }
      }
    });
  }

  if (!walls.length) return;

  const oldWallIds = getExistingCurveWallIds();
  const oldWalls = oldWallIds.map((id) => canvas.scene.walls.get(id)).filter(Boolean);
  const created = await canvas.scene.createEmbeddedDocuments("Wall", walls);
  const wallIds = created.map((wall) => wall.id);
  const flagUpdates = created.map((wall, index) => ({
    _id: wall.id,
    [`flags.${MODULE_ID}.${CUBIC_FLAG}.index`]: index,
    [`flags.${MODULE_ID}.${CUBIC_FLAG}.wallIds`]: wallIds
  }));
  await canvas.scene.updateEmbeddedDocuments("Wall", flagUpdates);

  if (oldWallIds.length) {
    canvas.walls.storeHistory("delete", oldWalls.map((wall) => wall.toObject()));
    oldWallIds.forEach((id) => cubicState.replacingWallIds.add(id));
    try {
      await canvas.scene.deleteEmbeddedDocuments("Wall", oldWallIds);
    } finally {
      oldWallIds.forEach((id) => cubicState.replacingWallIds.delete(id));
    }
  }

  canvas.walls.storeHistory("create", created.map((wall) => wall.toObject()));
  ui.notifications.info(game.i18n.format("indy-walls.Notifications.CubicWallsCreated", {
    count: created.length
  }));
  clearCubicPreview();
}

function clearCubicPreview() {
  cubicState.placed = false;
  cubicState.initializing = false;
  cubicState.draggingHandle = null;
  cubicState.curveId = null;
  cubicState.wallIds = [];
  cubicState.graphics?.destroy();
  cubicState.graphics = null;
  setCubicEditingState(false);
}

function clearEllipsePreview() {
  ellipseState.placed = false;
  ellipseState.initializing = false;
  ellipseState.initialOrigin = null;
  ellipseState.draggingHandle = null;
  ellipseState.ellipseId = null;
  ellipseState.wallIds = [];
  ellipseState.graphics?.destroy();
  ellipseState.graphics = null;
  setEllipseEditingState(false);
}

function setCubicEditingState(editing) {
  document.body?.classList.toggle("indy-walls-cubic-editing", editing);
  ensureCubicEditButtons();
  setEditButtonsVisible(CUBIC_EDIT_BUTTONS_ID, editing);
  if (editing) positionCubicEditButtons();
}

function ensureCubicEditButtons() {
  ensureEditButtons({
    id: CUBIC_EDIT_BUTTONS_ID,
    buttons: [
      ["indy-walls.Controls.DecreaseSegments", "fa-solid fa-minus", () => changeCubicSegments(-1)],
      ["indy-walls.Controls.IncreaseSegments", "fa-solid fa-plus", () => changeCubicSegments(1)],
      ["indy-walls.Controls.ApplyCubic", "fa-solid fa-check", () => applyCubicWalls()],
      ["indy-walls.Controls.CancelCubic", "fa-solid fa-xmark", () => clearCubicPreview()]
    ]
  });
}

function positionCubicEditButtons() {
  positionEditButtons({id: CUBIC_EDIT_BUTTONS_ID, toolName: CUBIC_TOOL});
}

function setEllipseEditingState(editing) {
  document.body?.classList.toggle("indy-walls-ellipse-editing", editing);
  ensureEllipseEditButtons();
  setEditButtonsVisible(ELLIPSE_EDIT_BUTTONS_ID, editing);
  if (editing) positionEllipseEditButtons();
}

function ensureEllipseEditButtons() {
  ensureEditButtons({
    id: ELLIPSE_EDIT_BUTTONS_ID,
    buttons: [
      ["indy-walls.Controls.DecreaseSegments", "fa-solid fa-minus", () => changeEllipseSegments(-1)],
      ["indy-walls.Controls.IncreaseSegments", "fa-solid fa-plus", () => changeEllipseSegments(1)],
      ["indy-walls.Controls.ApplyEllipse", "fa-solid fa-check", () => applyEllipseWalls()],
      ["indy-walls.Controls.CancelEllipse", "fa-solid fa-xmark", () => clearEllipsePreview()]
    ]
  });
}

function positionEllipseEditButtons() {
  positionEditButtons({id: ELLIPSE_EDIT_BUTTONS_ID, toolName: ELLIPSE_TOOL, fallbackTop: 160});
}

function cancelCubicEditingForDeletedWall(wallDocument) {
  if (!cubicState.placed || !cubicState.curveId) return;
  if (cubicState.replacingWallIds.has(wallDocument.id)) return;

  const cubicData = wallDocument.getFlag(MODULE_ID, CUBIC_FLAG);
  const sameCurve = cubicData?.curveId === cubicState.curveId;
  const knownWall = cubicState.wallIds.includes(wallDocument.id);
  if (!sameCurve && !knownWall) return;

  clearCubicPreview();
  if (game.activeTool === CUBIC_TOOL) canvas.walls.activate({tool: "select"});
}

function cancelEllipseEditingForDeletedWall(wallDocument) {
  if (!ellipseState.placed || !ellipseState.ellipseId) return;
  if (ellipseState.replacingWallIds.has(wallDocument.id)) return;

  const ellipseData = wallDocument.getFlag(MODULE_ID, ELLIPSE_FLAG);
  const sameEllipse = ellipseData?.ellipseId === ellipseState.ellipseId;
  const knownWall = ellipseState.wallIds.includes(wallDocument.id);
  if (!sameEllipse && !knownWall) return;

  clearEllipsePreview();
  if (game.activeTool === ELLIPSE_TOOL) canvas.walls.activate({tool: "select"});
}

function loadCubicCurveFromWall(wall) {
  const cubicData = wall.document.getFlag(MODULE_ID, CUBIC_FLAG);
  if (!Array.isArray(cubicData?.handles) || cubicData.handles.length !== 4) return;

  cubicState.active = true;
  cubicState.placed = true;
  cubicState.initializing = false;
  cubicState.draggingHandle = null;
  cubicState.curveId = cubicData.curveId ?? null;
  cubicState.wallIds = Array.isArray(cubicData.wallIds) ? [...cubicData.wallIds] : [wall.document.id];
  cubicState.wallTypeTool = getWallTypeToolFromDocument(wall.document) ?? cubicData.wallTypeTool ?? "walls";
  cubicState.segments = clamp(Number(cubicData.segments) || DEFAULT_CUBIC_SEGMENTS, 2, 64);
  cubicState.handles = cubicData.handles.map((handle) => ({
    x: Number(handle.x) || 0,
    y: Number(handle.y) || 0
  }));

  canvas.walls.activate({tool: CUBIC_TOOL});
  drawCubicPreview();
}

function loadEllipseFromWall(wall) {
  const ellipseData = wall.document.getFlag(MODULE_ID, ELLIPSE_FLAG);
  if (!Array.isArray(ellipseData?.handles) || ellipseData.handles.length !== 2) return;

  ellipseState.active = true;
  ellipseState.placed = true;
  ellipseState.initializing = false;
  ellipseState.initialOrigin = null;
  ellipseState.draggingHandle = null;
  ellipseState.ellipseId = ellipseData.ellipseId ?? null;
  ellipseState.wallIds = Array.isArray(ellipseData.wallIds) ? [...ellipseData.wallIds] : [wall.document.id];
  ellipseState.wallTypeTool = getWallTypeToolFromDocument(wall.document) ?? ellipseData.wallTypeTool ?? "walls";
  ellipseState.segments = clamp(Number(ellipseData.segments) || DEFAULT_ELLIPSE_SEGMENTS, 4, 96);
  ellipseState.handles = ellipseData.handles.map((handle) => ({
    x: Number(handle.x) || 0,
    y: Number(handle.y) || 0
  }));

  canvas.walls.activate({tool: ELLIPSE_TOOL});
  drawEllipsePreview();
}

function cloneHandles() {
  return clonePoints(cubicState.handles);
}

function getExistingCurveWallIds() {
  return cubicState.wallIds.filter((id) => canvas.scene.walls.has(id));
}

function getExistingEllipseWallIds() {
  return ellipseState.wallIds.filter((id) => canvas.scene.walls.has(id));
}

function getWallTypeToolFromDocument(wallDocument) {
  const senses = CONST.WALL_SENSE_TYPES;
  const movement = CONST.WALL_MOVEMENT_TYPES;
  const doors = CONST.WALL_DOOR_TYPES;
  const {light, sight, sound, move, door} = wallDocument;

  if (door === doors.DOOR) return "doors";
  if (door === doors.SECRET) return "secret";
  if ((light === senses.LIMITED) && (sight === senses.LIMITED) && (sound === senses.LIMITED)
    && (move === movement.NORMAL)) return "terrain";
  if ((light === senses.NONE) && (sight === senses.NONE) && (sound === senses.NONE)
    && (move === movement.NORMAL)) return "invisible";
  if ((light === senses.NORMAL) && (sight === senses.NORMAL) && (sound === senses.NONE)
    && (move === movement.NONE)) return "ethereal";
  if ((light === senses.NORMAL) && (sight === senses.NORMAL) && (sound === senses.NORMAL)
    && (move === movement.NORMAL)) return "walls";
  return null;
}
