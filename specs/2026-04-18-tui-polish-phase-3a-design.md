# TUI Polish Phase 3a — Markdown contract extensions — design spec

Status: drafting (awaiting user approval)
Date: 2026-04-18
Target branch: continuation on `main` (per Phase 1 user consent)
Scope: `@buli/contracts`, `@buli/engine` (parser), `@buli/ink-tui`, `@buli/opentui-tui`
Predecessors: `specs/2026-04-18-tui-polish-phase-2-design.md`

## Goal

Extend the assistant-content contract with the markdown kinds the Phase 2
audit deferred — heading levels 4–6, three new inline span kinds
(`highlight`, `subscript`, `superscript`), and an external-link `↗`
indicator. Wire the contract through the parser (where cheap) and the
two renderer twins, with token-asserted regression tests on all new
visuals.

This is the smallest of three Phase 3 sub-phases and unblocks the
Phase 2 deferrals tied to contract gaps. Phase 3b adds substantial new
content-part primitives (Blockquote, Footnote, Tree, Compare,
ImagePlaceholder, DefinitionList) and Phase 3c designs+implements the
still-undesigned UI components (BashToolCallCard, TaskToolCallCard,
TodoWriteToolCallCard, ModelAndReasoningSelectionPane,
PromptContextSelectionPane, MinimumHeightPromptStrip, TurnFooter,
ReasoningStreamBlock, PromptDraftText).

## Workflow

Same mirror-pair TDD cycle as Phases 1–2, executed via subagent dispatch.
Each task that touches `@buli/contracts` is a single commit covering:

1. Contract schema + type extension (`packages/contracts/src/...`).
2. Contract token-test update (`packages/assistant-design-tokens/test/...`
   when needed) and parser update (`packages/engine/src/...`) — only when
   the parser can cheaply emit the new shape.
3. Renderer extension in both twins (ink-tui + opentui-tui).
4. New/updated component tests and parser tests.
5. Both packages' `bun test` + `bun typecheck` green.

## Invariants (carried forward from Phases 1–2)

- All colors via `@buli/assistant-design-tokens`. No hardcoded hex.
- ink-tui's `bunfig.toml` preloads `test/setup.ts` (FORCE_COLOR=3).
- No `import React from "react";` in test files.
- Never `git add .` — repo has unrelated user WIP that must stay in
  working tree.
- No `Co-Authored-By:` trailer in commit messages.

## Component-pair plan (in execution order)

### Task 1 — Heading levels 4–6

Pen design `Uc2Xo` (Addendum ch07 deeperHeadings). Extend `HeadingContentPart`
to accept levels 4, 5, 6.

| Level | Prefix | Prefix color | Body color | Body weight |
|---|---|---|---|---|
| 4 | `#### ` | `textSecondary` | `textPrimary` | bold |
| 5 | `##### ` | `textMuted` | `textSecondary` | bold |
| 6 | `###### ` | `textDim` | `textMuted` | bold |

Touchpoints:
- `packages/contracts/src/assistantContentPart.ts` — change
  `HeadingContentPartSchema.headingLevel` from
  `z.union([z.literal(1), z.literal(2), z.literal(3)])` to
  `z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)])`.
- `packages/engine/src/assistantContentPartParser.ts` — line 176 caps the
  parsed prefix length at 3 via `as 1 | 2 | 3`. Bump the cast so deeper
  hash-prefix headings parse correctly.
- `packages/{ink-tui,opentui-tui}/src/richText/renderAssistantResponseTree.tsx`
  — extend `HeadingView` to handle the new levels per the table above.
- Parser test for h4/h5/h6 detection.
- Renderer tests for each new level.

### Task 2 — `highlight`, `subscript`, `superscript` inline spans

Pen design `gggx3` (highlight, ch09), `y7s6l` (sub/super, ch09).

Add three new span schemas + types to `packages/contracts/src/inlineSpan.ts`:

```ts
export const InlineHighlightSpanSchema = z
  .object({ spanKind: z.literal("highlight"), spanText: z.string() })
  .strict();
export const InlineSubscriptSpanSchema = z
  .object({ spanKind: z.literal("subscript"), spanText: z.string() })
  .strict();
export const InlineSuperscriptSpanSchema = z
  .object({ spanKind: z.literal("superscript"), spanText: z.string() })
  .strict();
```

Add them to the `InlineSpanSchema` discriminated union.

Renderer mapping (both `InlineMarkdownText.tsx` twins):
- `highlight` → `accentAmber` foreground (no per-span background — chalk's
  `Text backgroundColor` only paints behind glyphs and the design's amber
  highlight chip works as a foreground shift on the cell grid).
- `subscript` → `textSecondary` foreground (no vertical shift available;
  document loss in `ink-limitations.md`).
- `superscript` → `textSecondary` foreground (same rationale).

Parser is **NOT** extended to emit these spans in this task. The contract
+ renderer support unblock callers (engine future work, fixtures, manual
constructions). Document this in the commit message.

Touchpoints:
- `packages/contracts/src/inlineSpan.ts`
- `packages/{ink-tui,opentui-tui}/src/components/primitives/InlineMarkdownText.tsx`
- Component tests in both twins for each new span kind
- `ink-limitations.md` updated with the sub/super loss note

### Task 3 — External-link `↗` indicator

Pen design `0wurh` (ch05 link block). The design shows `↗` glyph after
external link labels.

**Contract: no schema change.** Detect external links at render time by
inspecting `hrefUrl` for the `http://` or `https://` scheme. This avoids
a contract change for a purely presentational concern.

Renderer change in both `InlineMarkdownText.tsx` twins:
- After rendering the link span text, if `hrefUrl.startsWith("http://") ||
  hrefUrl.startsWith("https://")`, append a small `↗` glyph in the same
  `accentCyan` color.
- The OSC 8 hyperlink wrapper continues to wrap the visible text only,
  not the indicator glyph (the glyph is decorative chrome, not part of
  the link target).

Touchpoints:
- `packages/{ink-tui,opentui-tui}/src/components/primitives/InlineMarkdownText.tsx`
- Component tests asserting the `↗` glyph appears for `https://` links
  but not for relative or in-document links.

## Out of scope (deferred to Phase 3b / 3c)

- Block-level new content parts: Blockquote, Footnote, ImagePlaceholder,
  Tree, Compare, DefinitionList — Phase 3b.
- Designing + implementing the still-undesigned UI components — Phase 3c.
- Parser detection for `==text==`, `~text~`, `^text^` syntaxes — these
  collide with common file-path/regex characters; needs a separate
  bounded-regex design conversation. The contract + renderer added in
  Task 2 unblocks programmatic emission; parser detection follows
  separately when there's a clear syntax to commit to.

## Verification gate per task

Same as Phase 1/2:

- New/updated tests assert intended visual via token references (no
  hardcoded hex except in the helpers).
- `bun test` + `bun typecheck` pass in `@buli/contracts`,
  `@buli/assistant-design-tokens`, `@buli/engine`, `@buli/ink-tui`,
  `@buli/opentui-tui`.
- For Task 1 (touches the parser and the renderer), the existing
  fixtures-driven tests keep passing.

## Known risks and mitigations

- **`HeadingContentPart` widening** ripples through every consumer.
  Mitigation: TypeScript catches missing arms in discriminated narrowing
  (the `headingLevel === 1/2/3` checks become exhaustive checks; we add
  the 4/5/6 branches in renderers). The parser cast change is local.
- **`InlineSpan` widening** triggers exhaustiveness checks in
  `InlineMarkdownText.tsx` (currently the final return is the link
  fallback). After adding three new arms the dispatch must explicitly
  handle each before falling through to link, OR keep link as the
  default and explicitly dispatch the three new kinds before the fall-
  through. Either pattern is fine; pick the one already used in the file.
- **Parser strictness on heading-level cast**: if other files import
  the `HeadingContentPart["headingLevel"]` type, they may need a
  similar widening. Search before committing.

## Deferred to writing-plans

Per-task checklist with exact test names, schema diffs, and the parser
cast change.
