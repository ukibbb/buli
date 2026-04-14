# Ink fidelity notes

The Pencil design is the source of truth. The terminal is a character-cell grid,
so a small set of pen-file properties cannot be rendered at 1:1 fidelity. This
file documents the unavoidable translations and the mechanical rules we use so
the outcomes are reviewable instead of ad-hoc.

## Color palette — 1:1 from the pen file

All colors in the terminal UI come from the pen file's variables. No additional
colors are introduced. Reference table:

| Pen variable | Hex | Theme token |
| --- | --- | --- |
| `$bg` | `#0A0A0F` | `bg` |
| `$surface-1` | `#111118` | `surfaceOne` |
| `$surface-2` | `#16161F` | `surfaceTwo` |
| `$surface-3` | `#1C1C28` | `surfaceThree` |
| `$border` | `#2A2A3A` | `border` |
| `$border-subtle` | `#1E1E2E` | `borderSubtle` |
| `$text-primary` | `#F1F5F9` | `textPrimary` |
| `$text-secondary` | `#94A3B8` | `textSecondary` |
| `$text-muted` | `#64748B` | `textMuted` |
| `$text-dim` | `#475569` | `textDim` |
| `$green` | `#10B981` | `accentGreen` |
| `$amber` | `#F59E0B` | `accentAmber` |
| `$cyan` | `#22D3EE` | `accentCyan` |
| `$red` | `#EF4444` | `accentRed` |
| `$primary` | `#6366F1` | `accentPrimary` |
| `$primary-muted` | `#818CF8` | `accentPrimaryMuted` |
| `$purple` | `#A855F7` | `accentPurple` |

## Pixel → cell translation

A terminal cell has no sub-cell resolution. Every pen-file pixel value
(`gap`, `padding`, `width`, `height` when in pixels) is mapped through one helper
used everywhere:

```ts
// Anything between breakpoints rounds up.
// 0 → 0, 1-6 → 1, 7-12 → 1-2, 13-18 → 2-3, 19-24 → 3
export function toTerminalCellsFromDesignPixels(designPixelValue: number): number;
```

Concrete HERO 1 outcomes:

| Pen value | Terminal value |
| --- | --- |
| `gap: 4` | `gap={1}` |
| `gap: 8` | `gap={1}` |
| `gap: 10` | `gap={1}` |
| `gap: 12` | `gap={1}` |
| `gap: 16` (between stream blocks) | `gap={1}` |
| `padding: [10, 14]` | `paddingY={1} paddingX={2}` |
| `padding: [16, 20]` | `paddingY={2} paddingX={2}` |
| `width: 80` (ctx track) | `width={12}` (rescaled so it reads well in monospace) |

## Sub-row height items

The design has two genuinely sub-cell visual elements. Explicit decisions:

- **2 px accent stripes** (`V0QV7`, `tBwe7`, `jiLZk`, `ZpR2v`, `GvmM0`) — render as
  **one full row** of solid color via a whitespace `<Text>` with `backgroundColor`.
  One row is the minimum; it reads as a thin accent bar.
- **Font-size hierarchy** (`fontSize: 10/11/12/13/14`) — the terminal has one font
  size. Hierarchy expressed via `bold`, `dimColor`, and accent color. This matches
  the pattern already in `chatScreenTheme`.

These are the only two places where 100% fidelity is impossible. Everything else
renders 1:1 after the pixel → cell translation.

## Icons — Lucide → Unicode

Ink has no icon engine. The design references Lucide glyphs; we substitute
Unicode characters that render in any modern terminal without requiring a
Nerd Font:

| Lucide name | Unicode |
| --- | --- |
| `check` | `✓` |
| `arrow-up` | `↑` |
| `arrow-down` | `↓` |
| `chevron-right` | `›` |
| `x` | `×` |
| status / mode dot (ellipse node) | `●` |
| snake rectangle node | `▰` |
| snake ellipse node | `●` |

Substitutions live in `packages/ink-tui/src/components/glyphs.ts` as named
constants so every usage is greppable and inspectable.

## Corner radius

Pen `cornerRadius` on solid-filled rectangles cannot be reproduced; terminals
only render corner shapes on box borders. Where the design uses rounded fills
(chips `modeChip`, `modelChip`), we render them with `borderStyle="round"` and
a border color matching the fill. This preserves the rounded visual at the
cost of one column/row of border inside the chip bounds.

## Italic, bold, strikethrough

Supported by `<Text italic bold strikethrough>`. Actual rendering depends on the
user's terminal font. Acceptable — the design's intent (emphasis) survives even
when italic degrades.

## Animations

`useAnimation` drives all animated elements (reasoning-stream cursor blink,
snake cycle, elapsed-timer updates). Integer tick counter modulo frame count
selects the current frame. No framerate assumption beyond Ink's default.
