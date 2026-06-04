import {
  clamp,
  clonePoints,
  drawHandle,
  drawVertex,
  ensureEditButtons,
  getEventPoint,
  getHandleAt as getHandleIndexAt,
  getScaledRadius,
  isEditableTarget,
  positionEditButtons,
  setEditButtonsVisible
} from "./curve-common.js";

const MODULE_ID = "indy-walls";
const QUICK_WALL_TYPE_SETTING = "quickWallTypeChange";
const DEBUG_SETTING = "debugShapeSelection";
const STYLE_SETTINGS = {
  wallColor: "previewWallColor",
  wallWidth: "previewWallWidth",
  vertexColor: "previewVertexColor",
  vertexActiveColor: "previewVertexActiveColor",
  vertexSize: "previewVertexSize",
  endpointColor: "previewEndpointColor",
  endpointSize: "previewEndpointSize",
  handleColor: "previewHandleColor",
  handleSize: "previewHandleSize",
  outlineColor: "previewOutlineColor",
  outlineWidth: "previewOutlineWidth"
};
const CUBIC_TOOL = "indyCubicBezier";
const ELLIPSE_TOOL = "indyEllipseWall";
const RECTANGLE_TOOL = "indyRectangleWall";
const DEFAULT_CUBIC_SEGMENTS = 10;
const DEFAULT_ELLIPSE_SEGMENTS = 16;
const DEFAULT_RECTANGLE_SEGMENTS = 1;
const CUBIC_FLAG = "cubicBezier";
const ELLIPSE_FLAG = "ellipse";
const RECTANGLE_FLAG = "rectangle";
const CUBIC_EDIT_BUTTONS_ID = "indy-walls-cubic-edit-buttons";
const ELLIPSE_EDIT_BUTTONS_ID = "indy-walls-ellipse-edit-buttons";
const RECTANGLE_EDIT_BUTTONS_ID = "indy-walls-rectangle-edit-buttons";

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
  windows: () => ({
    light: CONST.WALL_SENSE_TYPES.NORMAL,
    sight: CONST.WALL_SENSE_TYPES.NORMAL,
    sound: CONST.WALL_SENSE_TYPES.NORMAL,
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
  undoStack: [],
  redoStack: [],
  pendingUndoSnapshot: null,
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
  initialOrigin: null,
  draggingHandle: null,
  ellipseId: null,
  wallIds: [],
  replacingWallIds: new Set(),
  undoStack: [],
  redoStack: [],
  pendingUndoSnapshot: null,
  wallTypeTool: "walls",
  segments: DEFAULT_ELLIPSE_SEGMENTS,
  graphics: null,
  handles: [
    {x: 0, y: 0},
    {x: 0, y: 0}
  ]
};

const rectangleState = {
  active: false,
  placed: false,
  initializing: false,
  draggingHandle: null,
  draggingVertex: null,
  hoveredVertex: null,
  lastSideEditAction: 0,
  suppressNextSideEditClick: false,
  rectangleId: null,
  wallIds: [],
  replacingWallIds: new Set(),
  undoStack: [],
  redoStack: [],
  pendingUndoSnapshot: null,
  wallTypeTool: "walls",
  sideSegments: {
    top: DEFAULT_RECTANGLE_SEGMENTS,
    right: DEFAULT_RECTANGLE_SEGMENTS,
    bottom: DEFAULT_RECTANGLE_SEGMENTS,
    left: DEFAULT_RECTANGLE_SEGMENTS
  },
  sideRatios: {
    top: [],
    right: [],
    bottom: [],
    left: []
  },
  sideEnabled: {
    top: true,
    right: true,
    bottom: true,
    left: true
  },
  sideGaps: {
    top: [],
    right: [],
    bottom: [],
    left: []
  },
  graphics: null,
  handles: [
    {x: 0, y: 0},
    {x: 0, y: 0}
  ]
};

const shapeLoadState = {
  allowControlWallLoad: false
};
const controlKeyState = {
  down: false
};
const editorDomDragState = {
  active: false,
  tool: null,
  handle: null,
  vertex: null,
  coordinateLabel: null,
  pointerCoordinateLabel: null,
  pointerOffset: null,
  startPointerPoint: null,
  startEditorPoint: null,
  pointerId: null,
  view: null
};

const hiddenEditWalls = new Map();
const rectangleCanvasClickViews = new WeakSet();
const editorDomDragViews = new WeakSet();

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, QUICK_WALL_TYPE_SETTING, {
    name: game.i18n.localize("indy-walls.Settings.QuickWallTypeChange.Name"),
    hint: game.i18n.localize("indy-walls.Settings.QuickWallTypeChange.Hint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });
  game.settings.register(MODULE_ID, DEBUG_SETTING, {
    name: game.i18n.localize("indy-walls.Settings.DebugShapeSelection.Name"),
    hint: game.i18n.localize("indy-walls.Settings.DebugShapeSelection.Hint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
  registerStyleSettings();

  patchWallsLayer();
  registerWallTypeControlShortcuts();
  registerCurveEditorShortcuts();
  registerControlKeyTracking();
  registerEditorDragFallback();
});

Hooks.on("canvasReady", () => {
  debugShapeSelection("canvasReady", {
    hasView: !!canvas?.app?.view,
    wallPlaceables: canvas?.walls?.placeables?.length ?? 0,
    wallObjectClass: CONFIG.Wall?.objectClass?.name,
    firstWallClass: canvas?.walls?.placeables?.[0]?.constructor?.name
  });
  patchAvailableWallObjectInteractions();
  registerRectangleCanvasClickHandler();
  registerEditorDomDragHandler();
});

Hooks.on("controlWall", (wall, controlled) => {
  if (!controlled || !game.user.isGM) return;
  const controlKeyDown = isControlKeyDown();
  debugShapeSelection("controlWall", {
    wallId: wall?.document?.id ?? wall?.id,
    controlled,
    allowControlWallLoad: shapeLoadState.allowControlWallLoad,
    controlKeyDown
  });
  if (shapeLoadState.allowControlWallLoad || controlKeyDown) loadShapeFromExistingWall(wall);
});

Hooks.on("deleteWall", (wallDocument) => {
  cancelCubicEditingForDeletedWall(wallDocument);
  cancelEllipseEditingForDeletedWall(wallDocument);
  cancelRectangleEditingForDeletedWall(wallDocument);
});

Hooks.on("drawWall", (wall) => {
  patchWallObjectInteractions(wall?.constructor);
  applyHiddenEditWallState(wall);
});

Hooks.on("refreshWall", (wall) => {
  applyHiddenEditWallState(wall);
});

function registerStyleSettings() {
  for (const [key, data] of Object.entries({
    wallColor: ["PreviewWallColor", String, "#c10e56ff"],
    vertexColor: ["PreviewVertexColor", String, "#ffffff"],
    vertexActiveColor: ["PreviewVertexActiveColor", String, "#aaff44"],
    endpointColor: ["PreviewEndpointColor", String, "#ff4444"],
    handleColor: ["PreviewHandleColor", String, "#aaff44"],
    outlineColor: ["PreviewOutlineColor", String, "#111111"]
  })) {
    registerColorStyleSetting(key, data);
  }

  for (const [key, data] of Object.entries({
    wallWidth: ["PreviewWallWidth", Number, 4, {min: 1, max: 12, step: 1}],
    vertexSize: ["PreviewVertexSize", Number, 5, {min: 2, max: 20, step: 1}],
    endpointSize: ["PreviewEndpointSize", Number, 12, {min: 4, max: 32, step: 1}],
    handleSize: ["PreviewHandleSize", Number, 12, {min: 4, max: 32, step: 1}],
    outlineWidth: ["PreviewOutlineWidth", Number, 2, {min: 0, max: 8, step: 0.5}]
  })) {
    const [label, type, defaultValue, range] = data;
    game.settings.register(MODULE_ID, STYLE_SETTINGS[key], {
      name: game.i18n.localize(`indy-walls.Settings.${label}.Name`),
      hint: game.i18n.localize(`indy-walls.Settings.${label}.Hint`),
      scope: "client",
      config: true,
      type,
      default: defaultValue,
      range,
      onChange: redrawActivePreview
    });
  }
}

function registerColorStyleSetting(key, data) {
  const [label, type, defaultValue] = data;
  const settingKey = STYLE_SETTINGS[key];
  const name = game.i18n.localize(`indy-walls.Settings.${label}.Name`);
  const hint = game.i18n.localize(`indy-walls.Settings.${label}.Hint`);
  const ColorSetting = window.Ardittristan?.ColorSetting;

  if (ColorSetting) {
    new ColorSetting(MODULE_ID, settingKey, {
      name,
      hint,
      label: game.i18n.localize("indy-walls.Settings.ColorPickerLabel"),
      restricted: false,
      defaultColor: defaultValue,
      scope: "client",
      onChange: redrawActivePreview
    });
    return;
  }

  game.settings.register(MODULE_ID, settingKey, {
    name,
    hint,
    scope: "client",
    config: true,
    type,
    default: defaultValue,
    onChange: redrawActivePreview
  });
}

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
      rectangleState.wallTypeTool = toolName;
      if (isControlInteraction(event)) await updateSelectedWalls(toolName);
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
        ellipseState.active = false;
        rectangleState.active = false;
        clearEllipsePreview();
        clearRectanglePreview();
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
        cubicState.active = false;
        rectangleState.active = false;
        clearCubicPreview();
        clearRectanglePreview();
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

  wallTools[RECTANGLE_TOOL] = {
    name: RECTANGLE_TOOL,
    order: 15,
    title: "indy-walls.Controls.Rectangle",
    icon: "fa-solid fa-vector-square",
    onChange: (event, active) => {
      rectangleState.active = active;
      if (active) {
        cubicState.active = false;
        ellipseState.active = false;
        clearCubicPreview();
        clearEllipsePreview();
        canvas.walls.activate();
      }
      else clearRectanglePreview();
    },
    toolclip: {
      heading: "indy-walls.Controls.Rectangle",
      items: [
        {paragraph: "indy-walls.Tooltips.Rectangle"}
      ]
    }
  };
});

Hooks.on("renderSceneControls", () => {
  positionCubicEditButtons();
  positionEllipseEditButtons();
  positionRectangleEditButtons();
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
    const rectangleData = wall.document.getFlag(MODULE_ID, RECTANGLE_FLAG);
    if (rectangleData) update[`flags.${MODULE_ID}.${RECTANGLE_FLAG}.wallTypeTool`] = toolName;
    return update;
  });

  await canvas.scene.updateEmbeddedDocuments("Wall", updates);
  ui.notifications.info(game.i18n.format("indy-walls.Notifications.WallTypesUpdated", {
    count: selectedWalls.length
  }));
}

function registerWallTypeControlShortcuts() {
  document.addEventListener("click", (event) => {
    if (!isControlInteraction(event)) return;
    if (!game.user.isGM) return;
    if (!game.settings.get(MODULE_ID, QUICK_WALL_TYPE_SETTING)) return;
    if (!canvas?.walls?.controlled?.length) return;

    const button = event.target?.closest?.("[data-tool]");
    const toolName = button?.dataset?.tool;
    if (!WALL_TYPE_DATA[toolName]) return;

    event.preventDefault();
    event.stopPropagation();
    cubicState.wallTypeTool = toolName;
    ellipseState.wallTypeTool = toolName;
    rectangleState.wallTypeTool = toolName;
    updateSelectedWalls(toolName);
  }, {capture: true});
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
    debugShapeSelection("walls layer drag left start", {
      ctrl: isControlInteraction(event),
      activeTool: game.activeTool,
      editorActive: isAnyEditorToolActive()
    });
    if (isAnyEditorToolActive() && isControlInteraction(event) && loadShapeAtInteractionPoint(event)) {
      consumeCanvasInteraction(event);
      resetCanvasCursor(event);
      return;
    }

    if (!isCubicToolActive() && !isEllipseToolActive() && !isRectangleToolActive()) {
      return originalDragStart.call(this, event);
    }

    event.interactionData.clearPreviewContainer = false;
    const origin = event.interactionData.origin;
    const hitPoint = getInteractionPoint(event) ?? origin;
    const point = getEventPoint(this, origin, event);

    if (isEllipseToolActive()) {
      ellipseState.draggingHandle = getEllipseHandleAt({x: hitPoint.x, y: hitPoint.y});
      if (ellipseState.draggingHandle === null) {
        if (ellipseState.placed) {
          consumeCanvasInteraction(event);
          resetCanvasCursor();
          drawEllipsePreview();
          return;
        }
        beginEditorOperation(ellipseState, true);
        ellipseState.placed = false;
        ellipseState.initializing = true;
        ellipseState.initialOrigin = point;
        ellipseState.draggingHandle = 1;
        setEllipseHandle(0, point);
        setEllipseHandle(1, point);
      } else {
        beginEditorOperation(ellipseState);
      }
      drawEllipsePreview();
      return;
    }

    if (isRectangleToolActive()) {
      rectangleState.draggingHandle = getRectangleHandleAt({x: hitPoint.x, y: hitPoint.y});
      if (rectangleState.draggingHandle !== null) {
        beginEditorOperation(rectangleState);
        rectangleState.lastSideEditAction = Date.now();
        rectangleState.suppressNextSideEditClick = true;
      }
      rectangleState.draggingVertex = rectangleState.draggingHandle === null
        ? getRectangleVertexAt({x: hitPoint.x, y: hitPoint.y})
        : null;

      if (rectangleState.draggingVertex && event.altKey) {
        consumeCanvasInteraction(event);
        const snapshot = getEditorSnapshot(rectangleState);
        removeRectangleVertex(rectangleState.draggingVertex);
        pushEditorUndoSnapshot(rectangleState, snapshot);
        rectangleState.draggingVertex = null;
        rectangleState.hoveredVertex = null;
        rectangleState.lastSideEditAction = Date.now();
        rectangleState.suppressNextSideEditClick = true;
        scheduleCanvasInteractionReset(event);
        return;
      }

      if (rectangleState.draggingVertex) {
        beginEditorOperation(rectangleState);
        rectangleState.lastSideEditAction = Date.now();
        rectangleState.suppressNextSideEditClick = true;
        drawRectanglePreview();
        return;
      }

      if (rectangleState.draggingHandle === null) {
        if (rectangleState.placed) {
          consumeCanvasInteraction(event);
          resetCanvasCursor(event);
          drawRectanglePreview();
          return;
        }
        beginEditorOperation(rectangleState, true);
        rectangleState.placed = false;
        rectangleState.initializing = true;
        rectangleState.draggingHandle = 1;
        rectangleState.draggingVertex = null;
        rectangleState.sideRatios = getDefaultRectangleSideRatios();
        rectangleState.sideEnabled = getDefaultRectangleSideEnabled();
        rectangleState.sideGaps = getDefaultRectangleSideGaps();
        setRectangleHandle(0, point);
        setRectangleHandle(1, point);
      }
      drawRectanglePreview();
      return;
    }

    cubicState.draggingHandle = getCubicHandleAt({x: hitPoint.x, y: hitPoint.y});
    if (cubicState.draggingHandle === null) {
      if (cubicState.placed) {
        consumeCanvasInteraction(event);
        resetCanvasCursor(event);
        drawCubicPreview();
        return;
      }
      beginEditorOperation(cubicState, true);
      cubicState.placed = false;
      cubicState.initializing = true;
      cubicState.draggingHandle = 3;
      setHandle(0, point);
      setHandle(1, point);
      setHandle(2, point);
      setHandle(3, point);
    } else {
      beginEditorOperation(cubicState);
    }

    drawCubicPreview();
  };

  WallsLayer.prototype._onDragLeftMove = function(event) {
    if (!isCubicToolActive() && !isEllipseToolActive() && !isRectangleToolActive()) {
      return originalDragMove.call(this, event);
    }

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

    if (isRectangleToolActive()) {
      if (rectangleState.draggingVertex) {
        const point = getEventPoint(this, event.interactionData.destination, event);
        setRectangleVertex(rectangleState.draggingVertex, point);
        drawRectanglePreview();
        return;
      }

      if (rectangleState.draggingHandle === null) return;
      const point = getEventPoint(this, event.interactionData.destination, event);
      setRectangleHandle(rectangleState.draggingHandle, point);
      rectangleState.placed = true;
      drawRectanglePreview();
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
    debugShapeSelection("walls layer drag left drop", {
      activeTool: game.activeTool,
      editorActive: isAnyEditorToolActive(),
      cubicDraggingHandle: cubicState.draggingHandle,
      ellipseDraggingHandle: ellipseState.draggingHandle,
      rectangleDraggingHandle: rectangleState.draggingHandle,
      rectangleDraggingVertex: rectangleState.draggingVertex
    });
    if (!isCubicToolActive() && !isEllipseToolActive() && !isRectangleToolActive()) {
      return originalDragDrop.call(this, event);
    }
    if (isEllipseToolActive()) {
      ellipseState.draggingHandle = null;
      ellipseState.initializing = false;
      ellipseState.initialOrigin = null;
      event.interactionData.clearPreviewContainer = false;
      commitEditorOperation(ellipseState);
      drawEllipsePreview();
      return;
    }

    if (isRectangleToolActive()) {
      rectangleState.draggingHandle = null;
      rectangleState.draggingVertex = null;
      rectangleState.hoveredVertex = null;
      rectangleState.initializing = false;
      event.interactionData.clearPreviewContainer = false;
      resetCanvasCursor(event);
      commitEditorOperation(rectangleState);
      drawRectanglePreview();
      return;
    }

    cubicState.draggingHandle = null;
    cubicState.initializing = false;
    event.interactionData.clearPreviewContainer = false;
    commitEditorOperation(cubicState);
    drawCubicPreview();
  };

  WallsLayer.prototype._onDragLeftCancel = function(event) {
    debugShapeSelection("walls layer drag left cancel", {
      activeTool: game.activeTool,
      editorActive: isAnyEditorToolActive(),
      cubicDraggingHandle: cubicState.draggingHandle,
      ellipseDraggingHandle: ellipseState.draggingHandle,
      rectangleDraggingHandle: rectangleState.draggingHandle,
      rectangleDraggingVertex: rectangleState.draggingVertex
    });
    if (!isCubicToolActive() && !isEllipseToolActive() && !isRectangleToolActive()) {
      return originalDragCancel.call(this, event);
    }
    if (isEllipseToolActive()) {
      ellipseState.draggingHandle = null;
      ellipseState.initializing = false;
      ellipseState.initialOrigin = null;
      event.interactionData.clearPreviewContainer = false;
      cancelEditorOperation(ellipseState);
      drawEllipsePreview();
      return;
    }

    if (isRectangleToolActive()) {
      rectangleState.draggingHandle = null;
      rectangleState.draggingVertex = null;
      rectangleState.hoveredVertex = null;
      rectangleState.initializing = false;
      event.interactionData.clearPreviewContainer = false;
      resetCanvasCursor();
      cancelEditorOperation(rectangleState);
      drawRectanglePreview();
      return;
    }

    cubicState.draggingHandle = null;
    cubicState.initializing = false;
    event.interactionData.clearPreviewContainer = false;
    cancelEditorOperation(cubicState);
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

  patchAvailableWallObjectInteractions();
}

function patchAvailableWallObjectInteractions() {
  const WallClass = CONFIG.Wall?.objectClass ?? canvas?.walls?.placeables?.[0]?.constructor;
  debugShapeSelection("patchAvailableWallObjectInteractions", {
    hasWallClass: !!WallClass,
    wallClassName: WallClass?.name,
    placeables: canvas?.walls?.placeables?.length ?? 0
  });
  patchWallObjectInteractions(WallClass);
}

function patchWallObjectInteractions(WallClass) {
  if (!WallClass) {
    debugShapeSelection("patchWallObjectInteractions skipped: no WallClass");
    return;
  }
  if (WallClass.prototype._indyWallsObjectPatched) {
    debugShapeSelection("patchWallObjectInteractions skipped: already patched", {
      wallClassName: WallClass.name
    });
    return;
  }

  for (const method of ["_onDragLeftStart", "_onClickLeft"]) {
    const original = WallClass.prototype[method];
    WallClass.prototype[method] = function(event) {
      const editorActive = isAnyEditorToolActive();
      debugShapeSelection("wall object event", {
        method,
        wallId: this.document?.id ?? this.id,
        ctrl: isControlInteraction(event),
        hasIndyShapeFlag: hasIndyShapeFlag(this.document),
        hasOriginal: !!original,
        editorActive
      });

      if ((method === "_onDragLeftStart" || method === "_onClickLeft")
        && game.user.isGM
        && isControlInteraction(event)
        && loadShapeFromExistingWall(this)) {
        consumeCanvasInteraction(event);
        resetCanvasCursor(event);
        return;
      }

      if (!editorActive) return original?.call(this, event);

      if (method === "_onDragLeftStart" && shouldRouteWallObjectDragStartToEditor(event)) {
        consumeCanvasInteraction(event);
        return canvas?.walls?._onDragLeftStart?.(event);
      }

      return original?.call(this, event);
    };
  }

  WallClass.prototype._indyWallsObjectPatched = true;
  debugShapeSelection("patchWallObjectInteractions patched", {
    wallClassName: WallClass.name
  });
}

function shouldRouteWallObjectDragStartToEditor(event) {
  const point = getInteractionPoint(event) ?? event.interactionData?.origin;
  if (!point) return false;

  if (isCubicToolActive()) return !cubicState.placed || getCubicHandleAt(point) !== null;
  if (isEllipseToolActive()) return !ellipseState.placed || getEllipseHandleAt(point) !== null;
  if (!isRectangleToolActive()) return false;

  return !rectangleState.placed
    || getRectangleHandleAt(point) !== null
    || getRectangleVertexAt(point) !== null
    || getRectangleSideAt(point) !== null;
}

function registerRectangleCanvasClickHandler() {
  const view = canvas?.app?.view;
  if (!view || rectangleCanvasClickViews.has(view)) return;

  view.addEventListener("click", handleRectangleCanvasClick, {capture: true});
  rectangleCanvasClickViews.add(view);
  debugShapeSelection("registered rectangle canvas click handler", {
    tagName: view.tagName,
    width: view.width,
    height: view.height,
    clientWidth: view.clientWidth,
    clientHeight: view.clientHeight
  });
}

function handleRectangleCanvasClick(event) {
  if (Number.isFinite(event.button) && event.button !== 0) return;

  if (isControlInteraction(event) && loadShapeFromCanvasClick(event)) {
    event.preventDefault?.();
    event.stopPropagation?.();
    scheduleCanvasInteractionReset(event);
    return;
  }

  if (!isRectangleToolActive() || !rectangleState.placed) return;

  const edit = getRectangleSideEditFromEvent(event);
  debugShapeSelection("rectangle canvas click", {
    clientX: event.clientX,
    clientY: event.clientY,
    altKey: !!event.altKey,
    edit
  });
  if (!edit) return;

  event.preventDefault?.();
  event.stopPropagation?.();
  commitRectangleSideEdit(edit, event);
}

function loadShapeFromCanvasClick(event) {
  for (const point of getCanvasClickCandidatePoints(event)) {
    const scan = getIndyWallAtPoint(point, "canvas click");
    if (!scan?.wall || !loadShapeFromExistingWall(scan.wall)) continue;

    debugShapeSelection("canvas click loaded shape", {
      point,
      wallId: scan.wall.document?.id ?? scan.wall.id
    });
    return true;
  }
  return false;
}

function getRectangleSideEditFromEvent(event) {
  if (!isRectangleToolActive() || !rectangleState.placed) return null;
  const point = getRectangleSidePointFromEvent(event);
  if (!point) return null;

  return {
    point: {x: point.x, y: point.y},
    remove: isAltInteraction(event)
  };
}

function getRectangleSidePointFromEvent(event) {
  for (const point of getCanvasClickCandidatePoints(event)) {
    if (getRectangleSideAt({x: point.x, y: point.y})) return {x: point.x, y: point.y};
  }
  return null;
}

function getCanvasClickCandidatePoints(event) {
  return getCanvasClickPointCandidates(event).map(({point}) => point);
}

function getCanvasClickPointCandidates(event) {
  const interactionPoint = getLabeledInteractionPoint(event);
  const candidates = [
    ...(interactionPoint ? [interactionPoint] : []),
    ...getClientInteractionPoints(event)
  ].filter(({point}) => Number.isFinite(point?.x) && Number.isFinite(point?.y));

  const seen = new Set();
  return candidates.filter(({label, point}) => {
    const key = `${Math.round(point.x * 100) / 100}:${Math.round(point.y * 100) / 100}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getLabeledInteractionPoint(event) {
  const source = event.data ?? event;
  if (source.getLocalPosition || source.global || event.global || event.interactionData?.origin) {
    return {label: "interaction", point: getInteractionPoint(event)};
  }
  return null;
}

function commitRectangleSideEdit(edit, event=null) {
  if (!isRectangleToolActive() || !rectangleState.placed) return false;
  debugInteractionManagers("before rectangle canvas click commit", event, {edit});
  if (!editRectangleSideWithUndo(edit.point, edit.remove)) return false;

  rectangleState.draggingHandle = null;
  rectangleState.draggingVertex = null;
  rectangleState.lastSideEditAction = Date.now();
  rectangleState.suppressNextSideEditClick = false;
  debugInteractionManagers("after rectangle canvas click commit", event, {edit});
  scheduleCanvasInteractionReset(event);
  return true;
}

function registerEditorDomDragHandler() {
  const view = canvas?.app?.view;
  if (!view || editorDomDragViews.has(view)) return;

  document.addEventListener("pointerdown", handleEditorDomPointerDown, {capture: true});
  window.addEventListener("pointermove", handleEditorDomPointerMove, {capture: true});
  window.addEventListener("pointerup", handleEditorDomPointerUp, {capture: true});
  window.addEventListener("pointercancel", handleEditorDomPointerCancel, {capture: true});
  editorDomDragViews.add(view);
  debugShapeSelection("registered editor DOM drag handler", {
    tagName: view.tagName,
    width: view.width,
    height: view.height,
    clientWidth: view.clientWidth,
    clientHeight: view.clientHeight
  });
}

function handleEditorDomPointerDown(event) {
  if (!isCanvasDomEvent(event) || event.button !== 0 || isControlInteraction(event)) return;
  const hit = getEditorDomDragHit(event);
  if (!hit) return;

  debugInteractionManagers("editor DOM drag start", event, hit);
  consumeCanvasInteraction(event);
  event.target?.setPointerCapture?.(event.pointerId);

  if (hit.tool === RECTANGLE_TOOL && hit.vertex && event.altKey) {
    const snapshot = getEditorSnapshot(rectangleState);
    removeRectangleVertex(hit.vertex);
    pushEditorUndoSnapshot(rectangleState, snapshot);
    rectangleState.draggingVertex = null;
    rectangleState.hoveredVertex = null;
    rectangleState.draggingHandle = null;
    rectangleState.lastSideEditAction = Date.now();
    rectangleState.suppressNextSideEditClick = false;
    scheduleCanvasInteractionReset(event);
    return;
  }

  const state = getActiveEditorState();
  beginEditorOperation(state);
  editorDomDragState.active = true;
  editorDomDragState.tool = hit.tool;
  editorDomDragState.handle = hit.handle;
  editorDomDragState.vertex = hit.vertex;
  editorDomDragState.coordinateLabel = hit.coordinateLabel;
  editorDomDragState.pointerCoordinateLabel = hit.pointerCoordinateLabel;
  editorDomDragState.pointerOffset = hit.pointerOffset;
  editorDomDragState.startPointerPoint = hit.startPointerPoint;
  editorDomDragState.startEditorPoint = hit.startEditorPoint;
  editorDomDragState.pointerId = event.pointerId;
  editorDomDragState.view = canvas?.app?.view ?? null;

  if (hit.tool === CUBIC_TOOL) cubicState.draggingHandle = hit.handle;
  else if (hit.tool === ELLIPSE_TOOL) ellipseState.draggingHandle = hit.handle;
  else if (hit.handle !== null) {
    rectangleState.draggingHandle = hit.handle;
    rectangleState.draggingVertex = null;
  } else {
    rectangleState.draggingHandle = null;
    rectangleState.draggingVertex = hit.vertex;
  }
}

function handleEditorDomPointerMove(event) {
  if (!editorDomDragState.active || event.pointerId !== editorDomDragState.pointerId) return;
  consumeCanvasInteraction(event);

  const point = getSnappedDomEditorPoint(event);
  if (!point) return;

  debugShapeSelection("editor DOM drag move", {
    tool: editorDomDragState.tool,
    handle: editorDomDragState.handle,
    vertex: editorDomDragState.vertex,
    coordinateLabel: editorDomDragState.coordinateLabel,
    pointerCoordinateLabel: editorDomDragState.pointerCoordinateLabel,
    pointerOffset: editorDomDragState.pointerOffset,
    startPointerPoint: editorDomDragState.startPointerPoint,
    startEditorPoint: editorDomDragState.startEditorPoint,
    point
  });

  if (editorDomDragState.tool === CUBIC_TOOL) {
    setHandle(editorDomDragState.handle, point);
    cubicState.placed = true;
    drawCubicPreview();
  } else if (editorDomDragState.tool === ELLIPSE_TOOL) {
    setEllipseHandle(editorDomDragState.handle, point);
    ellipseState.placed = true;
    drawEllipsePreview();
  } else if (editorDomDragState.handle !== null) {
    setRectangleHandle(editorDomDragState.handle, point);
    rectangleState.placed = true;
    drawRectanglePreview();
  } else if (editorDomDragState.vertex) {
    setRectangleVertex(editorDomDragState.vertex, point);
    drawRectanglePreview();
  }
}

function handleEditorDomPointerUp(event) {
  if (!editorDomDragState.active || event.pointerId !== editorDomDragState.pointerId) return;
  consumeCanvasInteraction(event);
  finalizeEditorDomDrag(event, false);
}

function handleEditorDomPointerCancel(event) {
  if (!editorDomDragState.active || event.pointerId !== editorDomDragState.pointerId) return;
  consumeCanvasInteraction(event);
  finalizeEditorDomDrag(event, true);
}

function finalizeEditorDomDrag(event=null, cancelled=false) {
  debugInteractionManagers(cancelled ? "editor DOM drag cancel" : "editor DOM drag commit", event, {
    tool: editorDomDragState.tool,
    handle: editorDomDragState.handle,
    vertex: editorDomDragState.vertex
  });

  if (editorDomDragState.tool === CUBIC_TOOL) {
    cubicState.draggingHandle = null;
    cubicState.initializing = false;
    if (cancelled) cancelEditorOperation(cubicState);
    else commitEditorOperation(cubicState);
    drawCubicPreview();
  } else if (editorDomDragState.tool === ELLIPSE_TOOL) {
    ellipseState.draggingHandle = null;
    ellipseState.initializing = false;
    ellipseState.initialOrigin = null;
    if (cancelled) cancelEditorOperation(ellipseState);
    else commitEditorOperation(ellipseState);
    drawEllipsePreview();
  } else if (editorDomDragState.tool === RECTANGLE_TOOL) {
    rectangleState.draggingHandle = null;
    rectangleState.draggingVertex = null;
    rectangleState.hoveredVertex = null;
    rectangleState.initializing = false;
    if (cancelled) cancelEditorOperation(rectangleState);
    else commitEditorOperation(rectangleState);
    drawRectanglePreview();
  }

  editorDomDragState.active = false;
  editorDomDragState.tool = null;
  editorDomDragState.handle = null;
  editorDomDragState.vertex = null;
  editorDomDragState.coordinateLabel = null;
  editorDomDragState.pointerCoordinateLabel = null;
  editorDomDragState.pointerOffset = null;
  editorDomDragState.startPointerPoint = null;
  editorDomDragState.startEditorPoint = null;
  editorDomDragState.pointerId = null;
  editorDomDragState.view = null;
  scheduleCanvasInteractionReset(event);
}

function getEditorDomDragHit(event) {
  if (isCubicToolActive() && cubicState.placed) {
    for (const {label, point} of getCanvasClickPointCandidates(event)) {
      const handle = getCubicHandleAt(point);
      if (handle !== null) return withDomPointerDragData(event, {
        tool: CUBIC_TOOL,
        handle,
        vertex: null,
        coordinateLabel: label,
        hitPoint: point,
        editorPoint: cubicState.handles[handle]
      });
    }
    return null;
  }

  if (isEllipseToolActive() && ellipseState.placed) {
    for (const {label, point} of getCanvasClickPointCandidates(event)) {
      const handle = getEllipseHandleAt(point);
      if (handle !== null) return withDomPointerDragData(event, {
        tool: ELLIPSE_TOOL,
        handle,
        vertex: null,
        coordinateLabel: label,
        hitPoint: point,
        editorPoint: ellipseState.handles[handle]
      });
    }
    return null;
  }

  if (!isRectangleToolActive() || !rectangleState.placed) return null;
  for (const {label, point} of getCanvasClickPointCandidates(event)) {
    const handle = getRectangleHandleAt(point);
    if (handle !== null) return withDomPointerDragData(event, {
      tool: RECTANGLE_TOOL,
      handle,
      vertex: null,
      coordinateLabel: label,
      hitPoint: point,
      editorPoint: rectangleState.handles[handle]
    });
    const vertex = getRectangleVertexAt(point);
    if (vertex) return withDomPointerDragData(event, {
      tool: RECTANGLE_TOOL,
      handle: null,
      vertex,
      coordinateLabel: label,
      hitPoint: point,
      editorPoint: vertex.point
    });
  }
  return null;
}

function withDomPointerDragData(event, hit) {
  const pointer = {
    label: hit.coordinateLabel,
    point: hit.hitPoint
  };
  if (!pointer.point || !hit.editorPoint) return null;

  return {
    ...hit,
    pointerCoordinateLabel: pointer.label,
    pointerOffset: {
      x: hit.editorPoint.x - pointer.point.x,
      y: hit.editorPoint.y - pointer.point.y
    },
    startPointerPoint: {x: pointer.point.x, y: pointer.point.y},
    startEditorPoint: {x: hit.editorPoint.x, y: hit.editorPoint.y}
  };
}

function getSnappedDomEditorPoint(event) {
  const point = getDomEditorDragPoint(event);
  if (!point || !canvas?.walls?._getWallEndpointCoordinates) return point ?? null;
  return getEventPoint(canvas.walls, point, event);
}

function getDomEditorDragPoint(event) {
  const candidates = getCanvasClickPointCandidates(event);
  const pointerPoint = candidates.find(({label}) => label === editorDomDragState.coordinateLabel)?.point
    ?? candidates.find(({label}) => label === editorDomDragState.pointerCoordinateLabel)?.point
    ?? candidates[0]?.point;
  if (!pointerPoint) return null;

  const startPointer = editorDomDragState.startPointerPoint;
  const startEditor = editorDomDragState.startEditorPoint;
  if (startPointer && startEditor) {
    return {
      x: startEditor.x + (pointerPoint.x - startPointer.x),
      y: startEditor.y + (pointerPoint.y - startPointer.y)
    };
  }

  const offset = editorDomDragState.pointerOffset ?? {x: 0, y: 0};
  return {
    x: pointerPoint.x + offset.x,
    y: pointerPoint.y + offset.y
  };
}

function isCanvasDomEvent(event) {
  const view = canvas?.app?.view;
  return !!view && (event.target === view || (event.composedPath?.() ?? []).includes(view));
}

function isAnyEditorToolActive() {
  return isCubicToolActive() || isEllipseToolActive() || isRectangleToolActive();
}

function registerEditorDragFallback() {
  window.addEventListener("pointerup", (event) => {
    scheduleEditorDragFallback(event, false);
  }, {capture: false});
  window.addEventListener("pointercancel", (event) => {
    scheduleEditorDragFallback(event, true);
  }, {capture: false});
}

function scheduleEditorDragFallback(event, cancelled) {
  if (!hasActiveEditorDrag()) return;

  setTimeout(() => {
    if (!hasActiveEditorDrag()) return;
    debugInteractionManagers(cancelled ? "fallback cancelling active editor drag" : "fallback committing active editor drag", event, {
      activeTool: game.activeTool,
      cubicDraggingHandle: cubicState.draggingHandle,
      ellipseDraggingHandle: ellipseState.draggingHandle,
      rectangleDraggingHandle: rectangleState.draggingHandle,
      rectangleDraggingVertex: rectangleState.draggingVertex
    });
    finalizeActiveEditorDrag(event, cancelled);
  }, 0);
}

function hasActiveEditorDrag() {
  return cubicState.draggingHandle !== null
    || ellipseState.draggingHandle !== null
    || rectangleState.draggingHandle !== null
    || !!rectangleState.draggingVertex;
}

function finalizeActiveEditorDrag(event=null, cancelled=false) {
  if (isEllipseToolActive() && ellipseState.draggingHandle !== null) {
    ellipseState.draggingHandle = null;
    ellipseState.initializing = false;
    ellipseState.initialOrigin = null;
    if (cancelled) cancelEditorOperation(ellipseState);
    else commitEditorOperation(ellipseState);
    drawEllipsePreview();
  } else if (isRectangleToolActive() && (rectangleState.draggingHandle !== null || rectangleState.draggingVertex)) {
    rectangleState.draggingHandle = null;
    rectangleState.draggingVertex = null;
    rectangleState.hoveredVertex = null;
    rectangleState.initializing = false;
    if (cancelled) cancelEditorOperation(rectangleState);
    else commitEditorOperation(rectangleState);
    drawRectanglePreview();
  } else if (isCubicToolActive() && cubicState.draggingHandle !== null) {
    cubicState.draggingHandle = null;
    cubicState.initializing = false;
    if (cancelled) cancelEditorOperation(cubicState);
    else commitEditorOperation(cubicState);
    drawCubicPreview();
  }

  scheduleCanvasInteractionReset(event);
}

function debugShapeSelection(message, data=null) {
  try {
    if (!game?.settings?.get(MODULE_ID, DEBUG_SETTING)) return;
  } catch (_error) {
    return;
  }

  if (data === null || data === undefined) {
    console.debug(`${MODULE_ID} | ${message}`);
    return;
  }
  console.debug(`${MODULE_ID} | ${message}`, data);
}

function registerControlKeyTracking() {
  window.addEventListener("keydown", (event) => {
    if (!isControlKeyEvent(event)) return;
    if (!controlKeyState.down) debugShapeSelection("control key down", {key: event.key, code: event.code});
    controlKeyState.down = true;
  }, {capture: true});

  window.addEventListener("keyup", (event) => {
    if (!isControlKeyEvent(event)) return;
    controlKeyState.down = false;
    debugShapeSelection("control key up", {key: event.key, code: event.code});
  }, {capture: true});

  window.addEventListener("blur", () => {
    if (!controlKeyState.down) return;
    controlKeyState.down = false;
    debugShapeSelection("control key cleared on blur");
  });
}

function isControlKeyEvent(event) {
  return event?.key === "Control" || event?.code === "ControlLeft" || event?.code === "ControlRight";
}

function isControlKeyDown() {
  const downKeys = game?.keyboard?.downKeys;
  return !!(controlKeyState.down
    || downKeys?.has?.("Control")
    || downKeys?.has?.("ControlLeft")
    || downKeys?.has?.("ControlRight"));
}

function isControlInteraction(event) {
  return !!(event?.ctrlKey
    || event.data?.originalEvent?.ctrlKey
    || event.originalEvent?.ctrlKey
    || isControlKeyDown());
}

function isAltInteraction(event) {
  return !!(event?.altKey
    || event.data?.originalEvent?.altKey
    || event.originalEvent?.altKey);
}

function loadShapeAtInteractionPoint(event) {
  const point = getInteractionPoint(event) ?? event.interactionData?.origin;
  debugShapeSelection("layer shortcut point", {
    point,
    origin: event.interactionData?.origin,
    ctrl: isControlInteraction(event)
  });
  if (!point) return false;

  return loadShapeAtPoint(point, "layer shortcut");
}

function loadShapeAtPoint(point, source="unknown") {
  const scan = getIndyWallAtPoint(point, source);
  const wall = scan?.wall ?? null;
  const loaded = wall ? loadShapeFromExistingWall(wall) : false;
  debugShapeSelection("loadShapeAtPoint result", {
    source,
    point,
    wallId: wall?.document?.id ?? wall?.id,
    loaded
  });
  return loaded;
}

function getIndyWallAtPoint(point, source="unknown") {
  const tolerance = getScaledRadius(Math.max(getPreviewStyle().wallWidth + 8, 12));
  let best = null;
  let bestDistance = Infinity;
  let total = 0;
  let flagged = 0;
  let invalidCoords = 0;
  let outsideBounds = 0;
  let nearestFlagged = null;
  let nearestInBounds = null;

  for (const wall of canvas?.walls?.placeables ?? []) {
    total += 1;
    if (!hasIndyShapeFlag(wall.document)) continue;
    flagged += 1;
    const coords = wall.document.c;
    if (!Array.isArray(coords) || coords.length < 4) {
      invalidCoords += 1;
      continue;
    }
    const start = {x: Number(coords[0]) || 0, y: Number(coords[1]) || 0};
    const end = {x: Number(coords[2]) || 0, y: Number(coords[3]) || 0};
    const distance = getPointSegmentDistance(
      point,
      start,
      end
    );
    if (!nearestFlagged || distance < nearestFlagged.distance) {
      nearestFlagged = {
        wallId: wall.document?.id ?? wall.id,
        distance,
        coords
      };
    }
    if (!isPointNearSegmentBounds(point, start, end, tolerance)) {
      outsideBounds += 1;
      continue;
    }

    if (!nearestInBounds || distance < nearestInBounds.distance) {
      nearestInBounds = {
        wallId: wall.document?.id ?? wall.id,
        distance,
        coords
      };
    }
    if (distance <= tolerance && distance < bestDistance) {
      best = wall;
      bestDistance = distance;
    }
  }

  debugShapeSelection("getIndyWallAtPoint scan", {
    source,
    point,
    tolerance,
    total,
    flagged,
    invalidCoords,
    outsideBounds,
    bestWallId: best?.document?.id ?? best?.id,
    bestDistance: Number.isFinite(bestDistance) ? bestDistance : null,
    nearestFlagged,
    nearestInBounds
  });
  return {wall: best, nearestFlagged, nearestInBounds};
}

function isPointNearSegmentBounds(point, start, end, tolerance) {
  return point.x >= Math.min(start.x, end.x) - tolerance
    && point.x <= Math.max(start.x, end.x) + tolerance
    && point.y >= Math.min(start.y, end.y) - tolerance
    && point.y <= Math.max(start.y, end.y) + tolerance;
}

function hasIndyShapeFlag(wallDocument) {
  return !!(wallDocument?.getFlag(MODULE_ID, CUBIC_FLAG)
    || wallDocument?.getFlag(MODULE_ID, ELLIPSE_FLAG)
    || wallDocument?.getFlag(MODULE_ID, RECTANGLE_FLAG));
}

function getPointSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = (dx * dx) + (dy * dy);
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);

  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

function loadShapeFromExistingWall(wall) {
  if (!wall?.document) {
    debugShapeSelection("loadShapeFromExistingWall skipped: no document", {wallId: wall?.id});
    return false;
  }

  const cubicData = wall.document.getFlag(MODULE_ID, CUBIC_FLAG);
  const ellipseData = wall.document.getFlag(MODULE_ID, ELLIPSE_FLAG);
  const rectangleData = wall.document.getFlag(MODULE_ID, RECTANGLE_FLAG);
  debugShapeSelection("loadShapeFromExistingWall flags", {
    wallId: wall.document.id,
    hasCubic: !!cubicData,
    hasEllipse: !!ellipseData,
    hasRectangle: !!rectangleData
  });
  if (!cubicData && !ellipseData && !rectangleData) return false;

  clearCubicPreview();
  clearEllipsePreview();
  clearRectanglePreview();

  shapeLoadState.allowControlWallLoad = true;
  try {
    if (rectangleData) loadRectangleFromWall(wall);
    else if (ellipseData) loadEllipseFromWall(wall);
    else loadCubicCurveFromWall(wall);
  } finally {
    shapeLoadState.allowControlWallLoad = false;
  }
  return true;
}

function hideEditSessionWalls(wallIds) {
  restoreEditSessionWalls();
  for (const id of wallIds) {
    const wall = getWallPlaceable(id);
    if (!wall) continue;

    wall.release?.();
    hiddenEditWalls.set(id, {
      visible: wall.visible !== false,
      interactive: wall.interactive,
      eventMode: wall.eventMode
    });
    wall.renderFlags?.set?.({refresh: true});
    wall.refresh?.();
    applyHiddenEditWallState(wall);
  }
}

function restoreEditSessionWalls() {
  for (const [id, state] of hiddenEditWalls) {
    const wall = getWallPlaceable(id);
    if (!wall) continue;
    wall.renderFlags?.set?.({refresh: true});
    wall.refresh?.();
    wall.visible = state.visible;
    wall.interactive = state.interactive;
    if ("eventMode" in wall) wall.eventMode = state.eventMode;
  }
  hiddenEditWalls.clear();
}

function applyHiddenEditWallState(wall) {
  const id = wall?.document?.id ?? wall?.id;
  if (!id || !hiddenEditWalls.has(id)) return;

  wall.visible = false;
  wall.interactive = false;
  if ("eventMode" in wall) wall.eventMode = "none";
}

function getWallPlaceable(id) {
  return canvas?.walls?.placeables?.find((wall) => wall.document?.id === id || wall.id === id) ?? null;
}

function consumeCanvasInteraction(event) {
  event.stopImmediatePropagation?.();
  event.stopPropagation?.();
  event.preventDefault?.();
  event.data?.originalEvent?.stopImmediatePropagation?.();
  event.data?.originalEvent?.stopPropagation?.();
  event.data?.originalEvent?.preventDefault?.();
  event.originalEvent?.stopImmediatePropagation?.();
  event.originalEvent?.stopPropagation?.();
  event.originalEvent?.preventDefault?.();
  if (event.interactionData) event.interactionData.clearPreviewContainer = false;
}

function resetCanvasCursor(event=null) {
  clearMouseInteractionManagerDragState(event);
  if (canvas?.app?.view?.style) canvas.app.view.style.cursor = "";
  if (document.body?.style) document.body.style.cursor = "";
}

function scheduleCanvasInteractionReset(event=null) {
  debugInteractionManagers("schedule interaction reset start", event);
  resetCanvasCursor(event);
  debugInteractionManagers("after immediate interaction reset", event);
  globalThis.queueMicrotask?.(() => {
    resetCanvasCursor(event);
    debugInteractionManagers("after microtask interaction reset", event);
  });
  setTimeout(() => {
    resetCanvasCursor(event);
    debugInteractionManagers("after timeout 0 interaction reset", event);
  }, 0);
  setTimeout(() => {
    resetCanvasCursor(event);
    debugInteractionManagers("after timeout 50 interaction reset", event);
  }, 50);
}

function clearMouseInteractionManagerDragState(event=null) {
  for (const {manager} of getCanvasInteractionManagers(event)) {
    manager.cursor = null;
    manager._dragging = false;
    manager.dragging = false;
    const noneState = manager.constructor?.INTERACTION_STATES?.NONE;
    if (Number.isFinite(noneState)) manager.state = noneState;
  }
}

function debugInteractionManagers(message, event=null, extra={}) {
  try {
    if (!game?.settings?.get(MODULE_ID, DEBUG_SETTING)) return;
  } catch (_error) {
    return;
  }

  console.debug(`${MODULE_ID} | ${message}`, {
    ...extra,
    eventType: event?.type,
    eventButton: event?.button,
    interactionData: {
      clearPreviewContainer: event?.interactionData?.clearPreviewContainer,
      origin: event?.interactionData?.origin,
      destination: event?.interactionData?.destination,
      objectId: event?.interactionData?.object?.document?.id ?? event?.interactionData?.object?.id
    },
    managers: getCanvasInteractionManagers(event).map(({label, manager}) => ({
      label,
      state: manager.state,
      dragging: manager.dragging,
      _dragging: manager._dragging,
      cursor: manager.cursor,
      targetId: manager.object?.document?.id ?? manager.object?.id
    }))
  });
}

function getCanvasInteractionManagers(event=null) {
  const interactionObject = event?.interactionData?.object;
  const entries = [
    ["canvas", canvas?.mouseInteractionManager],
    ["walls", canvas?.walls?.mouseInteractionManager],
    ["walls._", canvas?.walls?._mouseInteractionManager],
    ["interactionObject", interactionObject?.mouseInteractionManager],
    ["interactionObject._", interactionObject?._mouseInteractionManager],
    ["event.target", event?.target?.mouseInteractionManager],
    ["event.target._", event?.target?._mouseInteractionManager],
    ["event.currentTarget", event?.currentTarget?.mouseInteractionManager],
    ["event.currentTarget._", event?.currentTarget?._mouseInteractionManager]
  ];

  for (const wall of canvas?.walls?.controlled ?? []) {
    entries.push([`controlled:${wall.document?.id ?? wall.id}`, wall?.mouseInteractionManager]);
    entries.push([`controlled:${wall.document?.id ?? wall.id}._`, wall?._mouseInteractionManager]);
  }
  for (const wall of canvas?.walls?.placeables ?? []) {
    if (!wall?.hover) continue;
    entries.push([`hover:${wall.document?.id ?? wall.id}`, wall?.mouseInteractionManager]);
    entries.push([`hover:${wall.document?.id ?? wall.id}._`, wall?._mouseInteractionManager]);
  }

  const seen = new Set();
  const managers = [];
  for (const [label, manager] of entries) {
    if (!manager || seen.has(manager)) continue;
    seen.add(manager);
    managers.push({label, manager});
  }
  return managers;
}

function getInteractionPoint(event) {
  const source = event.data ?? event;
  const point = source.getLocalPosition?.(canvas?.stage);
  if (point) return {x: point.x, y: point.y};

  const global = source.global ?? event.global;
  const transform = canvas?.stage?.worldTransform;
  const inverse = global && transform?.applyInverse?.(global);
  if (inverse) return {x: inverse.x, y: inverse.y};

  const clientPoint = getClientInteractionPoint(event);
  if (clientPoint) return clientPoint;

  const origin = event.interactionData?.origin;
  return origin ? {x: origin.x, y: origin.y} : null;
}

function getClientInteractionPoint(event) {
  return getClientInteractionPoints(event)[0]?.point ?? null;
}

function getClientInteractionPoints(event) {
  const original = event.data?.originalEvent ?? event.originalEvent ?? event;
  if (!Number.isFinite(original?.clientX) || !Number.isFinite(original?.clientY)) return [];

  const view = canvas?.app?.view;
  const rect = view?.getBoundingClientRect?.();
  const transform = canvas?.stage?.worldTransform;
  if (!view || !rect || !transform?.applyInverse) return [];

  const scaleX = view.width / Math.max(rect.width, 1);
  const scaleY = view.height / Math.max(rect.height, 1);
  const localX = original.clientX - rect.left;
  const localY = original.clientY - rect.top;
  const pixiPoint = getPixiMappedClientPoint(original);
  const candidates = [
    ...(pixiPoint ? [["pixi.mapPositionToPoint", pixiPoint]] : []),
    ["scaled", new PIXI.Point(localX * scaleX, localY * scaleY)],
    ["unscaled", new PIXI.Point(localX, localY)]
  ];
  const points = [];

  for (const [label, screenPoint] of candidates) {
    const worldPoint = transform.applyInverse(screenPoint);
    addUniqueInteractionPoint(points, label, {x: worldPoint.x, y: worldPoint.y});
  }

  return points;
}

function getPixiMappedClientPoint(original) {
  const renderer = canvas?.app?.renderer;
  const transform = canvas?.stage?.worldTransform;
  const mapped = new PIXI.Point();
  const mapper = renderer?.events?.mapPositionToPoint ?? renderer?.plugins?.interaction?.mapPositionToPoint;
  if (!mapper || !transform?.applyInverse) return null;

  try {
    mapper.call(renderer.events ?? renderer.plugins.interaction, mapped, original.clientX, original.clientY);
    return mapped;
  } catch (error) {
    debugShapeSelection("pixi mapPositionToPoint failed", {message: error?.message});
    return null;
  }
}

function addUniqueInteractionPoint(points, label, point) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
  const duplicate = points.some((candidate) =>
    Math.abs(candidate.point.x - point.x) < 0.01
    && Math.abs(candidate.point.y - point.y) < 0.01
  );
  if (!duplicate) points.push({label, point});
}

function registerCurveEditorShortcuts() {
  window.addEventListener("wheel", (event) => {
    if (!getActiveEditorState()?.placed || !event.ctrlKey) return;

    event.preventDefault();
    event.stopPropagation();
    changeActiveSegments(event.deltaY < 0 ? 1 : -1);
  }, {capture: true, passive: false});

  window.addEventListener("keydown", (event) => {
    if (!isAnyEditorToolActive() || isEditableTarget(event.target)) return;

    const key = event.key.toLowerCase();
    if (event.ctrlKey && !event.shiftKey && key === "z") {
      event.preventDefault();
      event.stopPropagation();
      undoActiveEditor();
      return;
    }

    if (event.ctrlKey && (key === "y" || (event.shiftKey && key === "z"))) {
      event.preventDefault();
      event.stopPropagation();
      redoActiveEditor();
      return;
    }

    if (!getActiveEditorState()?.placed) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      clearActivePreview();
      cubicState.active = false;
      ellipseState.active = false;
      rectangleState.active = false;
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

function isRectangleToolActive() {
  return game.user.isGM && game.activeTool === RECTANGLE_TOOL && rectangleState.active;
}

function getActiveEditorState() {
  if (isCubicToolActive()) return cubicState;
  if (isEllipseToolActive()) return ellipseState;
  if (isRectangleToolActive()) return rectangleState;
  return null;
}

function changeActiveSegments(delta) {
  const state = getActiveEditorState();
  const snapshot = state?.placed ? getEditorSnapshot(state) : null;

  if (isCubicToolActive()) changeCubicSegments(delta);
  else if (isEllipseToolActive()) changeEllipseSegments(delta);
  else if (isRectangleToolActive()) changeRectangleSegments(delta);

  if (snapshot) pushEditorUndoSnapshot(state, snapshot);
}

function applyActiveWalls() {
  if (isCubicToolActive()) applyCubicWalls();
  else if (isEllipseToolActive()) applyEllipseWalls();
  else if (isRectangleToolActive()) applyRectangleWalls();
}

function clearActivePreview() {
  if (isCubicToolActive()) clearCubicPreview();
  else if (isEllipseToolActive()) clearEllipsePreview();
  else if (isRectangleToolActive()) clearRectanglePreview();
}

function beginEditorOperation(state=getActiveEditorState(), includeUnplaced=false) {
  if (!state || (!state.placed && !includeUnplaced) || state.pendingUndoSnapshot) return;
  state.pendingUndoSnapshot = getEditorSnapshot(state);
}

function commitEditorOperation(state=getActiveEditorState()) {
  if (!state?.pendingUndoSnapshot) return;

  const before = state.pendingUndoSnapshot;
  state.pendingUndoSnapshot = null;
  const after = getEditorSnapshot(state);
  if (snapshotsEqual(before, after)) return;

  state.undoStack.push(before);
  state.redoStack = [];
  updateEditButtonStates();
}

function cancelEditorOperation(state=getActiveEditorState()) {
  if (state) state.pendingUndoSnapshot = null;
}

function clearEditorHistory(state) {
  if (!state) return;
  state.undoStack = [];
  state.redoStack = [];
  state.pendingUndoSnapshot = null;
  updateEditButtonStates();
}

function undoActiveEditor() {
  const state = getActiveEditorState();
  if (!state?.undoStack.length) return;

  const current = getEditorSnapshot(state);
  const previous = state.undoStack.pop();
  state.redoStack.push(current);
  restoreEditorSnapshot(state, previous);
  updateEditButtonStates();
}

function redoActiveEditor() {
  const state = getActiveEditorState();
  if (!state?.redoStack.length) return;

  const current = getEditorSnapshot(state);
  const next = state.redoStack.pop();
  state.undoStack.push(current);
  restoreEditorSnapshot(state, next);
  updateEditButtonStates();
}

function pushEditorUndoSnapshot(state, snapshot) {
  if (!state || !snapshot || snapshotsEqual(snapshot, getEditorSnapshot(state))) return;
  state.undoStack.push(snapshot);
  state.redoStack = [];
  updateEditButtonStates();
}

function updateEditButtonStates() {
  const state = getActiveEditorState();
  const canUndo = !!state?.undoStack.length;
  const canRedo = !!state?.redoStack.length;
  for (const id of [CUBIC_EDIT_BUTTONS_ID, ELLIPSE_EDIT_BUTTONS_ID, RECTANGLE_EDIT_BUTTONS_ID]) {
    const controls = document.getElementById(id);
    if (!controls) continue;
    setEditButtonDisabled(controls, "indy-walls.Controls.UndoEdit", !canUndo);
    setEditButtonDisabled(controls, "indy-walls.Controls.RedoEdit", !canRedo);
  }
}

function setEditButtonDisabled(controls, titleKey, disabled) {
  const title = game.i18n.localize(titleKey);
  const button = Array.from(controls.querySelectorAll("button")).find((candidate) => candidate.title === title);
  if (button) button.disabled = disabled;
}

function getEditorSnapshot(state) {
  if (state === cubicState) {
    return {
      placed: cubicState.placed,
      handles: clonePoints(cubicState.handles),
      segments: cubicState.segments,
      wallTypeTool: cubicState.wallTypeTool
    };
  }

  if (state === ellipseState) {
    return {
      placed: ellipseState.placed,
      handles: clonePoints(ellipseState.handles),
      segments: ellipseState.segments,
      wallTypeTool: ellipseState.wallTypeTool
    };
  }

  return {
    placed: rectangleState.placed,
    handles: clonePoints(rectangleState.handles),
    sideSegments: {...rectangleState.sideSegments},
    sideRatios: cloneRectangleSideRatios(rectangleState.sideRatios),
    sideEnabled: cloneRectangleSideEnabled(rectangleState.sideEnabled),
    sideGaps: cloneRectangleSideGaps(rectangleState.sideGaps),
    wallTypeTool: rectangleState.wallTypeTool
  };
}

function restoreEditorSnapshot(state, snapshot) {
  if (state === cubicState) {
    cubicState.placed = snapshot.placed;
    cubicState.handles = clonePoints(snapshot.handles);
    cubicState.segments = snapshot.segments;
    cubicState.wallTypeTool = snapshot.wallTypeTool;
    cubicState.draggingHandle = null;
    cubicState.initializing = false;
    drawCubicPreview();
    return;
  }

  if (state === ellipseState) {
    ellipseState.placed = snapshot.placed;
    ellipseState.handles = clonePoints(snapshot.handles);
    ellipseState.segments = snapshot.segments;
    ellipseState.wallTypeTool = snapshot.wallTypeTool;
    ellipseState.draggingHandle = null;
    ellipseState.initializing = false;
    ellipseState.initialOrigin = null;
    drawEllipsePreview();
    return;
  }

  rectangleState.placed = snapshot.placed;
  rectangleState.handles = clonePoints(snapshot.handles);
  rectangleState.sideSegments = {...snapshot.sideSegments};
  rectangleState.sideRatios = cloneRectangleSideRatios(snapshot.sideRatios);
  rectangleState.sideEnabled = cloneRectangleSideEnabled(snapshot.sideEnabled);
  rectangleState.sideGaps = cloneRectangleSideGaps(snapshot.sideGaps);
  rectangleState.wallTypeTool = snapshot.wallTypeTool;
  rectangleState.draggingHandle = null;
  rectangleState.draggingVertex = null;
  rectangleState.hoveredVertex = null;
  rectangleState.initializing = false;
  drawRectanglePreview();
}

function snapshotsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function redrawActivePreview() {
  if (cubicState.placed) drawCubicPreview();
  if (ellipseState.placed) drawEllipsePreview();
  if (rectangleState.placed) drawRectanglePreview();
}

function getPreviewStyle() {
  const outlineWidth = getStyleNumber(STYLE_SETTINGS.outlineWidth, 2, 0, 8);
  const outlineColor = getStyleColor(STYLE_SETTINGS.outlineColor, 0x111111);
  return {
    wallColor: getStyleColor(STYLE_SETTINGS.wallColor, 0xc10e56),
    wallWidth: getStyleNumber(STYLE_SETTINGS.wallWidth, 4, 1, 12),
    guideWidth: Math.max(getStyleNumber(STYLE_SETTINGS.wallWidth, 4, 1, 12) / 2, 1),
    vertexColor: getStyleColor(STYLE_SETTINGS.vertexColor, 0xffffff),
    vertexActiveColor: getStyleColor(STYLE_SETTINGS.vertexActiveColor, 0xaaff44),
    vertexSize: getStyleNumber(STYLE_SETTINGS.vertexSize, 5, 2, 20),
    splitVertexSize: Math.max(getStyleNumber(STYLE_SETTINGS.vertexSize, 5, 2, 20) + 3, 4),
    endpointColor: getStyleColor(STYLE_SETTINGS.endpointColor, 0xff4444),
    endpointSize: getStyleNumber(STYLE_SETTINGS.endpointSize, 12, 4, 32),
    handleColor: getStyleColor(STYLE_SETTINGS.handleColor, 0xaaff44),
    handleSize: getStyleNumber(STYLE_SETTINGS.handleSize, 12, 4, 32),
    outlineColor,
    outlineWidth
  };
}

function getStyleNumber(setting, fallback, min, max) {
  const value = Number(game.settings.get(MODULE_ID, setting));
  if (!Number.isFinite(value)) return fallback;
  return clamp(value, min, max);
}

function getStyleColor(setting, fallback) {
  return colorStringToNumber(game.settings.get(MODULE_ID, setting), fallback);
}

function colorStringToNumber(value, fallback) {
  if (typeof value !== "string") return fallback;
  const match = value.trim().match(/^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/i);
  return match ? parseInt(match[1], 16) : fallback;
}

function drawPreviewVertex(graphics, point, style=getPreviewStyle()) {
  drawVertex(graphics, point, {
    color: style.vertexColor,
    radius: style.vertexSize,
    outlineColor: style.outlineColor,
    outlineWidth: style.outlineWidth
  });
}

function drawEndpoint(graphics, point, style=getPreviewStyle()) {
  drawHandle(graphics, point, style.endpointColor, {
    radius: style.endpointSize,
    outlineColor: style.outlineColor,
    outlineWidth: style.outlineWidth
  });
}

function drawBezierHandle(graphics, point, style=getPreviewStyle()) {
  drawHandle(graphics, point, style.handleColor, {
    radius: style.handleSize,
    outlineColor: style.outlineColor,
    outlineWidth: style.outlineWidth
  });
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
  const style = getPreviewStyle();
  const radius = Math.max(style.endpointSize, style.handleSize);
  const index = getHandleIndexAt(cubicState.handles, point, radius, style.outlineWidth);
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

  const style = getPreviewStyle();
  const points = getCubicPoints(cubicState.segments);
  graphics.lineStyle(getScaledRadius(style.wallWidth), style.wallColor, 0.9);
  graphics.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    graphics.lineTo(points[i].x, points[i].y);
  }

  const [start, controlA, controlB, end] = cubicState.handles;
  graphics.lineStyle(getScaledRadius(style.guideWidth), style.wallColor, 0.65);
  graphics.moveTo(start.x, start.y);
  graphics.lineTo(controlA.x, controlA.y);
  graphics.moveTo(end.x, end.y);
  graphics.lineTo(controlB.x, controlB.y);

  for (const point of points) {
    drawPreviewVertex(graphics, point, style);
  }
  drawEndpoint(graphics, start, style);
  drawEndpoint(graphics, end, style);
  drawBezierHandle(graphics, controlA, style);
  drawBezierHandle(graphics, controlB, style);
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
  const style = getPreviewStyle();
  const index = getHandleIndexAt(ellipseState.handles, point, style.endpointSize, style.outlineWidth);
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

  const style = getPreviewStyle();
  const points = getEllipsePoints(ellipseState.segments);
  graphics.lineStyle(getScaledRadius(style.wallWidth), style.wallColor, 0.9);
  graphics.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    graphics.lineTo(points[i].x, points[i].y);
  }

  const [a, b] = ellipseState.handles;
  graphics.lineStyle(getScaledRadius(style.guideWidth), style.wallColor, 0.45);
  graphics.drawRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));

  for (const point of points) {
    drawPreviewVertex(graphics, point, style);
  }
  drawEndpoint(graphics, a, style);
  drawEndpoint(graphics, b, style);
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

function setRectangleHandle(index, point) {
  rectangleState.handles[index] = {x: point.x, y: point.y};
}

function getRectangleHandleAt(point) {
  if (!rectangleState.placed) return null;
  const style = getPreviewStyle();
  const radius = getRectangleCornerHitRadius(style);
  let bestIndex = null;
  let bestDistance = Infinity;
  for (let i = 0; i < rectangleState.handles.length; i++) {
    const handle = rectangleState.handles[i];
    const distance = Math.hypot(handle.x - point.x, handle.y - point.y);
    if (distance <= radius && distance < bestDistance) {
      bestIndex = i;
      bestDistance = distance;
    }
  }
  return bestIndex;
}

function getRectangleVertexAt(point) {
  if (!rectangleState.placed) return null;
  const radius = getRectangleVertexHitRadius();
  const vertices = getRectangleSideVertices();
  for (const vertex of vertices) {
    if (Math.hypot(vertex.point.x - point.x, vertex.point.y - point.y) <= radius) {
      return {side: vertex.side, index: vertex.index, point: vertex.point};
    }
  }
  return null;
}

function updateRectangleHoveredVertex(point) {
  const hovered = point ? getRectangleVertexAt(point) : null;
  if (sameRectangleVertex(hovered, rectangleState.hoveredVertex)) return;

  rectangleState.hoveredVertex = hovered;
  drawRectanglePreview();
}

function setRectangleVertex(vertex, point) {
  const ratios = getRectangleSideRatios(vertex.side);
  const ratio = getRectangleRatioForPoint(vertex.side, point);
  const previous = vertex.index > 0 ? ratios[vertex.index - 1] : 0;
  const next = vertex.index < ratios.length - 1 ? ratios[vertex.index + 1] : 1;
  const spacing = getRectangleRatioSpacing(rectangleState.sideSegments[vertex.side]);
  if ((next - previous) <= (spacing * 2)) return;
  ratios[vertex.index] = clamp(ratio, previous + spacing, next - spacing);
  rectangleState.sideRatios[vertex.side] = ratios;
}

function changeRectangleSegments(delta, side=null) {
  if (!isRectangleToolActive()) return;
  const sides = side ? [side] : ["top", "right", "bottom", "left"];
  for (const key of sides) {
    rectangleState.sideSegments[key] = clamp(rectangleState.sideSegments[key] + delta, 1, 64);
    rectangleState.sideRatios[key] = reconcileRectangleSideRatios(
      rectangleState.sideRatios[key],
      rectangleState.sideSegments[key]
    );
  }
  drawRectanglePreview();
}

function editRectangleSideAt(point, remove=false) {
  if (!rectangleState.placed) return false;
  if (isNearRectangleCorner(point)) return false;

  const hit = getRectangleSideAt(point);
  if (!hit) return false;

  if (remove) return removeRectangleVertexAt(hit);
  return addRectangleVertexAt(hit);
}

function editRectangleSideWithUndo(point, remove=false) {
  const snapshot = getEditorSnapshot(rectangleState);
  const edited = editRectangleSideAt(point, remove);
  if (edited) pushEditorUndoSnapshot(rectangleState, snapshot);
  return edited;
}

function addRectangleVertexAt({side, ratio}) {
  if (!rectangleState.sideEnabled[side]) {
    rectangleState.sideEnabled[side] = true;
    rectangleState.sideSegments[side] = DEFAULT_RECTANGLE_SEGMENTS;
    rectangleState.sideRatios[side] = [];
    rectangleState.sideGaps[side] = [];
    drawRectanglePreview();
    return true;
  }

  if (restoreRectangleSegmentAt({side, ratio})) return true;

  if (rectangleState.sideSegments[side] >= 64) return false;

  const ratios = getRectangleSideRatios(side);
  const spacing = getRectangleRatioSpacing(rectangleState.sideSegments[side] + 1);
  if (ratio < spacing || ratio > (1 - spacing)) return false;
  if (ratios.some((existing) => Math.abs(existing - ratio) < spacing)) return false;

  rectangleState.sideSegments[side] += 1;
  rectangleState.sideRatios[side] = reconcileRectangleSideRatios([...ratios, ratio], rectangleState.sideSegments[side]);
  rectangleState.sideGaps[side] = reconcileRectangleSideGaps(rectangleState.sideGaps[side], rectangleState.sideSegments[side]);
  drawRectanglePreview();
  return true;
}

function removeRectangleVertexAt({side, ratio}) {
  const ratios = getRectangleSideRatios(side);
  if (!ratios.length) return disableRectangleSide(side);

  const vertex = getNearestRectangleVertexOnSide(side, ratio);
  const spacing = getRectangleRatioSpacing(rectangleState.sideSegments[side]);
  if (vertex && Math.abs(vertex.ratio - ratio) <= (spacing * 2)) {
    return removeRectangleVertex({side, index: vertex.index});
  }

  return removeRectangleSegmentAt({side, ratio});
}

function getNearestRectangleVertexOnSide(side, ratio) {
  const ratios = getRectangleSideRatios(side);
  let nearestIndex = 0;
  let nearestDistance = Math.abs(ratios[0] - ratio);
  for (let i = 1; i < ratios.length; i++) {
    const distance = Math.abs(ratios[i] - ratio);
    if (distance < nearestDistance) {
      nearestIndex = i;
      nearestDistance = distance;
    }
  }

  return {index: nearestIndex, ratio: ratios[nearestIndex]};
}

function removeRectangleSegmentAt({side, ratio}) {
  const index = getRectangleSegmentIndexAt(side, ratio);
  const gaps = getRectangleSideGaps(side);
  if (gaps.includes(index)) return false;

  rectangleState.sideGaps[side] = [...gaps, index].sort((a, b) => a - b);
  drawRectanglePreview();
  return true;
}

function restoreRectangleSegmentAt({side, ratio}) {
  const index = getRectangleSegmentIndexAt(side, ratio);
  const gaps = getRectangleSideGaps(side);
  if (!gaps.includes(index)) return false;

  rectangleState.sideGaps[side] = gaps.filter((gap) => gap !== index);
  drawRectanglePreview();
  return true;
}

function getRectangleSegmentIndexAt(side, ratio) {
  const ratios = getRectangleSideRatios(side);
  const points = [0, ...ratios, 1];
  for (let i = 0; i < points.length - 1; i++) {
    if (ratio >= points[i] && ratio <= points[i + 1]) return i;
  }
  return Math.max(rectangleState.sideSegments[side] - 1, 0);
}

function getRectangleSideGaps(side) {
  const gaps = reconcileRectangleSideGaps(rectangleState.sideGaps?.[side], rectangleState.sideSegments[side]);
  rectangleState.sideGaps[side] = gaps;
  return gaps;
}

function removeRectangleVertex({side, index}) {
  const ratios = getRectangleSideRatios(side);
  if (ratios[index] === undefined) return false;

  ratios.splice(index, 1);
  rectangleState.sideSegments[side] -= 1;
  rectangleState.sideRatios[side] = reconcileRectangleSideRatios(ratios, rectangleState.sideSegments[side]);
  rectangleState.sideGaps[side] = reconcileRectangleSideGaps(rectangleState.sideGaps[side], rectangleState.sideSegments[side]);
  rectangleState.hoveredVertex = null;
  drawRectanglePreview();
  return true;
}

function disableRectangleSide(side) {
  if (!rectangleState.sideEnabled[side]) return false;

  rectangleState.sideEnabled[side] = false;
  rectangleState.sideSegments[side] = DEFAULT_RECTANGLE_SEGMENTS;
  rectangleState.sideRatios[side] = [];
  rectangleState.sideGaps[side] = [];
  rectangleState.hoveredVertex = null;
  drawRectanglePreview();
  return true;
}

function getRectangleSideAt(point) {
  const bounds = getRectangleBounds();
  const style = getPreviewStyle();
  const tolerance = getScaledRadius(Math.max(style.wallWidth + 6, 10));
  const hits = [
    {
      side: "top",
      distance: Math.abs(point.y - bounds.minY),
      ratio: getBoundedRatio(point.x, bounds.minX, bounds.maxX),
      inRange: isBetween(point.x, bounds.minX, bounds.maxX)
    },
    {
      side: "right",
      distance: Math.abs(point.x - bounds.maxX),
      ratio: getBoundedRatio(point.y, bounds.minY, bounds.maxY),
      inRange: isBetween(point.y, bounds.minY, bounds.maxY)
    },
    {
      side: "bottom",
      distance: Math.abs(point.y - bounds.maxY),
      ratio: getBoundedRatio(point.x, bounds.maxX, bounds.minX),
      inRange: isBetween(point.x, bounds.minX, bounds.maxX)
    },
    {
      side: "left",
      distance: Math.abs(point.x - bounds.minX),
      ratio: getBoundedRatio(point.y, bounds.maxY, bounds.minY),
      inRange: isBetween(point.y, bounds.minY, bounds.maxY)
    }
  ].filter((hit) => hit.inRange && hit.distance <= tolerance);

  hits.sort((a, b) => a.distance - b.distance);
  const hit = hits[0];
  return hit ? {side: hit.side, ratio: hit.ratio} : null;
}

function isBetween(value, a, b) {
  return value >= Math.min(a, b) && value <= Math.max(a, b);
}

function drawRectanglePreview() {
  const layer = canvas?.walls;
  if (!layer) return;

  if (!rectangleState.graphics || rectangleState.graphics._destroyed) {
    rectangleState.graphics = new PIXI.Graphics();
    layer.preview.addChild(rectangleState.graphics);
    configureRectanglePreviewInteraction(rectangleState.graphics);
  } else if (!rectangleState.graphics.parent) {
    layer.preview.addChild(rectangleState.graphics);
    configureRectanglePreviewInteraction(rectangleState.graphics);
  }

  const graphics = rectangleState.graphics;
  graphics.clear();
  setRectangleEditingState(rectangleState.placed);
  if (!rectangleState.placed) return;

  const style = getPreviewStyle();
  const segments = getRectangleSegments();
  drawRectangleInteractionHits(graphics, style);
  graphics.lineStyle(getScaledRadius(style.wallWidth), style.wallColor, 0.9);
  for (const {a, b} of segments) {
    graphics.moveTo(a.x, a.y);
    graphics.lineTo(b.x, b.y);
  }

  const [a, b] = rectangleState.handles;
  const bounds = getRectangleBounds();
  drawRectangleBoundsGuide(graphics, bounds, style);

  for (const {a: start} of segments) {
    drawPreviewVertex(graphics, start, style);
  }
  drawPreviewVertex(graphics, segments.at(-1)?.b ?? a, style);
  for (const vertex of getRectangleSideVertices()) {
    drawRectangleSplitVertex(graphics, vertex, style);
  }
  drawEndpoint(graphics, a, style);
  drawEndpoint(graphics, b, style);
}

function configureRectanglePreviewInteraction(graphics) {
  if (graphics._indyWallsRectangleInteraction) return;

  graphics.eventMode = "static";
  graphics.cursor = "pointer";
  graphics.on("pointerdown", handleRectanglePreviewPointerGate);
  graphics.on("pointerup", handleRectanglePreviewPointerGate);
  graphics.on("pointertap", handleRectanglePreviewPointerTap);
  graphics._indyWallsRectangleInteraction = true;
}

function drawRectangleInteractionHits(graphics, style) {
  const width = getScaledRadius(Math.max(style.wallWidth + 18, 24));
  graphics.lineStyle(width, 0xffffff, 0.001);
  for (const [, start, end] of getRectangleBoundsSides(getRectangleBounds())) {
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(end.x, end.y);
  }
}

function handleRectanglePreviewPointerTap(event) {
  const point = getRectanglePreviewSideInteractionPoint(event);
  if (!point) return;

  debugInteractionManagers("rectangle preview pointertap side edit", event, {
    point,
    remove: isAltInteraction(event)
  });
  if (!editRectangleSideWithUndo(point, isAltInteraction(event))) return;

  event.stopPropagation?.();
  event.preventDefault?.();
  rectangleState.draggingHandle = null;
  rectangleState.draggingVertex = null;
  rectangleState.lastSideEditAction = Date.now();
  rectangleState.suppressNextSideEditClick = false;
  scheduleCanvasInteractionReset(event);
}

function handleRectanglePreviewPointerGate(event) {
  const point = getRectanglePreviewSideInteractionPoint(event);
  if (!point) return;

  debugInteractionManagers("rectangle preview pointer gate", event, {point});
  event.stopPropagation?.();
  event.preventDefault?.();
}

function getRectanglePreviewSideInteractionPoint(event) {
  if (!isRectangleToolActive() || !rectangleState.placed || isControlInteraction(event)) return null;
  const point = getInteractionPoint(event);
  if (!point || !getRectangleSideAt(point)) return null;
  return point;
}

function drawRectangleBoundsGuide(graphics, bounds, style) {
  for (const [side, start, end] of getRectangleBoundsSides(bounds)) {
    if (!rectangleState.sideEnabled[side]) {
      graphics.lineStyle(getScaledRadius(Math.max(style.guideWidth, 1)), style.outlineColor, 0.22);
      graphics.moveTo(start.x, start.y);
      graphics.lineTo(end.x, end.y);
      continue;
    }

    const gaps = getRectangleSideGaps(side);
    for (const segment of getAllSideSegments(side, start, end)) {
      const missing = gaps.includes(segment.index);
      graphics.lineStyle(
        getScaledRadius(missing ? Math.max(style.guideWidth, 1) : style.guideWidth),
        missing ? style.outlineColor : style.wallColor,
        missing ? 0.22 : 0.45
      );
      graphics.moveTo(segment.a.x, segment.a.y);
      graphics.lineTo(segment.b.x, segment.b.y);
    }
  }
}

function getRectangleVertexHitRadius() {
  const style = getPreviewStyle();
  return getScaledRadius(style.splitVertexSize + style.outlineWidth + 8);
}

function getRectangleCornerHitRadius(style=getPreviewStyle()) {
  return getScaledRadius(Math.max(style.endpointSize + style.outlineWidth + 8, style.wallWidth + 16));
}

function isNearRectangleCorner(point) {
  if (!rectangleState.placed) return false;
  const radius = getRectangleCornerHitRadius();
  return rectangleState.handles.some((handle) => {
    return Math.hypot(handle.x - point.x, handle.y - point.y) <= radius;
  });
}

function drawRectangleSplitVertex(graphics, vertex, style) {
  const radius = getScaledRadius(style.splitVertexSize);
  const highlighted = isHighlightedRectangleVertex(vertex);
  graphics.beginFill(highlighted ? style.vertexActiveColor : style.vertexColor, 0.98);
  graphics.lineStyle(
    getScaledRadius(style.outlineWidth),
    highlighted ? style.outlineColor : style.wallColor,
    0.95
  );
  const {point} = vertex;
  graphics.drawCircle(point.x, point.y, radius);
  graphics.endFill();
}

function isHighlightedRectangleVertex(vertex) {
  return sameRectangleVertex(rectangleState.draggingVertex, vertex)
    || sameRectangleVertex(rectangleState.hoveredVertex, vertex);
}

function sameRectangleVertex(a, b) {
  return !!a && !!b && a.side === b.side && a.index === b.index;
}

function getRectangleBounds() {
  const [a, b] = rectangleState.handles;
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x, b.x);
  const maxY = Math.max(a.y, b.y);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function getDefaultRectangleSideRatios() {
  return {
    top: [],
    right: [],
    bottom: [],
    left: []
  };
}

function getDefaultRectangleSideEnabled() {
  return {
    top: true,
    right: true,
    bottom: true,
    left: true
  };
}

function getDefaultRectangleSideGaps() {
  return {
    top: [],
    right: [],
    bottom: [],
    left: []
  };
}

function cloneRectangleSideRatios(source) {
  return {
    top: [...(source?.top ?? [])],
    right: [...(source?.right ?? [])],
    bottom: [...(source?.bottom ?? [])],
    left: [...(source?.left ?? [])]
  };
}

function cloneRectangleSideGaps(source) {
  return {
    top: [...(source?.top ?? [])],
    right: [...(source?.right ?? [])],
    bottom: [...(source?.bottom ?? [])],
    left: [...(source?.left ?? [])]
  };
}

function cloneRectangleSideEnabled(source) {
  return {
    top: source?.top !== false,
    right: source?.right !== false,
    bottom: source?.bottom !== false,
    left: source?.left !== false
  };
}

function getRectangleSideRatios(side) {
  const count = rectangleState.sideSegments[side] ?? DEFAULT_RECTANGLE_SEGMENTS;
  const ratios = reconcileRectangleSideRatios(rectangleState.sideRatios?.[side], count);
  rectangleState.sideRatios[side] = ratios;
  return ratios;
}

function reconcileRectangleSideRatios(source, segmentCount) {
  const vertexCount = Math.max(segmentCount - 1, 0);
  const ratios = Array.isArray(source)
    ? source.map((ratio) => Number(ratio)).filter((ratio) => Number.isFinite(ratio))
    : [];

  ratios.sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < vertexCount; i++) {
    result.push(clamp(ratios[i] ?? ((i + 1) / segmentCount), 0, 1));
  }

  const spacing = getRectangleRatioSpacing(segmentCount);
  for (let i = 0; i < result.length; i++) {
    const min = i === 0 ? spacing : result[i - 1] + spacing;
    const max = i === result.length - 1 ? 1 - spacing : result[i + 1] - spacing;
    result[i] = clamp(result[i], min, max);
  }

  return result;
}

function reconcileRectangleSideGaps(source, segmentCount) {
  if (!Array.isArray(source)) return [];
  return [...new Set(source
    .map((index) => Number(index))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < segmentCount))]
    .sort((a, b) => a - b);
}

function getRectangleRatioSpacing(segmentCount) {
  return Math.min(0.02, 0.45 / Math.max(segmentCount, 1));
}

function getRectangleRatioForPoint(side, point) {
  const bounds = getRectangleBounds();
  if (side === "top") return getBoundedRatio(point.x, bounds.minX, bounds.maxX);
  if (side === "right") return getBoundedRatio(point.y, bounds.minY, bounds.maxY);
  if (side === "bottom") return getBoundedRatio(point.x, bounds.maxX, bounds.minX);
  return getBoundedRatio(point.y, bounds.maxY, bounds.minY);
}

function getBoundedRatio(value, start, end) {
  const length = end - start;
  if (!length) return 0;
  return clamp((value - start) / length, 0, 1);
}

function getRectangleSegments() {
  const bounds = getRectangleBounds();
  return getRectangleBoundsSides(bounds).flatMap(([side, start, end]) => getSideSegments(side, start, end));
}

function getRectangleSideVertices() {
  const bounds = getRectangleBounds();
  return getRectangleBoundsSides(bounds).flatMap(([side, start, end]) => getSideVertices(side, start, end));
}

function getRectangleBoundsSides(bounds) {
  return [
    ["top", {x: bounds.minX, y: bounds.minY}, {x: bounds.maxX, y: bounds.minY}],
    ["right", {x: bounds.maxX, y: bounds.minY}, {x: bounds.maxX, y: bounds.maxY}],
    ["bottom", {x: bounds.maxX, y: bounds.maxY}, {x: bounds.minX, y: bounds.maxY}],
    ["left", {x: bounds.minX, y: bounds.maxY}, {x: bounds.minX, y: bounds.minY}]
  ];
}

function getSideSegments(side, start, end) {
  if (!rectangleState.sideEnabled[side]) return [];

  const gaps = getRectangleSideGaps(side);
  return getAllSideSegments(side, start, end).filter((segment) => !gaps.includes(segment.index));
}

function getAllSideSegments(side, start, end) {
  const points = getSidePoints(side, start, end);
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push({side, index: i, a: points[i], b: points[i + 1]});
  }
  return segments;
}

function getSideVertices(side, start, end) {
  if (!rectangleState.sideEnabled[side]) return [];
  return getSidePoints(side, start, end).slice(1, -1).map((point, index) => ({side, index, point}));
}

function getSidePoints(side, start, end) {
  return [
    start,
    ...getRectangleSideRatios(side).map((ratio) => ({
      x: start.x + ((end.x - start.x) * ratio),
      y: start.y + ((end.y - start.y) * ratio)
    })),
    end
  ];
}

async function applyRectangleWalls() {
  if (!isRectangleToolActive() || !rectangleState.placed) return;

  const wallData = WALL_TYPE_DATA[rectangleState.wallTypeTool]?.() ?? WALL_TYPE_DATA.walls();
  const rectangleId = rectangleState.rectangleId ?? foundry.utils.randomID();
  const segments = getRectangleSegments();
  const walls = [];

  for (let i = 0; i < segments.length; i++) {
    const {a, b} = segments[i];
    const c = [Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y)];
    if ((c[0] === c[2]) && (c[1] === c[3])) continue;
    walls.push({
      ...wallData,
      c,
      flags: {
        [MODULE_ID]: {
          [RECTANGLE_FLAG]: {
            rectangleId,
            index: i,
            wallIds: [],
            handles: clonePoints(rectangleState.handles),
            sideSegments: {...rectangleState.sideSegments},
            sideRatios: cloneRectangleSideRatios(rectangleState.sideRatios),
            sideEnabled: cloneRectangleSideEnabled(rectangleState.sideEnabled),
            sideGaps: cloneRectangleSideGaps(rectangleState.sideGaps),
            wallTypeTool: rectangleState.wallTypeTool
          }
        }
      }
    });
  }

  if (!walls.length) return;

  const oldWallIds = getExistingRectangleWallIds();
  const oldWalls = oldWallIds.map((id) => canvas.scene.walls.get(id)).filter(Boolean);
  const created = await canvas.scene.createEmbeddedDocuments("Wall", walls);
  const wallIds = created.map((wall) => wall.id);
  const flagUpdates = created.map((wall, index) => ({
    _id: wall.id,
    [`flags.${MODULE_ID}.${RECTANGLE_FLAG}.index`]: index,
    [`flags.${MODULE_ID}.${RECTANGLE_FLAG}.wallIds`]: wallIds
  }));
  await canvas.scene.updateEmbeddedDocuments("Wall", flagUpdates);

  if (oldWallIds.length) {
    canvas.walls.storeHistory("delete", oldWalls.map((wall) => wall.toObject()));
    oldWallIds.forEach((id) => rectangleState.replacingWallIds.add(id));
    try {
      await canvas.scene.deleteEmbeddedDocuments("Wall", oldWallIds);
    } finally {
      oldWallIds.forEach((id) => rectangleState.replacingWallIds.delete(id));
    }
  }

  canvas.walls.storeHistory("create", created.map((wall) => wall.toObject()));
  ui.notifications.info(game.i18n.format("indy-walls.Notifications.RectangleWallsCreated", {
    count: created.length
  }));
  clearRectanglePreview();
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
  restoreEditSessionWalls();
  clearEditorHistory(cubicState);
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
  restoreEditSessionWalls();
  clearEditorHistory(ellipseState);
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

function clearRectanglePreview() {
  restoreEditSessionWalls();
  clearEditorHistory(rectangleState);
  rectangleState.placed = false;
  rectangleState.initializing = false;
  rectangleState.draggingHandle = null;
  rectangleState.draggingVertex = null;
  rectangleState.hoveredVertex = null;
  rectangleState.rectangleId = null;
  rectangleState.wallIds = [];
  rectangleState.sideRatios = getDefaultRectangleSideRatios();
  rectangleState.sideEnabled = getDefaultRectangleSideEnabled();
  rectangleState.sideGaps = getDefaultRectangleSideGaps();
  rectangleState.graphics?.destroy();
  rectangleState.graphics = null;
  setRectangleEditingState(false);
}

function setCubicEditingState(editing) {
  document.body?.classList.toggle("indy-walls-cubic-editing", editing);
  ensureCubicEditButtons();
  setEditButtonsVisible(CUBIC_EDIT_BUTTONS_ID, editing);
  updateEditButtonStates();
  if (editing) positionCubicEditButtons();
}

function ensureCubicEditButtons() {
  ensureEditButtons({
    id: CUBIC_EDIT_BUTTONS_ID,
    buttons: [
      ["indy-walls.Controls.DecreaseSegments", "fa-solid fa-minus", () => changeActiveSegments(-1)],
      ["indy-walls.Controls.IncreaseSegments", "fa-solid fa-plus", () => changeActiveSegments(1)],
      ["indy-walls.Controls.UndoEdit", "fa-solid fa-rotate-left", () => undoActiveEditor()],
      ["indy-walls.Controls.RedoEdit", "fa-solid fa-rotate-right", () => redoActiveEditor()],
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
  updateEditButtonStates();
  if (editing) positionEllipseEditButtons();
}

function ensureEllipseEditButtons() {
  ensureEditButtons({
    id: ELLIPSE_EDIT_BUTTONS_ID,
    buttons: [
      ["indy-walls.Controls.DecreaseSegments", "fa-solid fa-minus", () => changeActiveSegments(-1)],
      ["indy-walls.Controls.IncreaseSegments", "fa-solid fa-plus", () => changeActiveSegments(1)],
      ["indy-walls.Controls.UndoEdit", "fa-solid fa-rotate-left", () => undoActiveEditor()],
      ["indy-walls.Controls.RedoEdit", "fa-solid fa-rotate-right", () => redoActiveEditor()],
      ["indy-walls.Controls.ApplyEllipse", "fa-solid fa-check", () => applyEllipseWalls()],
      ["indy-walls.Controls.CancelEllipse", "fa-solid fa-xmark", () => clearEllipsePreview()]
    ]
  });
}

function positionEllipseEditButtons() {
  positionEditButtons({id: ELLIPSE_EDIT_BUTTONS_ID, toolName: ELLIPSE_TOOL, fallbackTop: 160});
}

function setRectangleEditingState(editing) {
  document.body?.classList.toggle("indy-walls-rectangle-editing", editing);
  ensureRectangleEditButtons();
  setEditButtonsVisible(RECTANGLE_EDIT_BUTTONS_ID, editing);
  updateEditButtonStates();
  if (editing) positionRectangleEditButtons();
}

function ensureRectangleEditButtons() {
  const existing = document.getElementById(RECTANGLE_EDIT_BUTTONS_ID);
  if (existing && existing.querySelectorAll("button").length !== 4) existing.remove();

  ensureEditButtons({
    id: RECTANGLE_EDIT_BUTTONS_ID,
    buttons: [
      ["indy-walls.Controls.UndoEdit", "fa-solid fa-rotate-left", () => undoActiveEditor()],
      ["indy-walls.Controls.RedoEdit", "fa-solid fa-rotate-right", () => redoActiveEditor()],
      ["indy-walls.Controls.ApplyRectangle", "fa-solid fa-check", () => applyRectangleWalls()],
      ["indy-walls.Controls.CancelRectangle", "fa-solid fa-xmark", () => clearRectanglePreview()]
    ]
  });
}

function positionRectangleEditButtons() {
  positionEditButtons({id: RECTANGLE_EDIT_BUTTONS_ID, toolName: RECTANGLE_TOOL, fallbackTop: 200});
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

function cancelRectangleEditingForDeletedWall(wallDocument) {
  if (!rectangleState.placed || !rectangleState.rectangleId) return;
  if (rectangleState.replacingWallIds.has(wallDocument.id)) return;

  const rectangleData = wallDocument.getFlag(MODULE_ID, RECTANGLE_FLAG);
  const sameRectangle = rectangleData?.rectangleId === rectangleState.rectangleId;
  const knownWall = rectangleState.wallIds.includes(wallDocument.id);
  if (!sameRectangle && !knownWall) return;

  clearRectanglePreview();
  if (game.activeTool === RECTANGLE_TOOL) canvas.walls.activate({tool: "select"});
}

function loadCubicCurveFromWall(wall) {
  const cubicData = wall.document.getFlag(MODULE_ID, CUBIC_FLAG);
  if (!Array.isArray(cubicData?.handles) || cubicData.handles.length !== 4) return;

  cubicState.active = true;
  ellipseState.active = false;
  rectangleState.active = false;
  clearEditorHistory(cubicState);
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
  hideEditSessionWalls(cubicState.wallIds);
  drawCubicPreview();
}

function loadEllipseFromWall(wall) {
  const ellipseData = wall.document.getFlag(MODULE_ID, ELLIPSE_FLAG);
  if (!Array.isArray(ellipseData?.handles) || ellipseData.handles.length !== 2) return;

  cubicState.active = false;
  ellipseState.active = true;
  rectangleState.active = false;
  clearEditorHistory(ellipseState);
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
  hideEditSessionWalls(ellipseState.wallIds);
  drawEllipsePreview();
}

function loadRectangleFromWall(wall) {
  const rectangleData = wall.document.getFlag(MODULE_ID, RECTANGLE_FLAG);
  if (!Array.isArray(rectangleData?.handles) || rectangleData.handles.length !== 2) return;

  cubicState.active = false;
  ellipseState.active = false;
  rectangleState.active = true;
  clearEditorHistory(rectangleState);
  rectangleState.placed = true;
  rectangleState.initializing = false;
  rectangleState.draggingHandle = null;
  rectangleState.draggingVertex = null;
  rectangleState.hoveredVertex = null;
  rectangleState.rectangleId = rectangleData.rectangleId ?? null;
  rectangleState.wallIds = Array.isArray(rectangleData.wallIds) ? [...rectangleData.wallIds] : [wall.document.id];
  rectangleState.wallTypeTool = getWallTypeToolFromDocument(wall.document) ?? rectangleData.wallTypeTool ?? "walls";
  rectangleState.sideSegments = normalizeRectangleSideSegments(rectangleData.sideSegments);
  rectangleState.sideRatios = normalizeRectangleSideRatios(rectangleData.sideRatios, rectangleState.sideSegments);
  rectangleState.sideEnabled = normalizeRectangleSideEnabled(rectangleData.sideEnabled);
  rectangleState.sideGaps = normalizeRectangleSideGaps(rectangleData.sideGaps, rectangleState.sideSegments);
  rectangleState.handles = rectangleData.handles.map((handle) => ({
    x: Number(handle.x) || 0,
    y: Number(handle.y) || 0
  }));

  canvas.walls.activate({tool: RECTANGLE_TOOL});
  hideEditSessionWalls(rectangleState.wallIds);
  drawRectanglePreview();
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

function getExistingRectangleWallIds() {
  return rectangleState.wallIds.filter((id) => canvas.scene.walls.has(id));
}

function normalizeRectangleSideSegments(source={}) {
  return {
    top: clamp(Number(source.top) || DEFAULT_RECTANGLE_SEGMENTS, 1, 64),
    right: clamp(Number(source.right) || DEFAULT_RECTANGLE_SEGMENTS, 1, 64),
    bottom: clamp(Number(source.bottom) || DEFAULT_RECTANGLE_SEGMENTS, 1, 64),
    left: clamp(Number(source.left) || DEFAULT_RECTANGLE_SEGMENTS, 1, 64)
  };
}

function normalizeRectangleSideRatios(source={}, sideSegments=normalizeRectangleSideSegments()) {
  return {
    top: reconcileRectangleSideRatios(source.top, sideSegments.top),
    right: reconcileRectangleSideRatios(source.right, sideSegments.right),
    bottom: reconcileRectangleSideRatios(source.bottom, sideSegments.bottom),
    left: reconcileRectangleSideRatios(source.left, sideSegments.left)
  };
}

function normalizeRectangleSideEnabled(source={}) {
  return cloneRectangleSideEnabled(source);
}

function normalizeRectangleSideGaps(source={}, sideSegments=normalizeRectangleSideSegments()) {
  return {
    top: reconcileRectangleSideGaps(source.top, sideSegments.top),
    right: reconcileRectangleSideGaps(source.right, sideSegments.right),
    bottom: reconcileRectangleSideGaps(source.bottom, sideSegments.bottom),
    left: reconcileRectangleSideGaps(source.left, sideSegments.left)
  };
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
    && (move === movement.NONE)) return "windows";
  if ((light === senses.NORMAL) && (sight === senses.NORMAL) && (sound === senses.NORMAL)
    && (move === movement.NORMAL)) return "walls";
  return null;
}
