export function preparePreviewGraphics(state, layer, {configure=null}={}) {
  if (!state || !layer?.preview) return null;

  if (!state.graphics || state.graphics._destroyed) {
    state.graphics = createPreviewGraphics(configure);
    layer.preview.addChild(state.graphics);
  } else if (!state.graphics.parent) {
    configurePreviewGraphicsForFoundry(state.graphics);
    configure?.(state.graphics);
    layer.preview.addChild(state.graphics);
  } else {
    configurePreviewGraphicsForFoundry(state.graphics);
    configure?.(state.graphics);
  }

  try {
    clearManagedPreviewChildren(state.graphics);
    state.graphics.clear();
  } catch (_error) {
    try {
      destroyPreviewGraphics(state);
      state.graphics = createPreviewGraphics(configure);
      layer.preview.addChild(state.graphics);
      state.graphics.clear();
    } catch (_recoveryError) {
      destroyPreviewGraphics(state);
      state.graphics = null;
      return null;
    }
  }

  return state.graphics;
}

export function createPreviewGraphics(configure=null) {
  const graphics = new PIXI.Graphics();
  configurePreviewGraphicsForFoundry(graphics);
  configure?.(graphics);
  return graphics;
}

export function configurePreviewGraphicsForFoundry(graphics) {
  if (!graphics || graphics._indyWallsPreviewCompatible) return;
  graphics._onDragEnd = () => {};
  graphics._indyWallsPreviewCompatible = true;
}

function clearManagedPreviewChildren(container) {
  if (!container?.children?.length) return;
  for (const child of [...container.children]) {
    if (!child?._indyWallsPreviewManaged) continue;
    try {
      container.removeChild(child);
    } catch (_error) {
      // Canvas teardown can invalidate parent-child links before this cleanup runs.
    }
    try {
      child.destroy({children: true});
    } catch (_error) {
      try {
        child.destroy?.(true);
      } catch (_recoveryError) {
        // The child may already be destroyed.
      }
    }
  }
}

export function destroyPreviewGraphics(state) {
  try {
    clearManagedPreviewChildren(state?.graphics);
    state?.graphics?.destroy();
  } catch (_error) {
    // The canvas may already have invalidated the PIXI object during scene teardown.
  }
}


