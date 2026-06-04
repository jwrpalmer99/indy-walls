# Indy Walls

Indy Walls is a Foundry VTT module for small wall-editing improvements.

Compatibility:

- Minimum Foundry VTT version: 13
- Verified Foundry VTT version: 14

Optional dependencies:

- [lib - ColorSettings](https://github.com/ardittristan/VTTColorSettings) (`colorsettings`) is recommended for color picker controls in the module settings. Indy Walls still works without it and falls back to plain hex text fields.

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

### Preview Styling

Module settings include client-side controls for the editor preview wall color and width, regular vertex color and size, active vertex color, endpoint color and size, Bezier handle color and size, and outline color and width.
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
5. Use `+` and `-`, or Ctrl-scrollwheel, to change the number of generated wall segments.
6. Use the check button or Enter to create wall segments, or X or Escape to cancel.

Generated segments use the last selected wall type from the standard wall type buttons.

Bezier metadata is stored on each generated wall segment. Ctrl-left-click any generated segment to reopen the curve editor so it can be adjusted and re-applied.

### Ellipse Walls

The Wall Controls include an Ellipse Wall tool.

Basic workflow:

1. Open Wall Controls.
2. Select the Ellipse Wall tool.
3. Click-drag on the canvas to place the ellipse.
4. Hold Alt while placing to make a circle.
5. Hold Ctrl while placing to grow the ellipse from the center point.
6. Use `+` and `-`, or Ctrl-scrollwheel, to change the number of generated wall segments.
7. Use the check button or Enter to create wall segments, or X or Escape to cancel.

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
12. Use the check button or Enter to create wall segments, or X or Escape to cancel.

Rectangle metadata is stored on each generated wall segment. Ctrl-left-click any generated segment to reopen the rectangle editor, including per-side vertices, segment gaps, and removed sides, so it can be adjusted and re-applied.

## License

Indy Walls is licensed under the BSD 3-Clause License. See [license.md](license.md) for the full license text.

## Attribution

The cubic Bezier wall tool is informed by DragonFlagon Curvy Walls from the DragonFlagon FoundryVTT Modules project:

https://github.com/flamewave000/dragonflagon-fvtt

DragonFlagon FoundryVTT Modules is licensed under the BSD 3-Clause License. The required copyright notice,
license conditions, and disclaimer are included in [license.md](license.md).
