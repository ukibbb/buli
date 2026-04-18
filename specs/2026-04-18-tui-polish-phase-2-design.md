# TUI Polish Phase 2 — Markdown Kinds galleries — design spec

Status: drafting (awaiting user approval)
Date: 2026-04-18
Target branch: continuation on `main` (per Phase 1 user consent)
Scope: `packages/ink-tui` and `packages/opentui-tui` (mirror-paired)
Predecessor: `specs/2026-04-18-tui-component-polish-three-phase-design.md` (Phase 1 done)

## Goal

Bring both TUI implementations to visual parity with the **Markdown Kinds** gallery
frames in `novibe.space/designs/my-design.pen`:

- `eeFUN` — Markdown Kinds · Terminal Gallery (chapters ch01–ch05)
- `ouRVm` — Markdown Kinds · Addendum (chapters ch07–ch10)

Phase 3 inherits the rest of `icfA0` (Markdown Kinds · New Blocks — Tree, Compare)
plus the image placeholder primitive, plus all other still-undesigned components.

## Workflow

Same mirror-pair TDD cycle as Phase 1, executed via subagent dispatch:

1. Read the relevant pen frame.
2. Write/update the ink-tui component test capturing intended visual.
3. Polish ink-tui until green.
4. Mirror to opentui-tui (test → polish).
5. Run both `bun test` and `bun typecheck`.
6. Commit one component-pair per commit, no `Co-Authored-By` trailer.

## Invariants (carried forward from Phase 1)

- All colors and spacing through `@buli/assistant-design-tokens`.
- No hardcoded hex in components or tests; tests assert against
  `chatScreenTheme.<token>` references.
- ink-tui tests rely on `bunfig.toml` preloading `test/setup.ts` which
  sets `FORCE_COLOR=3` so chalk emits ANSI in tests.
- No `import React from "react";` in test files (TS6133); use
  `import type { ReactElement } from "react";` only when needed.
- Never `git add .` — the repo has unrelated user WIP that must stay
  in the working tree (engine/openai/cli files, plus a pointer-zone
  test appended to `ConversationTranscriptPane.rendering.test.tsx`).
- ink twin uses `<Box>/<Text>` ink primitives; opentui twin uses
  `<box>/<text>` opentui primitives. Component name, prop shape, and
  visual semantics stay aligned across twins.

## Component-pair plan (in execution order)

### Token + pen alignment

0. **`chatScreenTheme.bg` → `#000000`** + Pencil `$bg` variable updated to
   match. Rationale: per user direction the chat screen background should
   render as pure black so all surfaces (input panel, top bar, callouts,
   tool-call cards, code blocks) contrast more crisply. Surface tokens
   (`surfaceOne` `#111118`, `surfaceTwo` `#16161F`, `surfaceThree` `#1C1C28`)
   stay unchanged — the step-up from pure black actually increases their
   visible contrast vs the prior `#0A0A0F` baseline.

   Touchpoints:
   - `packages/assistant-design-tokens/src/chatScreenTheme.ts` — bump value.
   - `packages/assistant-design-tokens/test/chatScreenTheme.test.ts` —
     update token assertion.
   - Any other test or component that hard-codes `"#0A0A0F"` (search via
     grep before committing).
   - The pen file's `$bg` variable updated via the Pencil MCP so the
     design stays the source of truth.

   This is a single isolated commit before component-pair work begins so
   subsequent visual checks happen against the new baseline.

### Block-level primitives (audit + polish where divergent from gallery)

1. **`Callout`** — chapters ch03 (note/warn/danger) + ch10 (tip/info/success).
   Six variants total: each is `surfaceBg=#0A0A0F` + 1-cell rounded border in
   the variant accent color (cyan/amber/red/amber/cyan/green). Confirm the
   existing `Callout` API accepts all six variant names; if it only supports
   the three-variant ch03 set, extend it. Lock variant→accent mapping with
   token-asserted tests.

2. **`FencedCodeBlock`** (standalone variant) — ch02 fenceBlock. Standalone
   already exists. Verify `cornerRadius` 8, `surfaceTwo` header strip with
   optional filename + language label, `borderSubtle` 1-cell border, body
   on `bg`. Add tests asserting the standalone chrome exists when
   `variant` is unset.

3. **`BulletedList` / `NumberedList` / `NestedList`** — ch04. Verify glyph
   prefix (`•` / `1.` / nested indent), per-row gap matches design spacing.
   The gallery shows `// unordered` and `// ordered` rows — confirm both
   primitives render in `textPrimary` with `textDim` markers.

4. **`Checklist`** — ch04 task list. Four rows in design (mix of completed
   and not). Completed rows use `textMuted` strikethrough; checkbox glyphs
   are `☐` (unchecked) and `☑`/`✓` (checked, in `accentGreen`). Verify
   spacing and that completed text strike-throughs.

5. **`DataTable`** — ch05 tblBlock. The design uses a `accentGreen` 1-cell
   rounded border, `surfaceTwo` header strip on top, `borderSubtle` row
   dividers between rows, `bg` cell background. Verify or polish to match.

6. **`KeyValueList`** — ch08 dlBlock. Three rows of (term, definition) with
   gap 24 between columns. Term column likely in `textPrimary`, definition
   in `textSecondary`. Verify mapping or polish.

### Inline span polish (`InlineMarkdownText`, split per chapter)

7. **InlineMarkdownText — ch01 typography** (`MZYnv`/`lS98y`/`8abrp`/`SpTyN`/`oGnqt`).
   - h1: `>_` cyan prefix + `textPrimary` 28pt-equivalent (terminal: bold textPrimary)
   - h2: `##` accentGreen prefix + `textPrimary` bold
   - h3: `###` accentAmber prefix + `textSecondary` bold
   - paragraph primary: `textPrimary`, lineHeight 1.75
   - paragraph secondary: `textSecondary`, lineHeight 1.75
   - em row: `**bold**` (textPrimary bold), `_italic_` (textPrimary italic)
   The `>_` h1 prefix is a cyan two-character marker, not a terminal prompt.
   Add per-chapter tests asserting the prefix glyph + color + heading text.

8. **InlineMarkdownText — ch02 inline code** (`1fgRf`).
   Inline `` `code` `` chip — `bg=#0A0A0F` + `borderSubtle` 1-cell
   border + `accentCyan` text. In a terminal cell grid the "chip" is a
   single `surfaceTwo` background span behind the code text (no real border
   inside running prose). Use a per-span background substitution noted in
   `ink-limitations.md`.

9. **InlineMarkdownText — ch07 deeper headings** (`xqIdI`/`FyjN5`/`24gJ1`).
   - h4: `####` `textSecondary` prefix + `textPrimary` bold
   - h5: `#####` `textMuted` prefix + `textSecondary` bold
   - h6: `######` `textDim` prefix + `textMuted` bold

10. **InlineMarkdownText — ch09 remaining spans** (`lR1eH`/`gggx3`/`y7s6l`).
    - strikethrough: `textMuted` with line-through (or `textMuted` color
      alone if line-through is not portable across both renderers)
    - highlight: `accentAmber` inline color (the design's `==text==` chip
      becomes a foreground-color span on the terminal)
    - sub/super: smaller-feeling tighter span. On the terminal cell grid we
      cannot vertically shift; render in `textSecondary` to denote "this is
      sub/super".

11. **InlineMarkdownText — ch05 link** (`0wurh`).
    Link text in `accentCyan` + optional external-indicator glyph (`↗`)
    after the link label.

12. **InlineMarkdownText — ch05 footnote** (`8W6a5`).
    Footnote ref `[^1]` in `accentCyan` (5pt-bold equivalent), the body
    `textSecondary`, and a back-arrow `↩` in `accentCyan`. The whole row
    is a `borderSubtle` rounded card.

### New block-level primitives

13. **`Blockquote`** — ch03 quoteBlock. A `accentCyan` 2-cell-wide
    vertical stripe (1-cell visual width × 2 chars to match the design's
    2px line) + one cell of gap + body in `textPrimary`. Goes in
    `packages/{ink-tui,opentui-tui}/src/components/primitives/Blockquote.tsx`.
    Mirror-paired test in both packages.

14. **`HorizontalRule`** — ch05 hrBlock. A horizontal `border` 1-cell line
    on each side of a centred `§` glyph in `textDim`. Render as
    `─────── § ───────` filling the row width. Same path/structure as
    `Blockquote`.

## Out of scope (deferred to Phase 3)

- `ImagePlaceholder` — ch05 imgBlock. Requires a design conversation about
  what to render for an image in a TUI (ASCII placeholder card? caption-only
  with a `[image: …]` glyph?). Phase 3 starts that conversation.
- `Tree` — ch06. New substantive primitive — hierarchical rows with
  `├─`/`└─` glyphs.
- `Compare` — ch07 (in `icfA0`). New substantive primitive — two-column
  side-by-side.
- All other components without designs (BashToolCallCard, TaskToolCallCard,
  TodoWriteToolCallCard, ModelAndReasoningSelectionPane,
  PromptContextSelectionPane, MinimumHeightPromptStrip, TurnFooter,
  ReasoningStreamBlock, PromptDraftText) — Phase 3 designs and implements.

## Verification gate per cycle

Same as Phase 1:

- New/updated component test asserts intended visual with token references.
- `bun test` + `bun typecheck` pass in both `@buli/ink-tui` and `@buli/opentui-tui`.
- For composites (Callout six-variant, DataTable, FencedCodeBlock, Blockquote,
  Footnote): visual comparison to the pen frame noted in commit message.

## Known risks and mitigations

- **InlineMarkdownText is shared by many gallery chapters.** Splitting its
  polish into chapter-scoped tasks (tasks 7–12) lets each commit have a
  narrow blast radius. The risk is that a chapter task accidentally
  regresses a span case from another chapter — mitigation: each chapter's
  test file asserts only its own spans, and the full suite must stay green.
- **Italic and strikethrough in chalk.** Ink/chalk supports `italic` and
  `strikethrough` as Text props. opentui's `<text>` may or may not — verify
  in the per-task implementation step. If opentui can't render the text
  decoration directly, fall back to a color-only signal (e.g. textMuted
  alone for strikethrough) and document the limitation in
  `ink-limitations.md`.
- **Per-span background for inline code chip.** Ink's `Text backgroundColor`
  only paints behind glyphs (not the gap between word boundaries). For an
  inline `code` chip this is acceptable. Document in
  `ink-limitations.md` if it's noticeably different from opentui.
- **Subscript/superscript on a cell grid.** No vertical half-steps available.
  Mitigation: render in `textSecondary` and accept the loss; note in
  `ink-limitations.md`.

## Deferred to writing-plans

Per-task checklist with exact test names, structural assertions, and the
specific source-diff to apply for each of the 14 component-pairs.
