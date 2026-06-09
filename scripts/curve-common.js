export const HANDLE_RADIUS = 12;
export const VERTEX_RADIUS = 5;

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function getScaledRadius(radius) {
  const scale = canvas?.stage?.scale?.x || canvas?.viewport?.scale || 1;
  return radius / Math.max(scale, 0.1);
}

export function getHandleHitRadius(radius=HANDLE_RADIUS, outlineWidth=2) {
  return getScaledRadius(radius + outlineWidth + 8);
}

export function getEventPoint(layer, point, event, {snapToClosestWallPoint=false}={}) {
  const monkSnapPoint = snapToClosestWallPoint ? getMonksClosestWallPoint(point) : null;
  if (monkSnapPoint) return monkSnapPoint;

  const [x, y] = layer._getWallEndpointCoordinates(point, {snap: !event.shiftKey});
  return {x, y};
}

export function getMonksClosestWallPoint(point, excludeWallId=null) {
  if (!point) return null;

  const activeState = getMonksSnapActiveState();
  if (!activeState.active) return null;

  const tolerance = getMonksSnapTolerance();
  if (!(tolerance > 0)) return null;

  let closestEndpoint = null;
  let closestEndpointDistance = Infinity;
  let closestSegment = null;
  let closestSegmentDistance = Infinity;
  for (const wall of getSceneWallDocuments()) {
    const document = wall?.document ?? wall;
    if (!document || document.id === excludeWallId) continue;
    const c = document.c;
    if (!Array.isArray(c) || c.length < 4) continue;

    for (const endpoint of getWallSegmentEndpoints(c)) {
      const distance = Math.hypot(endpoint.x - point.x, endpoint.y - point.y);
      if (distance < closestEndpointDistance) {
        closestEndpointDistance = distance;
        closestEndpoint = endpoint;
      }
    }

    const segmentPoint = getClosestWallSegmentPoint(point, c);
    if (!segmentPoint) continue;
    if (segmentPoint.distance < closestSegmentDistance) {
      closestSegmentDistance = segmentPoint.distance;
      closestSegment = segmentPoint.point;
    }
  }

  if (closestEndpointDistance < tolerance) return closestEndpoint;
  return closestSegmentDistance < tolerance ? closestSegment : null;
}

function getWallSegmentEndpoints(coordinates) {
  const endpoints = [
    {x: Number(coordinates[0]), y: Number(coordinates[1])},
    {x: Number(coordinates[2]), y: Number(coordinates[3])}
  ];
  return endpoints.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function getClosestWallSegmentPoint(point, coordinates) {
  const start = {
    x: Number(coordinates[0]),
    y: Number(coordinates[1])
  };
  const end = {
    x: Number(coordinates[2]),
    y: Number(coordinates[3])
  };
  if (!Number.isFinite(start.x) || !Number.isFinite(start.y) || !Number.isFinite(end.x) || !Number.isFinite(end.y)) return null;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = (dx * dx) + (dy * dy);
  if (!lengthSquared) {
    return {
      point: start,
      distance: Math.hypot(start.x - point.x, start.y - point.y)
    };
  }

  const t = clamp((((point.x - start.x) * dx) + ((point.y - start.y) * dy)) / lengthSquared, 0, 1);
  const closest = {
    x: start.x + (dx * t),
    y: start.y + (dy * t)
  };
  return {
    point: closest,
    distance: Math.hypot(closest.x - point.x, closest.y - point.y)
  };
}

function getMonksSnapActiveState() {
  const moduleActive = game?.modules?.get?.("monks-wall-enhancement")?.active === true;
  const tool = ui?.controls?.control?.tools?.snaptowall
    ?? ui?.controls?.controls?.walls?.tools?.snaptowall
    ?? ui?.controls?.tools?.snaptowall;
  const button = getMonksSnapButton();
  const toolFound = !!tool;
  const toolActive = tool?.active === true
    || button?.classList?.contains("active")
    || button?.getAttribute?.("aria-pressed") === "true";
  return {
    active: moduleActive && toolActive,
    moduleActive,
    toolActive,
    toolFound,
    buttonFound: !!button,
    buttonActiveClass: button?.classList?.contains("active") ?? false,
    buttonAriaPressed: button?.getAttribute?.("aria-pressed") ?? null
  };
}

function getMonksSnapButton() {
  return document.querySelector('[data-tool="snaptowall"]')
    ?? document.querySelector('[data-action="snaptowall"]')
    ?? document.querySelector('[name="snaptowall"]');
}

function getMonksSnapTolerance() {
  try {
    const value = Number(game.settings.get("monks-wall-enhancement", "snap-tolerance"));
    return Number.isFinite(value) ? value : 0;
  } catch (_error) {
    return 0;
  }
}

function getSceneWallDocuments() {
  const walls = canvas?.scene?.walls;
  if (!walls) return [];
  if (Array.isArray(walls.contents)) return walls.contents;
  if (typeof walls.values === "function") return Array.from(walls.values());
  if (typeof walls[Symbol.iterator] === "function") return Array.from(walls);
  return [];
}

export function getHandleAt(handles, point, radius=HANDLE_RADIUS, outlineWidth=2) {
  const hitRadius = getHandleHitRadius(radius, outlineWidth);
  return handles.findIndex((handle) => {
    return Math.hypot(handle.x - point.x, handle.y - point.y) <= hitRadius;
  });
}

export function drawHandle(graphics, point, color, {radius=HANDLE_RADIUS, outlineColor=0x111111, outlineWidth=2}={}) {
  const scaledRadius = getScaledRadius(radius);
  graphics.beginFill(color, 0.95);
  graphics.lineStyle(getScaledRadius(outlineWidth), outlineColor, 0.9);
  graphics.drawCircle(point.x, point.y, scaledRadius);
  graphics.endFill();
}

export function drawVertex(graphics, point, {color=0xffffff, radius=VERTEX_RADIUS, outlineColor=0x111111, outlineWidth=1.5}={}) {
  const scaledRadius = getScaledRadius(radius);
  graphics.beginFill(color, 0.95);
  graphics.lineStyle(getScaledRadius(outlineWidth), outlineColor, 0.9);
  graphics.drawCircle(point.x, point.y, scaledRadius);
  graphics.endFill();
}

export function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

export function clonePoints(points) {
  return points.map((point) => ({x: point.x, y: point.y}));
}

export function getQuadraticBezierPoint(p0, p1, p2, t) {
  const mt = 1 - t;
  return {
    x: (mt * mt * p0.x) + (2 * mt * t * p1.x) + (t * t * p2.x),
    y: (mt * mt * p0.y) + (2 * mt * t * p1.y) + (t * t * p2.y)
  };
}

export function getCubicBezierPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return {
    x: (mt ** 3 * p0.x) + (3 * mt ** 2 * t * p1.x) + (3 * mt * t ** 2 * p2.x) + (t ** 3 * p3.x),
    y: (mt ** 3 * p0.y) + (3 * mt ** 2 * t * p1.y) + (3 * mt * t ** 2 * p2.y) + (t ** 3 * p3.y)
  };
}

export function ensureEditButtons({id, buttons}) {
  if (document.getElementById(id)) return;

  const controls = document.createElement("div");
  controls.id = id;
  controls.className = "indy-walls-edit-buttons";
  controls.hidden = true;

  for (const [title, icon, onClick] of buttons) {
    const button = document.createElement("button");
    button.type = "button";
    button.title = game.i18n.localize(title);
    button.innerHTML = `<i class="${icon}"></i>`;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    controls.append(button);
  }

  document.body.append(controls);
}

export function setEditButtonsVisible(id, visible) {
  const controls = document.getElementById(id);
  if (controls) controls.hidden = !visible;
}

export function positionEditButtons({id, toolName, fallbackTop=120}) {
  const controls = document.getElementById(id);
  if (!controls || controls.hidden) return;

  const toolButton = document.querySelector(`[data-tool="${toolName}"]`);
  if (!toolButton) {
    const uiLeft = document.getElementById("ui-left")?.getBoundingClientRect();
    controls.style.left = `${(uiLeft?.right ?? 70) + 10}px`;
    controls.style.top = `${uiLeft?.top ?? fallbackTop}px`;
    return;
  }

  const rect = toolButton.getBoundingClientRect();
  controls.style.left = `${rect.right + 10}px`;
  controls.style.top = `${rect.top}px`;
}


