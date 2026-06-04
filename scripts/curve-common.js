export const HANDLE_RADIUS = 12;

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function getEventPoint(layer, point, event) {
  const [x, y] = layer._getWallEndpointCoordinates(point, {snap: !event.shiftKey});
  return {x, y};
}

export function getHandleAt(handles, point) {
  return handles.findIndex((handle) => {
    return Math.hypot(handle.x - point.x, handle.y - point.y) <= HANDLE_RADIUS;
  });
}

export function drawHandle(graphics, point, color) {
  graphics.beginFill(color, 0.95);
  graphics.lineStyle(2, 0x111111, 0.9);
  graphics.drawCircle(point.x, point.y, HANDLE_RADIUS);
  graphics.endFill();
}

export function drawVertex(graphics, point) {
  graphics.beginFill(0xffffff, 0.95);
  graphics.lineStyle(1, 0x111111, 0.9);
  graphics.drawCircle(point.x, point.y, 4);
  graphics.endFill();
}

export function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

export function clonePoints(points) {
  return points.map((point) => ({x: point.x, y: point.y}));
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
