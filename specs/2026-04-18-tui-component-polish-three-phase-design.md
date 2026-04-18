# TUI component polish — three-phase design spec

Status: approved via brainstorming, ready for implementation planning
Date: 2026-04-18
Target branch: feature branch off `main`
Scope: `packages/ink-tui` and `packages/opentui-tui` (mirror-paired)

## Goal

Bring both TUI implementations to visual parity with `novibe.space/designs/my-design.pen`,
then design and implement the components that exist in code but have no design yet.
Work is split into three sequential phases, each polishing or producing a defined
set of components in mirror-paired ink ↔ opentui cycles.

The pen file is the source of truth for visual decisions. Existing token mappings
(`ink-limitations.md`, `chatScreenTheme.ts`) are the source of truth for translating
pen pixel/alpha values onto the terminal cell grid.

## Workflow — the mirror-pair cycle

The unit of work is one component-pair. Per cycle:

1. Read the relevant pen frame via the Pencil MCP.
2. Diff design vs `ink-tui` component → write or update the component test in
   `packages/ink-tui/test/components/...` to capture the intended visual
   (text content, fg/bg color tokens, structural row count, conditional states).
3. Polish `ink-tui` component until the new test is green.
4. Mirror to `opentui-tui`: update the twin test, polish until green.
5. Run `bun test` and `bun typecheck` in both packages.
6. Commit one component-pair per commit. Commit message names the pen frame
   ID(s), the component file paths, and any token additions.

## Invariants

- All colors and spacing values flow through `@buli/assistant-design-tokens`.
  Components must not hardcode hex values. New palette entries are added to
  `chatScreenTheme` with the corresponding token test updated in the same commit.
- ink and opentui twins share component name, prop shape, and visual semantics.
  Implementation differences are limited to renderer primitives
  (`<Box>/<Text>` for ink vs `<box>/<text>` for opentui).
- TDD-strict: a polish change MUST be preceded by a failing test that captures
  the intended visual. No polish without an asserted expectation.
- Tests assert against token references (e.g. `chatScreenTheme.accentGreen`),
  not raw hex strings, so a token rename does not silently break tests.
- Behavior and keyboard logic are out of scope for this work. Only visual
  polish and the minimum prop-shape changes needed to achieve parity.

## Phase 1 — HERO 1 (`j20vJ`) + HELP Modal (`wWU85`)

Component-pair order, simple → composite:

1. `TopBar` — pen frame `cbMSE`. Status dot + path on a left-aligned strip with
   `surfaceOne` background and a `border` divider underneath.
2. `UserPromptBlock` — pen frame `mEK0g` (component `GgP0q`). Cyan caret +
   primary-text prompt, one cell gap.
3. `ReasoningCollapsedChip` — pen frame `LhCtn` (component `J2ZNB`).
   Chevron-right icon, `// thinking` label, separators, duration, token count,
   all in muted/dim shades.
4. `StreamingAssistantMessageBlock` — pen frame `90pSl` (agentResponse). Header
   `// agent · response`, body text in primary, optional embedded `codeBlock`
   rendered as a `SurfaceCard`-styled `FencedCodeBlock`.
5. `ReadToolCallCard` — pen frame `dKq7X`. Stripe + header + divider + body of
   line-numbered code rows. Status states: `streaming` (pending dot),
   `completed` (✓ + line/byte counts), `failed` (red stripe + error text).
6. `GrepToolCallCard` — pen frame `yntTc`. Header-only stripe card, no body.
7. `EditToolCallCard` — pen frames `YTs08` (success with diff body) and `cVkM5`
   (error with red stripe, header only). Diff body uses
   `chatScreenTheme.diffAdditionBg` and `diffRemovalBg` row tints to substitute
   for the design's `#10B98118` / `#EF444418` low-alpha rows.
8. `InputPanel` — pen frame `HOeet`. Composite: `inputTop` (mode chip + model
   chip), `inputBody` (caret + `PromptDraftText`), `inputBottom`
   (`[ ? ] help · shortcuts · [ ← → ] caret · [ ↑ ↓ ] transcript` rich
   markup + `ContextWindowMeter`). Currently ink-tui renders only a plain
   hint string in `inputBottom`; this phase ports opentui-tui's rich markup
   into ink-tui.
9. `ShortcutsModal` — pen frame `wWU85`. Green stripe top + header with title
   + body sections (gap 22, padding `[18,20]`) + `surfaceTwo` footer.

Sub-component touches as needed during the cycles: `ContextWindowMeter`,
`PromptDraftText`, `SnakeAnimationIndicator`, `Stripe`, `SurfaceCard`,
`ToolCallCardHeaderSlots`, `FileReference`, `FencedCodeBlock`.

## Phase 2 — Markdown Kinds galleries

Audit gallery frames `eeFUN` (Terminal Gallery), `ouRVm` (Addendum), and
`icfA0` (New Blocks). For each chapter, map gallery rows to existing
primitives and mirror-pair polish:

- `ch01·typography` → `InlineMarkdownText`
- `ch02·code` → `FencedCodeBlock`, `ShellBlock`
- `ch03·callouts` (info/success/warning/error) → `Callout`
- `ch04·lists` → `BulletedList`, `NumberedList`, `NestedList`, `Checklist`
- `ch05·media` → `FileReference` and any media-row primitives currently in code
- `ch07·deeperHeadings`, `ch08·definitionList`, `ch09·remainingSpans`,
  `ch10·moreCallouts` → `InlineMarkdownText` extensions, `KeyValueList`,
  `Callout` variants
- `ch06·tree`, `ch07·compare` (in `icfA0`) → identify whether existing
  primitives cover them; if not, defer those specific items to Phase 3.

Phase 2 also covers `DiffBlock`, `DataTable`, `StreamingCursor`, `Stripe`,
and `SurfaceCard` against any matching gallery rows.

## Phase 3 — Design then implement undesigned components

For each component below, the cycle is: inspect code (props, states, current
render output) → propose a pen frame layout in conversation → user approves →
`batch_design` the frame into `my-design.pen` → mirror-pair polish to match.

Targets:

- `BashToolCallCard`
- `TaskToolCallCard`
- `TodoWriteToolCallCard`
- `ModelAndReasoningSelectionPane`
- `PromptContextSelectionPane`
- `MinimumHeightPromptStrip`
- `TurnFooter`
- `ReasoningStreamBlock` (streaming sibling of the collapsed chip)
- `PromptDraftText` (if not implicitly covered by `InputPanel` in Phase 1)
- `SnakeAnimationIndicator` (if its visual treatment needs more than the
  HERO 1 dot)

The order within Phase 3 is interactive — chosen during Phase 3 brainstorming
based on which components have evolved or grown additional states by then.

## Verification gate per cycle

A commit is allowed only when ALL of the following hold:

- New or updated component test exists in the package being changed and asserts
  the intended visual against token references.
- `bun test` is green in both `@buli/ink-tui` and `@buli/opentui-tui`.
- `bun typecheck` is green in both packages.
- For composite components (InputPanel, EditToolCallCard with diff body,
  ShortcutsModal), a manual visual check against the pen frame screenshot
  is recorded in the commit message ("visually compared to pen frame `<id>`").

## Out of scope

- Any keyboard, scroll, focus, or selection behavior changes.
- Renaming public component props in ways that ripple into `ChatScreen.tsx`
  or engine wiring (minor twin-API alignment is allowed and called out in the
  commit message).
- New runtime features or rendering capabilities not already implied by the
  design or by both existing implementations.
- Refactoring of `chatScreenState`, transcript event runners, or any
  non-presentation module.

## Known risks and mitigations

- **Truecolor-only tints**: pen uses low-alpha tints (`#10B98118`,
  `#EF444418`) that chalk truecolor cannot represent. Mitigation: continue
  the existing `diffAdditionBg` / `diffRemovalBg` pattern — solid near-bg
  shades that preserve the semantic. Add new tokens as needed for similar
  cases (e.g. callout backgrounds are already done).
- **Twin API drift**: existing pairs have minor prop divergences
  (`promptInputHintText` vs `promptInputHintOverride`,
  `FencedCodeBlock` `variant` only on opentui side). Where one twin has the
  more complete API, port to the other twin in the same commit and document
  the alignment in the commit message.
- **Pen frame ID drift**: components carry pen frame IDs in comments. If a
  pen frame is restructured, update comments in the same commit. Do not
  proactively rewrite comments without a corresponding pen change.
- **Test infrastructure asymmetry**: opentui-tui has more component tests
  (primitives, toolCalls, ContextWindowMeter, ModelAndReasoningSelectionPane,
  TurnFooter) than ink-tui. Phase 1 cycles will close that gap by writing the
  missing ink-tui tests as part of the TDD step.

## Deferred to writing-plans

The per-component checklist with exact test names, color/structure
assertions, and expected commit boundaries.
