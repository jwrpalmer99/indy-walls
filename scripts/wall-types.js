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

export function getWallTypeToolName(toolName) {
  if (!toolName) return null;
  if (WALL_TYPE_DATA[toolName]) return toolName;
  const alias = WALL_TYPE_TOOL_ALIASES[toolName];
  return WALL_TYPE_DATA[alias] ? alias : null;
}

export function getSegmentWallData(state, key) {
  const tool = state?.wallTypeBySegment?.[key] ?? state?.wallTypeTool ?? "walls";
  return WALL_TYPE_DATA[tool]?.() ?? WALL_TYPE_DATA.walls();
}

export function getWallTypeToolFromDocument(wallDocument) {
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
