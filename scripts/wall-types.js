import {mergePreservedWallData} from "./wall-preservation.js";

export const SEGMENT_WALL_TYPE_KEYBINDINGS = {
  walls: {label: "Normal", key: "KeyX"},
  doors: {label: "Door", key: "KeyD"},
  windows: {label: "Window", key: "KeyW"},
  invisible: {label: "Invisible", key: "KeyI"},
  secret: {label: "Secret", key: "KeyS"},
  terrain: {label: "Terrain", key: "KeyT"}
};

export const WALL_TYPE_DATA = {
  walls: () => ({
    light: getSenseTypes().NORMAL,
    sight: getSenseTypes().NORMAL,
    sound: getSenseTypes().NORMAL,
    move: getMovementTypes().NORMAL,
    door: getDoorTypes().NONE,
    ds: getDoorStates().CLOSED
  }),
  terrain: () => ({
    light: getSenseTypes().LIMITED,
    sight: getSenseTypes().LIMITED,
    sound: getSenseTypes().LIMITED,
    move: getMovementTypes().NORMAL,
    door: getDoorTypes().NONE,
    ds: getDoorStates().CLOSED
  }),
  invisible: () => ({
    light: getSenseTypes().NONE,
    sight: getSenseTypes().NONE,
    sound: getSenseTypes().NONE,
    move: getMovementTypes().NORMAL,
    door: getDoorTypes().NONE,
    ds: getDoorStates().CLOSED
  }),
  ethereal: () => ({
    light: getSenseTypes().NORMAL,
    sight: getSenseTypes().NORMAL,
    sound: getSenseTypes().NONE,
    move: getMovementTypes().NONE,
    door: getDoorTypes().NONE,
    ds: getDoorStates().CLOSED
  }),
  windows: () => ({
    light: getSenseTypes().NORMAL,
    sight: getSenseTypes().NORMAL,
    sound: getSenseTypes().NORMAL,
    move: getMovementTypes().NONE,
    door: getDoorTypes().NONE,
    ds: getDoorStates().CLOSED
  }),
  doors: () => ({
    light: getSenseTypes().NORMAL,
    sight: getSenseTypes().NORMAL,
    sound: getSenseTypes().NORMAL,
    move: getMovementTypes().NORMAL,
    door: getDoorTypes().DOOR,
    ds: getDoorStates().CLOSED
  }),
  secret: () => ({
    light: getSenseTypes().NORMAL,
    sight: getSenseTypes().NORMAL,
    sound: getSenseTypes().NORMAL,
    move: getMovementTypes().NORMAL,
    door: getDoorTypes().SECRET,
    ds: getDoorStates().CLOSED
  })
};

const WALL_TYPE_FIELDS = ["light", "sight", "sound", "move", "door"];

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

export function getWallTypeToolName(toolName) {
  if (!toolName) return null;
  if (WALL_TYPE_DATA[toolName]) return toolName;
  const alias = WALL_TYPE_TOOL_ALIASES[toolName];
  return WALL_TYPE_DATA[alias] ? alias : null;
}

export function getSegmentWallData(state, key) {
  const tool = state?.wallTypeBySegment?.[key] ?? state?.wallTypeTool ?? "walls";
  const data = WALL_TYPE_DATA[tool]?.() ?? WALL_TYPE_DATA.walls();
  const typePatch = getWallTypePatch(tool) ?? getWallTypePatch("walls");
  return mergePreservedWallData(data, state, key, typePatch);
}

export function getWallTypePatch(toolName) {
  const data = WALL_TYPE_DATA[toolName]?.();
  if (!data) return null;

  const patch = {};
  for (const key of WALL_TYPE_FIELDS) {
    if (key in data) patch[key] = data[key];
  }
  return patch;
}

export function getWallTypeToolFromDocument(wallDocument) {
  const senses = getSenseTypes();
  const movement = getMovementTypes();
  const doors = getDoorTypes();
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

export function getSenseTypes() {
  return CONST.EDGE_SENSE_TYPES ?? CONST.WALL_SENSE_TYPES;
}

export function getMovementTypes() {
  return CONST.EDGE_MOVEMENT_TYPES ?? CONST.WALL_MOVEMENT_TYPES;
}

export function getDoorTypes() {
  return CONST.WALL_DOOR_TYPES;
}

export function getDoorStates() {
  return CONST.WALL_DOOR_STATES;
}


