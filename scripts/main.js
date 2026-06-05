import {
  clamp,
  clonePoints,
  ensureEditButtons,
  getEventPoint,
  getHandleAt as getHandleIndexAt,
  getScaledRadius,
  isEditableTarget,
  positionEditButtons,
  setEditButtonsVisible
} from "./curve-common.js";
import {
  beginEditorOperation as beginSessionEditorOperation,
  cancelEditorOperation as cancelSessionEditorOperation,
  clearEditorHistory as clearSessionEditorHistory,
  cloneWallTypeBySegment,
  commitEditorOperation as commitSessionEditorOperation,
  pushEditorUndoSnapshot as pushSessionEditorUndoSnapshot
} from "./editor-session.js";
import {
  configureInteractionHelpers,
  consumeCanvasInteraction,
  debugInteractionManagers,
  getClientInteractionPoint,
  getClientInteractionPoints,
  getInteractionPoint,
  resetCanvasCursor,
  resetEditorCursor,
  scheduleEditorInteractionReset
} from "./interaction.js";
import {
  configurePreviewStyle,
  drawBezierHandle,
  drawEndpoint,
  drawMoveHandle,
  drawPreviewVertex,
  getPreviewStyle,
  getSplitVertexHitRadius,
  registerStyleSettings
} from "./preview-style.js";
import {
  configurePreviewGraphicsForFoundry,
  destroyPreviewGraphics,
  preparePreviewGraphics
} from "./preview-graphics.js";
import {
  applyCubicWalls as applyCubicWallsImpl,
  cancelCubicEditingForDeletedWall as cancelCubicEditingForDeletedWallImpl,
  changeCubicSegments as changeCubicSegmentsImpl,
  clearCubicPreview as clearCubicPreviewImpl,
  CUBIC_EDIT_BUTTONS_ID,
  CUBIC_FLAG,
  CUBIC_TOOL,
  cubicState,
  drawCubicPreview as drawCubicPreviewImpl,
  editCubicSegmentWithUndo as editCubicSegmentWithUndoImpl,
  getCubicSegmentAt as getCubicSegmentAtImpl,
  getCubicEditableHandleIndexes,
  getCubicInitialCurveMode,
  getCubicPoints,
  getExistingCurveWallIds as getExistingCurveWallIdsImpl,
  initializeCubicControls,
  loadCubicCurveFromWall as loadCubicCurveFromWallImpl,
  normalizeCubicCurveMode,
  reconcileCubicSegmentGaps,
  setHandle,
  toggleCubicCurveModeWithUndo as toggleCubicCurveModeWithUndoImpl
} from "./shapes/cubic.js";
import {
  applyEllipseWalls as applyEllipseWallsImpl,
  cancelEllipseEditingForDeletedWall as cancelEllipseEditingForDeletedWallImpl,
  changeEllipseSegments as changeEllipseSegmentsImpl,
  clearEllipsePreview as clearEllipsePreviewImpl,
  drawEllipsePreview as drawEllipsePreviewImpl,
  editEllipseSegmentWithUndo as editEllipseSegmentWithUndoImpl,
  ELLIPSE_EDIT_BUTTONS_ID,
  ELLIPSE_FLAG,
  ELLIPSE_TOOL,
  ellipseState,
  getEllipseGeometry,
  getEllipsePoints,
  getEllipseSegmentAt as getEllipseSegmentAtImpl,
  getEllipseVertexAt as getEllipseVertexAtImpl,
  getExistingEllipseWallIds as getExistingEllipseWallIdsImpl,
  loadEllipseFromWall as loadEllipseFromWallImpl,
  reconcileEllipseSegmentGaps,
  setEllipseHandle,
  setEllipseResizeHandle,
  setEllipseRotationFromVertex,
  updateEllipseInitialHandles
} from "./shapes/ellipse.js";
import {
  applyRectangleWalls as applyRectangleWallsImpl,
  cancelRectangleEditingForDeletedWall as cancelRectangleEditingForDeletedWallImpl,
  changeRectangleSegments as changeRectangleSegmentsImpl,
  cloneRectangleSideEnabled,
  cloneRectangleSideGaps,
  cloneRectangleSideRatios,
  clearRectanglePreview as clearRectanglePreviewImpl,
  commitRectangleSideEdit as commitRectangleSideEditImpl,
  drawRectanglePreview as drawRectanglePreviewImpl,
  getExistingRectangleWallIds as getExistingRectangleWallIdsImpl,
  getDefaultRectangleSideEnabled,
  getDefaultRectangleSideGaps,
  getDefaultRectangleSideRatios,
  getRectangleBounds,
  getRectangleCornerHandles,
  getRectangleHandleAt as getRectangleHandleAtImpl,
  getRectangleSegmentIndexAt,
  getRectangleSegmentKey,
  getRectangleSegments,
  getRectangleSideAtWithStyle as getRectangleSideAtImpl,
  getRectangleSideEditFromEvent as getRectangleSideEditFromEventImpl,
  getRectangleVertexAt as getRectangleVertexAtImpl,
  loadRectangleFromWall as loadRectangleFromWallImpl,
  removeRectangleVertex as removeRectangleVertexImpl,
  RECTANGLE_EDIT_BUTTONS_ID,
  RECTANGLE_FLAG,
  RECTANGLE_TOOL,
  rectangleState,
  setRectangleHandle,
  setRectangleVertex
} from "./shapes/rectangle.js";
import {
  applyPolylineWalls as applyPolylineWallsImpl,
  cancelPolylineEditingForDeletedWall as cancelPolylineEditingForDeletedWallImpl,
  changePolylineCurveSegments as changePolylineCurveSegmentsImpl,
  clearPolylinePreview as clearPolylinePreviewImpl,
  closePolyline as closePolylineImpl,
  commitPolylineSegmentEdit as commitPolylineSegmentEditImpl,
  cyclePolylineSegmentCurveWithUndo as cyclePolylineSegmentCurveWithUndoImpl,
  DEFAULT_POLYLINE_CURVE_SEGMENTS,
  drawPolylinePreview as drawPolylinePreviewImpl,
  editPolylineSegmentWithUndo as editPolylineSegmentWithUndoImpl,
  getExistingPolylineWallIds as getExistingPolylineWallIdsImpl,
  POLYLINE_EDIT_BUTTONS_ID,
  POLYLINE_FLAG,
  POLYLINE_TOOL,
  getPolylineSegmentCount,
  getPolylineSegmentAt as getPolylineSegmentAtImpl,
  getPolylineSegmentEditFromEvent as getPolylineSegmentEditFromEventImpl,
  clonePolylineSegmentCurves,
  getPolylineCurveHandleAt as getPolylineCurveHandleAtImpl,
  getPolylineVertexAt as getPolylineVertexAtImpl,
  reconcilePolylineSegmentCurves,
  handlePolylineCanvasClick as handlePolylineCanvasClickImpl,
  isPolylineClosePoint as isPolylineClosePointImpl,
  loadPolylineFromWall as loadPolylineFromWallImpl,
  polylineState,
  reconcilePolylineSegmentGaps,
  removePolylineVertex as removePolylineVertexImpl,
  setPolylineCurveHandle as setPolylineCurveHandleImpl,
  setPolylineVertex as setPolylineVertexImpl,
  translatePolylineSegmentCurves
} from "./shapes/polyline.js";
import {
  getSegmentWallData,
  getWallTypeToolFromDocument,
  getWallTypeToolName,
  SEGMENT_WALL_TYPE_KEYBINDINGS,
  WALL_TYPE_DATA
} from "./wall-types.js";

const MODULE_ID = "indy-walls";
const QUICK_WALL_TYPE_SETTING = "quickWallTypeChange";
const DEBUG_SETTING = "debugShapeSelection";
const ACTIVE_TOOL_HIGHLIGHT_COLOR_SETTING = "activeShapeToolHighlightColor";
const ACTIVE_TOOL_HIGHLIGHT_GLOW_SETTING = "activeShapeToolHighlightGlow";
const ACTIVE_TOOL_HIGHLIGHT_BORDER_WIDTH_SETTING = "activeShapeToolHighlightBorderWidth";
const SHOW_DOOR_GLYPHS_SETTING = "showDoorGlyphsInEditor";
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
let activePreviewRedrawFrame = null;

const hiddenEditWalls = new Map();
const rectangleCanvasClickViews = new WeakSet();
const editorDomDragViews = new WeakSet();

Hooks.once("init", () => {
  configurePreviewStyle({moduleId: MODULE_ID, onChange: redrawActivePreview});
  configureInteractionHelpers({moduleId: MODULE_ID, debugSetting: DEBUG_SETTING, debug: debugShapeSelection});
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
  game.settings.register(MODULE_ID, SHOW_DOOR_GLYPHS_SETTING, {
    name: game.i18n.localize("indy-walls.Settings.ShowDoorGlyphsInEditor.Name"),
    hint: game.i18n.localize("indy-walls.Settings.ShowDoorGlyphsInEditor.Hint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: redrawActivePreview
  });
  registerActiveToolHighlightSettings();
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
  patchIndyPreviewGraphicsForFoundry();
  patchAvailableWallObjectInteractions();
  registerRectangleCanvasClickHandler();
  registerEditorDomDragHandler();
});

Hooks.on("canvasPan", () => {
  scheduleActivePreviewRedraw();
});

Hooks.on("canvasTearDown", () => {
  clearEditorStateForCanvasChange("canvasTearDown");
});

Hooks.on("canvasInit", () => {
  clearEditorStateForCanvasChange("canvasInit");
});

Hooks.on("controlWall", (wall, controlled) => {
  if (!controlled || !game.user.isGM) return;
  if (!isWallControlsActive()) return;
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

function registerActiveToolHighlightSettings() {
  registerActiveToolHighlightColorSetting();
  game.settings.register(MODULE_ID, ACTIVE_TOOL_HIGHLIGHT_GLOW_SETTING, {
    name: game.i18n.localize("indy-walls.Settings.ActiveShapeToolHighlightGlow.Name"),
    hint: game.i18n.localize("indy-walls.Settings.ActiveShapeToolHighlightGlow.Hint"),
    scope: "client",
    config: true,
    type: Number,
    default: 0.6,
    range: {min: 0, max: 2, step: 0.1},
    onChange: updateIndyToolButtonHighlights
  });
  game.settings.register(MODULE_ID, ACTIVE_TOOL_HIGHLIGHT_BORDER_WIDTH_SETTING, {
    name: game.i18n.localize("indy-walls.Settings.ActiveShapeToolHighlightBorderWidth.Name"),
    hint: game.i18n.localize("indy-walls.Settings.ActiveShapeToolHighlightBorderWidth.Hint"),
    scope: "client",
    config: true,
    type: Number,
    default: 3,
    range: {min: 0, max: 8, step: 1},
    onChange: updateIndyToolButtonHighlights
  });
}

function registerActiveToolHighlightColorSetting() {
  const name = game.i18n.localize("indy-walls.Settings.ActiveShapeToolHighlightColor.Name");
  const hint = game.i18n.localize("indy-walls.Settings.ActiveShapeToolHighlightColor.Hint");
  const ColorSetting = window.Ardittristan?.ColorSetting;

  if (ColorSetting) {
    new ColorSetting(MODULE_ID, ACTIVE_TOOL_HIGHLIGHT_COLOR_SETTING, {
      name,
      hint,
      label: game.i18n.localize("indy-walls.Settings.ColorPickerLabel"),
      restricted: false,
      defaultColor: "#ffb000",
      scope: "client",
      onChange: updateIndyToolButtonHighlights
    });
    return;
  }

  game.settings.register(MODULE_ID, ACTIVE_TOOL_HIGHLIGHT_COLOR_SETTING, {
    name,
    hint,
    scope: "client",
    config: true,
    type: String,
    default: "#ffb000",
    onChange: updateIndyToolButtonHighlights
  });
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
      updateIndyToolButtonHighlights();
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
      updateIndyToolButtonHighlights();
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
      updateIndyToolButtonHighlights();
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
      updateIndyToolButtonHighlights();
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
  updateIndyToolButtonHighlights();
  positionCubicEditButtons();
  positionEllipseEditButtons();
  positionRectangleEditButtons();
  positionPolylineEditButtons();
});

function updateIndyToolButtonHighlights() {
  const activeTool = getActiveEditorTool();
  const color = getActiveShapeToolHighlightColor();
  const glow = clamp(Number(game.settings.get(MODULE_ID, ACTIVE_TOOL_HIGHLIGHT_GLOW_SETTING)) || 0, 0, 2);
  const borderWidth = clamp(Number(game.settings.get(MODULE_ID, ACTIVE_TOOL_HIGHLIGHT_BORDER_WIDTH_SETTING)) || 0, 0, 8);

  for (const tool of [CUBIC_TOOL, ELLIPSE_TOOL, RECTANGLE_TOOL, POLYLINE_TOOL]) {
    const active = tool === activeTool;
    for (const button of document.querySelectorAll(`[data-tool="${tool}"]`)) {
      button.classList.toggle("indy-walls-shape-tool-active", active);
      button.style.setProperty("--indy-walls-active-tool-color", color);
      button.style.setProperty("--indy-walls-active-tool-glow", String(glow));
      button.style.setProperty("--indy-walls-active-tool-border-width", `${borderWidth}px`);
    }
  }
}

function getActiveShapeToolHighlightColor() {
  const value = String(game.settings.get(MODULE_ID, ACTIVE_TOOL_HIGHLIGHT_COLOR_SETTING) ?? "").trim();
  return /^#?[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value)
    ? (value.startsWith("#") ? value : `#${value}`)
    : "#ffb000";
}

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
      cubicState.curveMode = getCubicInitialCurveMode();
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
      setEllipseResizeHandle(ellipseState.draggingHandle, point, isAltInteraction(event));
      if (ellipseState.initializing) {
        updateEllipseInitialHandles({
          alt: isAltInteraction(event),
          ctrl: isControlInteraction(event)
        });
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
      polylineDraggingVertex: polylineState.draggingVertex,
      polylineDraggingCurveHandle: polylineState.draggingCurveHandle
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

      if (method === "_onClickLeft" && game.user.isGM && isControlInteraction(event) && isWallControlsActive()) {
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
  view.addEventListener("click", handleRectangleCanvasClick, {capture: true});
  view.addEventListener("dblclick", handlePolylineCanvasDoubleClick, {capture: true});
  view.addEventListener("contextmenu", handleEditorCanvasContextMenu, {capture: true});
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
  if (!isWallControlsActive()) return;
  const point = getClientInteractionPoint(event);
  if (point) lastCanvasPointerState.point = point;
  if (point && isPolylineToolActive() && polylineState.drawing) {
    polylineState.previewPoint = point;
    drawPolylinePreview();
  }
}

function handleCanvasSegmentEditPointerDown(event) {
  if (!isWallControlsActive()) return;
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
  if (!isWallControlsActive()) return;
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
  if (!isWallControlsActive()) {
    clearControlShapeSelect();
    clearPendingCanvasSegmentEdit();
    return;
  }
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
  if (!isWallControlsActive()) {
    clearControlShapeSelect();
    clearPendingCanvasSegmentEdit();
    return;
  }
  if (isControlShapeSelectEvent(event)) clearControlShapeSelect();
  if (!isPendingCanvasSegmentEditEvent(event)) {
    return;
  }
  consumeCanvasInteraction(event);
  clearPendingCanvasSegmentEdit();
  scheduleEditorInteractionReset(event);
}

function startControlShapeSelect(event) {
  if (!game.user.isGM) return;
  if (!isWallControlsActive()) {
    debugShapeSelection("control shape select skipped: wall controls inactive", {
      activeTool: game.activeTool,
      activeControl: getActiveControlName()
    });
    return;
  }
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
  if (!isWallControlsActive()) {
    clearControlShapeSelect();
    debugShapeSelection("control shape select skipped on finish: wall controls inactive", {
      activeTool: game.activeTool,
      activeControl: getActiveControlName()
    });
    return false;
  }

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
  if (!isWallControlsActive()) return;
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
  if (!isWallControlsActive()) return;
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

function handleEditorCanvasContextMenu(event) {
  if (!isWallControlsActive()) return;
  if (handleCubicCanvasContextMenu(event)) return;
  handlePolylineCanvasContextMenu(event);
}

function handleCubicCanvasContextMenu(event) {
  if (!isCubicToolActive() || !cubicState.placed) return false;

  for (const point of getCanvasClickCandidatePoints(event)) {
    const segment = getCubicSegmentAt({x: point.x, y: point.y});
    if (!segment) continue;

    debugShapeSelection("cubic canvas contextmenu toggle curve mode", {
      clientX: event.clientX,
      clientY: event.clientY,
      segment,
      curveMode: cubicState.curveMode
    });
    consumeCanvasInteraction(event);
    event.preventDefault();
    event.stopPropagation();
    toggleCubicCurveModeWithUndo();
    scheduleEditorInteractionReset(event);
    return true;
  }

  return false;
}

function handlePolylineCanvasContextMenu(event) {
  if (!isPolylineToolActive() || !polylineState.placed) return;

  for (const point of getCanvasClickCandidatePoints(event)) {
    const segment = getPolylineSegmentAt({x: point.x, y: point.y});
    if (!segment) continue;

    debugShapeSelection("polyline canvas contextmenu cycle segment curve", {
      clientX: event.clientX,
      clientY: event.clientY,
      segment
    });
    consumeCanvasInteraction(event);
    event.preventDefault();
    event.stopPropagation();
    cyclePolylineSegmentCurveWithUndo(segment.sourceIndex ?? segment.index);
    scheduleEditorInteractionReset(event);
    return;
  }
}

function shouldClosePolylineAtEvent(event) {
  if (polylineState.points.length < 3) return false;
  const point = getClientInteractionPoint(event);
  return isPolylineClosePoint(point) || isPolylineClosePoint(polylineState.points.at(-1));
}

function isPolylineClosePoint(point) {
  return isPolylineClosePointImpl(point, getPolylineDeps());
}

function closePolyline() {
  return closePolylineImpl(getPolylineDeps());
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

function loadShapeFromCanvasPointerUp(event) {
  if (!isWallControlsActive()) return false;
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
  return getRectangleSideEditFromEventImpl(event, getRectangleDeps());
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
  return commitRectangleSideEditImpl(edit, event, getRectangleDeps());
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
  if (!isWallControlsActive()) return;
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
    polylineState.draggingCurveHandle = null;
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
    polylineState.draggingCurveHandle = hit.handle;
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
      setEllipseResizeHandle(editorDomDragState.handle, point, isAltInteraction(event));
    }
    if (ellipseState.initializing) updateEllipseInitialHandles({
      alt: isAltInteraction(event),
      ctrl: isControlInteraction(event)
    });
    ellipseState.placed = true;
    drawEllipsePreview();
  } else if (editorDomDragState.tool === POLYLINE_TOOL) {
    if (editorDomDragState.handle) {
      setPolylineCurveHandle(editorDomDragState.handle, point);
    } else if (editorDomDragState.vertex) {
      setPolylineVertex(editorDomDragState.vertex.index, point);
      polylineState.previewPoint = null;
    }
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
    polylineState.draggingCurveHandle = null;
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

function resetEditorDomDragState() {
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

function clearEditorStateForCanvasChange(source="canvas") {
  debugShapeSelection("clearing editor state for canvas change", {
    source,
    cubicPlaced: cubicState.placed,
    ellipsePlaced: ellipseState.placed,
    rectanglePlaced: rectangleState.placed,
    polylinePlaced: polylineState.placed
  });

  patchIndyPreviewGraphicsForFoundry();
  try {
    restoreEditSessionWalls();
  } catch (_error) {
    hiddenEditWalls.clear();
  }
  clearPendingCanvasSegmentEdit();
  clearControlShapeSelect();
  resetEditorDomDragState();

  clearCubicPreview();
  clearEllipsePreview();
  clearRectanglePreview();
  clearPolylinePreview();
}

function patchIndyPreviewGraphicsForFoundry() {
  for (const graphics of [cubicState.graphics, ellipseState.graphics, rectangleState.graphics, polylineState.graphics]) {
    configurePreviewGraphicsForFoundry(graphics);
  }
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
      const curveHandle = getPolylineCurveHandleAt(point);
      if (curveHandle) return withDomPointerDragData(event, {
        tool: POLYLINE_TOOL,
        handle: curveHandle,
        vertex: null,
        move: false,
        coordinateLabel: label,
        hitPoint: point,
        editorPoint: curveHandle.point
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
      editorPoint: getRectangleCornerHandlePoint(handle)
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
  cubicState.curveMode = getCubicInitialCurveMode();
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
    || !!polylineState.draggingVertex
    || !!polylineState.draggingCurveHandle;
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
  } else if (isPolylineToolActive() && (polylineState.draggingVertex || polylineState.draggingCurveHandle)) {
    polylineState.draggingVertex = null;
    polylineState.draggingCurveHandle = null;
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

function isWallControlsActive() {
  const activeControl = getActiveControlName();
  if (activeControl) return activeControl === "walls";
  return canvas?.activeLayer === canvas?.walls;
}

function getActiveControlName() {
  const activeControl = ui?.controls?.control ?? canvas?.controls?.control;
  if (typeof activeControl === "string") return activeControl;
  return activeControl?.name ?? activeControl?.id ?? activeControl?.layer ?? null;
}

function isAltInteraction(event) {
  return !!(event?.altKey
    || event.data?.originalEvent?.altKey
    || event.originalEvent?.altKey);
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

function registerCurveEditorShortcuts() {
  window.addEventListener("wheel", (event) => {
    if (!getActiveEditorState()?.placed || !event.ctrlKey) return;

    event.preventDefault();
    event.stopPropagation();
    changeActiveSegments(event.deltaY < 0 ? 1 : -1);
  }, {capture: true, passive: false});

  window.addEventListener("keydown", (event) => {
    if (!game.user.isGM || isEditableTarget(event.target)) return;
    if (!isAnyEditorToolActive() && !copiedEditorShape) return;

    if (event.key === "Escape" && isAnyEditorToolActive()) {
      consumeEditorEscape(event);
      return;
    }

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

    if (event.key === "Delete" || event.key === "Backspace") {
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

  window.addEventListener("keyup", (event) => {
    if (!game.user.isGM || isEditableTarget(event.target)) return;
    if (event.key !== "Escape" || !isAnyEditorToolActive()) return;
    consumeEditorEscape(event, {clearPreview: false});
  }, {capture: true});
}

function consumeEditorEscape(event, {clearPreview=true}={}) {
  event.preventDefault();
  event.stopImmediatePropagation?.();
  event.stopPropagation();
  if (clearPreview && getActiveEditorState()?.placed) clearActivePreview();
  scheduleEditorInteractionReset(event);
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
  else if (isPolylineToolActive()) changePolylineCurveSegments(delta);

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

  const replacingWallIds = state.replacingWallIds;
  wallIds.forEach((id) => replacingWallIds.add(id));
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
  beginSessionEditorOperation(state, getEditorSnapshot, includeUnplaced);
}

function commitEditorOperation(state=getActiveEditorState()) {
  commitSessionEditorOperation(state, getEditorSnapshot, updateEditButtonStates);
}

function cancelEditorOperation(state=getActiveEditorState()) {
  cancelSessionEditorOperation(state);
}

function clearEditorHistory(state) {
  clearSessionEditorHistory(state, updateEditButtonStates);
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
  pushSessionEditorUndoSnapshot(state, snapshot, getEditorSnapshot, updateEditButtonStates);
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
      curveMode: cubicState.curveMode,
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
      segmentCurves: clonePolylineSegmentCurves(polylineState.segmentCurves),
      curveSegments: polylineState.curveSegments,
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
    cubicState.curveMode = normalizeCubicCurveMode(snapshot.curveMode);
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
    polylineState.segmentCurves = reconcilePolylineSegmentCurves(snapshot.segmentCurves, getPolylineSegmentCount());
    polylineState.curveSegments = clamp(Number(snapshot.curveSegments) || DEFAULT_POLYLINE_CURVE_SEGMENTS, 2, 64);
    polylineState.wallTypeBySegment = cloneWallTypeBySegment(snapshot.wallTypeBySegment);
    polylineState.wallTypeTool = snapshot.wallTypeTool;
    polylineState.draggingVertex = null;
    polylineState.draggingCurveHandle = null;
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

function getSegmentWallType(state, segment) {
  return state?.wallTypeBySegment?.[getSegmentKey(segment)] ?? state?.wallTypeTool ?? "walls";
}

function getSegmentPreviewColor(state, segment, style=getPreviewStyle()) {
  const tool = getSegmentWallType(state, segment);
  return style.wallTypeColors?.[tool] ?? style.wallColor;
}

function drawSegmentDoorIcon(graphics, state, segment, style=getPreviewStyle()) {
  if (!game.settings.get(MODULE_ID, SHOW_DOOR_GLYPHS_SETTING)) return;
  const tool = getSegmentWallType(state, segment);
  if (tool !== "doors" && tool !== "secret") return;
  if (!Number.isFinite(segment?.a?.x) || !Number.isFinite(segment?.a?.y)
    || !Number.isFinite(segment?.b?.x) || !Number.isFinite(segment?.b?.y)) return;

  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.1) return;

  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const center = {
    x: (segment.a.x + segment.b.x) / 2,
    y: (segment.a.y + segment.b.y) / 2
  };
  const size = Math.max(style.endpointSize * 3.8, 40);
  const width = Math.max(style.outlineWidth, 2);
  if (tool === "secret") drawFoundrySecretDoorIcon(graphics, center, ux, uy, nx, ny, size, width, style.outlineColor);
  else drawFoundryDoorIcon(graphics, center, ux, uy, nx, ny, size, width, style.outlineColor);
}

function drawFoundryDoorIcon(graphics, center, ux, uy, nx, ny, size, width, outlineColor) {
  const bodyFill = 0xd8d8d4;
  const panelFill = 0xf1f1ec;
  const hardwareFill = 0x65696c;
  const halfAlong = size * 0.39;
  const halfAcross = size * 0.68;
  const lineWidth = Math.max(width, 1.5);

  drawOrientedRect(graphics, center, ux, uy, nx, ny, halfAlong, halfAcross, {
    fill: bodyFill,
    fillAlpha: 0.96,
    line: outlineColor,
    lineAlpha: 0.9,
    lineWidth: lineWidth + 1
  });

  for (const across of [-halfAcross * 0.42, halfAcross * 0.35]) {
    drawOrientedRect(graphics, offsetPoint(center, ux, uy, nx, ny, 0, across), ux, uy, nx, ny, halfAlong * 0.58, halfAcross * 0.15, {
      fill: panelFill,
      fillAlpha: 0.96,
      line: outlineColor,
      lineAlpha: 0.75,
      lineWidth: Math.max(width * 0.75, 1)
    });
  }

  drawDoorRivets(graphics, center, ux, uy, nx, ny, halfAlong, halfAcross, width, hardwareFill);
  drawDoorSideHardware(graphics, center, ux, uy, nx, ny, halfAlong, halfAcross, width, outlineColor, hardwareFill);
}

function drawFoundrySecretDoorIcon(graphics, center, ux, uy, nx, ny, size, width, outlineColor) {
  const fillColor = 0xe8e6df;
  const lineColor = 0x8b8f8e;
  const halfAlong = size * 0.36;
  const halfAcross = size * 0.58;
  const radius = halfAlong;
  const baseY = halfAcross;
  const archCenter = {along: 0, across: -halfAcross + radius};
  const points = [
    ...getSecretDoorArchPoints(center, ux, uy, nx, ny, archCenter, radius, -Math.PI, 0, 14),
    offsetPoint(center, ux, uy, nx, ny, halfAlong, baseY),
    offsetPoint(center, ux, uy, nx, ny, -halfAlong, baseY)
  ];
  const lineWidth = Math.max(width, 1.5);

  drawOrientedPolygon(graphics, points, {
    fill: fillColor,
    fillAlpha: 0.9,
    line: outlineColor,
    lineAlpha: 0.65,
    lineWidth: lineWidth + 1
  });
  drawSecretDoorDashedOutline(graphics, center, ux, uy, nx, ny, archCenter, radius, halfAlong, baseY, lineColor, lineWidth);
  drawSecretDoorVerticalLines(graphics, center, ux, uy, nx, ny, halfAlong, baseY, lineColor, Math.max(width * 0.65, 1));
}

function getSecretDoorArchPoints(center, ux, uy, nx, ny, archCenter, radius, startAngle, endAngle, steps) {
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = startAngle + (endAngle - startAngle) * t;
    points.push(offsetPoint(
      center,
      ux,
      uy,
      nx,
      ny,
      archCenter.along + Math.cos(angle) * radius,
      archCenter.across + Math.sin(angle) * radius
    ));
  }
  return points;
}

function drawSecretDoorDashedOutline(graphics, center, ux, uy, nx, ny, archCenter, radius, halfAlong, baseY, color, lineWidth) {
  const path = [
    ...getSecretDoorArchPoints(center, ux, uy, nx, ny, archCenter, radius, -Math.PI, 0, 24),
    offsetPoint(center, ux, uy, nx, ny, halfAlong, baseY),
    offsetPoint(center, ux, uy, nx, ny, -halfAlong, baseY),
    offsetPoint(center, ux, uy, nx, ny, -halfAlong, archCenter.across)
  ];
  drawDashedPolyline(graphics, path, color, lineWidth, 4, 3, true);
}

function drawSecretDoorVerticalLines(graphics, center, ux, uy, nx, ny, halfAlong, baseY, color, lineWidth) {
  graphics.lineStyle(lineWidth, color, 0.65);
  for (const along of [-0.45, -0.15, 0.15, 0.45].map((value) => value * halfAlong)) {
    const top = offsetPoint(center, ux, uy, nx, ny, along, -baseY * 0.55);
    const bottom = offsetPoint(center, ux, uy, nx, ny, along, baseY * 0.88);
    graphics.moveTo(top.x, top.y);
    graphics.lineTo(bottom.x, bottom.y);
  }
}

function drawDoorRivets(graphics, center, ux, uy, nx, ny, halfAlong, halfAcross, width, color) {
  const radius = Math.max(width * 0.55, 1.1);
  const alongValues = [-0.72, -0.36, 0, 0.36, 0.72].map((value) => value * halfAlong);
  const acrossValues = [-0.82, 0.82].map((value) => value * halfAcross);
  graphics.beginFill(color, 0.85);
  for (const along of alongValues) {
    for (const across of acrossValues) {
      const point = offsetPoint(center, ux, uy, nx, ny, along, across);
      graphics.drawCircle(point.x, point.y, radius);
    }
  }
  for (const along of [-0.82, 0.82].map((value) => value * halfAlong)) {
    for (const across of [-0.55, -0.28, 0, 0.28, 0.55].map((value) => value * halfAcross)) {
      const point = offsetPoint(center, ux, uy, nx, ny, along, across);
      graphics.drawCircle(point.x, point.y, radius);
    }
  }
  graphics.endFill();
}

function drawDoorSideHardware(graphics, center, ux, uy, nx, ny, halfAlong, halfAcross, width, outlineColor, color) {
  const knob = offsetPoint(center, ux, uy, nx, ny, -halfAlong * 1.02, 0);
  const tabAlong = halfAlong * 1.04;
  const tabWidth = halfAlong * 0.12;
  const tabHeight = halfAcross * 0.12;
  const tabCenters = [
    offsetPoint(center, ux, uy, nx, ny, tabAlong, -halfAcross * 0.34),
    offsetPoint(center, ux, uy, nx, ny, tabAlong, halfAcross * 0.28)
  ];

  graphics.beginFill(outlineColor, 0.9);
  graphics.drawCircle(knob.x, knob.y, Math.max(width * 2.4, halfAlong * 0.18));
  graphics.endFill();
  graphics.beginFill(color, 1);
  graphics.drawCircle(knob.x, knob.y, Math.max(width * 1.45, halfAlong * 0.11));
  graphics.endFill();

  for (const tab of tabCenters) {
    drawOrientedRect(graphics, tab, ux, uy, nx, ny, tabWidth, tabHeight, {
      fill: 0xd8d8d4,
      fillAlpha: 0.95,
      line: outlineColor,
      lineAlpha: 0.85,
      lineWidth: Math.max(width * 0.75, 1)
    });
  }
}

function drawOrientedRect(graphics, center, ux, uy, nx, ny, halfAlong, halfAcross, {
  fill=null,
  fillAlpha=1,
  line=null,
  lineAlpha=1,
  lineWidth=1
}={}) {
  const points = [
    offsetPoint(center, ux, uy, nx, ny, -halfAlong, -halfAcross),
    offsetPoint(center, ux, uy, nx, ny, halfAlong, -halfAcross),
    offsetPoint(center, ux, uy, nx, ny, halfAlong, halfAcross),
    offsetPoint(center, ux, uy, nx, ny, -halfAlong, halfAcross)
  ];
  if (line !== null) graphics.lineStyle(lineWidth, line, lineAlpha);
  if (fill !== null) graphics.beginFill(fill, fillAlpha);
  drawPolylinePath(graphics, points, true);
  if (fill !== null) graphics.endFill();
}

function drawOrientedPolygon(graphics, points, {
  fill=null,
  fillAlpha=1,
  line=null,
  lineAlpha=1,
  lineWidth=1
}={}) {
  if (!points.length) return;
  if (line !== null) graphics.lineStyle(lineWidth, line, lineAlpha);
  if (fill !== null) graphics.beginFill(fill, fillAlpha);
  drawPolylinePath(graphics, points, true);
  if (fill !== null) graphics.endFill();
}

function drawDashedPolyline(graphics, points, color, width, dashLength, gapLength, closed=false) {
  const path = closed && points.length ? [...points, points[0]] : points;
  if (path.length < 2) return;
  graphics.lineStyle(width, color, 0.85);
  for (let i = 0; i < path.length - 1; i++) {
    drawDashedSegment(graphics, path[i], path[i + 1], dashLength, gapLength);
  }
}

function drawDashedSegment(graphics, a, b, dashLength, gapLength) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.1) return;
  const ux = dx / length;
  const uy = dy / length;
  let distance = 0;
  while (distance < length) {
    const start = distance;
    const end = Math.min(distance + dashLength, length);
    graphics.moveTo(a.x + ux * start, a.y + uy * start);
    graphics.lineTo(a.x + ux * end, a.y + uy * end);
    distance += dashLength + gapLength;
  }
}

function offsetPoint(origin, ux, uy, nx, ny, along, across) {
  return {
    x: origin.x + ux * along + nx * across,
    y: origin.y + uy * along + ny * across
  };
}

function drawPolylinePath(graphics, points, closed=false) {
  if (!points.length) return;
  graphics.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) graphics.lineTo(point.x, point.y);
  if (closed) graphics.lineTo(points[0].x, points[0].y);
}

function getWallDocumentById(id) {
  return canvas?.scene?.walls?.get(id) ?? null;
}

async function replaceShapeWalls(state, oldWallIds, wallData) {
  const existingIds = [...new Set(oldWallIds ?? [])].filter((id) => canvas.scene.walls.has(id));
  const reusedIds = existingIds.slice(0, wallData.length);
  const createdIds = wallData.slice(reusedIds.length).map(() => foundry.utils.randomID());
  const finalWallIds = [...reusedIds, ...createdIds];
  const walls = wallData.map((wall, index) => {
    const data = foundry.utils.deepClone(wall);
    setShapeWallIds(data, finalWallIds);
    if (index < reusedIds.length) data._id = reusedIds[index];
    else data._id = createdIds[index - reusedIds.length];
    return data;
  });

  const createdData = walls.slice(reusedIds.length);
  const updateData = walls.slice(0, reusedIds.length);
  const deleteIds = existingIds.slice(wallData.length);
  const created = createdData.length
    ? await canvas.scene.createEmbeddedDocuments("Wall", createdData, {keepId: true})
    : [];
  const updated = updateData.length
    ? await canvas.scene.updateEmbeddedDocuments("Wall", updateData)
    : [];

  if (deleteIds.length) {
    deleteIds.forEach((id) => state.replacingWallIds.add(id));
    try {
      await canvas.scene.deleteEmbeddedDocuments("Wall", deleteIds);
    } finally {
      deleteIds.forEach((id) => state.replacingWallIds.delete(id));
    }
  }

  return finalWallIds.map((id) =>
    updated.find((wall) => wall.id === id)
    ?? created.find((wall) => wall.id === id)
    ?? canvas.scene.walls.get(id)
  ).filter(Boolean);
}

function setShapeWallIds(wallData, wallIds) {
  const moduleFlags = wallData?.flags?.[MODULE_ID];
  if (!moduleFlags) return;
  for (const shapeData of Object.values(moduleFlags)) {
    if (shapeData && typeof shapeData === "object" && "wallIds" in shapeData) shapeData.wallIds = wallIds;
  }
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

function scheduleActivePreviewRedraw() {
  if (activePreviewRedrawFrame !== null) return;
  activePreviewRedrawFrame = requestAnimationFrame(() => {
    activePreviewRedrawFrame = null;
    redrawActivePreview();
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
  else if (tool === POLYLINE_TOOL) {
    polylineState.points = translatePoints(polylineState.points, dx, dy);
    translatePolylineSegmentCurves(dx, dy);
  }
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

function getCubicHandleAt(point) {
  if (!cubicState.placed) return null;
  const style = getPreviewStyle();
  const radius = Math.max(style.endpointSize, style.handleSize);
  const handleIndexes = getCubicEditableHandleIndexes();
  const handles = handleIndexes.map((index) => cubicState.handles[index]);
  const index = getHandleIndexAt(handles, point, radius, style.outlineWidth);
  return index < 0 ? null : handleIndexes[index];
}

function changeCubicSegments(delta) {
  return changeCubicSegmentsImpl(delta, getCubicDeps());
}

function drawCubicPreview() {
  return drawCubicPreviewImpl(getCubicDeps());
}

function getCubicSegmentAt(point) {
  return getCubicSegmentAtImpl(point, getCubicDeps());
}

function editCubicSegmentWithUndo(index, remove=false) {
  return editCubicSegmentWithUndoImpl(index, remove, getCubicDeps());
}

function toggleCubicCurveModeWithUndo() {
  return toggleCubicCurveModeWithUndoImpl(getCubicDeps());
}

function getEllipseHandleAt(point) {
  if (!ellipseState.placed) return null;
  const style = getPreviewStyle();
  const index = getHandleIndexAt(ellipseState.handles, point, style.endpointSize, style.outlineWidth);
  return index < 0 ? null : index;
}

function getEllipseVertexAt(point) {
  return getEllipseVertexAtImpl(point, getEllipseDeps());
}

function changeEllipseSegments(delta) {
  return changeEllipseSegmentsImpl(delta, getEllipseDeps());
}

function drawEllipsePreview() {
  return drawEllipsePreviewImpl(getEllipseDeps());
}

function getEllipseSegmentAt(point) {
  return getEllipseSegmentAtImpl(point, getEllipseDeps());
}

function editEllipseSegmentWithUndo(index, remove=false) {
  return editEllipseSegmentWithUndoImpl(index, remove, getEllipseDeps());
}

function getRectangleHandleAt(point) {
  return getRectangleHandleAtImpl(point, getRectangleDeps());
}

function getRectangleCornerHandlePoint(index) {
  return getRectangleCornerHandles().find((handle) => handle.index === index)?.point ?? null;
}

function getRectangleVertexAt(point) {
  return getRectangleVertexAtImpl(point, getRectangleDeps());
}

function changeRectangleSegments(delta, side=null) {
  return changeRectangleSegmentsImpl(delta, side, getRectangleDeps());
}

function removeRectangleVertex({side, index}) {
  return removeRectangleVertexImpl({side, index}, getRectangleDeps());
}

function getRectangleSideAt(point) {
  return getRectangleSideAtImpl(point, getRectangleDeps());
}

function drawRectanglePreview() {
  return drawRectanglePreviewImpl(getRectangleDeps());
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

function prepareRectanglePreviewGraphics(layer) {
  return preparePreviewGraphics(rectangleState, layer, {
    configure: configureRectanglePreviewInteraction
  });
}

function destroyRectanglePreviewGraphics() {
  destroyPreviewGraphics(rectangleState);
}

function handleRectanglePreviewPointerTap(event) {
  const point = getRectanglePreviewSideInteractionPoint(event);
  if (!point) return;

  debugInteractionManagers("rectangle preview pointertap side edit", event, {
    point,
    remove: isAltInteraction(event)
  });
  if (!commitRectangleSideEdit({point, remove: isAltInteraction(event)}, event)) return;

  event.stopPropagation?.();
  event.preventDefault?.();
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

function getSegmentKey(segment) {
  return segment.side ? getRectangleSegmentKey(segment) : String(segment.index);
}

function getPolylineDeps() {
  return {
    MODULE_ID,
    clamp,
    clearEditorHistory,
    clearPolylinePreview,
    clonePoints,
    cloneWallTypeBySegment,
    debugShapeSelection,
    deactivateOtherShapeStates,
    drawBezierHandle,
    drawMoveHandle,
    drawSegmentDoorIcon,
    drawPolylinePreview,
    drawPreviewVertex,
    getClientInteractionPoint,
    getEditorShapeCenter,
    getEditorSnapshot,
    getPointSegmentDistance,
    getPreviewStyle,
    getScaledRadius,
    getSegmentKey,
    getSegmentPreviewColor,
    getSegmentWallData,
    getShapeWallTypeByIndexedFlag,
    getSplitVertexHitRadius,
    getWallTypeToolFromDocument,
    hideEditSessionWalls,
    isPointNearSegmentBounds,
    isPolylineToolActive,
    pushEditorUndoSnapshot,
    replaceShapeWalls,
    restoreEditSessionWalls,
    scheduleEditorInteractionReset,
    setPolylineEditingState
  };
}

function deactivateOtherShapeStates(activeState) {
  cubicState.active = activeState === cubicState;
  ellipseState.active = activeState === ellipseState;
  rectangleState.active = activeState === rectangleState;
  polylineState.active = activeState === polylineState;
}

function getCubicDeps() {
  return {
    MODULE_ID,
    clamp,
    clearCubicPreview,
    clearEditorHistory,
    clonePoints,
    cloneWallTypeBySegment,
    deactivateOtherShapeStates,
    drawBezierHandle,
    drawCubicPreview,
    drawEndpoint,
    drawMoveHandle,
    drawSegmentDoorIcon,
    drawPreviewVertex,
    getEditorShapeCenter,
    getEditorSnapshot,
    getPointSegmentDistance,
    getPreviewStyle,
    getScaledRadius,
    getSegmentKey,
    getSegmentPreviewColor,
    getSegmentWallData,
    getShapeWallTypeByIndexedFlag,
    getWallTypeToolFromDocument,
    hideEditSessionWalls,
    isCubicToolActive,
    isPointNearSegmentBounds,
    pushEditorUndoSnapshot,
    replaceShapeWalls,
    restoreEditSessionWalls,
    setCubicEditingState
  };
}

function getEllipseDeps() {
  return {
    MODULE_ID,
    clamp,
    clearEditorHistory,
    clearEllipsePreview,
    clonePoints,
    cloneWallTypeBySegment,
    deactivateOtherShapeStates,
    drawEndpoint,
    drawEllipsePreview,
    drawMoveHandle,
    drawSegmentDoorIcon,
    getEditorShapeCenter,
    getEditorSnapshot,
    getPointSegmentDistance,
    getPreviewStyle,
    getScaledRadius,
    getSegmentKey,
    getSegmentPreviewColor,
    getSegmentWallData,
    getShapeWallTypeByIndexedFlag,
    getSplitVertexHitRadius,
    getWallTypeToolFromDocument,
    hideEditSessionWalls,
    isEllipseToolActive,
    isPointNearSegmentBounds,
    pushEditorUndoSnapshot,
    replaceShapeWalls,
    restoreEditSessionWalls,
    setEllipseEditingState
  };
}

function getRectangleDeps() {
  return {
    MODULE_ID,
    clearEditorHistory,
    clearRectanglePreview,
    clonePoints,
    cloneWallTypeBySegment,
    debugInteractionManagers,
    deactivateOtherShapeStates,
    destroyRectanglePreviewGraphics,
    drawEndpoint,
    drawMoveHandle,
    drawPreviewVertex,
    drawRectanglePreview,
    drawSegmentDoorIcon,
    getCanvasClickCandidatePoints,
    getEditorShapeCenter,
    getEditorSnapshot,
    getPreviewStyle,
    getRectangleWallTypeBySegment,
    getScaledRadius,
    getSegmentKey,
    getSegmentPreviewColor,
    getSegmentWallData,
    getSplitVertexHitRadius,
    getWallTypeToolFromDocument,
    hideEditSessionWalls,
    isAltInteraction,
    isRectangleToolActive,
    prepareRectanglePreviewGraphics,
    pushEditorUndoSnapshot,
    replaceShapeWalls,
    restoreEditSessionWalls,
    scheduleEditorInteractionReset,
    setRectangleEditingState
  };
}

function handlePolylineCanvasClick(event) {
  return handlePolylineCanvasClickImpl(event, getPolylineDeps());
}

function drawPolylinePreview() {
  return drawPolylinePreviewImpl(getPolylineDeps());
}

function changePolylineCurveSegments(delta) {
  return changePolylineCurveSegmentsImpl(delta, getPolylineDeps());
}

function getPolylineVertexAt(point) {
  return getPolylineVertexAtImpl(point, getPolylineDeps());
}

function setPolylineVertex(index, point) {
  return setPolylineVertexImpl(index, point);
}

function getPolylineCurveHandleAt(point) {
  return getPolylineCurveHandleAtImpl(point, getPolylineDeps());
}

function setPolylineCurveHandle(handle, point) {
  return setPolylineCurveHandleImpl(handle, point);
}

function getPolylineSegmentAt(point) {
  return getPolylineSegmentAtImpl(point, getPolylineDeps());
}

function getPolylineSegmentEditFromEvent(event) {
  return getPolylineSegmentEditFromEventImpl(event, getPolylineDeps());
}

function commitPolylineSegmentEdit(edit, event=null) {
  return commitPolylineSegmentEditImpl(edit, event, getPolylineDeps());
}

function editPolylineSegmentWithUndo(index, remove=false, point=null) {
  return editPolylineSegmentWithUndoImpl(index, remove, point, getPolylineDeps());
}

function cyclePolylineSegmentCurveWithUndo(index) {
  return cyclePolylineSegmentCurveWithUndoImpl(index, getPolylineDeps());
}

function removePolylineVertex(index) {
  return removePolylineVertexImpl(index, getPolylineDeps());
}

async function applyPolylineWalls() {
  return applyPolylineWallsImpl(getPolylineDeps());
}

async function applyRectangleWalls() {
  return applyRectangleWallsImpl(getRectangleDeps());
}

async function applyEllipseWalls() {
  return applyEllipseWallsImpl(getEllipseDeps());
}

async function applyCubicWalls() {
  return applyCubicWallsImpl(getCubicDeps());
}

function clearCubicPreview() {
  return clearCubicPreviewImpl(getCubicDeps());
}

function clearEllipsePreview() {
  return clearEllipsePreviewImpl(getEllipseDeps());
}

function clearRectanglePreview() {
  return clearRectanglePreviewImpl(getRectangleDeps());
}

function clearPolylinePreview() {
  return clearPolylinePreviewImpl(getPolylineDeps());
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
  return cancelCubicEditingForDeletedWallImpl(wallDocument, getCubicDeps());
}

function cancelEllipseEditingForDeletedWall(wallDocument) {
  return cancelEllipseEditingForDeletedWallImpl(wallDocument, getEllipseDeps());
}

function cancelRectangleEditingForDeletedWall(wallDocument) {
  return cancelRectangleEditingForDeletedWallImpl(wallDocument, getRectangleDeps());
}

function cancelPolylineEditingForDeletedWall(wallDocument) {
  return cancelPolylineEditingForDeletedWallImpl(wallDocument, getPolylineDeps());
}

function loadCubicCurveFromWall(wall) {
  return loadCubicCurveFromWallImpl(wall, getCubicDeps());
}

function loadEllipseFromWall(wall) {
  return loadEllipseFromWallImpl(wall, getEllipseDeps());
}

function loadRectangleFromWall(wall) {
  return loadRectangleFromWallImpl(wall, getRectangleDeps());
}

function loadPolylineFromWall(wall) {
  return loadPolylineFromWallImpl(wall, getPolylineDeps());
}

function getExistingCurveWallIds() {
  return getExistingCurveWallIdsImpl();
}

function getExistingEllipseWallIds() {
  return getExistingEllipseWallIdsImpl();
}

function getExistingRectangleWallIds() {
  return getExistingRectangleWallIdsImpl();
}

function getExistingPolylineWallIds() {
  return getExistingPolylineWallIdsImpl();
}
