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
import {
  CUBIC_EDIT_BUTTONS_ID,
  CUBIC_FLAG,
  CUBIC_TOOL,
  DEFAULT_CUBIC_SEGMENTS,
  cubicState
} from "./shapes/cubic.js";
import {
  DEFAULT_ELLIPSE_SEGMENTS,
  ELLIPSE_EDIT_BUTTONS_ID,
  ELLIPSE_FLAG,
  ELLIPSE_TOOL,
  ellipseState
} from "./shapes/ellipse.js";
import {
  DEFAULT_RECTANGLE_SEGMENTS,
  RECTANGLE_EDIT_BUTTONS_ID,
  RECTANGLE_FLAG,
  RECTANGLE_TOOL,
  rectangleState
} from "./shapes/rectangle.js";
import {
  POLYLINE_EDIT_BUTTONS_ID,
  POLYLINE_FLAG,
  POLYLINE_TOOL,
  polylineState
} from "./shapes/polyline.js";

const MODULE_ID = "indy-walls";
const QUICK_WALL_TYPE_SETTING = "quickWallTypeChange";
const DEBUG_SETTING = "debugShapeSelection";
const STYLE_SETTINGS = {
  wallColor: "previewWallColor",
  windowWallColor: "previewWindowWallColor",
  doorWallColor: "previewDoorWallColor",
  secretWallColor: "previewSecretWallColor",
  invisibleWallColor: "previewInvisibleWallColor",
  terrainWallColor: "previewTerrainWallColor",
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
const SEGMENT_WALL_TYPE_KEYBINDINGS = {
  walls: {label: "Normal", key: "KeyX"},
  doors: {label: "Door", key: "KeyD"},
  windows: {label: "Window", key: "KeyW"},
  invisible: {label: "Invisible", key: "KeyI"},
  secret: {label: "Secret", key: "KeyS"},
  terrain: {label: "Terrain", key: "KeyT"}
};

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
const WALL_TYPE_TOOL_ALIASES = {
  wall: "walls",
  normal: "walls",
  terrainWall: "terrain",
  invisibleWall: "invisible",
  etherealWall: "ethereal",
  window: "windows",
  windowWall: "windows",
  windowWalls: "windows",
  door: "doors",
  doorWall: "doors",
  secretDoor: "secret",
  secretDoorWall: "secret"
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
  move: false,
  coordinateLabel: null,
  pointerCoordinateLabel: null,
  pointerOffset: null,
  startPointerPoint: null,
  startEditorPoint: null,
  initialPlacement: false,
  controlInteraction: false,
  pointerId: null,
  view: null
};
const canvasSegmentEditState = {
  tool: null,
  edit: null,
  pointerId: null,
  clientX: null,
  clientY: null,
  cancelledByMove: false,
  ignoreClickUntil: 0
};
const controlShapeSelectState = {
  active: false,
  pointerId: null,
  clientX: null,
  clientY: null
};
const lastCanvasPointerState = {
  point: null
};
let copiedEditorShape = null;

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
  registerSegmentWallTypeKeybindings();

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
  cancelPolylineEditingForDeletedWall(wallDocument);
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
    windowWallColor: ["PreviewWindowWallColor", String, "#b784a7ff"],
    doorWallColor: ["PreviewDoorWallColor", String, "#123c69ff"],
    secretWallColor: ["PreviewSecretWallColor", String, "#7a3db8ff"],
    invisibleWallColor: ["PreviewInvisibleWallColor", String, "#8ecae6ff"],
    terrainWallColor: ["PreviewTerrainWallColor", String, "#3f9b4fff"],
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

function registerSegmentWallTypeKeybindings() {
  if (!game.keybindings?.register) return;

  for (const [toolName, {label, key}] of Object.entries(SEGMENT_WALL_TYPE_KEYBINDINGS)) {
    game.keybindings.register(MODULE_ID, `setHoveredSegment${label}`, {
      name: `indy-walls.Keybindings.SetHoveredSegment${label}.Name`,
      hint: `indy-walls.Keybindings.SetHoveredSegment${label}.Hint`,
      editable: [{key}],
      restricted: true,
      onDown: () => changeHoveredSegmentWallType(toolName)
    });
  }
}

Hooks.on("getSceneControlButtons", (controls) => {
  const wallTools = controls.walls?.tools;
  if (!wallTools) return;

  for (const toolId of Object.keys(wallTools)) {
    const toolName = getWallTypeToolName(toolId);
    if (!toolName) continue;
    const tool = wallTools[toolId];
    if (!tool || tool._indyWallsWrapped) continue;

    const originalOnChange = tool.onChange;
    tool.onChange = async (event, active) => {
      originalOnChange?.(event, active);
      if (!active) return;
      cubicState.wallTypeTool = toolName;
      ellipseState.wallTypeTool = toolName;
      rectangleState.wallTypeTool = toolName;
      polylineState.wallTypeTool = toolName;
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
        polylineState.active = false;
        clearEllipsePreview();
        clearRectanglePreview();
        clearPolylinePreview();
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
        polylineState.active = false;
        clearCubicPreview();
        clearRectanglePreview();
        clearPolylinePreview();
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
        polylineState.active = false;
        clearCubicPreview();
        clearEllipsePreview();
        clearPolylinePreview();
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

  wallTools[POLYLINE_TOOL] = {
    name: POLYLINE_TOOL,
    order: 16,
    title: "indy-walls.Controls.Polyline",
    icon: "fa-solid fa-draw-polygon",
    onChange: (event, active) => {
      polylineState.active = active;
      if (active) {
        cubicState.active = false;
        ellipseState.active = false;
        rectangleState.active = false;
        clearCubicPreview();
        clearEllipsePreview();
        clearRectanglePreview();
        canvas.walls.activate();
      }
      else clearPolylinePreview();
    },
    toolclip: {
      heading: "indy-walls.Controls.Polyline",
      items: [
        {paragraph: "indy-walls.Tooltips.Polyline"}
      ]
    }
  };
});

Hooks.on("renderSceneControls", () => {
  positionCubicEditButtons();
  positionEllipseEditButtons();
  positionRectangleEditButtons();
  positionPolylineEditButtons();
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
    const polylineData = wall.document.getFlag(MODULE_ID, POLYLINE_FLAG);
    if (polylineData) update[`flags.${MODULE_ID}.${POLYLINE_FLAG}.wallTypeTool`] = toolName;
    return update;
  });

  await canvas.scene.updateEmbeddedDocuments("Wall", updates);
}

function registerWallTypeControlShortcuts() {
  document.addEventListener("click", (event) => {
    if (!isControlInteraction(event)) return;
    if (!game.user.isGM) return;
    if (!game.settings.get(MODULE_ID, QUICK_WALL_TYPE_SETTING)) return;
    if (!canvas?.walls?.controlled?.length) return;

    const button = event.target?.closest?.("[data-tool]");
    const toolName = getWallTypeToolName(button?.dataset?.tool);
    if (!toolName) return;

    event.preventDefault();
    event.stopPropagation();
    cubicState.wallTypeTool = toolName;
    ellipseState.wallTypeTool = toolName;
    rectangleState.wallTypeTool = toolName;
    polylineState.wallTypeTool = toolName;
    updateSelectedWalls(toolName);
  }, {capture: true});
}

function getWallTypeToolName(toolName) {
  if (!toolName) return null;
  if (WALL_TYPE_DATA[toolName]) return toolName;
  const alias = WALL_TYPE_TOOL_ALIASES[toolName];
  return WALL_TYPE_DATA[alias] ? alias : null;
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

    if (!isCubicToolActive() && !isEllipseToolActive() && !isRectangleToolActive() && !isPolylineToolActive()) {
      return originalDragStart.call(this, event);
    }
    if (isPolylineToolActive()) {
      consumeCanvasInteraction(event);
      resetEditorCursor(event);
      return;
    }

    event.interactionData.clearPreviewContainer = false;
    const origin = event.interactionData.origin;
    const hitPoint = getInteractionPoint(event) ?? origin;
    const point = getEventPoint(this, origin, event);

    if (isEllipseToolActive()) {
      ellipseState.draggingHandle = getEllipseHandleAt({x: hitPoint.x, y: hitPoint.y});
      ellipseState.draggingVertex = ellipseState.draggingHandle === null
        ? getEllipseVertexAt({x: hitPoint.x, y: hitPoint.y})
        : null;
      if (ellipseState.draggingVertex) {
        beginEditorOperation(ellipseState);
        markSuppressEllipseSegmentClick();
        drawEllipsePreview();
        return;
      }
      if (ellipseState.draggingHandle === null) {
        if (ellipseState.placed) {
          consumeCanvasInteraction(event);
          resetEditorCursor(event);
          drawEllipsePreview();
          return;
        }
        beginEditorOperation(ellipseState, true);
        ellipseState.placed = false;
        ellipseState.initializing = true;
        ellipseState.initialOrigin = point;
        ellipseState.draggingHandle = 1;
        ellipseState.draggingVertex = null;
        ellipseState.ellipseId = null;
        ellipseState.wallIds = [];
        ellipseState.wallTypeBySegment = {};
        ellipseState.rotation = 0;
        ellipseState.segmentGaps = [];
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
        scheduleEditorInteractionReset(event);
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
          resetEditorCursor(event);
          drawRectanglePreview();
          return;
        }
        beginEditorOperation(rectangleState, true);
        rectangleState.placed = false;
        rectangleState.initializing = true;
        rectangleState.draggingHandle = 1;
        rectangleState.draggingVertex = null;
        rectangleState.hoveredVertex = null;
        rectangleState.rectangleId = null;
        rectangleState.wallIds = [];
        rectangleState.wallTypeBySegment = {};
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
        resetEditorCursor(event);
        drawCubicPreview();
        return;
      }
      beginEditorOperation(cubicState, true);
      cubicState.placed = false;
      cubicState.initializing = true;
      cubicState.draggingHandle = 3;
      cubicState.curveId = null;
      cubicState.wallIds = [];
      cubicState.wallTypeBySegment = {};
      cubicState.segmentGaps = [];
      setHandle(0, point);
      setHandle(1, point);
      setHandle(2, point);
      setHandle(3, point);
    } else {
      beginEditorOperation(cubicState);
      markSuppressCubicSegmentClick();
    }

    drawCubicPreview();
  };

  WallsLayer.prototype._onDragLeftMove = function(event) {
    if (!isCubicToolActive() && !isEllipseToolActive() && !isRectangleToolActive() && !isPolylineToolActive()) {
      return originalDragMove.call(this, event);
    }
    if (isPolylineToolActive()) return;

    if (isEllipseToolActive()) {
      if (ellipseState.draggingVertex) {
        const point = getEventPoint(this, event.interactionData.destination, event);
        setEllipseRotationFromVertex(ellipseState.draggingVertex, point);
        drawEllipsePreview();
        return;
      }
      if (ellipseState.draggingHandle === null) return;
      const point = getEventPoint(this, event.interactionData.destination, event);
      setEllipseResizeHandle(ellipseState.draggingHandle, point, event);
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
      ellipseDraggingVertex: ellipseState.draggingVertex,
      rectangleDraggingHandle: rectangleState.draggingHandle,
      rectangleDraggingVertex: rectangleState.draggingVertex,
      polylineDraggingVertex: polylineState.draggingVertex
    });
    if (!isCubicToolActive() && !isEllipseToolActive() && !isRectangleToolActive() && !isPolylineToolActive()) {
      return originalDragDrop.call(this, event);
    }
    if (isPolylineToolActive()) {
      event.interactionData.clearPreviewContainer = false;
      resetEditorCursor(event);
      return;
    }
    if (isEllipseToolActive()) {
      const wasVertexDrag = !!ellipseState.draggingVertex;
      ellipseState.draggingHandle = null;
      ellipseState.draggingVertex = null;
      ellipseState.initializing = false;
      ellipseState.initialOrigin = null;
      event.interactionData.clearPreviewContainer = false;
      commitEditorOperation(ellipseState);
      if (wasVertexDrag) markSuppressEllipseSegmentClick();
      drawEllipsePreview();
      return;
    }

    if (isRectangleToolActive()) {
      rectangleState.draggingHandle = null;
      rectangleState.draggingVertex = null;
      rectangleState.hoveredVertex = null;
      rectangleState.initializing = false;
      event.interactionData.clearPreviewContainer = false;
      resetEditorCursor(event);
      commitEditorOperation(rectangleState);
      drawRectanglePreview();
      return;
    }

    cubicState.draggingHandle = null;
    cubicState.initializing = false;
    event.interactionData.clearPreviewContainer = false;
    commitEditorOperation(cubicState);
    markSuppressCubicSegmentClick();
    drawCubicPreview();
  };

  WallsLayer.prototype._onDragLeftCancel = function(event) {
    debugShapeSelection("walls layer drag left cancel", {
      activeTool: game.activeTool,
      editorActive: isAnyEditorToolActive(),
      cubicDraggingHandle: cubicState.draggingHandle,
      ellipseDraggingHandle: ellipseState.draggingHandle,
      ellipseDraggingVertex: ellipseState.draggingVertex,
      rectangleDraggingHandle: rectangleState.draggingHandle,
      rectangleDraggingVertex: rectangleState.draggingVertex,
      polylineDraggingVertex: polylineState.draggingVertex
    });
    if (!isCubicToolActive() && !isEllipseToolActive() && !isRectangleToolActive() && !isPolylineToolActive()) {
      return originalDragCancel.call(this, event);
    }
    if (isPolylineToolActive()) {
      event.interactionData.clearPreviewContainer = false;
      resetEditorCursor(event);
      return;
    }
    if (isEllipseToolActive()) {
      const wasVertexDrag = !!ellipseState.draggingVertex;
      ellipseState.draggingHandle = null;
      ellipseState.draggingVertex = null;
      ellipseState.initializing = false;
      ellipseState.initialOrigin = null;
      event.interactionData.clearPreviewContainer = false;
      cancelEditorOperation(ellipseState);
      if (wasVertexDrag) markSuppressEllipseSegmentClick();
      drawEllipsePreview();
      return;
    }

    if (isRectangleToolActive()) {
      rectangleState.draggingHandle = null;
      rectangleState.draggingVertex = null;
      rectangleState.hoveredVertex = null;
      rectangleState.initializing = false;
      event.interactionData.clearPreviewContainer = false;
      resetEditorCursor(event);
      cancelEditorOperation(rectangleState);
      drawRectanglePreview();
      return;
    }

    cubicState.draggingHandle = null;
    cubicState.initializing = false;
    event.interactionData.clearPreviewContainer = false;
    cancelEditorOperation(cubicState);
    markSuppressCubicSegmentClick();
    drawCubicPreview();
  };

  WallsLayer.prototype._onMouseWheel = function(event) {
    if (!getActiveEditorState()?.placed || !event.ctrlKey || isPolylineToolActive()) {
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

      if (method === "_onClickLeft" && game.user.isGM && isControlInteraction(event)) {
        consumeCanvasInteraction(event);
        resetEditorCursor(event);
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

  if (isCubicToolActive()) return !cubicState.placed
    || getCubicHandleAt(point) !== null
    || getCubicSegmentAt(point) !== null;
  if (isEllipseToolActive()) return !ellipseState.placed
    || getEllipseHandleAt(point) !== null
    || getEllipseVertexAt(point) !== null
    || getEllipseSegmentAt(point) !== null;
  if (isPolylineToolActive()) return !polylineState.placed
    || getPolylineVertexAt(point) !== null
    || getPolylineSegmentAt(point) !== null;
  if (!isRectangleToolActive()) return false;

  return !rectangleState.placed
    || getRectangleHandleAt(point) !== null
    || getRectangleVertexAt(point) !== null
    || getRectangleSideAt(point) !== null;
}

function registerRectangleCanvasClickHandler() {
  const view = canvas?.app?.view;
  if (!view || rectangleCanvasClickViews.has(view)) return;

  view.addEventListener("pointerdown", handleCanvasSegmentEditPointerDown, {capture: true});
  view.addEventListener("pointermove", handleCanvasSegmentEditPointerMove, {capture: true});
  view.addEventListener("pointermove", updateLastCanvasPointerPoint, {capture: true});
  view.addEventListener("pointerup", handleCanvasSegmentEditPointerUp, {capture: true});
  view.addEventListener("pointercancel", handleCanvasSegmentEditPointerCancel, {capture: true});
  view.addEventListener("mousedown", handleEditorCanvasMouseEvent, {capture: true});
  view.addEventListener("mouseup", handleEditorCanvasMouseEvent, {capture: true});
  view.addEventListener("click", handleRectangleCanvasClick, {capture: true});
  view.addEventListener("dblclick", handlePolylineCanvasDoubleClick, {capture: true});
  rectangleCanvasClickViews.add(view);
  debugShapeSelection("registered rectangle canvas click handler", {
    tagName: view.tagName,
    width: view.width,
    height: view.height,
    clientWidth: view.clientWidth,
    clientHeight: view.clientHeight
  });
}

function updateLastCanvasPointerPoint(event) {
  const point = getClientInteractionPoint(event);
  if (point) lastCanvasPointerState.point = point;
  if (point && isPolylineToolActive() && polylineState.drawing) {
    polylineState.previewPoint = point;
    drawPolylinePreview();
  }
}

function handleCanvasSegmentEditPointerDown(event) {
  if (Number.isFinite(event.button) && event.button !== 0) return;
  if (isControlInteraction(event)) {
    startControlShapeSelect(event);
    return;
  }
  if (getEditorDomDragHit(event)) return;

  const pending = getActiveCanvasSegmentEdit(event);
  if (!pending) {
    if (isPolylineToolActive()) {
      consumeCanvasInteraction(event);
      scheduleEditorInteractionReset(event);
    }
    return;
  }

  debugShapeSelection(`${pending.tool} canvas segment pointerdown`, {
    clientX: event.clientX,
    clientY: event.clientY,
    altKey: !!event.altKey,
    edit: pending.edit
  });
  consumeCanvasInteraction(event);
  canvasSegmentEditState.tool = pending.tool;
  canvasSegmentEditState.edit = pending.edit;
  canvasSegmentEditState.pointerId = event.pointerId;
  canvasSegmentEditState.clientX = event.clientX;
  canvasSegmentEditState.clientY = event.clientY;
  canvasSegmentEditState.cancelledByMove = false;
  resetCanvasCursor(event);
  scheduleEditorInteractionReset(event);
}

function handleCanvasSegmentEditPointerMove(event) {
  if (!isPendingCanvasSegmentEditEvent(event)) return;
  if (canvasSegmentEditState.clientX !== null && canvasSegmentEditState.clientY !== null) {
    const distance = Math.hypot(event.clientX - canvasSegmentEditState.clientX, event.clientY - canvasSegmentEditState.clientY);
    if (distance > 8) canvasSegmentEditState.cancelledByMove = true;
  }

  debugShapeSelection(`${canvasSegmentEditState.tool} canvas segment pointermove blocked`, {
    clientX: event.clientX,
    clientY: event.clientY,
    cancelledByMove: canvasSegmentEditState.cancelledByMove,
    edit: canvasSegmentEditState.edit
  });
  consumeCanvasInteraction(event);
  resetCanvasCursor(event);
}

function handleCanvasSegmentEditPointerUp(event) {
  const wasControlSelect = isControlShapeSelectEvent(event);
  const controlSelectHandled = finishControlShapeSelect(event);
  if (controlSelectHandled) {
    consumeCanvasInteraction(event);
    scheduleEditorInteractionReset(event);
    return;
  }
  if (wasControlSelect) return;

  if (!isPendingCanvasSegmentEditEvent(event)) {
    return;
  }
  consumeCanvasInteraction(event);
  const pending = consumePendingCanvasSegmentEdit(event);
  if (pending) {
    debugShapeSelection(`${pending.tool} canvas segment pointerup commit pending`, {
      clientX: event.clientX,
      clientY: event.clientY,
      altKey: !!event.altKey,
      edit: pending.edit
    });
    commitCanvasSegmentEdit(pending.tool, pending.edit, event);
    canvasSegmentEditState.ignoreClickUntil = Date.now() + 500;
  } else {
    clearPendingCanvasSegmentEdit();
  }
  resetCanvasCursor(event);
  scheduleEditorInteractionReset(event);
}

function handleCanvasSegmentEditPointerCancel(event) {
  if (isControlShapeSelectEvent(event)) clearControlShapeSelect();
  if (!isPendingCanvasSegmentEditEvent(event)) {
    return;
  }
  consumeCanvasInteraction(event);
  clearPendingCanvasSegmentEdit();
  scheduleEditorInteractionReset(event);
}

function handleEditorCanvasMouseEvent(event) {
  if (Number.isFinite(event.button) && event.button !== 0) return;
  if (isControlInteraction(event) || !isPlacedEditorActive()) return;
}

function startControlShapeSelect(event) {
  if (!game.user.isGM) return;
  controlShapeSelectState.active = true;
  controlShapeSelectState.pointerId = event.pointerId;
  controlShapeSelectState.clientX = event.clientX;
  controlShapeSelectState.clientY = event.clientY;
  debugShapeSelection("control shape select armed", {
    clientX: event.clientX,
    clientY: event.clientY,
    activeTool: game.activeTool
  });
}

function finishControlShapeSelect(event) {
  if (!isControlShapeSelectEvent(event)) return false;

  const moved = Math.hypot(
    event.clientX - controlShapeSelectState.clientX,
    event.clientY - controlShapeSelectState.clientY
  );
  clearControlShapeSelect();
  if (moved > 6) {
    debugShapeSelection("control shape select skipped after drag", {
      clientX: event.clientX,
      clientY: event.clientY,
      moved
    });
    return false;
  }

  const loaded = loadShapeFromCanvasPointerUp(event);
  if (loaded) canvasSegmentEditState.ignoreClickUntil = Date.now() + 500;
  return loaded;
}

function isControlShapeSelectEvent(event) {
  return controlShapeSelectState.active
    && (controlShapeSelectState.pointerId === null || controlShapeSelectState.pointerId === event.pointerId);
}

function clearControlShapeSelect() {
  controlShapeSelectState.active = false;
  controlShapeSelectState.pointerId = null;
  controlShapeSelectState.clientX = null;
  controlShapeSelectState.clientY = null;
}

function handleRectangleCanvasClick(event) {
  if (Number.isFinite(event.button) && event.button !== 0) return;
  if (shouldIgnoreCanvasSegmentClick()) {
    consumeCanvasInteraction(event);
    scheduleEditorInteractionReset(event);
    return;
  }

  const pending = consumePendingCanvasSegmentEdit(event);
  if (pending) {
    debugShapeSelection(`${pending.tool} canvas segment click commit pending`, {
      clientX: event.clientX,
      clientY: event.clientY,
      altKey: !!event.altKey,
      edit: pending.edit
    });
    consumeCanvasInteraction(event);
    commitCanvasSegmentEdit(pending.tool, pending.edit, event);
    return;
  }

  if (isPolylineToolActive()) {
    debugShapeSelection("polyline canvas click", {
      clientX: event.clientX,
      clientY: event.clientY,
      altKey: !!event.altKey,
      placed: polylineState.placed,
      drawing: polylineState.drawing
    });
    consumeCanvasInteraction(event);
    handlePolylineCanvasClick(event);
    return;
  }

  if (isPlacedEditorActive()) {
    debugShapeSelection("editor canvas click blocked", {
      clientX: event.clientX,
      clientY: event.clientY,
      activeTool: game.activeTool
    });
    consumeCanvasInteraction(event);
    scheduleEditorInteractionReset(event);
    return;
  }

  if (isCubicToolActive() && cubicState.placed) {
    if (shouldSuppressCubicSegmentClick()) {
      debugShapeSelection("cubic canvas click suppressed after drag", {
        clientX: event.clientX,
        clientY: event.clientY
      });
      consumeCanvasInteraction(event);
      scheduleEditorInteractionReset(event);
      return;
    }

    const edit = getCubicSegmentEditFromEvent(event);
    debugShapeSelection("cubic canvas click", {
      clientX: event.clientX,
      clientY: event.clientY,
      altKey: !!event.altKey,
      edit
    });
    if (!edit) return;

    consumeCanvasInteraction(event);
    commitCubicSegmentEdit(edit, event);
    return;
  }

  if (isEllipseToolActive() && ellipseState.placed) {
    if (shouldSuppressEllipseSegmentClick()) {
      debugShapeSelection("ellipse canvas click suppressed after drag", {
        clientX: event.clientX,
        clientY: event.clientY
      });
      consumeCanvasInteraction(event);
      scheduleEditorInteractionReset(event);
      return;
    }

    const edit = getEllipseSegmentEditFromEvent(event);
    debugShapeSelection("ellipse canvas click", {
      clientX: event.clientX,
      clientY: event.clientY,
      altKey: !!event.altKey,
      edit
    });
    if (!edit) return;

    consumeCanvasInteraction(event);
    commitEllipseSegmentEdit(edit, event);
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

  consumeCanvasInteraction(event);
  commitRectangleSideEdit(edit, event);
}

function handlePolylineCanvasDoubleClick(event) {
  if (Number.isFinite(event.button) && event.button !== 0) return;
  if (!isPolylineToolActive() || !polylineState.drawing) return;

  const snapshot = getEditorSnapshot(polylineState);
  const close = shouldClosePolylineAtEvent(event);
  debugShapeSelection("polyline canvas double click finish drawing", {
    clientX: event.clientX,
    clientY: event.clientY,
    pointCount: polylineState.points.length,
    close
  });
  consumeCanvasInteraction(event);
  if (close) closePolyline();
  polylineState.drawing = false;
  polylineState.previewPoint = null;
  drawPolylinePreview();
  pushEditorUndoSnapshot(polylineState, snapshot);
  scheduleEditorInteractionReset(event);
}

function shouldClosePolylineAtEvent(event) {
  if (polylineState.points.length < 3) return false;
  const point = getClientInteractionPoint(event);
  return isPolylineClosePoint(point) || isPolylineClosePoint(polylineState.points.at(-1));
}

function isPolylineClosePoint(point) {
  const first = polylineState.points[0];
  if (!first || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return false;
  return Math.hypot(first.x - point.x, first.y - point.y) <= getPolylineVertexHitRadius();
}

function closePolyline() {
  if (polylineState.points.length < 3) return false;
  if (isPolylineClosePoint(polylineState.points.at(-1))) polylineState.points.pop();
  if (polylineState.points.length < 3) return false;
  polylineState.closed = true;
  polylineState.segmentGaps = reconcilePolylineSegmentGaps(polylineState.segmentGaps, getPolylineSegmentCount());
  return true;
}

function getActiveCanvasSegmentEdit(event) {
  if (isCubicToolActive() && cubicState.placed && !isCubicSegmentClickSuppressed()) {
    const edit = getCubicSegmentEditFromEvent(event);
    if (edit) return {tool: "cubic", edit};
  }

  if (isEllipseToolActive() && ellipseState.placed && !isEllipseSegmentClickSuppressed()) {
    const edit = getEllipseSegmentEditFromEvent(event);
    if (edit) return {tool: "ellipse", edit};
  }

  if (isRectangleToolActive() && rectangleState.placed) {
    const edit = getRectangleSideEditFromEvent(event);
    if (edit) return {tool: "rectangle", edit};
  }

  if (isPolylineToolActive() && polylineState.placed) {
    const edit = getPolylineSegmentEditFromEvent(event);
    if (edit) return {tool: "polyline", edit};
  }

  return null;
}

function isPendingCanvasSegmentEditEvent(event) {
  return !!canvasSegmentEditState.edit
    && (canvasSegmentEditState.pointerId === null || canvasSegmentEditState.pointerId === event.pointerId);
}

function consumePendingCanvasSegmentEdit(event) {
  if (!canvasSegmentEditState.edit) return null;
  if (canvasSegmentEditState.cancelledByMove) {
    clearPendingCanvasSegmentEdit();
    return null;
  }
  if (canvasSegmentEditState.clientX !== null && canvasSegmentEditState.clientY !== null) {
    const distance = Math.hypot(event.clientX - canvasSegmentEditState.clientX, event.clientY - canvasSegmentEditState.clientY);
    if (distance > 8) {
      clearPendingCanvasSegmentEdit();
      return null;
    }
  }

  const pending = {
    tool: canvasSegmentEditState.tool,
    edit: canvasSegmentEditState.edit
  };
  clearPendingCanvasSegmentEdit();
  return pending;
}

function clearPendingCanvasSegmentEdit() {
  canvasSegmentEditState.tool = null;
  canvasSegmentEditState.edit = null;
  canvasSegmentEditState.pointerId = null;
  canvasSegmentEditState.clientX = null;
  canvasSegmentEditState.clientY = null;
  canvasSegmentEditState.cancelledByMove = false;
}

function shouldIgnoreCanvasSegmentClick() {
  if (Date.now() >= canvasSegmentEditState.ignoreClickUntil) return false;
  canvasSegmentEditState.ignoreClickUntil = 0;
  return true;
}

function commitCanvasSegmentEdit(tool, edit, event=null) {
  if (tool === "cubic") return commitCubicSegmentEdit(edit, event);
  if (tool === "ellipse") return commitEllipseSegmentEdit(edit, event);
  if (tool === "rectangle") return commitRectangleSideEdit(edit, event);
  if (tool === "polyline") return commitPolylineSegmentEdit(edit, event);
  return false;
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

function loadShapeFromCanvasPointerUp(event) {
  for (const point of getCanvasClickCandidatePoints(event)) {
    const scan = getIndyWallAtPoint(point, "canvas pointerup");
    if (!scan?.wall || !loadShapeFromExistingWall(scan.wall)) continue;

    debugShapeSelection("canvas pointerup loaded shape", {
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

function getCubicSegmentEditFromEvent(event) {
  if (!isCubicToolActive() || !cubicState.placed) return null;
  for (const point of getCanvasClickCandidatePoints(event)) {
    const segment = getCubicSegmentAt({x: point.x, y: point.y});
    if (!segment) continue;
    return {
      point: {x: point.x, y: point.y},
      segment,
      remove: isAltInteraction(event)
    };
  }
  return null;
}

function getEllipseSegmentEditFromEvent(event) {
  if (!isEllipseToolActive() || !ellipseState.placed) return null;
  for (const point of getCanvasClickCandidatePoints(event)) {
    const segment = getEllipseSegmentAt({x: point.x, y: point.y});
    if (!segment) continue;
    return {
      point: {x: point.x, y: point.y},
      segment,
      remove: isAltInteraction(event)
    };
  }
  return null;
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
  scheduleEditorInteractionReset(event);
  return true;
}

function commitCubicSegmentEdit(edit, event=null) {
  if (!isCubicToolActive() || !cubicState.placed) return false;
  debugInteractionManagers("before cubic canvas click commit", event, {edit});
  if (!editCubicSegmentWithUndo(edit.segment.index, edit.remove)) return false;

  cubicState.draggingHandle = null;
  cubicState.lastSegmentEditAction = Date.now();
  cubicState.suppressNextSegmentEditClick = false;
  debugInteractionManagers("after cubic canvas click commit", event, {edit});
  scheduleEditorInteractionReset(event);
  return true;
}

function markSuppressCubicSegmentClick() {
  cubicState.lastSegmentEditAction = Date.now();
  cubicState.suppressNextSegmentEditClick = true;
}

function shouldSuppressCubicSegmentClick() {
  const suppressed = isCubicSegmentClickSuppressed();
  cubicState.suppressNextSegmentEditClick = false;
  return suppressed;
}

function isCubicSegmentClickSuppressed() {
  if (!cubicState.suppressNextSegmentEditClick) return false;
  return (Date.now() - cubicState.lastSegmentEditAction) < 1000;
}

function commitEllipseSegmentEdit(edit, event=null) {
  if (!isEllipseToolActive() || !ellipseState.placed) return false;
  debugInteractionManagers("before ellipse canvas click commit", event, {edit});
  if (!editEllipseSegmentWithUndo(edit.segment.index, edit.remove)) return false;

  ellipseState.draggingHandle = null;
  ellipseState.draggingVertex = null;
  ellipseState.lastSegmentEditAction = Date.now();
  ellipseState.suppressNextSegmentEditClick = false;
  debugInteractionManagers("after ellipse canvas click commit", event, {edit});
  scheduleEditorInteractionReset(event);
  return true;
}

function markSuppressEllipseSegmentClick() {
  ellipseState.lastSegmentEditAction = Date.now();
  ellipseState.suppressNextSegmentEditClick = true;
}

function shouldSuppressEllipseSegmentClick() {
  const suppressed = isEllipseSegmentClickSuppressed();
  ellipseState.suppressNextSegmentEditClick = false;
  return suppressed;
}

function isEllipseSegmentClickSuppressed() {
  if (!ellipseState.suppressNextSegmentEditClick) return false;
  return (Date.now() - ellipseState.lastSegmentEditAction) < 1000;
}

function registerEditorDomDragHandler() {
  const view = canvas?.app?.view;
  if (!view || editorDomDragViews.has(view)) return;

  view.addEventListener("pointerdown", handleEditorDomPointerDown, {capture: true});
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
  debugShapeSelection("editor DOM pointerdown", {
    target: event.target?.tagName,
    button: event.button,
    activeTool: game.activeTool,
    cubic: isCubicToolActive(),
    ellipse: isEllipseToolActive(),
    rectangle: isRectangleToolActive(),
    polyline: isPolylineToolActive(),
    placed: getActiveEditorState()?.placed ?? null
  });
  if (!isCanvasDomEvent(event) || event.button !== 0) return;
  const controlInteraction = isControlInteraction(event);
  const hit = getEditorDomDragHit(event);
  if (!hit) {
    debugShapeSelection("editor DOM pointerdown no hit", {
      activeTool: game.activeTool,
      candidates: getCanvasClickPointCandidates(event)
    });
    if (isAnyEditorToolActive()) {
      consumeCanvasInteraction(event);
      scheduleEditorInteractionReset(event);
    }
    return;
  }
  if (controlInteraction && !hit.initialPlacement) {
    debugShapeSelection("editor DOM pointerdown ignored control edit hit", {hit});
    return;
  }

  debugInteractionManagers("editor DOM drag start", event, hit);
  consumeCanvasInteraction(event);
  resetEditorCursor(event);
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
    scheduleEditorInteractionReset(event);
    return;
  }

  if (hit.tool === POLYLINE_TOOL && hit.vertex && event.altKey) {
    const snapshot = getEditorSnapshot(polylineState);
    const removed = removePolylineVertex(hit.vertex.index);
    if (removed) pushEditorUndoSnapshot(polylineState, snapshot);
    polylineState.draggingVertex = null;
    polylineState.hoveredVertex = null;
    scheduleEditorInteractionReset(event);
    return;
  }

  const state = getActiveEditorState();
  beginEditorOperation(state, !!hit.initialPlacement);
  editorDomDragState.active = true;
  editorDomDragState.tool = hit.tool;
  editorDomDragState.handle = hit.handle;
  editorDomDragState.vertex = hit.vertex;
  editorDomDragState.move = !!hit.move;
  editorDomDragState.coordinateLabel = hit.coordinateLabel;
  editorDomDragState.pointerCoordinateLabel = hit.pointerCoordinateLabel;
  editorDomDragState.pointerOffset = hit.pointerOffset;
  editorDomDragState.startPointerPoint = hit.startPointerPoint;
  editorDomDragState.startEditorPoint = hit.startEditorPoint;
  editorDomDragState.initialPlacement = !!hit.initialPlacement;
  editorDomDragState.controlInteraction = controlInteraction;
  editorDomDragState.pointerId = event.pointerId;
  editorDomDragState.view = canvas?.app?.view ?? null;

  if (hit.move) {
    cubicState.draggingHandle = null;
    ellipseState.draggingHandle = null;
    ellipseState.draggingVertex = null;
    rectangleState.draggingHandle = null;
    rectangleState.draggingVertex = null;
    polylineState.draggingVertex = null;
  }
  else if (hit.tool === CUBIC_TOOL) {
    if (hit.initialPlacement) initializeCubicDomPlacement(hit.editorPoint);
    else {
      cubicState.draggingHandle = hit.handle;
      markSuppressCubicSegmentClick();
    }
  }
  else if (hit.tool === ELLIPSE_TOOL) {
    if (hit.initialPlacement) initializeEllipseDomPlacement(hit.editorPoint);
    else {
      ellipseState.draggingHandle = hit.handle;
      ellipseState.draggingVertex = hit.vertex;
      if (hit.vertex) markSuppressEllipseSegmentClick();
    }
  }
  else if (hit.tool === POLYLINE_TOOL) {
    polylineState.draggingVertex = hit.vertex;
  }
  else if (hit.handle !== null) {
    if (hit.initialPlacement) initializeRectangleDomPlacement(hit.editorPoint);
    else {
      rectangleState.draggingHandle = hit.handle;
      rectangleState.draggingVertex = null;
    }
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
    move: editorDomDragState.move,
    coordinateLabel: editorDomDragState.coordinateLabel,
    pointerCoordinateLabel: editorDomDragState.pointerCoordinateLabel,
    pointerOffset: editorDomDragState.pointerOffset,
    startPointerPoint: editorDomDragState.startPointerPoint,
    startEditorPoint: editorDomDragState.startEditorPoint,
    point
  });

  if (editorDomDragState.move) {
    moveEditorShapeToCenter(editorDomDragState.tool, point);
    drawEditorPreview(editorDomDragState.tool);
  } else if (editorDomDragState.tool === CUBIC_TOOL) {
    setHandle(editorDomDragState.handle, point);
    if (cubicState.initializing && editorDomDragState.handle === 3) initializeCubicControls();
    cubicState.placed = true;
    drawCubicPreview();
  } else if (editorDomDragState.tool === ELLIPSE_TOOL) {
    if (editorDomDragState.vertex) {
      setEllipseRotationFromVertex(editorDomDragState.vertex, point);
    } else {
      setEllipseResizeHandle(editorDomDragState.handle, point, event);
    }
    if (ellipseState.initializing) updateEllipseInitialHandles(event);
    ellipseState.placed = true;
    drawEllipsePreview();
  } else if (editorDomDragState.tool === POLYLINE_TOOL && editorDomDragState.vertex) {
    setPolylineVertex(editorDomDragState.vertex.index, point);
    polylineState.previewPoint = null;
    drawPolylinePreview();
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
    vertex: editorDomDragState.vertex,
    move: editorDomDragState.move,
    initialPlacement: editorDomDragState.initialPlacement,
    controlInteraction: editorDomDragState.controlInteraction
  });

  const controlClickSelect = !cancelled
    && editorDomDragState.initialPlacement
    && editorDomDragState.controlInteraction
    && getEditorDomDragDistance(event) <= 6;

  if (controlClickSelect) {
    const tool = editorDomDragState.tool;
    cancelEditorOperation(getEditorStateForTool(tool));
    clearEditorPreviewForTool(tool);
    const loaded = loadShapeFromCanvasPointerUp(event);
    if (loaded) canvasSegmentEditState.ignoreClickUntil = Date.now() + 500;
    debugShapeSelection("editor DOM control click selection", {tool, loaded});
  } else if (editorDomDragState.tool === CUBIC_TOOL) {
    cubicState.draggingHandle = null;
    cubicState.initializing = false;
    if (cancelled) cancelEditorOperation(cubicState);
    else commitEditorOperation(cubicState);
    markSuppressCubicSegmentClick();
    drawCubicPreview();
  } else if (editorDomDragState.tool === ELLIPSE_TOOL) {
    const wasVertexDrag = !!editorDomDragState.vertex;
    ellipseState.draggingHandle = null;
    ellipseState.draggingVertex = null;
    ellipseState.initializing = false;
    ellipseState.initialOrigin = null;
    if (cancelled) cancelEditorOperation(ellipseState);
    else commitEditorOperation(ellipseState);
    if (wasVertexDrag) markSuppressEllipseSegmentClick();
    drawEllipsePreview();
  } else if (editorDomDragState.tool === RECTANGLE_TOOL) {
    rectangleState.draggingHandle = null;
    rectangleState.draggingVertex = null;
    rectangleState.hoveredVertex = null;
    rectangleState.initializing = false;
    if (cancelled) cancelEditorOperation(rectangleState);
    else commitEditorOperation(rectangleState);
    drawRectanglePreview();
  } else if (editorDomDragState.tool === POLYLINE_TOOL) {
    polylineState.draggingVertex = null;
    polylineState.hoveredVertex = null;
    if (cancelled) cancelEditorOperation(polylineState);
    else commitEditorOperation(polylineState);
    canvasSegmentEditState.ignoreClickUntil = Date.now() + 500;
    drawPolylinePreview();
  }

  editorDomDragState.active = false;
  editorDomDragState.tool = null;
  editorDomDragState.handle = null;
  editorDomDragState.vertex = null;
  editorDomDragState.move = false;
  editorDomDragState.coordinateLabel = null;
  editorDomDragState.pointerCoordinateLabel = null;
  editorDomDragState.pointerOffset = null;
  editorDomDragState.startPointerPoint = null;
  editorDomDragState.startEditorPoint = null;
  editorDomDragState.initialPlacement = false;
  editorDomDragState.controlInteraction = false;
  editorDomDragState.pointerId = null;
  editorDomDragState.view = null;
  scheduleEditorInteractionReset(event);
}

function getEditorDomDragDistance(event=null) {
  const start = editorDomDragState.startPointerPoint;
  if (!start || !event) return 0;
  const current = getCanvasClickPointCandidates(event)
    .find(({label}) => label === editorDomDragState.coordinateLabel)?.point
    ?? getCanvasClickPointCandidates(event)[0]?.point;
  if (!current) return 0;
  return Math.hypot(current.x - start.x, current.y - start.y);
}

function clearEditorPreviewForTool(tool) {
  if (tool === CUBIC_TOOL) clearCubicPreview();
  else if (tool === ELLIPSE_TOOL) clearEllipsePreview();
  else if (tool === RECTANGLE_TOOL) clearRectanglePreview();
  else if (tool === POLYLINE_TOOL) clearPolylinePreview();
}

function getEditorDomDragHit(event) {
  const initialHit = getEditorDomInitialPlacementHit(event);
  if (initialHit) return initialHit;

  if (isCubicToolActive() && cubicState.placed) {
    for (const {label, point} of getCanvasClickPointCandidates(event)) {
      const movePoint = getEditorMoveHandleAt(CUBIC_TOOL, point);
      if (movePoint) return withDomPointerDragData(event, {
        tool: CUBIC_TOOL,
        handle: null,
        vertex: null,
        move: true,
        coordinateLabel: label,
        hitPoint: point,
        editorPoint: movePoint
      });
      const handle = getCubicHandleAt(point);
      if (handle !== null) return withDomPointerDragData(event, {
        tool: CUBIC_TOOL,
        handle,
        vertex: null,
        move: false,
        coordinateLabel: label,
        hitPoint: point,
        editorPoint: cubicState.handles[handle]
      });
    }
    return null;
  }

  if (isEllipseToolActive() && ellipseState.placed) {
    for (const {label, point} of getCanvasClickPointCandidates(event)) {
      const movePoint = getEditorMoveHandleAt(ELLIPSE_TOOL, point);
      if (movePoint) return withDomPointerDragData(event, {
        tool: ELLIPSE_TOOL,
        handle: null,
        vertex: null,
        move: true,
        coordinateLabel: label,
        hitPoint: point,
        editorPoint: movePoint
      });
      const handle = getEllipseHandleAt(point);
      if (handle !== null) return withDomPointerDragData(event, {
        tool: ELLIPSE_TOOL,
        handle,
        vertex: null,
        move: false,
        coordinateLabel: label,
        hitPoint: point,
        editorPoint: ellipseState.handles[handle]
      });
      const vertex = getEllipseVertexAt(point);
      if (vertex) return withDomPointerDragData(event, {
        tool: ELLIPSE_TOOL,
        handle: null,
        vertex,
        move: false,
        coordinateLabel: label,
        hitPoint: point,
        editorPoint: vertex.point
      });
    }
    return null;
  }

  if (isPolylineToolActive() && polylineState.placed) {
    for (const {label, point} of getCanvasClickPointCandidates(event)) {
      const movePoint = getEditorMoveHandleAt(POLYLINE_TOOL, point);
      if (movePoint) return withDomPointerDragData(event, {
        tool: POLYLINE_TOOL,
        handle: null,
        vertex: null,
        move: true,
        coordinateLabel: label,
        hitPoint: point,
        editorPoint: movePoint
      });
      const vertex = getPolylineVertexAt(point);
      if (vertex) return withDomPointerDragData(event, {
        tool: POLYLINE_TOOL,
        handle: null,
        vertex,
        move: false,
        coordinateLabel: label,
        hitPoint: point,
        editorPoint: vertex.point
      });
    }
    return null;
  }

  if (!isRectangleToolActive() || !rectangleState.placed) return null;
  for (const {label, point} of getCanvasClickPointCandidates(event)) {
    const movePoint = getEditorMoveHandleAt(RECTANGLE_TOOL, point);
    if (movePoint) return withDomPointerDragData(event, {
      tool: RECTANGLE_TOOL,
      handle: null,
      vertex: null,
      move: true,
      coordinateLabel: label,
      hitPoint: point,
      editorPoint: movePoint
    });
    const handle = getRectangleHandleAt(point);
    if (handle !== null) return withDomPointerDragData(event, {
      tool: RECTANGLE_TOOL,
      handle,
      vertex: null,
      move: false,
      coordinateLabel: label,
      hitPoint: point,
      editorPoint: rectangleState.handles[handle]
    });
    const vertex = getRectangleVertexAt(point);
    if (vertex) return withDomPointerDragData(event, {
      tool: RECTANGLE_TOOL,
      handle: null,
      vertex,
      move: false,
      coordinateLabel: label,
      hitPoint: point,
      editorPoint: vertex.point
    });
  }
  return null;
}

function getEditorDomInitialPlacementHit(event) {
  if (!isCubicToolActive() && !isEllipseToolActive() && !isRectangleToolActive()) return null;
  if (isCubicToolActive() && cubicState.placed) return null;
  if (isEllipseToolActive() && ellipseState.placed) return null;
  if (isRectangleToolActive() && rectangleState.placed) return null;

  const candidate = getCanvasClickPointCandidates(event)[0];
  if (!candidate?.point) return null;

  if (isCubicToolActive()) return withDomPointerDragData(event, {
    tool: CUBIC_TOOL,
    handle: 3,
    vertex: null,
    move: false,
    initialPlacement: true,
    coordinateLabel: candidate.label,
    hitPoint: candidate.point,
    editorPoint: candidate.point
  });

  if (isEllipseToolActive()) return withDomPointerDragData(event, {
    tool: ELLIPSE_TOOL,
    handle: 1,
    vertex: null,
    move: false,
    initialPlacement: true,
    coordinateLabel: candidate.label,
    hitPoint: candidate.point,
    editorPoint: candidate.point
  });

  return withDomPointerDragData(event, {
    tool: RECTANGLE_TOOL,
    handle: 1,
    vertex: null,
    move: false,
    initialPlacement: true,
    coordinateLabel: candidate.label,
    hitPoint: candidate.point,
    editorPoint: candidate.point
  });
}

function initializeCubicDomPlacement(point) {
  cubicState.placed = false;
  cubicState.initializing = true;
  cubicState.draggingHandle = 3;
  cubicState.curveId = null;
  cubicState.wallIds = [];
  cubicState.wallTypeBySegment = {};
  cubicState.segmentGaps = [];
  setHandle(0, point);
  setHandle(1, point);
  setHandle(2, point);
  setHandle(3, point);
  drawCubicPreview();
}

function initializeEllipseDomPlacement(point) {
  ellipseState.placed = false;
  ellipseState.initializing = true;
  ellipseState.initialOrigin = point;
  ellipseState.draggingHandle = 1;
  ellipseState.draggingVertex = null;
  ellipseState.ellipseId = null;
  ellipseState.wallIds = [];
  ellipseState.wallTypeBySegment = {};
  ellipseState.rotation = 0;
  ellipseState.segmentGaps = [];
  setEllipseHandle(0, point);
  setEllipseHandle(1, point);
  drawEllipsePreview();
}

function initializeRectangleDomPlacement(point) {
  rectangleState.placed = false;
  rectangleState.initializing = true;
  rectangleState.draggingHandle = 1;
  rectangleState.draggingVertex = null;
  rectangleState.hoveredVertex = null;
  rectangleState.rectangleId = null;
  rectangleState.wallIds = [];
  rectangleState.wallTypeBySegment = {};
  rectangleState.sideRatios = getDefaultRectangleSideRatios();
  rectangleState.sideEnabled = getDefaultRectangleSideEnabled();
  rectangleState.sideGaps = getDefaultRectangleSideGaps();
  setRectangleHandle(0, point);
  setRectangleHandle(1, point);
  drawRectanglePreview();
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
  return isCubicToolActive() || isEllipseToolActive() || isRectangleToolActive() || isPolylineToolActive();
}

function isPlacedEditorActive() {
  return (isCubicToolActive() && cubicState.placed)
    || (isEllipseToolActive() && ellipseState.placed)
    || (isRectangleToolActive() && rectangleState.placed)
    || (isPolylineToolActive() && polylineState.placed);
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
      ellipseDraggingVertex: ellipseState.draggingVertex,
      rectangleDraggingHandle: rectangleState.draggingHandle,
      rectangleDraggingVertex: rectangleState.draggingVertex,
      polylineDraggingVertex: polylineState.draggingVertex
    });
    finalizeActiveEditorDrag(event, cancelled);
  }, 0);
}

function hasActiveEditorDrag() {
  return cubicState.draggingHandle !== null
    || ellipseState.draggingHandle !== null
    || !!ellipseState.draggingVertex
    || rectangleState.draggingHandle !== null
    || !!rectangleState.draggingVertex
    || !!polylineState.draggingVertex;
}

function finalizeActiveEditorDrag(event=null, cancelled=false) {
  if (isEllipseToolActive() && (ellipseState.draggingHandle !== null || ellipseState.draggingVertex)) {
    ellipseState.draggingHandle = null;
    ellipseState.draggingVertex = null;
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
  } else if (isPolylineToolActive() && polylineState.draggingVertex) {
    polylineState.draggingVertex = null;
    polylineState.hoveredVertex = null;
    if (cancelled) cancelEditorOperation(polylineState);
    else commitEditorOperation(polylineState);
    canvasSegmentEditState.ignoreClickUntil = Date.now() + 500;
    drawPolylinePreview();
  }

  scheduleEditorInteractionReset(event);
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
    || wallDocument?.getFlag(MODULE_ID, RECTANGLE_FLAG)
    || wallDocument?.getFlag(MODULE_ID, POLYLINE_FLAG));
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
  const polylineData = wall.document.getFlag(MODULE_ID, POLYLINE_FLAG);
  debugShapeSelection("loadShapeFromExistingWall flags", {
    wallId: wall.document.id,
    hasCubic: !!cubicData,
    hasEllipse: !!ellipseData,
    hasRectangle: !!rectangleData,
    hasPolyline: !!polylineData
  });
  if (!cubicData && !ellipseData && !rectangleData && !polylineData) return false;

  clearCubicPreview();
  clearEllipsePreview();
  clearRectanglePreview();
  clearPolylinePreview();

  shapeLoadState.allowControlWallLoad = true;
  try {
    if (rectangleData) loadRectangleFromWall(wall);
    else if (ellipseData) loadEllipseFromWall(wall);
    else if (polylineData) loadPolylineFromWall(wall);
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

function dropHiddenEditWalls(wallIds=[]) {
  for (const id of wallIds) hiddenEditWalls.delete(id);
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

function resetEditorCursor(event=null) {
  clearMouseInteractionManagerDragState(event, {includeCanvas: false});
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

function scheduleEditorInteractionReset(event=null) {
  debugInteractionManagers("schedule editor interaction reset start", event);
  resetEditorCursor(event);
  debugInteractionManagers("after immediate editor interaction reset", event);
  globalThis.queueMicrotask?.(() => {
    resetEditorCursor(event);
    debugInteractionManagers("after microtask editor interaction reset", event);
  });
  setTimeout(() => {
    resetEditorCursor(event);
    debugInteractionManagers("after timeout 0 editor interaction reset", event);
  }, 0);
}

function clearMouseInteractionManagerDragState(event=null, {includeCanvas=true}={}) {
  for (const {label, manager} of getCanvasInteractionManagers(event)) {
    if (!includeCanvas && label === "canvas") continue;
    manager.cursor = null;
    manager._dragging = false;
    manager.dragging = false;
    manager._dragLeft = false;
    manager._dragRight = false;
    manager._dragged = false;
    manager._pendingDrag = false;
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
    if (!getActiveEditorState()?.placed || !event.ctrlKey || isPolylineToolActive()) return;

    event.preventDefault();
    event.stopPropagation();
    changeActiveSegments(event.deltaY < 0 ? 1 : -1);
  }, {capture: true, passive: false});

  window.addEventListener("keydown", (event) => {
    if (!game.user.isGM || isEditableTarget(event.target)) return;
    if (!isAnyEditorToolActive() && !copiedEditorShape) return;

    const key = event.key.toLowerCase();
    if (event.ctrlKey && !event.shiftKey && key === "z") {
      event.preventDefault();
      event.stopPropagation();
      undoActiveEditor();
      return;
    }

    if (event.ctrlKey && key === "c") {
      event.preventDefault();
      event.stopPropagation();
      copyActiveEditorShape();
      return;
    }

    if (event.ctrlKey && key === "v") {
      event.preventDefault();
      event.stopPropagation();
      pasteCopiedEditorShape();
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
      polylineState.active = false;
      canvas.walls.activate({tool: "select"});
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      event.stopPropagation();
      deleteActiveEditorWalls();
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

function isPolylineToolActive() {
  return game.user.isGM && game.activeTool === POLYLINE_TOOL && polylineState.active;
}

function getActiveEditorState() {
  if (isCubicToolActive()) return cubicState;
  if (isEllipseToolActive()) return ellipseState;
  if (isRectangleToolActive()) return rectangleState;
  if (isPolylineToolActive()) return polylineState;
  return null;
}

function getActiveEditorTool() {
  if (isCubicToolActive()) return CUBIC_TOOL;
  if (isEllipseToolActive()) return ELLIPSE_TOOL;
  if (isRectangleToolActive()) return RECTANGLE_TOOL;
  if (isPolylineToolActive()) return POLYLINE_TOOL;
  return null;
}

function getEditorStateForTool(tool) {
  if (tool === CUBIC_TOOL) return cubicState;
  if (tool === ELLIPSE_TOOL) return ellipseState;
  if (tool === RECTANGLE_TOOL) return rectangleState;
  if (tool === POLYLINE_TOOL) return polylineState;
  return null;
}

function copyActiveEditorShape() {
  const tool = getActiveEditorTool();
  const state = getActiveEditorState();
  if (!tool || !state?.placed) return;

  copiedEditorShape = {
    tool,
    snapshot: getEditorSnapshot(state),
    pasteCount: 0
  };
  debugShapeSelection("copied editor shape", {tool});
}

function pasteCopiedEditorShape() {
  if (!copiedEditorShape?.snapshot) return;

  const {tool} = copiedEditorShape;
  const snapshot = JSON.parse(JSON.stringify(copiedEditorShape.snapshot));
  copiedEditorShape.pasteCount += 1;

  clearCubicPreview();
  clearEllipsePreview();
  clearRectanglePreview();
  clearPolylinePreview();
  cubicState.active = tool === CUBIC_TOOL;
  ellipseState.active = tool === ELLIPSE_TOOL;
  rectangleState.active = tool === RECTANGLE_TOOL;
  polylineState.active = tool === POLYLINE_TOOL;
  canvas.walls.activate({tool});

  const state = getEditorStateForTool(tool);
  restoreEditorSnapshot(state, snapshot);
  state.wallIds = [];
  if (tool === CUBIC_TOOL) state.curveId = null;
  else if (tool === ELLIPSE_TOOL) state.ellipseId = null;
  else if (tool === RECTANGLE_TOOL) state.rectangleId = null;
  else if (tool === POLYLINE_TOOL) state.polylineId = null;

  const pastePoint = getLastCanvasPointerPoint();
  const center = getEditorShapeCenter(tool);
  const offset = pastePoint && center
    ? {x: pastePoint.x - center.x, y: pastePoint.y - center.y}
    : getCopyPasteOffset(copiedEditorShape.pasteCount);
  translateEditorShape(tool, offset.x, offset.y);
  clearEditorHistory(state);
  drawEditorPreview(tool);
  debugShapeSelection("pasted editor shape", {tool, offset, pastePoint});
}

function getCopyPasteOffset(count) {
  const amount = getScaledRadius(48) * Math.max(count, 1);
  return {x: amount, y: amount};
}

function getLastCanvasPointerPoint() {
  const point = lastCanvasPointerState.point;
  return Number.isFinite(point?.x) && Number.isFinite(point?.y)
    ? {x: point.x, y: point.y}
    : null;
}

function changeActiveSegments(delta) {
  const state = getActiveEditorState();
  const snapshot = state?.placed ? getEditorSnapshot(state) : null;

  if (isCubicToolActive()) changeCubicSegments(delta);
  else if (isEllipseToolActive()) changeEllipseSegments(delta);
  else if (isRectangleToolActive()) changeRectangleSegments(delta);

  if (snapshot) pushEditorUndoSnapshot(state, snapshot);
}

function changeHoveredSegmentWallType(toolName) {
  if (!WALL_TYPE_DATA[toolName] || isEditableTarget(document.activeElement)) return false;

  const state = getActiveEditorState();
  if (!state?.placed) return false;

  const point = getLastCanvasPointerPoint();
  if (!point) return false;

  const segment = getHoveredEditorSegment(point);
  if (!segment) return false;

  const key = getSegmentKey(segment);
  if (state.wallTypeBySegment?.[key] === toolName) return true;

  const snapshot = getEditorSnapshot(state);
  state.wallTypeBySegment = {
    ...state.wallTypeBySegment,
    [key]: toolName
  };
  pushEditorUndoSnapshot(state, snapshot);
  drawEditorPreview(getActiveEditorTool());
  debugShapeSelection("changed hovered segment wall type", {
    toolName,
    segment,
    key,
    point
  });
  return true;
}

function getHoveredEditorSegment(point) {
  if (isCubicToolActive()) return getCubicSegmentAt(point);
  if (isEllipseToolActive()) return getEllipseSegmentAt(point);
  if (isPolylineToolActive()) return getPolylineSegmentAt(point);
  if (isRectangleToolActive()) {
    const side = getRectangleSideAt(point);
    if (!side) return null;
    return {
      side: side.side,
      index: getRectangleSegmentIndexAt(side.side, side.ratio)
    };
  }
  return null;
}

function applyActiveWalls() {
  if (isCubicToolActive()) applyCubicWalls();
  else if (isEllipseToolActive()) applyEllipseWalls();
  else if (isRectangleToolActive()) applyRectangleWalls();
  else if (isPolylineToolActive()) applyPolylineWalls();
}

function clearActivePreview() {
  if (isCubicToolActive()) clearCubicPreview();
  else if (isEllipseToolActive()) clearEllipsePreview();
  else if (isRectangleToolActive()) clearRectanglePreview();
  else if (isPolylineToolActive()) clearPolylinePreview();
}

async function deleteActiveEditorWalls() {
  const state = getActiveEditorState();
  if (!state?.placed) return;

  const wallIds = getExistingActiveEditorWallIds();
  if (!wallIds.length) {
    clearActivePreview();
    return;
  }

  const oldWalls = wallIds.map((id) => canvas.scene.walls.get(id)).filter(Boolean);
  const replacingWallIds = state.replacingWallIds;
  wallIds.forEach((id) => replacingWallIds.add(id));
  canvas.walls.storeHistory("delete", oldWalls.map((wall) => wall.toObject()));
  dropHiddenEditWalls(wallIds);
  try {
    await canvas.scene.deleteEmbeddedDocuments("Wall", wallIds);
  } finally {
    wallIds.forEach((id) => replacingWallIds.delete(id));
  }

  clearActivePreview();
  cubicState.active = false;
  ellipseState.active = false;
  rectangleState.active = false;
  polylineState.active = false;
  canvas.walls.activate({tool: "select"});
}

function getExistingActiveEditorWallIds() {
  if (isCubicToolActive()) return getExistingCurveWallIds();
  if (isEllipseToolActive()) return getExistingEllipseWallIds();
  if (isRectangleToolActive()) return getExistingRectangleWallIds();
  if (isPolylineToolActive()) return getExistingPolylineWallIds();
  return [];
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
  for (const id of [CUBIC_EDIT_BUTTONS_ID, ELLIPSE_EDIT_BUTTONS_ID, RECTANGLE_EDIT_BUTTONS_ID, POLYLINE_EDIT_BUTTONS_ID]) {
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
      segmentGaps: [...cubicState.segmentGaps],
      wallTypeBySegment: cloneWallTypeBySegment(cubicState.wallTypeBySegment),
      wallTypeTool: cubicState.wallTypeTool
    };
  }

  if (state === ellipseState) {
    return {
      placed: ellipseState.placed,
      handles: clonePoints(ellipseState.handles),
      segments: ellipseState.segments,
      rotation: ellipseState.rotation,
      segmentGaps: [...ellipseState.segmentGaps],
      wallTypeBySegment: cloneWallTypeBySegment(ellipseState.wallTypeBySegment),
      wallTypeTool: ellipseState.wallTypeTool
    };
  }

  if (state === polylineState) {
    return {
      placed: polylineState.placed,
      drawing: polylineState.drawing,
      closed: polylineState.closed,
      points: clonePoints(polylineState.points),
      segmentGaps: [...polylineState.segmentGaps],
      wallTypeBySegment: cloneWallTypeBySegment(polylineState.wallTypeBySegment),
      wallTypeTool: polylineState.wallTypeTool
    };
  }

  return {
    placed: rectangleState.placed,
    handles: clonePoints(rectangleState.handles),
    sideSegments: {...rectangleState.sideSegments},
    sideRatios: cloneRectangleSideRatios(rectangleState.sideRatios),
    sideEnabled: cloneRectangleSideEnabled(rectangleState.sideEnabled),
    sideGaps: cloneRectangleSideGaps(rectangleState.sideGaps),
    wallTypeBySegment: cloneWallTypeBySegment(rectangleState.wallTypeBySegment),
    wallTypeTool: rectangleState.wallTypeTool
  };
}

function restoreEditorSnapshot(state, snapshot) {
  if (state === cubicState) {
    cubicState.placed = snapshot.placed;
    cubicState.handles = clonePoints(snapshot.handles);
    cubicState.segments = snapshot.segments;
    cubicState.segmentGaps = reconcileCubicSegmentGaps(snapshot.segmentGaps, cubicState.segments);
    cubicState.wallTypeBySegment = cloneWallTypeBySegment(snapshot.wallTypeBySegment);
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
    ellipseState.rotation = Number(snapshot.rotation) || 0;
    ellipseState.segmentGaps = reconcileEllipseSegmentGaps(snapshot.segmentGaps, ellipseState.segments);
    ellipseState.wallTypeBySegment = cloneWallTypeBySegment(snapshot.wallTypeBySegment);
    ellipseState.wallTypeTool = snapshot.wallTypeTool;
    ellipseState.draggingHandle = null;
    ellipseState.draggingVertex = null;
    ellipseState.initializing = false;
    ellipseState.initialOrigin = null;
    drawEllipsePreview();
    return;
  }

  if (state === polylineState) {
    polylineState.placed = snapshot.placed;
    polylineState.drawing = !!snapshot.drawing;
    polylineState.closed = !!snapshot.closed;
    polylineState.points = clonePoints(snapshot.points ?? []);
    polylineState.segmentGaps = reconcilePolylineSegmentGaps(snapshot.segmentGaps, getPolylineSegmentCount());
    polylineState.wallTypeBySegment = cloneWallTypeBySegment(snapshot.wallTypeBySegment);
    polylineState.wallTypeTool = snapshot.wallTypeTool;
    polylineState.draggingVertex = null;
    polylineState.hoveredVertex = null;
    polylineState.previewPoint = null;
    drawPolylinePreview();
    return;
  }

  rectangleState.placed = snapshot.placed;
  rectangleState.handles = clonePoints(snapshot.handles);
  rectangleState.sideSegments = {...snapshot.sideSegments};
  rectangleState.sideRatios = cloneRectangleSideRatios(snapshot.sideRatios);
  rectangleState.sideEnabled = cloneRectangleSideEnabled(snapshot.sideEnabled);
  rectangleState.sideGaps = cloneRectangleSideGaps(snapshot.sideGaps);
  rectangleState.wallTypeBySegment = cloneWallTypeBySegment(snapshot.wallTypeBySegment);
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

function cloneWallTypeBySegment(source={}) {
  return {...(source ?? {})};
}

function getSegmentWallData(state, key) {
  const tool = state?.wallTypeBySegment?.[key] ?? state?.wallTypeTool ?? "walls";
  return WALL_TYPE_DATA[tool]?.() ?? WALL_TYPE_DATA.walls();
}

function getSegmentWallType(state, segment) {
  return state?.wallTypeBySegment?.[getSegmentKey(segment)] ?? state?.wallTypeTool ?? "walls";
}

function getSegmentPreviewColor(state, segment, style=getPreviewStyle()) {
  const tool = getSegmentWallType(state, segment);
  return style.wallTypeColors?.[tool] ?? style.wallColor;
}

function getWallDocumentById(id) {
  return canvas?.scene?.walls?.get(id) ?? null;
}

function getShapeWallTypeByIndexedFlag(wallIds, flagName) {
  const result = {};
  for (const id of wallIds ?? []) {
    const wallDocument = getWallDocumentById(id);
    const data = wallDocument?.getFlag(MODULE_ID, flagName);
    const index = Number(data?.index);
    if (!Number.isInteger(index)) continue;
    const tool = getWallTypeToolFromDocument(wallDocument) ?? data.wallTypeTool;
    if (tool) result[String(index)] = tool;
  }
  return result;
}

function getRectangleWallTypeBySegment(wallIds) {
  const result = {};
  const segments = getRectangleSegments();
  for (const id of wallIds ?? []) {
    const wallDocument = getWallDocumentById(id);
    const data = wallDocument?.getFlag(MODULE_ID, RECTANGLE_FLAG);
    const explicitKey = data?.side && Number.isInteger(Number(data?.segmentIndex))
      ? getRectangleSegmentKey({side: data.side, index: Number(data.segmentIndex)})
      : null;
    const key = explicitKey ?? getSegmentKeyFromWallCoordinates(segments, wallDocument?.c);
    if (!key) continue;
    const tool = getWallTypeToolFromDocument(wallDocument) ?? data?.wallTypeTool;
    if (tool) result[key] = tool;
  }
  return result;
}

function getSegmentKeyFromWallCoordinates(segments, coords) {
  if (!Array.isArray(coords) || coords.length < 4) return null;
  const target = coords.map((value) => Math.round(Number(value) || 0));
  for (const segment of segments) {
    const c = [
      Math.round(segment.a.x),
      Math.round(segment.a.y),
      Math.round(segment.b.x),
      Math.round(segment.b.y)
    ];
    const matchesForward = c.every((value, index) => value === target[index]);
    const matchesReverse = c[0] === target[2] && c[1] === target[3] && c[2] === target[0] && c[3] === target[1];
    if (matchesForward || matchesReverse) return getSegmentKey(segment);
  }
  return null;
}

function redrawActivePreview() {
  if (cubicState.placed) drawCubicPreview();
  if (ellipseState.placed) drawEllipsePreview();
  if (rectangleState.placed) drawRectanglePreview();
  if (polylineState.placed) drawPolylinePreview();
}

function getPreviewStyle() {
  const outlineWidth = getStyleNumber(STYLE_SETTINGS.outlineWidth, 2, 0, 8);
  const outlineColor = getStyleColor(STYLE_SETTINGS.outlineColor, 0x111111);
  return {
    wallColor: getStyleColor(STYLE_SETTINGS.wallColor, 0xc10e56),
    wallTypeColors: {
      windows: getStyleColor(STYLE_SETTINGS.windowWallColor, 0xb784a7),
      doors: getStyleColor(STYLE_SETTINGS.doorWallColor, 0x123c69),
      secret: getStyleColor(STYLE_SETTINGS.secretWallColor, 0x7a3db8),
      invisible: getStyleColor(STYLE_SETTINGS.invisibleWallColor, 0x8ecae6),
      terrain: getStyleColor(STYLE_SETTINGS.terrainWallColor, 0x3f9b4f)
    },
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

function drawMoveHandle(graphics, point, style=getPreviewStyle()) {
  drawHandle(graphics, point, style.vertexActiveColor, {
    radius: Math.max(style.handleSize * 0.75, style.splitVertexSize),
    outlineColor: style.outlineColor,
    outlineWidth: style.outlineWidth
  });
}

function getEditorMoveHandleAt(tool, point) {
  const center = getEditorShapeCenter(tool);
  if (!center) return null;
  const style = getPreviewStyle();
  const radius = getScaledRadius(Math.max(style.handleSize * 0.75, style.splitVertexSize) + (style.outlineWidth / 2));
  return Math.hypot(center.x - point.x, center.y - point.y) <= radius ? center : null;
}

function getEditorShapeCenter(tool) {
  if (tool === RECTANGLE_TOOL && rectangleState.placed) {
    const [a, b] = rectangleState.handles;
    return {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
  }
  if (tool === ELLIPSE_TOOL && ellipseState.placed) {
    const {cx, cy} = getEllipseGeometry();
    return {x: cx, y: cy};
  }
  if (tool === CUBIC_TOOL && cubicState.placed) {
    return getPointsCenter(getCubicPoints(cubicState.segments));
  }
  if (tool === POLYLINE_TOOL && polylineState.placed) {
    return getPointsCenter(polylineState.points);
  }
  return null;
}

function getPointsCenter(points) {
  if (!points.length) return null;
  const bounds = points.reduce((result, point) => ({
    minX: Math.min(result.minX, point.x),
    minY: Math.min(result.minY, point.y),
    maxX: Math.max(result.maxX, point.x),
    maxY: Math.max(result.maxY, point.y)
  }), {
    minX: points[0].x,
    minY: points[0].y,
    maxX: points[0].x,
    maxY: points[0].y
  });
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2
  };
}

function moveEditorShapeToCenter(tool, point) {
  const center = getEditorShapeCenter(tool);
  if (!center) return;
  translateEditorShape(tool, point.x - center.x, point.y - center.y);
}

function translateEditorShape(tool, dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (!dx && !dy)) return;
  if (tool === CUBIC_TOOL) cubicState.handles = translatePoints(cubicState.handles, dx, dy);
  else if (tool === ELLIPSE_TOOL) ellipseState.handles = translatePoints(ellipseState.handles, dx, dy);
  else if (tool === RECTANGLE_TOOL) rectangleState.handles = translatePoints(rectangleState.handles, dx, dy);
  else if (tool === POLYLINE_TOOL) polylineState.points = translatePoints(polylineState.points, dx, dy);
}

function translatePoints(points, dx, dy) {
  return points.map((point) => ({x: point.x + dx, y: point.y + dy}));
}

function drawEditorPreview(tool) {
  if (tool === CUBIC_TOOL) drawCubicPreview();
  else if (tool === ELLIPSE_TOOL) drawEllipsePreview();
  else if (tool === RECTANGLE_TOOL) drawRectanglePreview();
  else if (tool === POLYLINE_TOOL) drawPolylinePreview();
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
  cubicState.segmentGaps = reconcileCubicSegmentGaps(cubicState.segmentGaps, cubicState.segments);
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
  const segments = getCubicSegments();
  const allSegments = getAllCubicSegments();
  const gaps = getCubicSegmentGaps();
  for (const segment of segments) {
    const {a, b} = segment;
    graphics.lineStyle(getScaledRadius(style.wallWidth), getSegmentPreviewColor(cubicState, segment, style), 0.9);
    graphics.moveTo(a.x, a.y);
    graphics.lineTo(b.x, b.y);
  }

  for (const segment of allSegments) {
    if (!gaps.includes(segment.index)) continue;
    graphics.lineStyle(
      getScaledRadius(Math.max(style.guideWidth, 1)),
      getSegmentPreviewColor(cubicState, segment, style),
      0.22
    );
    graphics.moveTo(segment.a.x, segment.a.y);
    graphics.lineTo(segment.b.x, segment.b.y);
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
  drawMoveHandle(graphics, getEditorShapeCenter(CUBIC_TOOL), style);
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

function getAllCubicSegments() {
  const points = getCubicPoints(cubicState.segments);
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push({index: i, a: points[i], b: points[i + 1]});
  }
  return segments;
}

function getCubicSegments() {
  const gaps = getCubicSegmentGaps();
  return getAllCubicSegments().filter((segment) => !gaps.includes(segment.index));
}

function getCubicSegmentGaps() {
  const gaps = reconcileCubicSegmentGaps(cubicState.segmentGaps, cubicState.segments);
  cubicState.segmentGaps = gaps;
  return gaps;
}

function reconcileCubicSegmentGaps(source, segmentCount) {
  if (!Array.isArray(source)) return [];
  return [...new Set(source
    .map((index) => Number(index))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < segmentCount))]
    .sort((a, b) => a - b);
}

function getCubicSegmentAt(point) {
  if (!cubicState.placed) return null;
  const style = getPreviewStyle();
  const tolerance = getScaledRadius(Math.max(style.wallWidth + 6, 10));
  let best = null;
  let bestDistance = Infinity;

  for (const segment of getAllCubicSegments()) {
    if (!isPointNearSegmentBounds(point, segment.a, segment.b, tolerance)) continue;
    const distance = getPointSegmentDistance(point, segment.a, segment.b);
    if (distance <= tolerance && distance < bestDistance) {
      best = segment;
      bestDistance = distance;
    }
  }

  return best;
}

function editCubicSegmentWithUndo(index, remove=false) {
  const snapshot = getEditorSnapshot(cubicState);
  const edited = editCubicSegment(index, remove);
  if (edited) pushEditorUndoSnapshot(cubicState, snapshot);
  return edited;
}

function editCubicSegment(index, remove=false) {
  const gaps = getCubicSegmentGaps();
  if (remove) {
    if (gaps.includes(index)) return false;
    cubicState.segmentGaps = [...gaps, index].sort((a, b) => a - b);
    drawCubicPreview();
    return true;
  }

  if (!gaps.includes(index)) return false;
  cubicState.segmentGaps = gaps.filter((gap) => gap !== index);
  drawCubicPreview();
  return true;
}

function setEllipseHandle(index, point) {
  ellipseState.handles[index] = {x: point.x, y: point.y};
}

function setEllipseResizeHandle(index, point, event=null) {
  if (!isAltInteraction(event)) {
    setEllipseHandle(index, point);
    return;
  }

  const oppositeIndex = index === 0 ? 1 : 0;
  const opposite = ellipseState.handles[oppositeIndex];
  const dx = point.x - opposite.x;
  const dy = point.y - opposite.y;
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  setEllipseHandle(index, {
    x: opposite.x + Math.sign(dx || 1) * size,
    y: opposite.y + Math.sign(dy || 1) * size
  });
}

function getEllipseHandleAt(point) {
  if (!ellipseState.placed) return null;
  const style = getPreviewStyle();
  const index = getHandleIndexAt(ellipseState.handles, point, style.endpointSize, style.outlineWidth);
  return index < 0 ? null : index;
}

function getEllipseVertexAt(point) {
  if (!ellipseState.placed) return null;
  const radius = getEllipseVertexHitRadius();
  for (const vertex of getEllipseVertices()) {
    if (Math.hypot(vertex.point.x - point.x, vertex.point.y - point.y) <= radius) {
      return vertex;
    }
  }
  return null;
}

function getEllipseVertexHitRadius() {
  const style = getPreviewStyle();
  return getSplitVertexHitRadius(style);
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
  ellipseState.segmentGaps = reconcileEllipseSegmentGaps(ellipseState.segmentGaps, ellipseState.segments);
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
  const segments = getEllipseSegments();
  const allSegments = getAllEllipseSegments();
  const gaps = getEllipseSegmentGaps();
  for (const segment of segments) {
    const {a, b} = segment;
    graphics.lineStyle(getScaledRadius(style.wallWidth), getSegmentPreviewColor(ellipseState, segment, style), 0.9);
    graphics.moveTo(a.x, a.y);
    graphics.lineTo(b.x, b.y);
  }

  for (const segment of allSegments) {
    if (!gaps.includes(segment.index)) continue;
    graphics.lineStyle(
      getScaledRadius(Math.max(style.guideWidth, 1)),
      getSegmentPreviewColor(ellipseState, segment, style),
      0.22
    );
    graphics.moveTo(segment.a.x, segment.a.y);
    graphics.lineTo(segment.b.x, segment.b.y);
  }

  const [a, b] = ellipseState.handles;
  graphics.lineStyle(getScaledRadius(style.guideWidth), style.wallColor, 0.45);
  graphics.drawRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));

  for (const vertex of getEllipseVertices()) {
    drawEllipseSplitVertex(graphics, vertex, style);
  }
  drawEndpoint(graphics, a, style);
  drawEndpoint(graphics, b, style);
  drawMoveHandle(graphics, getEditorShapeCenter(ELLIPSE_TOOL), style);
}

function getEllipsePoints(segments) {
  const {cx, cy, rx, ry} = getEllipseGeometry();
  const rotation = Number(ellipseState.rotation) || 0;
  const cosRotation = Math.cos(rotation);
  const sinRotation = Math.sin(rotation);
  const points = [];

  for (let i = 0; i <= segments; i++) {
    const angle = (Math.PI * 2 * i) / segments;
    const x = Math.cos(angle) * rx;
    const y = Math.sin(angle) * ry;
    points.push({
      x: cx + (x * cosRotation) - (y * sinRotation),
      y: cy + (x * sinRotation) + (y * cosRotation)
    });
  }

  return points;
}

function getEllipseGeometry() {
  const [a, b] = ellipseState.handles;
  return {
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2,
    rx: Math.abs(b.x - a.x) / 2,
    ry: Math.abs(b.y - a.y) / 2
  };
}

function getEllipseVertices() {
  return getEllipsePoints(ellipseState.segments)
    .slice(0, -1)
    .map((point, index) => ({index, point}));
}

function getAllEllipseSegments() {
  const points = getEllipsePoints(ellipseState.segments);
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push({index: i, a: points[i], b: points[i + 1]});
  }
  return segments;
}

function getEllipseSegments() {
  const gaps = getEllipseSegmentGaps();
  return getAllEllipseSegments().filter((segment) => !gaps.includes(segment.index));
}

function getEllipseSegmentGaps() {
  const gaps = reconcileEllipseSegmentGaps(ellipseState.segmentGaps, ellipseState.segments);
  ellipseState.segmentGaps = gaps;
  return gaps;
}

function reconcileEllipseSegmentGaps(source, segmentCount) {
  if (!Array.isArray(source)) return [];
  return [...new Set(source
    .map((index) => Number(index))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < segmentCount))]
    .sort((a, b) => a - b);
}

function getEllipseSegmentAt(point) {
  if (!ellipseState.placed) return null;
  const style = getPreviewStyle();
  const tolerance = getScaledRadius(Math.max(style.wallWidth + 6, 10));
  let best = null;
  let bestDistance = Infinity;

  for (const segment of getAllEllipseSegments()) {
    if (!isPointNearSegmentBounds(point, segment.a, segment.b, tolerance)) continue;
    const distance = getPointSegmentDistance(point, segment.a, segment.b);
    if (distance <= tolerance && distance < bestDistance) {
      best = segment;
      bestDistance = distance;
    }
  }

  return best;
}

function editEllipseSegmentWithUndo(index, remove=false) {
  const snapshot = getEditorSnapshot(ellipseState);
  const edited = editEllipseSegment(index, remove);
  if (edited) pushEditorUndoSnapshot(ellipseState, snapshot);
  return edited;
}

function editEllipseSegment(index, remove=false) {
  const gaps = getEllipseSegmentGaps();
  if (remove) {
    if (gaps.includes(index)) return false;
    ellipseState.segmentGaps = [...gaps, index].sort((a, b) => a - b);
    drawEllipsePreview();
    return true;
  }

  if (!gaps.includes(index)) return false;
  ellipseState.segmentGaps = gaps.filter((gap) => gap !== index);
  drawEllipsePreview();
  return true;
}

function setEllipseRotationFromVertex(vertex, point) {
  if (!vertex || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
  const {cx, cy, rx, ry} = getEllipseGeometry();
  const pointerAngle = Math.atan2(point.y - cy, point.x - cx);
  const vertexAngle = (Math.PI * 2 * vertex.index) / ellipseState.segments;
  const baseAngle = Math.atan2(Math.sin(vertexAngle) * ry, Math.cos(vertexAngle) * rx);
  ellipseState.rotation = normalizeAngle(pointerAngle - baseAngle);
}

function normalizeAngle(angle) {
  const fullTurn = Math.PI * 2;
  return ((angle % fullTurn) + fullTurn) % fullTurn;
}

function drawEllipseSplitVertex(graphics, vertex, style) {
  const radius = getScaledRadius(style.splitVertexSize);
  const highlighted = ellipseState.draggingVertex?.index === vertex.index;
  graphics.beginFill(highlighted ? style.vertexActiveColor : style.vertexColor, 0.98);
  graphics.lineStyle(
    getScaledRadius(style.outlineWidth),
    highlighted ? style.outlineColor : style.wallColor,
    0.95
  );
  graphics.drawCircle(vertex.point.x, vertex.point.y, radius);
  graphics.endFill();
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
  for (const segment of segments) {
    const {a, b} = segment;
    graphics.lineStyle(getScaledRadius(style.wallWidth), getSegmentPreviewColor(rectangleState, segment, style), 0.9);
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
  drawMoveHandle(graphics, getEditorShapeCenter(RECTANGLE_TOOL), style);
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
  scheduleEditorInteractionReset(event);
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
      const color = getSegmentPreviewColor(rectangleState, segment, style);
      graphics.lineStyle(
        getScaledRadius(missing ? Math.max(style.guideWidth, 1) : style.guideWidth),
        color,
        missing ? 0.22 : 0.45
      );
      graphics.moveTo(segment.a.x, segment.a.y);
      graphics.lineTo(segment.b.x, segment.b.y);
    }
  }
}

function getRectangleVertexHitRadius() {
  const style = getPreviewStyle();
  return getSplitVertexHitRadius(style);
}

function getSplitVertexHitRadius(style=getPreviewStyle()) {
  return getScaledRadius(style.splitVertexSize + (style.outlineWidth / 2));
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

function getSegmentKey(segment) {
  return segment.side ? getRectangleSegmentKey(segment) : String(segment.index);
}

function getRectangleSegmentKey(segment) {
  return `${segment.side}:${segment.index}`;
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

function handlePolylineCanvasClick(event) {
  const point = getClientInteractionPoint(event);
  if (!point) return false;

  const snapshot = getEditorSnapshot(polylineState);
  if (!polylineState.placed) {
    polylineState.placed = true;
    polylineState.drawing = true;
    polylineState.polylineId = null;
    polylineState.wallIds = [];
    polylineState.wallTypeBySegment = {};
    polylineState.segmentGaps = [];
    polylineState.closed = false;
    polylineState.points = [point];
    polylineState.previewPoint = point;
    clearEditorHistory(polylineState);
    drawPolylinePreview();
    return true;
  }

  if (!polylineState.drawing) return false;
  if (polylineState.points.length >= 3 && isPolylineClosePoint(point)) {
    polylineState.previewPoint = polylineState.points[0];
    drawPolylinePreview();
    return true;
  }

  const last = polylineState.points.at(-1);
  const minDistance = getScaledRadius(Math.max(getPreviewStyle().vertexSize, 4));
  if (!last || Math.hypot(last.x - point.x, last.y - point.y) > minDistance) {
    polylineState.points = [...polylineState.points, point];
    polylineState.segmentGaps = reconcilePolylineSegmentGaps(polylineState.segmentGaps, getPolylineSegmentCount());
    pushEditorUndoSnapshot(polylineState, snapshot);
  }
  polylineState.previewPoint = point;
  drawPolylinePreview();
  return true;
}

function drawPolylinePreview() {
  const layer = canvas?.walls;
  if (!layer) return;

  if (!polylineState.graphics || polylineState.graphics._destroyed) {
    polylineState.graphics = new PIXI.Graphics();
    layer.preview.addChild(polylineState.graphics);
  } else if (!polylineState.graphics.parent) {
    layer.preview.addChild(polylineState.graphics);
  }

  const graphics = polylineState.graphics;
  graphics.clear();
  setPolylineEditingState(polylineState.placed);
  if (!polylineState.placed) return;

  const style = getPreviewStyle();
  const segments = getPolylineSegments();
  const allSegments = getAllPolylineSegments();
  const gaps = getPolylineSegmentGaps();
  for (const segment of segments) {
    graphics.lineStyle(getScaledRadius(style.wallWidth), getSegmentPreviewColor(polylineState, segment, style), 0.9);
    graphics.moveTo(segment.a.x, segment.a.y);
    graphics.lineTo(segment.b.x, segment.b.y);
  }

  for (const segment of allSegments) {
    if (!gaps.includes(segment.index)) continue;
    graphics.lineStyle(
      getScaledRadius(Math.max(style.guideWidth, 1)),
      getSegmentPreviewColor(polylineState, segment, style),
      0.22
    );
    graphics.moveTo(segment.a.x, segment.a.y);
    graphics.lineTo(segment.b.x, segment.b.y);
  }

  const last = polylineState.points.at(-1);
  const preview = polylineState.previewPoint;
  if (polylineState.drawing && last && preview && Math.hypot(last.x - preview.x, last.y - preview.y) > 0.1) {
    const previewSegment = {index: getPolylineSegmentCount(), a: last, b: preview};
    graphics.lineStyle(getScaledRadius(style.wallWidth), getSegmentPreviewColor(polylineState, previewSegment, style), 0.55);
    graphics.moveTo(last.x, last.y);
    graphics.lineTo(preview.x, preview.y);
    drawPreviewVertex(graphics, preview, style);
  }

  for (const vertex of getPolylineVertices()) {
    drawPolylineVertex(graphics, vertex, style);
  }
  if (polylineState.points.length > 1) drawMoveHandle(graphics, getEditorShapeCenter(POLYLINE_TOOL), style);
}

function getPolylineVertices() {
  return polylineState.points.map((point, index) => ({index, point}));
}

function getPolylineVertexAt(point) {
  if (!polylineState.placed) return null;
  const radius = getPolylineVertexHitRadius();
  for (const vertex of getPolylineVertices()) {
    if (Math.hypot(vertex.point.x - point.x, vertex.point.y - point.y) <= radius) {
      return vertex;
    }
  }
  return null;
}

function getPolylineVertexHitRadius() {
  return getSplitVertexHitRadius(getPreviewStyle());
}

function setPolylineVertex(index, point) {
  if (!Number.isInteger(index) || !polylineState.points[index]) return;
  polylineState.points[index] = {x: point.x, y: point.y};
}

function drawPolylineVertex(graphics, vertex, style) {
  const radius = getScaledRadius(style.splitVertexSize);
  const highlighted = polylineState.draggingVertex?.index === vertex.index || polylineState.hoveredVertex?.index === vertex.index;
  graphics.beginFill(highlighted ? style.vertexActiveColor : style.vertexColor, 0.98);
  graphics.lineStyle(
    getScaledRadius(style.outlineWidth),
    highlighted ? style.outlineColor : style.wallColor,
    0.95
  );
  graphics.drawCircle(vertex.point.x, vertex.point.y, radius);
  graphics.endFill();
}

function getPolylineSegmentCount() {
  if (polylineState.closed && polylineState.points.length > 2) return polylineState.points.length;
  return Math.max(polylineState.points.length - 1, 0);
}

function getAllPolylineSegments() {
  const segments = [];
  for (let i = 0; i < polylineState.points.length - 1; i++) {
    segments.push({index: i, a: polylineState.points[i], b: polylineState.points[i + 1]});
  }
  if (polylineState.closed && polylineState.points.length > 2) {
    segments.push({
      index: polylineState.points.length - 1,
      a: polylineState.points.at(-1),
      b: polylineState.points[0]
    });
  }
  return segments;
}

function getPolylineSegments() {
  const gaps = getPolylineSegmentGaps();
  return getAllPolylineSegments().filter((segment) => !gaps.includes(segment.index));
}

function getPolylineSegmentGaps() {
  const gaps = reconcilePolylineSegmentGaps(polylineState.segmentGaps, getPolylineSegmentCount());
  polylineState.segmentGaps = gaps;
  return gaps;
}

function reconcilePolylineSegmentGaps(source, segmentCount) {
  if (!Array.isArray(source)) return [];
  return [...new Set(source
    .map((index) => Number(index))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < segmentCount))]
    .sort((a, b) => a - b);
}

function getPolylineSegmentAt(point) {
  if (!polylineState.placed) return null;
  const style = getPreviewStyle();
  const tolerance = getScaledRadius(Math.max(style.wallWidth + 6, 10));
  let best = null;
  let bestDistance = Infinity;

  for (const segment of getAllPolylineSegments()) {
    if (!isPointNearSegmentBounds(point, segment.a, segment.b, tolerance)) continue;
    const distance = getPointSegmentDistance(point, segment.a, segment.b);
    if (distance <= tolerance && distance < bestDistance) {
      best = segment;
      bestDistance = distance;
    }
  }

  return best;
}

function getPolylineSegmentEditFromEvent(event) {
  const point = getClientInteractionPoint(event);
  const segment = point ? getPolylineSegmentAt(point) : null;
  if (!segment) return null;
  return {
    index: segment.index,
    point,
    remove: event.altKey
  };
}

function commitPolylineSegmentEdit(edit, event=null) {
  if (!edit) return false;
  const edited = editPolylineSegmentWithUndo(edit.index, edit.remove, edit.point);
  if (edited) {
    debugShapeSelection("polyline segment edit", {
      index: edit.index,
      remove: edit.remove,
      eventType: event?.type
    });
    scheduleEditorInteractionReset(event);
  }
  return edited;
}

function editPolylineSegmentWithUndo(index, remove=false, point=null) {
  const snapshot = getEditorSnapshot(polylineState);
  const edited = editPolylineSegment(index, remove, point);
  if (edited) pushEditorUndoSnapshot(polylineState, snapshot);
  return edited;
}

function editPolylineSegment(index, remove=false, point=null) {
  const gaps = getPolylineSegmentGaps();
  if (remove) {
    if (gaps.includes(index)) return false;
    polylineState.segmentGaps = [...gaps, index].sort((a, b) => a - b);
    drawPolylinePreview();
    return true;
  }

  if (gaps.includes(index)) {
    polylineState.segmentGaps = gaps.filter((gap) => gap !== index);
    drawPolylinePreview();
    return true;
  }

  return addPolylineVertexAtSegment(index, point);
}

function addPolylineVertexAtSegment(index, point) {
  if (!Number.isInteger(index) || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return false;
  if (index < 0 || index >= getPolylineSegmentCount()) return false;

  const segment = getAllPolylineSegments()[index];
  if (!segment) return false;
  const minDistance = getScaledRadius(Math.max(getPreviewStyle().vertexSize, 4));
  if (Math.hypot(segment.a.x - point.x, segment.a.y - point.y) <= minDistance) return false;
  if (Math.hypot(segment.b.x - point.x, segment.b.y - point.y) <= minDistance) return false;

  const insertIndex = polylineState.closed && index === polylineState.points.length - 1
    ? polylineState.points.length
    : index + 1;
  polylineState.points.splice(insertIndex, 0, {x: point.x, y: point.y});
  polylineState.segmentGaps = shiftPolylineGapsForInsert(polylineState.segmentGaps, index);
  polylineState.wallTypeBySegment = shiftPolylineWallTypesForInsert(polylineState.wallTypeBySegment, index);
  polylineState.previewPoint = null;
  drawPolylinePreview();
  return true;
}

function removePolylineVertex(index) {
  if (!Number.isInteger(index) || !polylineState.points[index]) return false;
  if (polylineState.points.length <= (polylineState.closed ? 3 : 2)) return false;

  const pointCountBefore = polylineState.points.length;
  const closed = polylineState.closed;
  polylineState.points.splice(index, 1);
  polylineState.segmentGaps = shiftPolylineGapsForRemove(polylineState.segmentGaps, index, pointCountBefore, closed);
  polylineState.wallTypeBySegment = shiftPolylineWallTypesForRemove(polylineState.wallTypeBySegment, index, pointCountBefore, closed);
  polylineState.previewPoint = null;
  drawPolylinePreview();
  return true;
}

function shiftPolylineGapsForInsert(source, splitIndex) {
  return [...new Set((source ?? []).map((gap) => {
    const index = Number(gap);
    if (!Number.isInteger(index)) return null;
    return index > splitIndex ? index + 1 : index;
  }).filter((index) => index !== null))]
    .sort((a, b) => a - b);
}

function shiftPolylineGapsForRemove(source, vertexIndex, pointCountBefore, closed=false) {
  if (closed) return shiftClosedPolylineGapsForRemove(source, vertexIndex, pointCountBefore);

  const result = new Set();
  const segmentCountBefore = Math.max(pointCountBefore - 1, 0);
  const segmentCountAfter = Math.max(pointCountBefore - 2, 0);
  for (const gap of source ?? []) {
    const index = Number(gap);
    if (!Number.isInteger(index)) continue;
    if (vertexIndex === 0) {
      if (index > 0) result.add(index - 1);
    } else if (vertexIndex === pointCountBefore - 1) {
      if (index < segmentCountBefore - 1) result.add(index);
    } else if (index === vertexIndex || index === vertexIndex - 1) {
      result.add(vertexIndex - 1);
    } else if (index > vertexIndex) {
      result.add(index - 1);
    } else {
      result.add(index);
    }
  }
  return [...result].filter((index) => index >= 0 && index < segmentCountAfter).sort((a, b) => a - b);
}

function shiftClosedPolylineGapsForRemove(source, vertexIndex, pointCountBefore) {
  const result = new Set();
  const segmentCountAfter = Math.max(pointCountBefore - 1, 0);
  const previousSegment = vertexIndex === 0 ? pointCountBefore - 1 : vertexIndex - 1;
  const nextSegment = vertexIndex;
  const mergedSegment = vertexIndex === 0 ? segmentCountAfter - 1 : vertexIndex - 1;

  for (const gap of source ?? []) {
    const index = Number(gap);
    if (!Number.isInteger(index)) continue;
    if (index === previousSegment || index === nextSegment) {
      result.add(mergedSegment);
    } else if (index > vertexIndex) {
      result.add(index - 1);
    } else {
      result.add(index);
    }
  }
  return [...result].filter((index) => index >= 0 && index < segmentCountAfter).sort((a, b) => a - b);
}

function shiftPolylineWallTypesForInsert(source={}, splitIndex) {
  const result = {};
  const splitKey = String(splitIndex);
  const splitType = source?.[splitKey];
  for (const [key, value] of Object.entries(source ?? {})) {
    const index = Number(key);
    if (!Number.isInteger(index)) continue;
    result[String(index > splitIndex ? index + 1 : index)] = value;
  }
  if (splitType) result[String(splitIndex + 1)] = splitType;
  return result;
}

function shiftPolylineWallTypesForRemove(source={}, vertexIndex, pointCountBefore, closed=false) {
  if (closed) return shiftClosedPolylineWallTypesForRemove(source, vertexIndex, pointCountBefore);

  const result = {};
  const segmentCountBefore = Math.max(pointCountBefore - 1, 0);
  const segmentCountAfter = Math.max(pointCountBefore - 2, 0);
  const previousType = source?.[String(vertexIndex - 1)];
  const nextType = source?.[String(vertexIndex)];
  for (const [key, value] of Object.entries(source ?? {})) {
    const index = Number(key);
    if (!Number.isInteger(index)) continue;
    if (vertexIndex === 0) {
      if (index > 0) result[String(index - 1)] = value;
    } else if (vertexIndex === pointCountBefore - 1) {
      if (index < segmentCountBefore - 1) result[String(index)] = value;
    } else if (index === vertexIndex || index === vertexIndex - 1) {
      continue;
    } else {
      result[String(index > vertexIndex ? index - 1 : index)] = value;
    }
  }
  const mergedType = previousType ?? nextType;
  if (mergedType && vertexIndex > 0 && vertexIndex < pointCountBefore - 1) result[String(vertexIndex - 1)] = mergedType;
  return Object.fromEntries(Object.entries(result)
    .filter(([key]) => {
      const index = Number(key);
      return Number.isInteger(index) && index >= 0 && index < segmentCountAfter;
    }));
}

function shiftClosedPolylineWallTypesForRemove(source={}, vertexIndex, pointCountBefore) {
  const result = {};
  const segmentCountAfter = Math.max(pointCountBefore - 1, 0);
  const previousSegment = vertexIndex === 0 ? pointCountBefore - 1 : vertexIndex - 1;
  const nextSegment = vertexIndex;
  const mergedSegment = vertexIndex === 0 ? segmentCountAfter - 1 : vertexIndex - 1;
  const mergedType = source?.[String(previousSegment)] ?? source?.[String(nextSegment)];

  for (const [key, value] of Object.entries(source ?? {})) {
    const index = Number(key);
    if (!Number.isInteger(index)) continue;
    if (index === previousSegment || index === nextSegment) continue;
    result[String(index > vertexIndex ? index - 1 : index)] = value;
  }
  if (mergedType) result[String(mergedSegment)] = mergedType;
  return Object.fromEntries(Object.entries(result)
    .filter(([key]) => {
      const index = Number(key);
      return Number.isInteger(index) && index >= 0 && index < segmentCountAfter;
    }));
}

async function applyPolylineWalls() {
  if (!isPolylineToolActive() || !polylineState.placed || polylineState.points.length < 2) return;

  const segments = getPolylineSegments();
  const segmentGaps = getPolylineSegmentGaps();
  const polylineId = polylineState.polylineId ?? foundry.utils.randomID();
  const walls = [];
  const wallSegmentIndexes = [];

  for (const segment of segments) {
    const {a, b} = segment;
    const wallData = getSegmentWallData(polylineState, getSegmentKey(segment));
    const c = [Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y)];
    if ((c[0] === c[2]) && (c[1] === c[3])) continue;
    wallSegmentIndexes.push(segment.index);
    walls.push({
      ...wallData,
      c,
      flags: {
        [MODULE_ID]: {
          [POLYLINE_FLAG]: {
            polylineId,
            index: segment.index,
            wallIds: [],
            points: clonePoints(polylineState.points),
            closed: polylineState.closed,
            segmentGaps,
            wallTypeBySegment: cloneWallTypeBySegment(polylineState.wallTypeBySegment),
            wallTypeTool: polylineState.wallTypeTool
          }
        }
      }
    });
  }

  const oldWallIds = getExistingPolylineWallIds();
  const oldWalls = oldWallIds.map((id) => canvas.scene.walls.get(id)).filter(Boolean);
  if (!walls.length) {
    if (oldWallIds.length) {
      canvas.walls.storeHistory("delete", oldWalls.map((wall) => wall.toObject()));
      oldWallIds.forEach((id) => polylineState.replacingWallIds.add(id));
      try {
        await canvas.scene.deleteEmbeddedDocuments("Wall", oldWallIds);
      } finally {
        oldWallIds.forEach((id) => polylineState.replacingWallIds.delete(id));
      }
    }
    clearPolylinePreview();
    return;
  }

  const created = await canvas.scene.createEmbeddedDocuments("Wall", walls);
  const wallIds = created.map((wall) => wall.id);
  const flagUpdates = created.map((wall, index) => ({
    _id: wall.id,
    [`flags.${MODULE_ID}.${POLYLINE_FLAG}.index`]: wallSegmentIndexes[index] ?? index,
    [`flags.${MODULE_ID}.${POLYLINE_FLAG}.wallIds`]: wallIds
  }));
  await canvas.scene.updateEmbeddedDocuments("Wall", flagUpdates);

  if (oldWallIds.length) {
    canvas.walls.storeHistory("delete", oldWalls.map((wall) => wall.toObject()));
    oldWallIds.forEach((id) => polylineState.replacingWallIds.add(id));
    try {
      await canvas.scene.deleteEmbeddedDocuments("Wall", oldWallIds);
    } finally {
      oldWallIds.forEach((id) => polylineState.replacingWallIds.delete(id));
    }
  }

  canvas.walls.storeHistory("create", created.map((wall) => wall.toObject()));
  ui.notifications.info(game.i18n.format("indy-walls.Notifications.PolylineWallsCreated", {
    count: created.length
  }));
  clearPolylinePreview();
}

async function applyRectangleWalls() {
  if (!isRectangleToolActive() || !rectangleState.placed) return;

  const rectangleId = rectangleState.rectangleId ?? foundry.utils.randomID();
  const segments = getRectangleSegments();
  const walls = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const {a, b} = segment;
    const wallData = getSegmentWallData(rectangleState, getSegmentKey(segment));
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
            side: segment.side,
            segmentIndex: segment.index,
            wallIds: [],
            handles: clonePoints(rectangleState.handles),
            sideSegments: {...rectangleState.sideSegments},
            sideRatios: cloneRectangleSideRatios(rectangleState.sideRatios),
            sideEnabled: cloneRectangleSideEnabled(rectangleState.sideEnabled),
            sideGaps: cloneRectangleSideGaps(rectangleState.sideGaps),
            wallTypeBySegment: cloneWallTypeBySegment(rectangleState.wallTypeBySegment),
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

  const segments = getEllipseSegments();
  const segmentGaps = getEllipseSegmentGaps();
  const ellipseId = ellipseState.ellipseId ?? foundry.utils.randomID();
  const walls = [];
  const wallSegmentIndexes = [];

  for (const segment of segments) {
    const {a, b} = segment;
    const wallData = getSegmentWallData(ellipseState, getSegmentKey(segment));
    const c = [Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y)];
    if ((c[0] === c[2]) && (c[1] === c[3])) continue;
    wallSegmentIndexes.push(segment.index);
    walls.push({
      ...wallData,
      c,
      flags: {
        [MODULE_ID]: {
          [ELLIPSE_FLAG]: {
            ellipseId,
            index: segment.index,
            wallIds: [],
            handles: clonePoints(ellipseState.handles),
            segments: ellipseState.segments,
            rotation: ellipseState.rotation,
            segmentGaps,
            wallTypeBySegment: cloneWallTypeBySegment(ellipseState.wallTypeBySegment),
            wallTypeTool: ellipseState.wallTypeTool
          }
        }
      }
    });
  }

  const oldWallIds = getExistingEllipseWallIds();
  const oldWalls = oldWallIds.map((id) => canvas.scene.walls.get(id)).filter(Boolean);
  if (!walls.length) {
    if (oldWallIds.length) {
      canvas.walls.storeHistory("delete", oldWalls.map((wall) => wall.toObject()));
      oldWallIds.forEach((id) => ellipseState.replacingWallIds.add(id));
      try {
        await canvas.scene.deleteEmbeddedDocuments("Wall", oldWallIds);
      } finally {
        oldWallIds.forEach((id) => ellipseState.replacingWallIds.delete(id));
      }
    }
    clearEllipsePreview();
    return;
  }

  const created = await canvas.scene.createEmbeddedDocuments("Wall", walls);
  const wallIds = created.map((wall) => wall.id);
  const flagUpdates = created.map((wall, index) => ({
    _id: wall.id,
    [`flags.${MODULE_ID}.${ELLIPSE_FLAG}.index`]: wallSegmentIndexes[index] ?? index,
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

  const segments = getCubicSegments();
  const segmentGaps = getCubicSegmentGaps();
  const curveId = cubicState.curveId ?? foundry.utils.randomID();
  const walls = [];
  const wallSegmentIndexes = [];

  for (const segment of segments) {
    const {a, b} = segment;
    const wallData = getSegmentWallData(cubicState, getSegmentKey(segment));
    const c = [Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y)];
    if ((c[0] === c[2]) && (c[1] === c[3])) continue;
    wallSegmentIndexes.push(segment.index);
    walls.push({
      ...wallData,
      c,
      flags: {
        [MODULE_ID]: {
          [CUBIC_FLAG]: {
            curveId,
            index: segment.index,
            wallIds: [],
            handles: cloneHandles(),
            segments: cubicState.segments,
            segmentGaps,
            wallTypeBySegment: cloneWallTypeBySegment(cubicState.wallTypeBySegment),
            wallTypeTool: cubicState.wallTypeTool
          }
        }
      }
    });
  }

  const oldWallIds = getExistingCurveWallIds();
  const oldWalls = oldWallIds.map((id) => canvas.scene.walls.get(id)).filter(Boolean);
  if (!walls.length) {
    if (oldWallIds.length) {
      canvas.walls.storeHistory("delete", oldWalls.map((wall) => wall.toObject()));
      oldWallIds.forEach((id) => cubicState.replacingWallIds.add(id));
      try {
        await canvas.scene.deleteEmbeddedDocuments("Wall", oldWallIds);
      } finally {
        oldWallIds.forEach((id) => cubicState.replacingWallIds.delete(id));
      }
    }
    clearCubicPreview();
    return;
  }

  const created = await canvas.scene.createEmbeddedDocuments("Wall", walls);
  const wallIds = created.map((wall) => wall.id);
  const flagUpdates = created.map((wall, index) => ({
    _id: wall.id,
    [`flags.${MODULE_ID}.${CUBIC_FLAG}.index`]: wallSegmentIndexes[index] ?? index,
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
  cubicState.lastSegmentEditAction = 0;
  cubicState.suppressNextSegmentEditClick = false;
  cubicState.curveId = null;
  cubicState.wallIds = [];
  cubicState.wallTypeBySegment = {};
  cubicState.segmentGaps = [];
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
  ellipseState.draggingVertex = null;
  ellipseState.lastSegmentEditAction = 0;
  ellipseState.suppressNextSegmentEditClick = false;
  ellipseState.ellipseId = null;
  ellipseState.wallIds = [];
  ellipseState.wallTypeBySegment = {};
  ellipseState.rotation = 0;
  ellipseState.segmentGaps = [];
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
  rectangleState.wallTypeBySegment = {};
  rectangleState.sideRatios = getDefaultRectangleSideRatios();
  rectangleState.sideEnabled = getDefaultRectangleSideEnabled();
  rectangleState.sideGaps = getDefaultRectangleSideGaps();
  rectangleState.graphics?.destroy();
  rectangleState.graphics = null;
  setRectangleEditingState(false);
}

function clearPolylinePreview() {
  restoreEditSessionWalls();
  clearEditorHistory(polylineState);
  polylineState.placed = false;
  polylineState.drawing = false;
  polylineState.draggingVertex = null;
  polylineState.hoveredVertex = null;
  polylineState.polylineId = null;
  polylineState.wallIds = [];
  polylineState.wallTypeBySegment = {};
  polylineState.segmentGaps = [];
  polylineState.closed = false;
  polylineState.previewPoint = null;
  polylineState.points = [];
  polylineState.graphics?.destroy();
  polylineState.graphics = null;
  setPolylineEditingState(false);
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

function setPolylineEditingState(editing) {
  document.body?.classList.toggle("indy-walls-polyline-editing", editing);
  ensurePolylineEditButtons();
  setEditButtonsVisible(POLYLINE_EDIT_BUTTONS_ID, editing);
  updateEditButtonStates();
  if (editing) positionPolylineEditButtons();
}

function ensurePolylineEditButtons() {
  ensureEditButtons({
    id: POLYLINE_EDIT_BUTTONS_ID,
    buttons: [
      ["indy-walls.Controls.UndoEdit", "fa-solid fa-rotate-left", () => undoActiveEditor()],
      ["indy-walls.Controls.RedoEdit", "fa-solid fa-rotate-right", () => redoActiveEditor()],
      ["indy-walls.Controls.ApplyPolyline", "fa-solid fa-check", () => applyPolylineWalls()],
      ["indy-walls.Controls.CancelPolyline", "fa-solid fa-xmark", () => clearPolylinePreview()]
    ]
  });
}

function positionPolylineEditButtons() {
  positionEditButtons({id: POLYLINE_EDIT_BUTTONS_ID, toolName: POLYLINE_TOOL, fallbackTop: 240});
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

function cancelPolylineEditingForDeletedWall(wallDocument) {
  if (!polylineState.placed || !polylineState.polylineId) return;
  if (polylineState.replacingWallIds.has(wallDocument.id)) return;

  const polylineData = wallDocument.getFlag(MODULE_ID, POLYLINE_FLAG);
  const samePolyline = polylineData?.polylineId === polylineState.polylineId;
  const knownWall = polylineState.wallIds.includes(wallDocument.id);
  if (!samePolyline && !knownWall) return;

  clearPolylinePreview();
  if (game.activeTool === POLYLINE_TOOL) canvas.walls.activate({tool: "select"});
}

function loadCubicCurveFromWall(wall) {
  const cubicData = wall.document.getFlag(MODULE_ID, CUBIC_FLAG);
  if (!Array.isArray(cubicData?.handles) || cubicData.handles.length !== 4) return;

  cubicState.active = true;
  ellipseState.active = false;
  rectangleState.active = false;
  polylineState.active = false;
  clearEditorHistory(cubicState);
  cubicState.placed = true;
  cubicState.initializing = false;
  cubicState.draggingHandle = null;
  cubicState.lastSegmentEditAction = 0;
  cubicState.suppressNextSegmentEditClick = false;
  cubicState.curveId = cubicData.curveId ?? null;
  cubicState.wallIds = Array.isArray(cubicData.wallIds) ? [...cubicData.wallIds] : [wall.document.id];
  cubicState.wallTypeTool = getWallTypeToolFromDocument(wall.document) ?? cubicData.wallTypeTool ?? "walls";
  cubicState.segments = clamp(Number(cubicData.segments) || DEFAULT_CUBIC_SEGMENTS, 2, 64);
  cubicState.segmentGaps = reconcileCubicSegmentGaps(cubicData.segmentGaps, cubicState.segments);
  cubicState.handles = cubicData.handles.map((handle) => ({
    x: Number(handle.x) || 0,
    y: Number(handle.y) || 0
  }));
  cubicState.wallTypeBySegment = {
    ...cloneWallTypeBySegment(cubicData.wallTypeBySegment),
    ...getShapeWallTypeByIndexedFlag(cubicState.wallIds, CUBIC_FLAG)
  };

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
  polylineState.active = false;
  clearEditorHistory(ellipseState);
  ellipseState.placed = true;
  ellipseState.initializing = false;
  ellipseState.initialOrigin = null;
  ellipseState.draggingHandle = null;
  ellipseState.draggingVertex = null;
  ellipseState.lastSegmentEditAction = 0;
  ellipseState.suppressNextSegmentEditClick = false;
  ellipseState.ellipseId = ellipseData.ellipseId ?? null;
  ellipseState.wallIds = Array.isArray(ellipseData.wallIds) ? [...ellipseData.wallIds] : [wall.document.id];
  ellipseState.wallTypeTool = getWallTypeToolFromDocument(wall.document) ?? ellipseData.wallTypeTool ?? "walls";
  ellipseState.segments = clamp(Number(ellipseData.segments) || DEFAULT_ELLIPSE_SEGMENTS, 4, 96);
  ellipseState.rotation = Number(ellipseData.rotation) || 0;
  ellipseState.segmentGaps = reconcileEllipseSegmentGaps(ellipseData.segmentGaps, ellipseState.segments);
  ellipseState.handles = ellipseData.handles.map((handle) => ({
    x: Number(handle.x) || 0,
    y: Number(handle.y) || 0
  }));
  ellipseState.wallTypeBySegment = {
    ...cloneWallTypeBySegment(ellipseData.wallTypeBySegment),
    ...getShapeWallTypeByIndexedFlag(ellipseState.wallIds, ELLIPSE_FLAG)
  };

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
  polylineState.active = false;
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
  rectangleState.wallTypeBySegment = {
    ...cloneWallTypeBySegment(rectangleData.wallTypeBySegment),
    ...getRectangleWallTypeBySegment(rectangleState.wallIds)
  };

  canvas.walls.activate({tool: RECTANGLE_TOOL});
  hideEditSessionWalls(rectangleState.wallIds);
  drawRectanglePreview();
}

function loadPolylineFromWall(wall) {
  const polylineData = wall.document.getFlag(MODULE_ID, POLYLINE_FLAG);
  if (!Array.isArray(polylineData?.points) || polylineData.points.length < 2) return;

  cubicState.active = false;
  ellipseState.active = false;
  rectangleState.active = false;
  polylineState.active = true;
  clearEditorHistory(polylineState);
  polylineState.placed = true;
  polylineState.drawing = false;
  polylineState.draggingVertex = null;
  polylineState.hoveredVertex = null;
  polylineState.polylineId = polylineData.polylineId ?? null;
  polylineState.wallIds = Array.isArray(polylineData.wallIds) ? [...polylineData.wallIds] : [wall.document.id];
  polylineState.wallTypeTool = getWallTypeToolFromDocument(wall.document) ?? polylineData.wallTypeTool ?? "walls";
  polylineState.points = polylineData.points.map((point) => ({
    x: Number(point.x) || 0,
    y: Number(point.y) || 0
  }));
  polylineState.closed = !!polylineData.closed;
  polylineState.segmentGaps = reconcilePolylineSegmentGaps(polylineData.segmentGaps, getPolylineSegmentCount());
  polylineState.previewPoint = null;
  polylineState.wallTypeBySegment = {
    ...cloneWallTypeBySegment(polylineData.wallTypeBySegment),
    ...getShapeWallTypeByIndexedFlag(polylineState.wallIds, POLYLINE_FLAG)
  };

  canvas.walls.activate({tool: POLYLINE_TOOL});
  hideEditSessionWalls(polylineState.wallIds);
  drawPolylinePreview();
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

function getExistingPolylineWallIds() {
  return polylineState.wallIds.filter((id) => canvas.scene.walls.has(id));
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
