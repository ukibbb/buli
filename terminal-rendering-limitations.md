# Terminal Rendering Limitations

The Pencil design is the source of truth. This document records the translation
rules the current TUI uses when design intent meets a terminal cell grid.

## 1. Goals

The terminal UI should preserve:

- layout hierarchy
- semantic color
- message and tool-state clarity
- stable fullscreen behavior
- readable spacing and rhythm

It does not try to simulate a pixel canvas.

## 2. Hard Limits

These are constraints of the terminal medium itself.

| Design feature | Why it cannot be exact | Translation rule |
| --- | --- | --- |
| Sub-cell spacing | Cells are the unit of layout. | Collapse small pixel gaps to whole-cell spacing. |
| Sub-row accent stripes | One text row is the minimum vertical unit. | Render a one-row solid stripe. |
| Font-size hierarchy | The terminal uses one font face and size. | Express hierarchy with weight, color, spacing, and borders. |
| Letter spacing | Not representable between cells. | Drop it. |
| Rounded filled rectangles without visible border | Corners are glyph-based, not vector geometry. | Use border glyphs or square surfaces. |
| Font-family changes | Terminal chooses the font. | Ignore. |
| Shadows and blur | No sub-cell alpha or blur model exists. | Use contrast, borders, and surface color instead. |
| Raster images and icon fonts | The current TUI is text and box based. | Substitute Unicode glyphs or omit the asset. |
| True subscript and superscript positioning | There is no half-row text positioning. | Keep the text inline and express the distinction with styling only. |

## 3. Translation Rules

These are the current default mappings.

### Spacing

- Pixel spacing is translated to whole terminal cells.
- The smallest visible accent or divider is one terminal row.

### Typography

- Headings collapse to stronger weight and accent color.
- Secondary information uses dimmer foreground colors.
- Inline code uses surface contrast rather than font changes.

### Surfaces And Borders

- Surfaces communicate grouping more than decoration.
- Borders are used when they clarify message boundaries or tool states.
- Accent rows replace thin pixel dividers.

### Icons And Glyphs

Lucide icon names from the pen file are mapped to Unicode glyphs in `packages/tui/src/components/glyphs.ts`.

## 4. Practical Standard

The success bar is not pixel parity.

The success bar is:

- clear hierarchy
- readable transcript rendering
- stable fullscreen interaction
- recognizable design intent after translation to a character grid
