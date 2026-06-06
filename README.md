
# Indy Walls

Indy Walls is a Foundry VTT module with wall-editing improvements, including curves/circular/rectangular wall drawing, borrowing ideas from DragonFlagon Curvy Walls .

Compatibility:

- Minimum Foundry VTT version: 13
- Verified Foundry VTT version: 14

Required dependencies:

- [libWrapper](https://github.com/ruipin/fvtt-lib-wrapper) (`lib-wrapper`) is required for coordinated wrapping of Foundry wall interaction handlers.

Optional dependencies:

- [lib - ColorSettings](https://github.com/ardittristan/VTTColorSettings) (`colorsettings`) is recommended for color picker controls in the module settings. Indy Walls still works without it and falls back to plain hex text fields.


<img width="400" height="225" alt="bezier_curve" src="https://github.com/user-attachments/assets/4c8295a9-1e42-4efa-97ee-6d15f98051c8" />
<img width="400" height="224" alt="ellipse" src="https://github.com/user-attachments/assets/c4fa0adb-aec6-4cc9-92df-7700c468da0d" />
<img width="400" height="263" alt="polyline-curve" src="https://github.com/user-attachments/assets/5f31efb5-b402-41db-9f38-02d0724e1a0b" />
<img width="400" height="224" alt="rectangle" src="https://github.com/user-attachments/assets/6af3209e-2880-4f2b-8e6f-e941afcc151a" />



## Features

### Quick Wall Type Changes

When enabled in module settings, Ctrl-clicking the existing Wall Controls type buttons updates the currently selected walls to that type. Normal clicks keep Foundry's standard tool-selection behavior.

Supported type buttons:

- Normal walls
- Terrain walls
- Invisible walls
- Ethereal walls
- Windows
- Doors
- Secret doors

This setting is client-side and is enabled by default.

### Indy Shape Editing

Indy Walls adds shape-based wall tools to Foundry's Wall Controls. Generated wall segments store metadata so the shape can be reopened later.

Common editing controls:

- Ctrl-left-click any generated Indy wall segment to reopen its shape editor.
- Use the undo/redo editor buttons or Ctrl-Z/Ctrl-Y while editing.
- Use Ctrl-C to copy the active shape preview.
- Use Ctrl-V to paste the copied shape centered on the mouse position.
- Use the center handle to move the active shape.
- Press Delete or Backspace while editing to delete the underlying wall documents.
- Press Enter or the check button to create or re-apply wall segments.
- Press Escape or the cancel button to cancel editing.

Generated segments use the last selected wall type from Foundry's wall type buttons unless a segment has an override. While editing a shape, hover a segment and press:

- `X` for Normal wall
- `D` for Door
- `W` for Window
- `I` for Invisible
- `S` for Secret Door
- `T` for Terrain

When enabled in module settings, those same wall type hotkeys can also update a hovered Foundry wall while Wall Controls are active. This setting is disabled by default.

### Convert to Indy Walls

The Wall Controls include a Convert to Indy Walls button for GMs. It scans plain Foundry walls in the current scene and previews the proposed Indy shapes before changing wall documents. Use the inline Save button to apply the conversion or Cancel to discard it. Detected axis-aligned rectangles become Indy rectangles, near-elliptical loops become Indy ellipses, and remaining connected paths become Indy polylines with arc or Bezier curve metadata where the fit is close enough.

The inline tolerance sliders and matching stored settings control how aggressively rectangle, ellipse, arc, and Bezier fits are accepted. The default value of `1` keeps the automatic scene-size-derived tolerance; lower values are stricter, and higher values, up to `10`, allow looser fits.

### Clean Up Walls

The Wall Controls include a Clean Up Walls button for GMs. It snaps nearby wall endpoints together using the wall cleanup snap tolerance module setting, deletes walls that collapse to zero length, and removes duplicate wall lines when their wall data matches. For Indy shapes, saved endpoint or vertex metadata is updated where possible so the editor reopens on the cleaned points, but curve handles are left unchanged.

### Preview Styling

Module settings include client-side controls for the editor preview wall color and width, per-type segment preview colors, regular vertex color and size, active vertex color, endpoint color and size, Bezier handle color and size, center handle color and size, outline color and width, and the active Indy shape tool button highlight color, glow, and border width.
If lib - ColorSettings is active, Indy Walls uses its color picker UI for color settings. Without it, color settings remain plain hex text fields.

### Editing Undo/Redo

While editing an Indy Walls shape, use the undo/redo buttons or Ctrl-Z/Ctrl-Y to undo and redo preview edits. These shortcuts are swallowed by the module during shape editing so they do not affect Foundry wall history or browser form undo.

### Cubic Bezier Walls

The Wall Controls include a Cubic Bezier Wall tool.

Basic workflow:

1. Open Wall Controls.
2. Select the Cubic Bezier Wall tool.
3. Click-drag on the canvas to place the initial curve.
4. Drag the red endpoint handles or green Bezier handles to adjust the curve.
5. Right-click the curve to toggle between one-handle arc mode and two-handle Bezier mode.
6. Use `+` and `-`, or Ctrl-scrollwheel, to change the number of generated wall segments.
7. Use the check button or Enter to create wall segments, or Escape to cancel.

Curve metadata is stored on each generated wall segment. Ctrl-left-click any generated segment to reopen the curve editor, including arc/Bezier mode, handles, segment count, hidden segments, and per-segment wall types, so it can be adjusted and re-applied.

### Ellipse Walls

The Wall Controls include an Ellipse Wall tool.

Basic workflow:

1. Open Wall Controls.
2. Select the Ellipse Wall tool.
3. Click-drag on the canvas to place the ellipse.
4. Hold Alt while placing to make a circle.
5. Hold Ctrl while placing to grow the ellipse from the center point.
6. Drag the red corner handles to resize the ellipse. Hold Alt while resizing to keep it circular.
7. Drag ellipse vertices to rotate the ellipse.
8. Left-click a hidden segment to restore it.
9. Alt-click a segment to hide it.
10. Use `+` and `-`, or Ctrl-scrollwheel, to change the number of generated wall segments.
11. Use the check button or Enter to create wall segments, or Escape to cancel.

Ellipse metadata is stored on each generated wall segment. Ctrl-left-click any generated segment to reopen the ellipse editor so it can be adjusted and re-applied.

### Rectangle Walls

The Wall Controls include a Rectangle Wall tool.

Basic workflow:

1. Open Wall Controls.
2. Select the Rectangle Wall tool.
3. Click-drag on the canvas to place the rectangle.
4. Left-click a rectangle side to add a vertex and split that side.
5. Drag intermediate vertices along their side to reposition the split.
6. Alt-click an intermediate vertex to remove it.
7. Alt-click a wall segment between vertices to create a gap in that side.
8. Left-click a gapped segment to restore it.
9. Alt-click a side with no intermediate vertices to remove that side wall.
10. Left-click a removed side to restore it.
11. Use Ctrl-scrollwheel to change all four side segment counts together.
12. Use the check button or Enter to create wall segments, or Escape to cancel.

Rectangle metadata is stored on each generated wall segment. Ctrl-left-click any generated segment to reopen the rectangle editor, including per-side vertices, segment gaps, and removed sides, so it can be adjusted and re-applied.

### Polyline Walls

The Wall Controls include a Polyline Wall tool for drawing vertex-to-vertex wall paths.

Basic workflow:

1. Open Wall Controls.
2. Select the Polyline Wall tool.
3. Click on the canvas to place each point.
4. Double-click to stop drawing and enter edit mode.
5. Double-click back on the first point to stop drawing as a closed polygon.
6. Drag points to reposition them.
7. Left-click a segment to add a point, or to restore a hidden segment.
8. Right-click a segment to cycle it between a straight line, an arc, and a Bezier curve.
9. Drag the curve handles on arc and Bezier segments to adjust their shape.
10. Use Ctrl-scrollwheel over a curved segment to change that segment's generated point count.
11. Alt-click a point to remove it.
12. Alt-click a segment to hide it.
13. Use the check button or Enter to create wall segments, or Escape to cancel.

Polyline metadata is stored on each generated wall segment. Ctrl-left-click any generated segment to reopen the polyline editor, including closed polygon state, hidden segments, curve modes and handles, global and per-segment curved detail, and per-segment wall types.

## License

Indy Walls is licensed under the BSD 3-Clause License. See [license.md](license.md) for the full license text.

## Attribution

This module borrows heavily from the ideas in DragonFlagon Curvy Walls from the DragonFlagon FoundryVTT Modules project:

https://github.com/flamewave000/dragonflagon-fvtt

DragonFlagon FoundryVTT Modules is licensed under the BSD 3-Clause License. The required copyright notice,
license conditions, and disclaimer are included in [license.md](license.md).
