let moduleId = null;
let debugSetting = null;
let debugCallback = null;

export function configureInteractionHelpers({moduleId: id, debugSetting: setting, debug=null}) {
  moduleId = id;
  debugSetting = setting;
  debugCallback = debug;
}

export function consumeCanvasInteraction(event) {
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

export function resetCanvasCursor(event=null) {
  clearMouseInteractionManagerDragState(event);
  if (canvas?.app?.view?.style) canvas.app.view.style.cursor = "";
  if (document.body?.style) document.body.style.cursor = "";
}

export function resetEditorCursor(event=null) {
  clearMouseInteractionManagerDragState(event, {includeCanvas: false});
  if (canvas?.app?.view?.style) canvas.app.view.style.cursor = "";
  if (document.body?.style) document.body.style.cursor = "";
}

export function scheduleEditorInteractionReset(event=null) {
  resetEditorCursor(event);
  globalThis.queueMicrotask?.(() => {
    resetEditorCursor(event);
  });
  setTimeout(() => {
    resetEditorCursor(event);
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

export function debugInteractionManagers(message, event=null, extra={}) {
  try {
    if (!game?.settings?.get(moduleId, debugSetting)) return;
  } catch (_error) {
    return;
  }

  console.debug(`${moduleId} | ${message}`, {
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

export function getInteractionPoint(event) {
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

export function getClientInteractionPoint(event) {
  return getClientInteractionPoints(event)[0]?.point ?? null;
}

export function getClientInteractionPoints(event) {
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
    debugCallback?.("pixi mapPositionToPoint failed", {message: error?.message});
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
