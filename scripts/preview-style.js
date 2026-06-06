import {
  clamp,
  drawHandle,
  drawVertex,
  getScaledRadius
} from "./curve-common.js";

export const STYLE_SETTINGS = {
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
  moveHandleColor: "previewMoveHandleColor",
  moveHandleSize: "previewMoveHandleSize",
  outlineColor: "previewOutlineColor",
  outlineWidth: "previewOutlineWidth"
};

let moduleId = null;
let onStyleChange = null;

export function configurePreviewStyle({moduleId: id, onChange=null}) {
  moduleId = id;
  onStyleChange = onChange;
}

export function registerStyleSettings() {
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
    moveHandleColor: ["PreviewMoveHandleColor", String, "#44c7ff"],
    outlineColor: ["PreviewOutlineColor", String, "#111111"]
  })) {
    registerColorStyleSetting(key, data);
  }

  for (const [key, data] of Object.entries({
    wallWidth: ["PreviewWallWidth", Number, 2, {min: 1, max: 12, step: 1}],
    vertexSize: ["PreviewVertexSize", Number, 3, {min: 2, max: 20, step: 1}],
    endpointSize: ["PreviewEndpointSize", Number, 8, {min: 4, max: 32, step: 1}],
    handleSize: ["PreviewHandleSize", Number, 6, {min: 4, max: 32, step: 1}],
    moveHandleSize: ["PreviewMoveHandleSize", Number, 8, {min: 4, max: 32, step: 1}],
    outlineWidth: ["PreviewOutlineWidth", Number, 2, {min: 0, max: 8, step: 0.5}]
  })) {
    const [label, type, defaultValue, range] = data;
    game.settings.register(moduleId, STYLE_SETTINGS[key], {
      name: game.i18n.localize(`indy-walls.Settings.${label}.Name`),
      hint: game.i18n.localize(`indy-walls.Settings.${label}.Hint`),
      scope: "client",
      config: true,
      type,
      default: defaultValue,
      range,
      onChange: onStyleChange
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
    new ColorSetting(moduleId, settingKey, {
      name,
      hint,
      label: game.i18n.localize("indy-walls.Settings.ColorPickerLabel"),
      restricted: false,
      defaultColor: defaultValue,
      scope: "client",
      onChange: onStyleChange
    });
    return;
  }

  game.settings.register(moduleId, settingKey, {
    name,
    hint,
    scope: "client",
    config: true,
    type,
    default: defaultValue,
    onChange: onStyleChange
  });
}

export function getPreviewStyle() {
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
    wallWidth: getStyleNumber(STYLE_SETTINGS.wallWidth, 1, 1, 12),
    guideWidth: Math.max(getStyleNumber(STYLE_SETTINGS.wallWidth, 1, 1, 12) / 2, 1),
    vertexColor: getStyleColor(STYLE_SETTINGS.vertexColor, 0xffffff),
    vertexActiveColor: getStyleColor(STYLE_SETTINGS.vertexActiveColor, 0xaaff44),
    vertexSize: getStyleNumber(STYLE_SETTINGS.vertexSize, 3, 2, 20),
    splitVertexSize: Math.max(getStyleNumber(STYLE_SETTINGS.vertexSize, 3, 2, 20) + 3, 4),
    endpointColor: getStyleColor(STYLE_SETTINGS.endpointColor, 0xff4444),
    endpointSize: getStyleNumber(STYLE_SETTINGS.endpointSize, 8, 4, 32),
    handleColor: getStyleColor(STYLE_SETTINGS.handleColor, 0xaaff44),
    handleSize: getStyleNumber(STYLE_SETTINGS.handleSize, 12, 4, 32),
    moveHandleColor: getStyleColor(STYLE_SETTINGS.moveHandleColor, 0x44c7ff),
    moveHandleSize: getStyleNumber(STYLE_SETTINGS.moveHandleSize, 12, 4, 32),
    outlineColor,
    outlineWidth
  };
}

function getStyleNumber(setting, fallback, min, max) {
  const value = Number(game.settings.get(moduleId, setting));
  if (!Number.isFinite(value)) return fallback;
  return clamp(value, min, max);
}

function getStyleColor(setting, fallback) {
  return colorStringToNumber(game.settings.get(moduleId, setting), fallback);
}

export function colorStringToNumber(value, fallback) {
  if (typeof value !== "string") return fallback;
  const match = value.trim().match(/^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/i);
  return match ? parseInt(match[1], 16) : fallback;
}

export function drawPreviewVertex(graphics, point, style=getPreviewStyle()) {
  drawVertex(graphics, point, {
    color: style.vertexColor,
    radius: style.vertexSize,
    outlineColor: style.outlineColor,
    outlineWidth: style.outlineWidth
  });
}

export function drawEndpoint(graphics, point, style=getPreviewStyle()) {
  drawHandle(graphics, point, style.endpointColor, {
    radius: style.endpointSize,
    outlineColor: style.outlineColor,
    outlineWidth: style.outlineWidth
  });
}

export function drawBezierHandle(graphics, point, style=getPreviewStyle()) {
  drawHandle(graphics, point, style.handleColor, {
    radius: style.handleSize,
    outlineColor: style.outlineColor,
    outlineWidth: style.outlineWidth
  });
}

export function drawMoveHandle(graphics, point, style=getPreviewStyle()) {
  drawHandle(graphics, point, style.moveHandleColor, {
    radius: style.moveHandleSize,
    outlineColor: style.outlineColor,
    outlineWidth: style.outlineWidth
  });
}

export function getSplitVertexHitRadius(style=getPreviewStyle()) {
  return getScaledRadius(style.splitVertexSize + (style.outlineWidth / 2));
}


