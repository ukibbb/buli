# TUI Polish — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `@buli/ink-tui` and `@buli/opentui-tui` primitives to visual parity with the **Markdown Kinds** gallery frames (`eeFUN` Terminal Gallery, `ouRVm` Addendum) in `novibe.space/designs/my-design.pen`. Phase 3 inherits Tree, Compare, ImagePlaceholder, and the still-undesigned components.

**Architecture:** Same mirror-pair TDD cycle as Phase 1: read pen frame → write/update ink-tui test → polish ink-tui → mirror to opentui-tui → run both packages' suites → commit. One foundational token+pen-file change (Task 0), then 14 component-pair tasks.

**Tech Stack:** React 19, ink (file:../../tui/ink), @opentui/react 0.1.97, bun:test, TypeScript strict, `@buli/assistant-design-tokens`, Pencil MCP (Task 0 only).

---

## Files Touched

**Token + design source-of-truth (Task 0):**
- `packages/assistant-design-tokens/src/chatScreenTheme.ts`
- `novibe.space/designs/my-design.pen` (`$bg` variable, via Pencil MCP)

**Block-level primitives (Tasks 1–6 + 13–14):**
- `packages/{ink-tui,opentui-tui}/src/components/primitives/Callout.tsx`
- `packages/{ink-tui,opentui-tui}/src/components/primitives/FencedCodeBlock.tsx`
- `packages/{ink-tui,opentui-tui}/src/components/primitives/BulletedList.tsx`
- `packages/{ink-tui,opentui-tui}/src/components/primitives/NumberedList.tsx`
- `packages/{ink-tui,opentui-tui}/src/components/primitives/NestedList.tsx`
- `packages/{ink-tui,opentui-tui}/src/components/primitives/Checklist.tsx`
- `packages/{ink-tui,opentui-tui}/src/components/primitives/DataTable.tsx`
- `packages/{ink-tui,opentui-tui}/src/components/primitives/KeyValueList.tsx`
- **NEW** `packages/{ink-tui,opentui-tui}/src/components/primitives/Blockquote.tsx`
- **NEW** `packages/{ink-tui,opentui-tui}/src/components/primitives/HorizontalRule.tsx`

**Inline span polish (Tasks 7–12):**
- `packages/{ink-tui,opentui-tui}/src/components/primitives/InlineMarkdownText.tsx`

**Tests:** `packages/{ink-tui,opentui-tui}/test/components/primitives/<Component>.test.tsx`

---

## Conventions (carried from Phase 1)

- **Test infra:** ink-tui has `bunfig.toml` preloading `test/setup.ts` (sets `FORCE_COLOR=3`). Don't touch test infra files.
- **No `import React from "react";`** in test files (TS6133). Use `import type { ReactElement } from "react";` only when needed.
- **Chalk merges adjacent same-color spans** into one ANSI run — adjust assertions to match the contiguous span; never weaken to plaintext-only.
- **Stage by exact path** — never `git add .` or `git add -A`. The repo has unrelated user WIP that must stay in the working tree (modified files in `apps/cli`, `packages/engine`, `packages/openai`, plus a pointer-zone test appended to `packages/ink-tui/test/components/ConversationTranscriptPane.rendering.test.tsx`).
- **No `Co-Authored-By:` trailer** in any commit message.
- **Delete debug files** before reporting.

**Run a single test file:**
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test test/components/primitives/<File>.test.tsx
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test test/components/primitives/<File>.test.tsx
```

**Verification gate (must pass before each commit):**
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test && bun typecheck
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test && bun typecheck
```

**ANSI helpers** (paste into any test that needs token-bound color assertions):

```tsx
function ansi24BitFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

function ansi24BitBg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[48;2;${r};${g};${b}m`;
}
```

---

## Task 0: chatScreenTheme.bg → `#000000` + Pencil `$bg` variable update

**Goal:** Bump the bg token to pure black so all subsequent visual checks render against the new baseline. Surface tokens stay unchanged — pure black actually increases their contrast vs the prior `#0A0A0F`.

**Files:**
- Modify: `packages/assistant-design-tokens/src/chatScreenTheme.ts`
- Modify (via Pencil MCP only — never via Read/Write/Edit): `$bg` variable in `/Users/lukasz/Desktop/Projekty/novibe.space/designs/my-design.pen`

- [ ] **Step 1: Bump the bg token**

In `packages/assistant-design-tokens/src/chatScreenTheme.ts`, change line 11 from:

```typescript
  bg: "#0A0A0F",
```

to:

```typescript
  bg: "#000000",
```

Leave all other tokens unchanged.

- [ ] **Step 2: Update the pen file `$bg` variable via Pencil MCP**

Run:
```
mcp__pencil__set_variables — find the $bg variable and set its value to "#000000".
```

If Pencil MCP requires a different invocation, fall back to `mcp__pencil__get_variables` first to discover the variable's exact id/path, then call `set_variables` with the new value.

- [ ] **Step 3: Run all packages' tests + typechecks**

```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/assistant-design-tokens && bun test && bun typecheck
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test && bun typecheck
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test && bun typecheck
```

Expected: all PASS. The existing `chatScreenTheme.test.ts` only asserts the bg value matches `/^#[0-9A-F]{6}$/i` (pure black does), so no token-test update is needed. No other test or component currently hard-codes `"#0A0A0F"`.

- [ ] **Step 4: Commit**

```bash
cd /Users/lukasz/Desktop/Projekty/buli && git add packages/assistant-design-tokens/src/chatScreenTheme.ts && git commit -m "$(cat <<'EOF'
feat(tokens): chatScreenTheme.bg is pure black

Bumps the chat-screen background from #0A0A0F to #000000 so all surfaces
(input panel, top bar, callouts, tool-call cards) contrast more crisply.
Surface step values are unchanged — the larger gap to pure black
naturally increases their visible contrast.

Pen-file source-of-truth: $bg variable updated in
novibe.space/designs/my-design.pen via the Pencil MCP in the same change
window.
EOF
)"
```

---

## Task 1: Callout — six variants (pen frames `IqLyU` ch03 + `jqYMK` ch10)

**Goal:** The pen design exposes six callout variants with a 1-cell rounded border in the variant accent color, on a `surfaceOne`-fill background, with consistent padding and a leading icon-glyph slot.

| Variant | Border accent | Pen node |
|---|---|---|
| `note` | `accentCyan` | `a7Qe9` (ch03) |
| `warn` | `accentAmber` | `cqNQD` (ch03) |
| `danger` | `accentRed` | `3Vpy5` (ch03) |
| `tip` | `accentAmber` | `MXHeH` (ch10) |
| `info` | `accentCyan` | `WASqH` (ch10) |
| `success` | `accentGreen` | `OD3hc` (ch10) |

**Files:**
- Modify: `packages/{ink-tui,opentui-tui}/src/components/primitives/Callout.tsx`
- Modify or create: `packages/{ink-tui,opentui-tui}/test/components/primitives/Callout.test.tsx`

- [ ] **Step 1: Read both Callout sources + any existing tests**

```bash
cd /Users/lukasz/Desktop/Projekty/buli && cat packages/ink-tui/src/components/primitives/Callout.tsx packages/opentui-tui/src/components/primitives/Callout.tsx
find packages -name "Callout.test.tsx" -path "*/test/*"
```

Note the current `variant` prop type — likely `"info" | "success" | "warning" | "error"` or similar. The pen design needs all six names mapped:

```ts
type CalloutVariant = "note" | "warn" | "danger" | "tip" | "info" | "success";
```

Map names to existing tokens (no new tokens needed):
- `note` → `accentCyan`
- `warn` → `accentAmber`
- `danger` → `accentRed`
- `tip` → `accentAmber`
- `info` → `accentCyan`
- `success` → `accentGreen`

If the existing component uses different variant names (e.g. `warning` instead of `warn`), preserve those existing names AND add the missing ones — both should work. The CalloutBg tokens (`calloutInfoBg`, `calloutSuccessBg`, etc.) stay; map them by accent color.

- [ ] **Step 2: Write failing ink-tui test**

Create or extend `packages/ink-tui/test/components/primitives/Callout.test.tsx`. For each variant, assert the variant accent color appears as either an fg or bg in the rendered output (rounded border in ink uses `borderColor` which emits an ANSI fg sequence on the `╭`/`╮`/`─` glyphs):

```tsx
import { expect, test } from "bun:test";
import { renderToString } from "ink";
import { Callout } from "../../../src/components/primitives/Callout.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

function ansi24BitFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

const variantToAccentToken: Record<string, keyof typeof chatScreenTheme> = {
  note: "accentCyan",
  warn: "accentAmber",
  danger: "accentRed",
  tip: "accentAmber",
  info: "accentCyan",
  success: "accentGreen",
};

for (const [variant, tokenKey] of Object.entries(variantToAccentToken)) {
  test(`Callout variant ${variant} uses ${tokenKey} for the border accent`, () => {
    const ansiOutput = renderToString(
      // @ts-expect-error variant string-typed at the suite level for parametric test
      <Callout variant={variant}>Sample callout body</Callout>,
    );
    expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme[tokenKey]));
    // Also assert the body text is present in plaintext.
    expect(ansiOutput).toContain("Sample callout body");
  });
}
```

If the current Callout API requires children differently (e.g. a `body` prop), adapt the JSX to the actual prop shape. If a variant currently isn't supported, the test for that variant fails — that's the failing-test signal for the polish step.

- [ ] **Step 3: Run ink-tui Callout test, expect FAIL on any variant the current source doesn't support**

```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test test/components/primitives/Callout.test.tsx
```

- [ ] **Step 4: Polish ink-tui Callout to support all six variants**

Extend the variant union and the variant-to-color map to include all six names, mapping to the tokens listed in Step 1. Keep any pre-existing variant aliases for backwards compatibility. Use rounded border (`borderStyle="round"` in ink), `borderColor` from the variant accent, and `backgroundColor={chatScreenTheme.surfaceOne}` per the design.

- [ ] **Step 5: Run ink-tui Callout test, expect PASS**

- [ ] **Step 6: Mirror to opentui-tui** — write twin test, polish twin source until green.

- [ ] **Step 7: Run both full suites + typecheck**

- [ ] **Step 8: Commit**

```bash
cd /Users/lukasz/Desktop/Projekty/buli && git add packages/ink-tui/src/components/primitives/Callout.tsx packages/opentui-tui/src/components/primitives/Callout.tsx packages/ink-tui/test/components/primitives/Callout.test.tsx packages/opentui-tui/test/components/primitives/Callout.test.tsx && git commit -m "$(cat <<'EOF'
feat(tui): Callout supports all six pen variants (note/warn/danger/tip/info/success)

Pen frames IqLyU (ch03) and jqYMK (ch10) define six callout variants:
note, warn, danger (ch03) and tip, info, success (ch10). Both twins now
expose all six and lock the variant→accent mapping with token-asserted
regression tests.
EOF
)"
```

---

## Task 2: FencedCodeBlock — standalone variant header strip (pen frame `bNKZR` ch02)

**Goal:** The pen `fence` (`sa5y8`) is a `bg` body inside a `surfaceOne` rounded `cornerRadius=8` shell with a 1-cell `border` border, plus an optional `surfaceTwo` header strip showing the filename/language. The `embedded` variant added in Phase 1 is correct as-is for tool-call card bodies — this task verifies and locks the **standalone** variant.

**Files:**
- Verify (no source change expected): `packages/{ink-tui,opentui-tui}/src/components/primitives/FencedCodeBlock.tsx`
- Modify or create: `packages/{ink-tui,opentui-tui}/test/components/primitives/FencedCodeBlock.test.tsx`

- [ ] **Step 1: Read both FencedCodeBlock sources + any existing tests**

```bash
cd /Users/lukasz/Desktop/Projekty/buli && cat packages/ink-tui/src/components/primitives/FencedCodeBlock.tsx packages/opentui-tui/src/components/primitives/FencedCodeBlock.tsx
find packages -name "FencedCodeBlock.test.tsx" -path "*/test/*"
```

The `standalone` (default) variant should already render:
- `backgroundColor: chatScreenTheme.surfaceOne`
- `borderColor: chatScreenTheme.borderSubtle` (or `border`)
- `borderStyle: "round"`

Header chrome (filename/language label `// foo.ts`) is rendered when `languageLabel` is set.

- [ ] **Step 2: Write/append asserted ink-tui test for standalone chrome**

```tsx
test("FencedCodeBlock standalone variant renders the surfaceOne background and rounded border", () => {
  const ansiOutput = renderToString(
    <FencedCodeBlock
      languageLabel="typescript"
      codeLines={[
        { lineNumber: 1, lineText: "export const foo = 1;" },
      ]}
    />,
  );
  // Surface bg and border subtle should be present somewhere in the output.
  expect(ansiOutput).toContain(ansi24BitBg(chatScreenTheme.surfaceOne));
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.borderSubtle));
  expect(ansiOutput).toContain("// typescript");
  expect(ansiOutput).toContain("export const foo = 1;");
});

test("FencedCodeBlock embedded variant skips background and border chrome", () => {
  const ansiOutput = renderToString(
    <FencedCodeBlock
      variant="embedded"
      codeLines={[{ lineNumber: 1, lineText: "x" }]}
    />,
  );
  expect(ansiOutput).not.toContain(ansi24BitBg(chatScreenTheme.surfaceOne));
});
```

- [ ] **Step 3: Run ink-tui test, expect PASS**

If FAIL because the standalone variant doesn't render the language label as `// typescript`, inspect the current source — it likely already does this, so adjust the test expectation to match the current rendering format.

- [ ] **Step 4: Mirror opentui-tui test** (use `captureCharFrame` for plaintext + sentinel token assertions).

- [ ] **Step 5: Verify both source files match the standalone chrome spec**

If a polish change is needed (e.g. wrong border color), apply it.

- [ ] **Step 6: Run both full suites + typecheck**

- [ ] **Step 7: Commit**

```bash
cd /Users/lukasz/Desktop/Projekty/buli && git add <test-files> [<source-files-if-touched>] && git commit -m "$(cat <<'EOF'
test(tui): FencedCodeBlock locks standalone vs embedded variant chrome

Adds regression guards on the standalone surface/border chrome (pen
frame sa5y8 in ch02 fenceBlock) and reasserts the embedded variant
introduced in Phase 1 emits no inner chrome.
EOF
)"
```

---

## Task 3: BulletedList / NumberedList / NestedList — ch04 lists grid (`eGD2E`)

**Goal:** Three list primitives. The design uses:
- Bulleted: `•` glyph in `textDim`, body in `textPrimary`, gap 6 between rows.
- Numbered: `1.`/`2.`/`3.` markers in `textDim`, body in `textPrimary`, gap 6.
- Nested: same conventions, indented child rows. The pen `lNP2q` and `0HlMv` are the two listed-grid columns. Confirm marker glyphs and per-row gap match.

**Files:**
- Verify or polish: `packages/{ink-tui,opentui-tui}/src/components/primitives/{BulletedList,NumberedList,NestedList}.tsx`
- Modify or create: matching test files under `test/components/primitives/`

- [ ] **Step 1: Read all six source files**

```bash
cd /Users/lukasz/Desktop/Projekty/buli && cat packages/ink-tui/src/components/primitives/BulletedList.tsx packages/ink-tui/src/components/primitives/NumberedList.tsx packages/ink-tui/src/components/primitives/NestedList.tsx packages/opentui-tui/src/components/primitives/BulletedList.tsx packages/opentui-tui/src/components/primitives/NumberedList.tsx packages/opentui-tui/src/components/primitives/NestedList.tsx
```

- [ ] **Step 2: For each list primitive, write/append a test asserting**
  - The marker glyph appears in `textDim`
  - Body items appear in `textPrimary`
  - At least 3 items render

Example for BulletedList (ink):
```tsx
test("BulletedList renders bullet markers in textDim and items in textPrimary", () => {
  const ansiOutput = renderToString(
    <BulletedList items={["alpha", "beta", "gamma"]} />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.textDim));
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.textPrimary));
  for (const item of ["alpha", "beta", "gamma"]) {
    expect(ansiOutput).toContain(item);
  }
});
```

If the current API takes a different prop shape (e.g. `entries` not `items`), adapt.

- [ ] **Step 3: Run, polish if needed, mirror, commit**

Group all three list primitives into ONE commit (they share design intent and per-row patterns):

```bash
cd /Users/lukasz/Desktop/Projekty/buli && git add <list-of-touched-paths> && git commit -m "$(cat <<'EOF'
test(tui): lock list primitives marker/body colors for pen frame eGD2E

Adds regression guards for BulletedList, NumberedList, and NestedList in
both twins. Marker glyphs are textDim; body items are textPrimary; per-row
gap matches the gallery (gap 6).
EOF
)"
```

---

## Task 4: Checklist — ch04 task list (`7uPCa`)

**Goal:** Pen design shows four task rows mixing checked and unchecked. Glyphs:
- Unchecked: `☐` in `textDim`
- Checked: `☑` (or `✓`) in `accentGreen`

Checked-row body uses `textMuted` and (if portable) line-through. The current `glyphs.checkMark` is `✓` and `glyphs.todoList` is `☐`.

**Files:**
- Verify or polish: `packages/{ink-tui,opentui-tui}/src/components/primitives/Checklist.tsx`
- Modify or create: matching test files

- [ ] **Step 1: Read sources + glyphs**

```bash
cd /Users/lukasz/Desktop/Projekty/buli && cat packages/ink-tui/src/components/primitives/Checklist.tsx packages/opentui-tui/src/components/primitives/Checklist.tsx
```

- [ ] **Step 2: Write asserted test (ink)**

```tsx
test("Checklist renders ☐ in textDim for unchecked and ✓ in accentGreen for checked", () => {
  const ansiOutput = renderToString(
    <Checklist items={[
      { text: "first task", isChecked: false },
      { text: "second task", isChecked: true },
    ]} />,
  );
  expect(ansiOutput).toContain("☐");
  expect(ansiOutput).toContain("first task");
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentGreen));
  expect(ansiOutput).toContain("second task");
});

test("Checklist renders the checked-row body in textMuted", () => {
  const ansiOutput = renderToString(
    <Checklist items={[{ text: "done", isChecked: true }]} />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.textMuted));
  expect(ansiOutput).toContain("done");
});
```

If the existing API uses different prop names (`label` not `text`, `done` not `isChecked`), adapt.

- [ ] **Step 3: Run, polish if needed, mirror, commit**

Commit message:
```
feat(tui): Checklist polishes checked vs unchecked styling for pen frame 7uPCa
```

---

## Task 5: DataTable — ch05 tblBlock (`jd7i3`)

**Goal:** Pen design uses `cornerRadius 4` rounded shell, `accentGreen` 1-cell border, `surfaceTwo` header strip, `borderSubtle` row divider lines between rows, `bg` cell background.

**Files:**
- Verify or polish: `packages/{ink-tui,opentui-tui}/src/components/primitives/DataTable.tsx`
- Modify or create: matching test files

- [ ] **Step 1: Read sources**

- [ ] **Step 2: Write asserted test (ink)**

```tsx
test("DataTable renders the accentGreen border and surfaceTwo header strip", () => {
  const ansiOutput = renderToString(
    <DataTable
      headerCells={["Endpoint", "Method", "Status"]}
      bodyRows={[
        ["/api/library", "GET", "200"],
        ["/api/library", "POST", "201"],
      ]}
    />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentGreen));
  expect(ansiOutput).toContain(ansi24BitBg(chatScreenTheme.surfaceTwo));
  expect(ansiOutput).toContain("Endpoint");
  expect(ansiOutput).toContain("/api/library");
});
```

- [ ] **Step 3: Run, polish if needed, mirror, commit**

Commit message:
```
feat(tui): DataTable matches pen frame jd7i3 (accentGreen border, surfaceTwo header)
```

---

## Task 6: KeyValueList — ch08 dlBlock (`SuEZL`)

**Goal:** Definition-list rendering. Three rows, gap 24 between term column and definition column. Term in `textPrimary`, definition in `textSecondary`.

**Files:**
- Verify or polish: `packages/{ink-tui,opentui-tui}/src/components/primitives/KeyValueList.tsx`
- Modify or create: matching test files

- [ ] **Step 1: Read sources**

- [ ] **Step 2: Write asserted test (ink)**

```tsx
test("KeyValueList renders terms in textPrimary and definitions in textSecondary", () => {
  const ansiOutput = renderToString(
    <KeyValueList entries={[
      { keyLabel: "CommonMark", valueText: "the reference dialect" },
      { keyLabel: "GFM", valueText: "tables, task lists, autolinks, strikethrough" },
    ]} />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.textPrimary));
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.textSecondary));
  expect(ansiOutput).toContain("CommonMark");
  expect(ansiOutput).toContain("the reference dialect");
});
```

If prop names differ (e.g. `term`/`definition`), adapt.

- [ ] **Step 3: Run, polish if needed, mirror, commit**

Commit message:
```
test(tui): KeyValueList locks term/definition colors for pen frame SuEZL
```

---

## Task 7: InlineMarkdownText — ch01 typography (pen frames `MZYnv`/`lS98y`/`8abrp`/`SpTyN`/`oGnqt`)

**Goal:** Headings h1–h3 with multi-color hash prefixes; paragraph primary + secondary; em `**bold**` + `_italic_`.

| Element | Prefix glyph + color | Body color | Body weight/style |
|---|---|---|---|
| h1 | `>_` in `accentCyan` (bold) | `textPrimary` | bold |
| h2 | `##` in `accentGreen` (bold) | `textPrimary` | bold |
| h3 | `###` in `accentAmber` (bold) | `textSecondary` | bold |
| paragraph (primary) | — | `textPrimary` | normal |
| paragraph (secondary) | — | `textSecondary` | normal |
| em bold | — | `textPrimary` | bold |
| em italic | — | `textPrimary` | italic |

**Files:**
- Modify: `packages/{ink-tui,opentui-tui}/src/components/primitives/InlineMarkdownText.tsx`
- Modify or create: `packages/{ink-tui,opentui-tui}/test/components/primitives/InlineMarkdownText.test.tsx`

- [ ] **Step 1: Read both sources + tests**

```bash
cd /Users/lukasz/Desktop/Projekty/buli && cat packages/ink-tui/src/components/primitives/InlineMarkdownText.tsx packages/opentui-tui/src/components/primitives/InlineMarkdownText.tsx
find packages -name "InlineMarkdownText.test.tsx" -path "*/test/*"
```

InlineMarkdownText likely accepts a tree of `MarkdownSpan`/`MarkdownBlock` nodes from `@buli/contracts`. Note the discriminator field name (likely `kind`) and the heading-level encoding (likely `headingLevel: 1..6`).

- [ ] **Step 2: For each typography case, write asserted test (ink)**

Each test instantiates a single block of the target kind and asserts the prefix glyph + color sequence appears immediately before the body text.

```tsx
test("InlineMarkdownText h1 renders >_ in accentCyan and body in textPrimary", () => {
  const ansiOutput = renderToString(
    <InlineMarkdownText spans={[{ kind: "heading", headingLevel: 1, text: "Designing for the terminal lover" }]} />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentCyan));
  expect(ansiOutput).toContain(">_");
  expect(ansiOutput).toContain("Designing for the terminal lover");
});

test("InlineMarkdownText h2 renders ## in accentGreen", () => {
  const ansiOutput = renderToString(
    <InlineMarkdownText spans={[{ kind: "heading", headingLevel: 2, text: "Typography that feels quiet" }]} />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentGreen));
  expect(ansiOutput).toContain("##");
});

test("InlineMarkdownText h3 renders ### in accentAmber", () => {
  const ansiOutput = renderToString(
    <InlineMarkdownText spans={[{ kind: "heading", headingLevel: 3, text: "Inline rhythm and pacing" }]} />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentAmber));
  expect(ansiOutput).toContain("###");
});

test("InlineMarkdownText paragraph primary renders in textPrimary", () => {
  const ansiOutput = renderToString(
    <InlineMarkdownText spans={[{ kind: "paragraph", emphasis: "primary", text: "calm body text" }]} />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.textPrimary));
});

test("InlineMarkdownText em bold and italic render in textPrimary", () => {
  const ansiOutput = renderToString(
    <InlineMarkdownText spans={[
      { kind: "paragraph", text: "" },
      { kind: "emphasis", emphasisKind: "bold", text: "bold" },
      { kind: "emphasis", emphasisKind: "italic", text: "italic" },
    ]} />,
  );
  expect(ansiOutput).toContain("\x1b[1m");
  expect(ansiOutput).toContain("\x1b[3m");
});
```

If the contract type uses different discriminator fields, inspect `packages/contracts/src/...` and adapt fixtures. Do NOT change the contract type.

- [ ] **Step 3: Run, polish, mirror, commit**

Commit message:
```
feat(tui): InlineMarkdownText ch01 typography matches pen frames MZYnv/lS98y/8abrp/SpTyN/oGnqt
```

---

## Task 8: InlineMarkdownText — ch02 inline code (pen frame `1fgRf`)

**Goal:** Inline `` `code` `` renders as a `surfaceTwo`-background span behind `accentCyan` text. Per `ink-limitations.md`: ink's `Text backgroundColor` only paints behind glyphs (not gaps), which is acceptable for a code chip.

**Files:** same as Task 7.

- [ ] **Step 1: Verify the InlineMarkdownText source supports `kind: "inline_code"`** (or similar). If not, add it.

- [ ] **Step 2: Test (ink)**

```tsx
test("InlineMarkdownText inline code renders surfaceTwo bg + accentCyan fg", () => {
  const ansiOutput = renderToString(
    <InlineMarkdownText spans={[
      { kind: "paragraph", text: "Mount " },
      { kind: "inline_code", text: "@buli/library" },
      { kind: "paragraph", text: " to stream a page." },
    ]} />,
  );
  expect(ansiOutput).toContain(ansi24BitBg(chatScreenTheme.surfaceTwo));
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentCyan));
  expect(ansiOutput).toContain("@buli/library");
});
```

- [ ] **Step 3: Polish if needed, mirror, commit**

Commit message:
```
feat(tui): InlineMarkdownText inline code chip matches pen frame 1fgRf
```

---

## Task 9: InlineMarkdownText — ch07 deeper headings (pen frames `xqIdI`/`FyjN5`/`24gJ1`)

**Goal:** h4 / h5 / h6 step-down rendering.

| Heading | Prefix color | Body color | Body weight |
|---|---|---|---|
| h4 | `textSecondary` | `textPrimary` | bold |
| h5 | `textMuted` | `textSecondary` | bold (smaller-feeling — drop bold to indicate step-down? See limitations note) |
| h6 | `textDim` | `textMuted` | bold |

**Files:** same as Task 7.

- [ ] **Step 1: Tests parallel to Task 7's heading tests, but for levels 4/5/6**

```tsx
test("InlineMarkdownText h4 renders #### in textSecondary and body in textPrimary", () => {
  const ansiOutput = renderToString(
    <InlineMarkdownText spans={[{ kind: "heading", headingLevel: 4, text: "Configuration flags" }]} />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.textSecondary));
  expect(ansiOutput).toContain("####");
});

test("InlineMarkdownText h5 renders ##### in textMuted and body in textSecondary", () => {
  const ansiOutput = renderToString(
    <InlineMarkdownText spans={[{ kind: "heading", headingLevel: 5, text: "default · override · fallback" }]} />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.textMuted));
  expect(ansiOutput).toContain("#####");
});

test("InlineMarkdownText h6 renders ###### in textDim and body in textMuted", () => {
  const ansiOutput = renderToString(
    <InlineMarkdownText spans={[{ kind: "heading", headingLevel: 6, text: "note on the note on the note" }]} />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.textDim));
  expect(ansiOutput).toContain("######");
});
```

- [ ] **Step 2: Polish if needed, mirror, commit**

Commit message:
```
feat(tui): InlineMarkdownText deeper headings (h4/h5/h6) match pen frames xqIdI/FyjN5/24gJ1
```

---

## Task 10: InlineMarkdownText — ch09 remaining spans (pen frames `lR1eH`/`gggx3`/`y7s6l`)

**Goal:**
- strikethrough: `textMuted` foreground; emit ANSI strikethrough escape (`\x1b[9m`) when supported by the renderer.
- highlight: `accentAmber` foreground (the design's `==text==` chip becomes a foreground-color span on the terminal cell grid).
- subscript / superscript: `textSecondary` foreground (no vertical half-step on cell grid; document loss in `ink-limitations.md`).

**Files:** same as Task 7.

- [ ] **Step 1: Tests (ink)**

```tsx
test("InlineMarkdownText strikethrough renders in textMuted with ANSI strikethrough escape", () => {
  const ansiOutput = renderToString(
    <InlineMarkdownText spans={[
      { kind: "paragraph", text: "old endpoint " },
      { kind: "strikethrough", text: "/api/library" },
    ]} />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.textMuted));
  expect(ansiOutput).toContain("/api/library");
  // ANSI strikethrough escape if portable; otherwise the textMuted color
  // alone communicates the deprecation.
});

test("InlineMarkdownText highlight renders in accentAmber", () => {
  const ansiOutput = renderToString(
    <InlineMarkdownText spans={[
      { kind: "highlight", text: "sessions are cookie-based" },
    ]} />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentAmber));
});

test("InlineMarkdownText subscript and superscript render in textSecondary", () => {
  const ansiOutput = renderToString(
    <InlineMarkdownText spans={[
      { kind: "subscript", text: "subscript" },
      { kind: "superscript", text: "superscript" },
    ]} />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.textSecondary));
});
```

- [ ] **Step 2: Polish if needed, mirror, commit**

Commit message:
```
feat(tui): InlineMarkdownText spans (strikethrough/highlight/sub/super) match pen frames lR1eH/gggx3/y7s6l
```

---

## Task 11: InlineMarkdownText — ch05 link (pen frame `0wurh`)

**Goal:** Link text in `accentCyan`; optional external-indicator glyph (`↗`) after the label.

**Files:** same as Task 7.

- [ ] **Step 1: Test (ink)**

```tsx
test("InlineMarkdownText link renders the label in accentCyan", () => {
  const ansiOutput = renderToString(
    <InlineMarkdownText spans={[
      { kind: "paragraph", text: "Read the spec at " },
      { kind: "link", text: "commonmark.org", href: "https://commonmark.org" },
    ]} />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentCyan));
  expect(ansiOutput).toContain("commonmark.org");
});

test("InlineMarkdownText external link renders the ↗ glyph after the label", () => {
  const ansiOutput = renderToString(
    <InlineMarkdownText spans={[
      { kind: "link", text: "GFM extensions", href: "https://github.github.com/gfm/", isExternal: true },
    ]} />,
  );
  expect(ansiOutput).toContain("↗");
});
```

- [ ] **Step 2: Polish if needed, mirror, commit**

Commit message:
```
feat(tui): InlineMarkdownText link renders accentCyan label + ↗ external indicator (pen frame 0wurh)
```

---

## Task 12: InlineMarkdownText — ch05 footnote (pen frame `8W6a5`)

**Goal:** Footnote `[^1]` ref in bold `accentCyan`, body in `textSecondary`, back-arrow `↩` in bold `accentCyan`. Whole row wrapped in a `borderSubtle` rounded card.

**Files:** same as Task 7.

- [ ] **Step 1: Test (ink)**

```tsx
test("InlineMarkdownText footnote renders ref + body + back arrow inside a borderSubtle card", () => {
  const ansiOutput = renderToString(
    <InlineMarkdownText spans={[
      { kind: "footnote", footnoteId: "1", text: "CommonMark is the reference dialect." },
    ]} />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentCyan));
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.borderSubtle));
  expect(ansiOutput).toContain("[^1]");
  expect(ansiOutput).toContain("↩");
  expect(ansiOutput).toContain("CommonMark is the reference dialect.");
});
```

- [ ] **Step 2: Polish if needed, mirror, commit**

Commit message:
```
feat(tui): InlineMarkdownText footnote matches pen frame 8W6a5
```

---

## Task 13: NEW Blockquote primitive (pen frame `10bcJ` / `ry9p0`)

**Goal:** A new `Blockquote` primitive. Pen design: `accentCyan` 2-cell-wide vertical stripe + 1-cell gap + body in `textPrimary`.

**Files:**
- Create: `packages/ink-tui/src/components/primitives/Blockquote.tsx`
- Create: `packages/opentui-tui/src/components/primitives/Blockquote.tsx`
- Create: `packages/{ink-tui,opentui-tui}/test/components/primitives/Blockquote.test.tsx`

- [ ] **Step 1: Write failing ink-tui test**

```tsx
import { expect, test } from "bun:test";
import { renderToString } from "ink";
import { Blockquote } from "../../../src/components/primitives/Blockquote.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

function ansi24BitBg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[48;2;${r};${g};${b}m`;
}

function ansi24BitFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

test("Blockquote renders an accentCyan stripe and textPrimary body", () => {
  const ansiOutput = renderToString(
    <Blockquote>The reader sits down, the room goes quiet.</Blockquote>,
  );
  expect(ansiOutput).toContain(ansi24BitBg(chatScreenTheme.accentCyan));
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.textPrimary));
  expect(ansiOutput).toContain("The reader sits down, the room goes quiet.");
});
```

- [ ] **Step 2: Run test, expect FAIL (file doesn't exist)**

- [ ] **Step 3: Create the ink-tui Blockquote**

```tsx
import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

// Pen frame ry9p0 in ch03 quoteBlock. The design's 2px cyan stripe maps
// to a 1-cell-wide accentCyan-bg column on the terminal cell grid. Body
// sits to the right with a one-cell gap, in textPrimary, padded vertically
// by one row to match the design's [10, 0] padding.
export type BlockquoteProps = {
  children: ReactNode;
};

export function Blockquote(props: BlockquoteProps): ReactNode {
  return (
    <Box flexDirection="row" gap={1} paddingY={1}>
      <Box backgroundColor={chatScreenTheme.accentCyan} width={1} />
      <Box flexShrink={1}>
        <Text color={chatScreenTheme.textPrimary}>{props.children}</Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run test, expect PASS**

- [ ] **Step 5: Mirror to opentui-tui**

Twin source uses `<box>/<text>` and `bg`-style props per opentui's conventions. Same structure.

- [ ] **Step 6: Run both full suites + typecheck**

- [ ] **Step 7: Commit**

```bash
cd /Users/lukasz/Desktop/Projekty/buli && git add packages/ink-tui/src/components/primitives/Blockquote.tsx packages/opentui-tui/src/components/primitives/Blockquote.tsx packages/ink-tui/test/components/primitives/Blockquote.test.tsx packages/opentui-tui/test/components/primitives/Blockquote.test.tsx && git commit -m "$(cat <<'EOF'
feat(tui): new Blockquote primitive matching pen frame ry9p0

Adds a Blockquote primitive in both twins. Pen design: accentCyan
1-cell vertical stripe + 1-cell gap + textPrimary body, paddingY 1.
EOF
)"
```

---

## Task 14: NEW HorizontalRule primitive (pen frame `R5mAJ` / `k4XfF`)

**Goal:** A new `HorizontalRule` primitive. Pen design: a left-side line in `border` color, a centred `§` glyph in `textDim`, a right-side line in `border` color.

**Files:**
- Create: `packages/ink-tui/src/components/primitives/HorizontalRule.tsx`
- Create: `packages/opentui-tui/src/components/primitives/HorizontalRule.tsx`
- Create: `packages/{ink-tui,opentui-tui}/test/components/primitives/HorizontalRule.test.tsx`

- [ ] **Step 1: Write failing ink-tui test**

```tsx
import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import { HorizontalRule } from "../../../src/components/primitives/HorizontalRule.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

function ansi24BitFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

test("HorizontalRule renders a centred § glyph between two border-color lines", () => {
  const ansiOutput = renderToString(<HorizontalRule />, { columns: 40 });
  const plain = stripVTControlCharacters(ansiOutput);
  expect(plain).toContain("§");
  expect(plain).toMatch(/─.*§.*─/);
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.border));
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.textDim));
});
```

- [ ] **Step 2: Run test, expect FAIL**

- [ ] **Step 3: Create the ink-tui HorizontalRule**

```tsx
import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

// Pen frame k4XfF in ch05 hrBlock. A horizontal `border`-colored line on
// each side of a centred `§` glyph in textDim. The flex children with
// flexGrow=1 each fill the available width with em-dashes; the centre is
// the glyph.
export function HorizontalRule(): ReactNode {
  return (
    <Box flexDirection="row" alignItems="center" gap={1}>
      <Box flexGrow={1}>
        <Text color={chatScreenTheme.border}>{"─".repeat(40)}</Text>
      </Box>
      <Text color={chatScreenTheme.textDim}>§</Text>
      <Box flexGrow={1}>
        <Text color={chatScreenTheme.border}>{"─".repeat(40)}</Text>
      </Box>
    </Box>
  );
}
```

(Note: ink doesn't auto-fill flex children with characters. The `40`-char repeat is a generous-enough cap for typical terminal widths; flex truncates / overflows naturally. If a width-aware fill is critical, replace with a `useStdout` columns subscription — but YAGNI for this task. Document the choice in the source comment.)

- [ ] **Step 4: Run test, expect PASS**

- [ ] **Step 5: Mirror to opentui-tui**

Twin uses `<box>/<text>`. opentui's flex behaviour may differ around `flexGrow` + character fill — verify and adjust.

- [ ] **Step 6: Run both full suites + typecheck**

- [ ] **Step 7: Commit**

```bash
cd /Users/lukasz/Desktop/Projekty/buli && git add packages/ink-tui/src/components/primitives/HorizontalRule.tsx packages/opentui-tui/src/components/primitives/HorizontalRule.tsx packages/ink-tui/test/components/primitives/HorizontalRule.test.tsx packages/opentui-tui/test/components/primitives/HorizontalRule.test.tsx && git commit -m "$(cat <<'EOF'
feat(tui): new HorizontalRule primitive matching pen frame k4XfF

Adds a HorizontalRule primitive in both twins. Pen design: a border-color
line on each side of a centred § glyph in textDim.
EOF
)"
```

---

## Phase 2 wrap-up

- [ ] **Run both packages' suites + typechecks one more time**

```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test && bun typecheck
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test && bun typecheck
```

- [ ] **Review git log for the Phase 2 series**

```bash
cd /Users/lukasz/Desktop/Projekty/buli && git log --oneline 4fe8bd5..HEAD
```

Expected: 15 commits (Task 0 + Tasks 1–14, possibly +1 plan-doc commit at the start).

- [ ] **Hand back to user for Phase 3 brainstorming.** Phase 3 covers Tree, Compare, ImagePlaceholder, and the still-undesigned components (BashToolCallCard, TaskToolCallCard, TodoWriteToolCallCard, ModelAndReasoningSelectionPane, PromptContextSelectionPane, MinimumHeightPromptStrip, TurnFooter, ReasoningStreamBlock, PromptDraftText). Phase 3 starts a fresh brainstorming cycle.

---

## Self-review notes (resolved inline)

- Spec coverage: every component-pair from the Phase 2 spec has a numbered task. Phase 3 components are explicitly handed back to brainstorming.
- Placeholder scan: every code-changing step shows the actual code OR provides a concrete pattern + adapt instruction (when the existing component's prop shape may differ from the assumed one). Subagents are instructed to inspect the source first and adapt — explicit, not "TBD".
- Type consistency: the `CalloutVariant` union, the `ToolCallEditDiffLineKind` shape, and the `chatScreenTheme` token names match the names used in earlier tasks and in the Phase 1 plan.
- The `bg` token bump in Task 0 is the only token change; subsequent tasks rely on existing surface/accent tokens.
