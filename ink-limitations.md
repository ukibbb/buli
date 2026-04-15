# Ink fidelity notes

The Pencil design is the source of truth. This document records two things:

1. What Ink **can** render (so we stop under-building).
2. What Ink **cannot** render (so we stop pretending we can reach 1:1).

Everything below is verified against the Ink source vendored at `tui/ink/src/`.
Every claim cites the decisive file/line.

---

## 0. TL;DR — the current screenshot is NOT "as close as we can get"

The terminal shown in the user's screenshot only paints a small slice of what the
design specifies:

- TopBar (status dot + cwd + mode chip + model chip + close)
- One plain assistant message block
- One input panel with prompt caret + snake indicator

The HERO 1 frame (`j20vJ`) and the AGENT RESPONSE library (`idXGN`) describe ~30
additional components — tool-call cards, reasoning-collapsed chips with stripe
headers, diff blocks, fenced code, shell blocks, callouts, checklists, tables,
file-ref pills, plan proposals, rate-limit notices, tool-approval prompts.

Of those, the overwhelming majority are **reachable** with Ink primitives and
have simply not been implemented yet. Section 3 lists exactly which.

Only the items in Section 2 are physically impossible in the terminal grid.

---

## 1. Verified Ink capability matrix

Cells reference files under `tui/ink/src/`.

### 1.1 Layout — full flexbox (Yoga)

| Capability | Source of truth |
| --- | --- |
| `flexDirection` row / column / row-reverse / column-reverse | `styles.ts:146` |
| `flexWrap` nowrap / wrap / wrap-reverse | `styles.ts:158` |
| `flexGrow`, `flexShrink`, `flexBasis` | `styles.ts:134-152` |
| `justifyContent` — start / end / center / space-between / space-around / space-evenly | `styles.ts:200-206` |
| `alignItems`, `alignSelf`, `alignContent` (incl. `stretch`, `baseline`) | `styles.ts:164-194` |
| `gap`, `columnGap`, `rowGap` (integer cells only) | `styles.ts:48-58` |
| per-side `padding*` / shorthand `padding`, `paddingX`, `paddingY` | `styles.ts:98-128` |
| per-side `margin*` / shorthand | `styles.ts:63-93` |
| width / height as integer cells **or** `"50%"` strings | `styles.ts:211-216` |
| `minWidth`, `minHeight`, `maxWidth`, `maxHeight` | `styles.ts:222-238` |
| absolute positioning (`position: "absolute"` + `top/right/bottom/left`) | `styles.ts:19-43` |
| hide subtree from layout (`display: "none"`) | `styles.ts:250`, `render-node-to-output.ts:124` |
| clip children to parent bounds (`overflow: "hidden"`) | `render-node-to-output.ts:166-194`, `output.ts:126-137` |
| fill any box area with `backgroundColor` (including padding) | `render-background.ts:5-50` |

**There is no `fit_content` / `fill_container` keyword** — those map to
`flexGrow: 1` or an absent `width` (natural sizing).

### 1.2 Borders

| Capability | Source of truth |
| --- | --- |
| `borderStyle`: single, double, round, bold, singleDouble, doubleSingle, classic, arrow | cli-boxes presets, `styles.ts:255` |
| arbitrary custom glyphs via `BoxStyle` object | `styles.ts:255` |
| per-side enable: `borderTop/Right/Bottom/Left` | `styles.ts:262-283` |
| per-side color: `borderTopColor`, … | `styles.ts:290-308` |
| per-side dim flag: `borderTopDimColor`, … | `styles.ts:322-343` |
| per-side border **background** color | `styles.ts:346-377` |

### 1.3 Text

| Capability | Source of truth |
| --- | --- |
| `color`, `backgroundColor` — named / `#RRGGBB` / `rgb(r,g,b)` / `ansi256(n)` | `colorize.ts:5-70` |
| `bold`, `italic`, `underline`, `strikethrough`, `dimColor`, `inverse` | `Text.tsx:23-58` |
| nested `<Text>` mixes styles per span (safe for "inline bold/italic/code") | `render-node-to-output.ts:134-138` |
| `wrap`: wrap / truncate-start / truncate-middle / truncate-end / end | `wrap-text.ts:21-48` |
| post-render character substitution via `<Transform>` | `Transform.tsx:13-19` |
| `<Static>` for write-once scrollback items | `Static.tsx:21-58` |

### 1.4 Input / viewport

| Capability | Source of truth |
| --- | --- |
| `useInput()` with full key flags incl. pageUp/pageDown/home/end/ctrl/meta | `hooks/use-input.ts:9-271` |
| kitty-keyboard protocol extensions | `hooks/use-input.ts:95-123` |
| paste bracketing, CSI / SS3 parsing | `input-parser.ts:88-246` |
| truecolor detection delegated to chalk (respects `COLORTERM`, `NO_COLOR`) | `colorize.ts` |
| sanitizes user ANSI: preserves SGR + OSC, strips cursor / screen-clear CSI | `sanitize-ansi.ts:5-35` |

**Scrolling is NOT built in.** Viewport clipping (`overflow: "hidden"`) plus
manual slice-and-offset is the pattern — exactly what
`ConversationTranscriptPane` already does via
`conversationTranscriptViewportState.ts`.

---

## 2. Hard limits (physically impossible in a text terminal)

These stay in the "translate, don't fake" column.

| Design feature | Why impossible | Translation rule |
| --- | --- | --- |
| Sub-cell spacing (`gap: 4/6/8/10`) | Cell is the unit. | Collapse via `toTerminalCellsFromDesignPixels`. Values 1–6 → 1 cell. |
| Sub-row accent stripes (`height: 2`) | One row minimum. | Render as a single row of solid `backgroundColor` via a whitespace `<Text>`. |
| `fontSize` hierarchy (10 / 11 / 12 / 13 / 14 / 20) | One terminal font. | Use `bold` + accent color + `dimColor` to express hierarchy. |
| `letterSpacing` | Not representable between cells. | Drop silently; rely on monospace spacing. |
| `cornerRadius` on a filled rectangle (no visible border) | Terminal glyphs only render corners as border chars. | Use `borderStyle: "round"` with `borderColor == backgroundColor` — accepts one cell of border in exchange for the rounded visual. |
| `fontFamily` selection | Terminal chooses one font. | Ignore — design is monospace already. |
| Drop shadows / blur effects | No sub-cell alpha. | Ignore; express emphasis via border or accent stripe. |
| Raster images / icon fonts | Ink has no image / sixel / kitty-graphics backend (verified: no imports). | Substitute Unicode glyphs (`glyphs.ts`). |
| Text `backgroundColor` spanning entire row beyond its glyphs | Chalk `bgX` only paints glyph cells. | Use a `<Box backgroundColor>` parent when you need a full-row band. |

---

## 3. Reachable but NOT implemented — this is where the gap lives

Every component listed here exists in `designs/my-design.pen` under frame
`idXGN` ("AGENT RESPONSE · Component Library") and/or in the HERO 1 stream at
`j20vJ`. Each one maps cleanly onto Ink primitives from Section 1. None is
blocked by Section 2. They are just absent from `packages/ink-tui/src/components/`.

### 3.1 Tool-call cards (HERO 1 shows read, grep, edit-success, edit-error)

Pattern for every tool card:

```tsx
<Box flexDirection="column" borderStyle="round" borderColor={border}>
  <Box height={1} backgroundColor={accentGreen} />           {/* 2px stripe → 1 row */}
  <Box paddingX={2} paddingY={1} justifyContent="space-between">
    {/* header: icon + tool name + args · status */}
  </Box>
  <Box height={1} backgroundColor={borderSubtle} />          {/* divider */}
  <Box flexDirection="column" paddingY={1}>{/* body */}</Box>
</Box>
```

Stripe color: green for success tools (read, grep, edit-success), red for
edit-error, amber for pending. Reachable — Section 1.1 and 1.2 cover every
prop used.

Tool variants specified in the library: `ToolCall-Read`, `ToolCall-Grep`,
`ToolCall-Edit`, `ToolCall-Bash`, `ToolCall-TodoWrite`, `ToolCall-Task`.

### 3.2 Reasoning streaming + collapsed chip

`ReasoningStreamBlock` and `ReasoningCollapsedChip` exist today, but the
collapsed variant in HERO 1 uses a **token/duration key-value row** that the
current implementation still short-circuits. Implementing it is pure text +
flex — no new primitives.

### 3.3 Prose primitives

| Pen component | Ink recipe |
| --- | --- |
| `Paragraph` | `<Text wrap="wrap">` inside a vertical-flex container. |
| `Heading1/2/3` | `<Text bold>` + size hierarchy faked via color + optional underline (§2). |
| `InlineBold/Italic/Strike/Link/Code` | Nested `<Text>` spans (`render-node-to-output.ts:134-138`). `Link` uses OSC 8 — Ink's ANSI sanitizer preserves OSC. |
| `CalloutInfo/Success/Warn/Error` | `<Box borderStyle="round" borderLeftColor={accent}>` with an icon cell + message. |

### 3.4 Lists

| Pen component | Ink recipe |
| --- | --- |
| `BulletedList` | Per-item `<Box><Text>•</Text><Text>{item}</Text></Box>`. |
| `NumberedList` | Same, index-formatted prefix. |
| `NestedList` | Recursive indent via `paddingLeft`. |
| `Checklist` | Glyphs from `glyphs.ts` (`✓`, `·`) plus `strikethrough` for done items. |

### 3.5 Code & references

| Pen component | Ink recipe |
| --- | --- |
| `FencedCodeBlock` | `<Box backgroundColor={surfaceOne}>` with per-line `<Text>` rows. Syntax highlighting works via nested `<Text>` spans — any tokenizer (`shiki --renderer=ansi`, `cli-highlight`) can emit ANSI SGR that Ink's sanitizer preserves. |
| `DiffBlock` | Two-column row per line: gutter sign + line body. Colors: green bg on `+`, red bg on `-`. Full-row bg requires wrapping each line in `<Box backgroundColor>`. |
| `ShellBlock` | Same as fenced block, with a leading `$ ` prefix. |
| `FileRef-inline` | `<Text color={cyan} underline>path.ts:42</Text>` — underline + color. |
| `FileRef-pill` | `<Box borderStyle="round" paddingX={1}><Text>path</Text></Box>`. |
| `FileRef-symbol` | Cyan glyph + name. |

### 3.6 Structured

| Pen component | Ink recipe |
| --- | --- |
| `Table` | Row = horizontal flex Box, cell = vertical Box with `width="<N>%"` or fixed cells. No wrapping between rows — flex has no grid, emulate per-row. |
| `KeyValueList` | Horizontal flex row; key on the left (fixed width), value on the right (`flexGrow: 1`). |

### 3.7 Behavior primitives

| Pen component | Ink recipe |
| --- | --- |
| `PlanProposal` | Bordered box + numbered list + action hint row. |
| `ErrorBanner` | Already partially implemented; needs title + body + hint row per the library spec. |
| `RateLimitNotice` | Amber bordered box + countdown timer (drives `useAnimation` tick). |
| `ToolApproval` | Focus-trapping box; `useInput()` handles y/n; reachable. |

### 3.8 Other missing HERO 1 pieces

- **Turn footer** (`TurnFooter`) after each assistant turn — tokens · duration · model.
- **StreamingCursor** variants (amber/green/cyan/dim) — just a blinking `<Text>` whose color cycles via `useAnimation`.
- **Context-window meter** in the input-panel bottom-right — `ctx NN%` + a 12-cell horizontal bar (`<Box width={12} backgroundColor>` overlaid with a filled-portion child).
- **Per-tool approval prompt** — reachable with `useInput` + bordered dialog.

---

## 4. Color palette — unchanged, still 1:1 from the pen file

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

`colorize.ts:33-36` accepts `#RRGGBB` directly — no conversion layer needed.

---

## 5. Pixel → cell translation (unchanged)

```ts
// 0 → 0, 1-6 → 1, 7-12 → 1-2, 13-18 → 2-3, 19-24 → 3
export function toTerminalCellsFromDesignPixels(designPixelValue: number): number;
```

HERO 1 outcomes:

| Pen value | Terminal value |
| --- | --- |
| `gap: 4 / 6 / 8 / 10 / 12` | `gap={1}` |
| `gap: 16` (stream-block separation) | `gap={1}` |
| `padding: [10, 14]` | `paddingY={1} paddingX={2}` |
| `padding: [16, 20]` | `paddingY={2} paddingX={2}` |
| `width: 80` (ctx track) | `width={12}` |

---

## 6. Icons — Lucide → Unicode (unchanged)

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

Substitutions live in `packages/ink-tui/src/components/glyphs.ts`.

---

## 7. Implementation status

Section 3's backlog has been shipped. Every primitive and block is wired to a
transcript entry kind in `packages/ink-tui/src/chatScreenState.ts` and routed
by `ConversationTranscriptPane.tsx`. Concretely:

| Design component | Implementation | Source file |
| --- | --- | --- |
| Tool-call shell (stripe + header + divider + body) | `SurfaceCard` | `components/primitives/SurfaceCard.tsx` |
| ToolCall-Read | `ReadToolCallCard` | `components/toolCalls/ReadToolCallCard.tsx` |
| ToolCall-Grep | `GrepToolCallCard` | `components/toolCalls/GrepToolCallCard.tsx` |
| ToolCall-Edit (success + error) | `EditToolCallCard` | `components/toolCalls/EditToolCallCard.tsx` |
| ToolCall-Bash | `BashToolCallCard` | `components/toolCalls/BashToolCallCard.tsx` |
| ToolCall-TodoWrite | `TodoWriteToolCallCard` | `components/toolCalls/TodoWriteToolCallCard.tsx` |
| ToolCall-Task | `TaskToolCallCard` | `components/toolCalls/TaskToolCallCard.tsx` |
| CalloutInfo / Success / Warn / Error | `Callout` | `components/primitives/Callout.tsx` |
| FencedCodeBlock (with syntax spans) | `FencedCodeBlock` | `components/primitives/FencedCodeBlock.tsx` |
| DiffBlock (addition / removal / context) | `DiffBlock` | `components/primitives/DiffBlock.tsx` |
| ShellBlock (prompt / stdout / stderr) | `ShellBlock` | `components/primitives/ShellBlock.tsx` |
| BulletedList / NumberedList / NestedList / Checklist | primitives/{BulletedList, NumberedList, NestedList, Checklist}.tsx | |
| KeyValueList / DataTable | primitives/{KeyValueList, DataTable}.tsx | |
| InlineBold / Italic / Strike / Code / Link | `InlineMarkdownText` | `components/primitives/InlineMarkdownText.tsx` |
| FileRef inline / pill / symbol | `FileReference` | `components/primitives/FileReference.tsx` |
| StreamingCursor (amber / green / cyan / dim) | `StreamingCursor` | `components/primitives/StreamingCursor.tsx` |
| PlanProposal | `PlanProposalBlock` | `components/behavior/PlanProposalBlock.tsx` |
| ErrorBanner | `ErrorBannerBlock` | `components/behavior/ErrorBannerBlock.tsx` |
| RateLimitNotice (live countdown) | `RateLimitNoticeBlock` | `components/behavior/RateLimitNoticeBlock.tsx` |
| ToolApproval | `ToolApprovalRequestBlock` | `components/behavior/ToolApprovalRequestBlock.tsx` |
| TurnFooter (model · tokens · duration) | `TurnFooter` | `components/TurnFooter.tsx` |
| Context-window meter | `ContextWindowMeter` | `components/ContextWindowMeter.tsx` |

Assistant messages now flow through `richText/parseAssistantResponseMarkdown.ts`
→ `richText/renderAssistantResponseTree.tsx`, so prose streams render as the
matching tree of primitives (headings, lists, fenced code, callouts, …)
instead of a single raw `<Text>`.

Event plumbing lives in `packages/contracts/src/events.ts` (eight new event
types for tool-call lifecycle, plan proposals, rate-limit notices, tool
approvals, and turn footers) and `packages/engine/src/runtime.ts` (provider →
domain translation). The reducer in `packages/ink-tui/src/chatScreenState.ts`
owns the routing into the corresponding transcript entry kinds.

## 8. Verifying every transcript entry renders

`packages/ink-tui/test/components/ConversationTranscriptPane.rendering.test.tsx`
builds a fixture transcript containing one of every entry kind (user message,
assistant markdown, each tool-call variant, plan proposal, rate-limit notice,
tool-approval request, turn footer) and asserts the rendered output contains
the expected labels, values, and block glyphs. It is the design-review
harness: changing a primitive without breaking the fixture means the
rendering surface still matches the pen file.

Tool-call / plan / rate-limit / approval renderers stay idle in production
until the engine emits the corresponding provider events (see
`packages/engine/src/runtime.ts`). The event plumbing and UI are ready — only
the provider-side emitters need to be wired when each tool / behavior comes
online.
