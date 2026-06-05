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

export function getEventPoint(layer, point, event) {
  const [x, y] = layer._getWallEndpointCoordinates(point, {snap: !event.shiftKey});
  return {x, y};
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
