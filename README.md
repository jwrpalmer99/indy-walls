# Indy Walls

Indy Walls is a Foundry VTT module for small wall-editing improvements.

Compatibility:

- Minimum Foundry VTT version: 13
- Verified Foundry VTT version: 14

## Features

### Quick Wall Type Changes

When enabled in module settings, clicking the existing Wall Controls type buttons updates the currently selected walls to that type.

Supported type buttons:

- Normal walls
- Terrain walls
- Invisible walls
- Ethereal walls
- Doors
- Secret doors

This setting is client-side and is enabled by default.

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

Bezier metadata is stored on each generated wall segment. Selecting any segment created by this tool reloads the full curve so it can be adjusted and re-applied.

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

Ellipse metadata is stored on each generated wall segment. Selecting any segment created by this tool reloads the full ellipse so it can be adjusted and re-applied.

## License

Indy Walls is licensed under the BSD 3-Clause License. See [license.md](license.md) for the full license text.

## Attribution

The cubic Bezier wall tool is informed by DragonFlagon Curvy Walls from the DragonFlagon FoundryVTT Modules project:

https://github.com/flamewave000/dragonflagon-fvtt

DragonFlagon FoundryVTT Modules is licensed under the BSD 3-Clause License. The required copyright notice,
license conditions, and disclaimer are included in [license.md](license.md).
