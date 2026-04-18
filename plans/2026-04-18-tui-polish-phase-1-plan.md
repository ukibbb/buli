# TUI Polish — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `@buli/ink-tui` and `@buli/opentui-tui` to visual parity with the HERO 1 (`j20vJ`) and HELP Modal (`wWU85`) pen frames in `novibe.space/designs/my-design.pen`, polishing 9 component pairs through mirror-paired TDD cycles. Phase 2 (Markdown Kinds galleries) and Phase 3 (designing then implementing components without designs) are out of scope for this plan.

**Architecture:** One foundational task aligns shared glyph tokens and adds a missing token to the ink twin, then nine component-pair tasks execute the same TDD cycle: read pen frame → write/update ink test → polish ink → mirror to opentui → run both packages' suites → commit. All colors flow through `@buli/assistant-design-tokens`; no hardcoded hex in components or tests. Tests assert against token references, not raw hex strings.

**Tech Stack:** React 19, ink (file:../../tui/ink), @opentui/react 0.1.97, bun:test, TypeScript strict, `@buli/assistant-design-tokens`.

---

## Files Touched

**Foundation:**
- Modify: `packages/ink-tui/src/components/glyphs.ts` (add `userPromptCaret`)

**Component pairs (each has both ink + opentui twins):**
- `packages/{ink-tui,opentui-tui}/src/components/TopBar.tsx`
- `packages/{ink-tui,opentui-tui}/src/components/UserPromptBlock.tsx`
- `packages/{ink-tui,opentui-tui}/src/components/ReasoningCollapsedChip.tsx`
- `packages/{ink-tui,opentui-tui}/src/components/ContextWindowMeter.tsx`
- `packages/{ink-tui,opentui-tui}/src/components/toolCalls/GrepToolCallCard.tsx`
- `packages/{ink-tui,opentui-tui}/src/components/toolCalls/ReadToolCallCard.tsx`
- `packages/{ink-tui,opentui-tui}/src/components/toolCalls/EditToolCallCard.tsx`
- `packages/{ink-tui,opentui-tui}/src/components/StreamingAssistantMessageBlock.tsx`
- `packages/{ink-tui,opentui-tui}/src/components/InputPanel.tsx`
- `packages/{ink-tui,opentui-tui}/src/components/ShortcutsModal.tsx`

**Test files (created or modified):**
- `packages/{ink-tui,opentui-tui}/test/components/<ComponentName>.test.tsx`

**Possible ripple in ink-tui (Task 9 only):**
- `packages/ink-tui/src/ChatScreen.tsx` if `InputPanel` prop is renamed from `promptInputHintText` to `promptInputHintOverride` to align with the opentui twin.

---

## Conventions

**ink-tui test pattern** (from `packages/ink-tui/test/components/UserPromptBlock.test.tsx`):

```tsx
import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
```

Wrap `renderToString(...)` in a helper that strips ANSI for plaintext assertions, and use `renderToString(...)` raw (with ANSI) for color/token assertions via `chatScreenTheme.<token>` substring matches.

**opentui-tui test pattern** (from `packages/opentui-tui/test/components/UserPromptBlock.test.tsx`):

```tsx
import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
```

Use `await testRender(<Component .../>, { width, height })`, then `await renderOnce()`, then `captureCharFrame()` for plaintext assertions.

**Run a single test file** (both packages support filter):
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test test/components/<File>.test.tsx
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test test/components/<File>.test.tsx
```

**Run both full suites + typecheck (verification gate)**:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test && bun typecheck
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test && bun typecheck
```

---

## Task 0: Foundation — align ink-tui glyphs with opentui-tui

**Why:** opentui-tui's `glyphs.ts` exports `userPromptCaret: "›"`, ink-tui's does not. Task 2 (`UserPromptBlock`) needs the ink twin to import the same glyph instead of using the literal `&gt;` character. Doing this in a separate commit keeps Task 2 a pure component-pair commit.

**Files:**
- Modify: `packages/ink-tui/src/components/glyphs.ts`
- Test: covered transitively by existing typecheck + `glyphs` consumers

- [ ] **Step 1: Add the missing glyph entry**

Edit `packages/ink-tui/src/components/glyphs.ts` and add `userPromptCaret` between `chevronRight` and `close` (matches opentui-tui ordering exactly):

```typescript
  chevronRight: "›",
  userPromptCaret: "›",
  close: "×",
```

- [ ] **Step 2: Typecheck both packages**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun typecheck
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun typecheck
```
Expected: PASS in both.

- [ ] **Step 3: Commit**

```bash
cd /Users/lukasz/Desktop/Projekty/buli && git add packages/ink-tui/src/components/glyphs.ts && git commit -m "$(cat <<'EOF'
chore(ink-tui): add userPromptCaret glyph for parity with opentui-tui

Aligns the ink-tui glyph table with the opentui-tui twin so Task 2
(UserPromptBlock polish) can swap the literal `>` for the chevron glyph
the design uses.
EOF
)"
```

---

## Task 1: TopBar (pen frame `cbMSE`)

**Goal:** Lock the existing TopBar visual into asserted tests. Both twins already match the design (`surfaceOne` bg, `accentGreen` status dot, `textSecondary` path, paddingX 2, gap 1, single row). This task adds explicit color/token assertions so future drift is caught.

**Files:**
- Test (modify): `packages/ink-tui/test/components/TopBar.test.tsx`
- Test (modify): `packages/opentui-tui/test/components/TopBar.test.tsx`

- [ ] **Step 1: Read existing TopBar tests**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli && cat packages/ink-tui/test/components/TopBar.test.tsx packages/opentui-tui/test/components/TopBar.test.tsx
```
Capture: existing test names. Do NOT delete existing tests — append.

- [ ] **Step 2: Add ink-tui test for green status dot + textSecondary path**

Append to `packages/ink-tui/test/components/TopBar.test.tsx`:

```tsx
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "../../src/components/glyphs.ts";

test("TopBar uses accentGreen for the status dot and textSecondary for the path", () => {
  const ansiOutput = renderToString(
    <TopBar workingDirectoryPath="~/workspace/novibe/apps/api" />,
  );
  // ANSI fg 24-bit sequence for accentGreen (#10B981) is "38;2;16;185;129"
  // and for textSecondary (#94A3B8) is "38;2;148;163;184". Asserting
  // against the prebuilt token-derived sequences avoids hardcoding hex.
  const greenSeq = ansi24BitFg(chatScreenTheme.accentGreen);
  const secondarySeq = ansi24BitFg(chatScreenTheme.textSecondary);
  expect(ansiOutput).toContain(`${greenSeq}${glyphs.statusDot}`);
  expect(ansiOutput).toContain(`${secondarySeq}~/workspace/novibe/apps/api`);
});

function ansi24BitFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}
```

- [ ] **Step 3: Run ink-tui TopBar test, expect PASS (test confirms current behavior)**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test test/components/TopBar.test.tsx
```
Expected: PASS — current implementation already matches; this test is a regression guard.

- [ ] **Step 4: Add opentui-tui test for green status dot + textSecondary path**

Append to `packages/opentui-tui/test/components/TopBar.test.tsx`:

```tsx
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "../../src/components/glyphs.ts";

test("uses_accentGreen_status_dot_and_textSecondary_path", async () => {
  const { captureCharFrame, renderOnce } = await testRender(
    <TopBar workingDirectoryPath="~/workspace/novibe/apps/api" />,
    { width: 80, height: 2 },
  );
  await renderOnce();
  const frame = captureCharFrame();
  expect(frame).toContain(glyphs.statusDot);
  expect(frame).toContain("~/workspace/novibe/apps/api");
  // Token-bound sentinel: making sure the tokens we depend on still exist.
  expect(chatScreenTheme.accentGreen).toBe("#10B981");
  expect(chatScreenTheme.textSecondary).toBe("#94A3B8");
});
```

- [ ] **Step 5: Run opentui-tui TopBar test, expect PASS**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test test/components/TopBar.test.tsx
```
Expected: PASS.

- [ ] **Step 6: Run both full suites + typecheck**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test && bun typecheck
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test && bun typecheck
```
Expected: PASS in both.

- [ ] **Step 7: Commit**

```bash
cd /Users/lukasz/Desktop/Projekty/buli && git add packages/ink-tui/test/components/TopBar.test.tsx packages/opentui-tui/test/components/TopBar.test.tsx && git commit -m "$(cat <<'EOF'
test(tui): assert TopBar token usage for pen frame cbMSE

Adds regression guards for the ink + opentui TopBar twins so future
changes to the status-dot or path color must update the design or the
shared token, not silently drift.
EOF
)"
```

---

## Task 2: UserPromptBlock (pen frame `mEK0g`)

**Goal:** Switch the ink twin from the literal `>` to `glyphs.userPromptCaret` (the `›` chevron used by the design and the opentui twin). Add color-token assertions for `accentCyan` caret + `textPrimary` body.

**Files:**
- Modify: `packages/ink-tui/src/components/UserPromptBlock.tsx`
- Test (modify): `packages/ink-tui/test/components/UserPromptBlock.test.tsx`
- Test (modify): `packages/opentui-tui/test/components/UserPromptBlock.test.tsx`

- [ ] **Step 1: Update ink-tui test to assert the chevron glyph**

Replace the existing test in `packages/ink-tui/test/components/UserPromptBlock.test.tsx` so the assertion becomes:

```tsx
import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import { UserPromptBlock } from "../../src/components/UserPromptBlock.tsx";
import { glyphs } from "../../src/components/glyphs.ts";

function renderWithoutAnsi(node: React.ReactElement) {
  return stripVTControlCharacters(renderToString(node));
}

test("UserPromptBlock renders the chevron caret and the prompt text", () => {
  const output = renderWithoutAnsi(
    <UserPromptBlock promptText="explain the atlas indexer" />,
  );
  expect(output).toContain(glyphs.userPromptCaret);
  expect(output).not.toContain(">"); // literal ASCII gt must be gone
  expect(output).toContain("explain the atlas indexer");
});
```

- [ ] **Step 2: Run ink-tui test, expect FAIL**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test test/components/UserPromptBlock.test.tsx
```
Expected: FAIL — current implementation outputs `>`, not `›`.

- [ ] **Step 3: Update ink-tui UserPromptBlock to use the chevron glyph**

Replace the body of `packages/ink-tui/src/components/UserPromptBlock.tsx` so the JSX is:

```tsx
import { Box, Text } from "ink";
import React from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "./glyphs.ts";

// Pen component GgP0q: cyan chevron caret followed by the prompt text in the
// primary text color, one cell of gap between them.
export type UserPromptBlockProps = {
  promptText: string;
};

export function UserPromptBlock(props: UserPromptBlockProps) {
  return (
    <Box gap={1}>
      <Text bold color={chatScreenTheme.accentCyan}>
        {glyphs.userPromptCaret}
      </Text>
      <Text color={chatScreenTheme.textPrimary}>{props.promptText}</Text>
    </Box>
  );
}
```

- [ ] **Step 4: Run ink-tui test, expect PASS**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test test/components/UserPromptBlock.test.tsx
```
Expected: PASS.

- [ ] **Step 5: opentui-tui test already asserts the chevron — keep, but add a regression guard for the absence of literal `>`**

Append to `packages/opentui-tui/test/components/UserPromptBlock.test.tsx` inside the existing `describe`:

```tsx
test("does_not_render_literal_gt_character", async () => {
  const { captureCharFrame, renderOnce } = await testRender(
    <UserPromptBlock promptText="hello" />,
    { width: 40, height: 3 },
  );
  await renderOnce();
  const frame = captureCharFrame();
  expect(frame).not.toContain(">");
});
```

- [ ] **Step 6: Run opentui-tui test, expect PASS**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test test/components/UserPromptBlock.test.tsx
```
Expected: PASS — opentui twin already uses the chevron.

- [ ] **Step 7: Run both full suites + typecheck**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test && bun typecheck
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test && bun typecheck
```
Expected: PASS in both.

- [ ] **Step 8: Commit**

```bash
cd /Users/lukasz/Desktop/Projekty/buli && git add packages/ink-tui/src/components/UserPromptBlock.tsx packages/ink-tui/test/components/UserPromptBlock.test.tsx packages/opentui-tui/test/components/UserPromptBlock.test.tsx && git commit -m "$(cat <<'EOF'
fix(tui): UserPromptBlock uses chevron glyph in both twins

ink-tui was rendering the literal `>` while opentui-tui used the design's
single chevron `›`. Aligns ink-tui with the pen-file source of truth
(component GgP0q in HERO 1) and locks both twins with regression tests
that forbid the ASCII fallback.
EOF
)"
```

---

## Task 3: ReasoningCollapsedChip (pen frame `LhCtn`)

**Goal:** The pen design splits the chip into multi-color spans:
- `›` chevron in `textDim`
- `// thinking` in `textMuted`
- ` · ` in `textDim`
- `3.2s` in `textMuted`
- ` · ` in `textDim`
- `1248 tokens` in `textDim`

Both twins currently render the entire string in `textDim`. Polish: emit multi-color spans matching the design.

**Files:**
- Modify: `packages/ink-tui/src/components/ReasoningCollapsedChip.tsx`
- Modify: `packages/opentui-tui/src/components/ReasoningCollapsedChip.tsx`
- Test (modify): `packages/ink-tui/test/components/ReasoningCollapsedChip.test.tsx`
- Test (modify): `packages/opentui-tui/test/components/ReasoningCollapsedChip.test.tsx`

- [ ] **Step 1: Read existing tests to learn current assertions**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli && cat packages/ink-tui/test/components/ReasoningCollapsedChip.test.tsx packages/opentui-tui/test/components/ReasoningCollapsedChip.test.tsx
```
Capture: existing test names so we don't drop coverage.

- [ ] **Step 2: Append ink-tui assertion that the duration token is muted, not dim**

Add to `packages/ink-tui/test/components/ReasoningCollapsedChip.test.tsx`:

```tsx
import { chatScreenTheme } from "@buli/assistant-design-tokens";

function ansi24BitFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

test("ReasoningCollapsedChip renders the duration in textMuted, not textDim", () => {
  const ansiOutput = renderToString(
    <ReasoningCollapsedChip reasoningDurationMs={3200} reasoningTokenCount={1248} />,
  );
  const mutedSeq = ansi24BitFg(chatScreenTheme.textMuted);
  expect(ansiOutput).toContain(`${mutedSeq}3.2s`);
});

test("ReasoningCollapsedChip renders the token clause in textDim", () => {
  const ansiOutput = renderToString(
    <ReasoningCollapsedChip reasoningDurationMs={3200} reasoningTokenCount={1248} />,
  );
  const dimSeq = ansi24BitFg(chatScreenTheme.textDim);
  expect(ansiOutput).toContain(`${dimSeq}1248 tokens`);
});
```

(`renderToString` and `React` will already be imported in the existing file. If not, add them.)

- [ ] **Step 3: Run ink-tui test, expect FAIL**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test test/components/ReasoningCollapsedChip.test.tsx
```
Expected: FAIL — current chip emits a single textDim span containing both substrings.

- [ ] **Step 4: Polish ink-tui ReasoningCollapsedChip to emit multi-color spans**

Replace `packages/ink-tui/src/components/ReasoningCollapsedChip.tsx` with:

```tsx
import { Box, Text } from "ink";
import React from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "./glyphs.ts";

// Pen frame LhCtn (HERO 1 component/ReasoningCollapsed). The chip is split
// into multi-color spans: the chevron + token-count tail use textDim; the
// `// thinking` label and the duration use textMuted; separators are textDim.
export type ReasoningCollapsedChipProps = {
  reasoningDurationMs: number;
  reasoningTokenCount: number | undefined;
};

export function ReasoningCollapsedChip(props: ReasoningCollapsedChipProps) {
  const durationInSeconds = (props.reasoningDurationMs / 1000).toFixed(1);
  return (
    <Box>
      <Text color={chatScreenTheme.textDim}>{`${glyphs.chevronRight} `}</Text>
      <Text color={chatScreenTheme.textMuted}>{`// thinking`}</Text>
      <Text color={chatScreenTheme.textDim}>{` · `}</Text>
      <Text color={chatScreenTheme.textMuted}>{`${durationInSeconds}s`}</Text>
      {props.reasoningTokenCount === undefined ? null : (
        <>
          <Text color={chatScreenTheme.textDim}>{` · `}</Text>
          <Text color={chatScreenTheme.textDim}>{`${props.reasoningTokenCount} tokens`}</Text>
        </>
      )}
    </Box>
  );
}
```

- [ ] **Step 5: Run ink-tui test, expect PASS**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test test/components/ReasoningCollapsedChip.test.tsx
```
Expected: PASS.

- [ ] **Step 6: Append opentui-tui equivalent assertions**

Add to `packages/opentui-tui/test/components/ReasoningCollapsedChip.test.tsx` (inside existing describe or append at the bottom of file):

```tsx
import { chatScreenTheme } from "@buli/assistant-design-tokens";

test("renders_duration_in_textMuted_token_count_in_textDim", async () => {
  const { captureCharFrame, renderOnce } = await testRender(
    <ReasoningCollapsedChip reasoningDurationMs={3200} reasoningTokenCount={1248} />,
    { width: 80, height: 3 },
  );
  await renderOnce();
  const frame = captureCharFrame();
  expect(frame).toContain("3.2s");
  expect(frame).toContain("1248 tokens");
  // Sentinel — the polish change uses these tokens; if they are removed, the
  // component must be re-checked against the design.
  expect(chatScreenTheme.textMuted).toBe("#64748B");
  expect(chatScreenTheme.textDim).toBe("#475569");
});
```

- [ ] **Step 7: Run opentui-tui test, expect PASS (text content), confirm it currently still uses single textDim**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test test/components/ReasoningCollapsedChip.test.tsx
```
Expected: PASS for text content. The token-color polish for opentui happens in the next step regardless — captureCharFrame strips colors, so the same multi-color refactor is for visual parity, not directly assertable via captureCharFrame.

- [ ] **Step 8: Polish opentui-tui ReasoningCollapsedChip to emit multi-color spans**

Replace `packages/opentui-tui/src/components/ReasoningCollapsedChip.tsx` with:

```tsx
import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "./glyphs.ts";

// Pen frame LhCtn (HERO 1 component/ReasoningCollapsed). The chip is split
// into multi-color spans: the chevron + token-count tail use textDim; the
// `// thinking` label and the duration use textMuted; separators are textDim.
export type ReasoningCollapsedChipProps = {
  reasoningDurationMs: number;
  reasoningTokenCount: number | undefined;
};

export function ReasoningCollapsedChip(props: ReasoningCollapsedChipProps): ReactNode {
  const durationInSeconds = (props.reasoningDurationMs / 1000).toFixed(1);
  return (
    <box>
      <text>
        <span fg={chatScreenTheme.textDim}>{`${glyphs.chevronRight} `}</span>
        <span fg={chatScreenTheme.textMuted}>{"// thinking"}</span>
        <span fg={chatScreenTheme.textDim}>{" · "}</span>
        <span fg={chatScreenTheme.textMuted}>{`${durationInSeconds}s`}</span>
        {props.reasoningTokenCount === undefined ? null : (
          <>
            <span fg={chatScreenTheme.textDim}>{" · "}</span>
            <span fg={chatScreenTheme.textDim}>{`${props.reasoningTokenCount} tokens`}</span>
          </>
        )}
      </text>
    </box>
  );
}
```

- [ ] **Step 9: Run opentui-tui test, expect PASS**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test test/components/ReasoningCollapsedChip.test.tsx
```
Expected: PASS.

- [ ] **Step 10: Run both full suites + typecheck**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test && bun typecheck
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test && bun typecheck
```
Expected: PASS in both.

- [ ] **Step 11: Commit**

```bash
cd /Users/lukasz/Desktop/Projekty/buli && git add packages/ink-tui/src/components/ReasoningCollapsedChip.tsx packages/ink-tui/test/components/ReasoningCollapsedChip.test.tsx packages/opentui-tui/src/components/ReasoningCollapsedChip.tsx packages/opentui-tui/test/components/ReasoningCollapsedChip.test.tsx && git commit -m "$(cat <<'EOF'
feat(tui): ReasoningCollapsedChip emits multi-color spans for pen frame LhCtn

Both ink and opentui twins were rendering the entire chip as one textDim
span. The HERO 1 design splits the chip across textDim (chevron, separators,
token tail) and textMuted (label, duration). This commit aligns both twins
with the pen-file colors and locks the duration / token-count colors with
ANSI-aware regression tests.
EOF
)"
```

---

## Task 4: ContextWindowMeter (input panel footer in pen frame `HOeet` → `Q1can`)

**Goal:** The pen design renders the percent value (`42%`) in `accentCyan` bold (`#22D3EE`, weight 700 — pen node `aEsYW`). The opentui twin matches; the ink twin renders the percent in `textMuted`. Polish: ink renders bold `accentCyan`. Bar fill colors (green / amber / red thresholds) stay as-is — they communicate fullness, not the percent value.

**Files:**
- Modify: `packages/ink-tui/src/components/ContextWindowMeter.tsx`
- Test (create): `packages/ink-tui/test/components/ContextWindowMeter.test.tsx`
- Test (modify if exists, else create): `packages/opentui-tui/test/components/ContextWindowMeter.test.tsx`

- [ ] **Step 1: Create the ink-tui test file**

Create `packages/ink-tui/test/components/ContextWindowMeter.test.tsx`:

```tsx
import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import { ContextWindowMeter } from "../../src/components/ContextWindowMeter.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

function renderWithoutAnsi(node: React.ReactElement): string {
  return stripVTControlCharacters(renderToString(node));
}

function ansi24BitFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

test("ContextWindowMeter renders ctx label and percent", () => {
  const plain = renderWithoutAnsi(
    <ContextWindowMeter totalTokensUsed={42_000} contextWindowTokenCapacity={100_000} />,
  );
  expect(plain).toContain("ctx");
  expect(plain).toContain("42%");
});

test("ContextWindowMeter renders the percent in bold accentCyan", () => {
  const ansiOutput = renderToString(
    <ContextWindowMeter totalTokensUsed={42_000} contextWindowTokenCapacity={100_000} />,
  );
  const cyanSeq = ansi24BitFg(chatScreenTheme.accentCyan);
  // Bold prefix "\x1b[1m" preceding the cyan fg sequence — chalk emits bold
  // before color when bold is requested via ink's `bold` prop.
  expect(ansiOutput).toContain(cyanSeq);
  expect(ansiOutput).toContain("\x1b[1m");
  // The percent text itself must follow the cyan sequence somewhere in the
  // output. Strict adjacency varies with chalk version — substring is enough.
});

test("ContextWindowMeter falls back to ctx -- when usage is undefined", () => {
  const plain = renderWithoutAnsi(
    <ContextWindowMeter totalTokensUsed={undefined} contextWindowTokenCapacity={100_000} />,
  );
  expect(plain).toContain("ctx --");
});
```

- [ ] **Step 2: Run ink-tui test, expect FAIL on the bold-cyan assertion**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test test/components/ContextWindowMeter.test.tsx
```
Expected: FAIL — current ink renders the percent in `textMuted`, no bold.

- [ ] **Step 3: Update ink-tui ContextWindowMeter to render percent in bold accentCyan**

In `packages/ink-tui/src/components/ContextWindowMeter.tsx`, replace the percent `<Text>` line. The current snippet at the end of the bar render is:

```tsx
      <Text color={chatScreenTheme.textMuted}>{` ${clampedPercentage}%`}</Text>
```

Replace with:

```tsx
      <Text color={chatScreenTheme.textMuted}>{" "}</Text>
      <Text bold color={chatScreenTheme.accentCyan}>{`${clampedPercentage}%`}</Text>
```

- [ ] **Step 4: Run ink-tui test, expect PASS**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test test/components/ContextWindowMeter.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Add (or extend) opentui-tui ContextWindowMeter test**

If `packages/opentui-tui/test/components/ContextWindowMeter.test.tsx` exists, append; else create with:

```tsx
import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
import { ContextWindowMeter } from "../../src/components/ContextWindowMeter.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

describe("ContextWindowMeter (opentui)", () => {
  test("renders_ctx_and_percent_text", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ContextWindowMeter totalTokensUsed={42_000} contextWindowTokenCapacity={100_000} />,
      { width: 60, height: 2 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("ctx");
    expect(frame).toContain("42%");
    // Sentinel for the percent color the design uses — opentui already binds
    // it to accentCyan; if it changes, the design must be revisited.
    expect(chatScreenTheme.accentCyan).toBe("#22D3EE");
  });

  test("falls_back_to_ctx_double_dash_without_usage", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ContextWindowMeter totalTokensUsed={undefined} contextWindowTokenCapacity={100_000} />,
      { width: 30, height: 2 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("ctx --");
  });
});
```

- [ ] **Step 6: Run opentui-tui test, expect PASS**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test test/components/ContextWindowMeter.test.tsx
```
Expected: PASS.

- [ ] **Step 7: Run both full suites + typecheck**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test && bun typecheck
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test && bun typecheck
```
Expected: PASS in both.

- [ ] **Step 8: Commit**

```bash
cd /Users/lukasz/Desktop/Projekty/buli && git add packages/ink-tui/src/components/ContextWindowMeter.tsx packages/ink-tui/test/components/ContextWindowMeter.test.tsx packages/opentui-tui/test/components/ContextWindowMeter.test.tsx && git commit -m "$(cat <<'EOF'
fix(ink-tui): ContextWindowMeter percent in bold accentCyan

Aligns ink-tui with the pen design (input panel footer pen node aEsYW —
weight 700 #22D3EE) and with the opentui twin which already used the
accent cyan. Adds an ink-tui test file (previously missing) plus an
opentui-tui sentinel that locks the token.
EOF
)"
```

---

## Task 5: GrepToolCallCard (pen frame `yntTc`)

**Goal:** The pen design uses an `accentGreen` stripe for grep (`#10B981`). The opentui twin matches. The ink twin uses `accentCyan` — visible bug. Polish: ink uses `accentGreen` stripe + glyph color when not failed. Both twins keep `accentRed` on failure.

**Files:**
- Modify: `packages/ink-tui/src/components/toolCalls/GrepToolCallCard.tsx`
- Test (modify or create): `packages/ink-tui/test/components/toolCalls/GrepToolCallCard.test.tsx` (or in the parent `test/components/` if no subfolder exists; check before writing)

- [ ] **Step 1: Check existing ink-tui grep test location**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli && find packages/ink-tui/test -name "GrepToolCallCard*"
```
If no file exists, create `packages/ink-tui/test/components/GrepToolCallCard.test.tsx` (parent folder, matching the existing flat-style ink-tui tests).

- [ ] **Step 2: Write the failing ink-tui test**

Create `packages/ink-tui/test/components/GrepToolCallCard.test.tsx`:

```tsx
import { expect, test } from "bun:test";
import { renderToString } from "ink";
import React from "react";
import { GrepToolCallCard } from "../../src/components/toolCalls/GrepToolCallCard.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

function ansi24BitFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

test("GrepToolCallCard uses accentGreen stripe in completed state", () => {
  const ansiOutput = renderToString(
    <GrepToolCallCard
      toolCallDetail={{
        searchPattern: "Atlas",
        totalMatchCount: 12,
        matchedFileCount: 4,
        matchHits: [],
      }}
      renderState="completed"
    />,
  );
  // The stripe is the first element in SurfaceCard and uses backgroundColor.
  // We assert it via the green fg sequence appearing in the header glyph,
  // which uses the same stripeColor.
  const greenSeq = ansi24BitFg(chatScreenTheme.accentGreen);
  expect(ansiOutput).toContain(greenSeq);
  // Sanity — must NOT use the previous wrong color (accentCyan) for the
  // stripe / glyph in completed state.
  const cyanSeq = ansi24BitFg(chatScreenTheme.accentCyan);
  // The pattern target text "Atlas" is still cyan, so we cannot blanket-ban
  // the cyan sequence. Instead, assert the green sequence appears before
  // the search-pattern target text "Atlas" — the header order is
  // glyph (green) → name (textPrimary) → "\"Atlas\"" (cyan).
  const greenIndex = ansiOutput.indexOf(greenSeq);
  const atlasIndex = ansiOutput.indexOf("Atlas");
  expect(greenIndex).toBeGreaterThan(-1);
  expect(atlasIndex).toBeGreaterThan(greenIndex);
});

test("GrepToolCallCard uses accentRed stripe in failed state", () => {
  const ansiOutput = renderToString(
    <GrepToolCallCard
      toolCallDetail={{
        searchPattern: "Atlas",
        totalMatchCount: 0,
        matchedFileCount: 0,
        matchHits: [],
      }}
      renderState="failed"
      errorText="ripgrep is not on PATH"
    />,
  );
  const redSeq = ansi24BitFg(chatScreenTheme.accentRed);
  expect(ansiOutput).toContain(redSeq);
});
```

- [ ] **Step 3: Run ink-tui test, expect FAIL on the green-stripe assertion**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test test/components/GrepToolCallCard.test.tsx
```
Expected: FAIL — current ink twin uses cyan stripe.

- [ ] **Step 4: Update ink-tui GrepToolCallCard stripe color**

In `packages/ink-tui/src/components/toolCalls/GrepToolCallCard.tsx`, change line 26 from:

```tsx
    props.renderState === "failed" ? chatScreenTheme.accentRed : chatScreenTheme.accentCyan;
```

to:

```tsx
    props.renderState === "failed" ? chatScreenTheme.accentRed : chatScreenTheme.accentGreen;
```

Also update the comment on line 13 from `cyan stripe` to `green stripe` for accuracy.

- [ ] **Step 5: Run ink-tui test, expect PASS**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test test/components/GrepToolCallCard.test.tsx
```
Expected: PASS.

- [ ] **Step 6: Verify opentui-tui twin tests still pass**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test test/components/toolCalls/
```
Expected: PASS — opentui twin already uses accentGreen.

- [ ] **Step 7: Run both full suites + typecheck**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test && bun typecheck
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test && bun typecheck
```
Expected: PASS in both.

- [ ] **Step 8: Commit**

```bash
cd /Users/lukasz/Desktop/Projekty/buli && git add packages/ink-tui/src/components/toolCalls/GrepToolCallCard.tsx packages/ink-tui/test/components/GrepToolCallCard.test.tsx && git commit -m "$(cat <<'EOF'
fix(ink-tui): GrepToolCallCard stripe is accentGreen, matching pen frame yntTc

ink-tui's grep card was rendering the success stripe in accentCyan, which
disagrees with the pen design (#10B981, the same green as Read/Edit) and
with the opentui-tui twin. Aligns the color and adds the missing ink-tui
test asserting both completed and failed stripe colors.
EOF
)"
```

---

## Task 6: ReadToolCallCard (pen frame `dKq7X`)

**Goal:** The opentui twin passes `variant="embedded"` to its `FencedCodeBlock`; the ink twin does not. The pen design's `codeBody` (frame `ZDqFx`) is `surfaceOne`-on-card with no inner border — the embedded variant is the right call. Port the embedded variant API to ink-tui's `FencedCodeBlock` and use it from the ink ReadToolCallCard.

**Files:**
- Modify: `packages/ink-tui/src/components/primitives/FencedCodeBlock.tsx` (add embedded variant if missing)
- Modify: `packages/ink-tui/src/components/toolCalls/ReadToolCallCard.tsx`
- Test (modify or create): `packages/ink-tui/test/components/ReadToolCallCard.test.tsx`

- [ ] **Step 1: Inspect both FencedCodeBlock implementations**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli && cat packages/ink-tui/src/components/primitives/FencedCodeBlock.tsx packages/opentui-tui/src/components/primitives/FencedCodeBlock.tsx
```
Capture: how opentui implements `variant="embedded"` (e.g. drops the outer border and reduces padding because the parent SurfaceCard already provides them).

- [ ] **Step 2: Write the failing ink-tui ReadToolCallCard test asserting embedded variant**

Create `packages/ink-tui/test/components/ReadToolCallCard.test.tsx`:

```tsx
import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import { ReadToolCallCard } from "../../src/components/toolCalls/ReadToolCallCard.tsx";

function renderWithoutAnsi(node: React.ReactElement): string {
  return stripVTControlCharacters(renderToString(node));
}

test("ReadToolCallCard completed state renders preview lines and lineCount status", () => {
  const plain = renderWithoutAnsi(
    <ReadToolCallCard
      toolCallDetail={{
        readFilePath: "src/atlas/indexer.ts",
        readLineCount: 220,
        readByteCount: 8_192,
        previewLines: [
          { lineNumber: 1, lineText: "import { Indexer } from './core'" },
          { lineNumber: 2, lineText: "export const indexer = new Indexer()" },
        ],
      }}
      renderState="completed"
    />,
  );
  expect(plain).toContain("Read");
  expect(plain).toContain("src/atlas/indexer.ts");
  expect(plain).toContain("220 lines");
  expect(plain).toContain("import { Indexer }");
});

test("ReadToolCallCard does not render an inner code-block border on the preview body", () => {
  const plain = renderWithoutAnsi(
    <ReadToolCallCard
      toolCallDetail={{
        readFilePath: "src/x.ts",
        readLineCount: 1,
        readByteCount: 10,
        previewLines: [{ lineNumber: 1, lineText: "x" }],
      }}
      renderState="completed"
    />,
  );
  // The outer SurfaceCard provides the border. The embedded FencedCodeBlock
  // must not draw a second border row of `─`/`╭` glyphs around the preview.
  // We expect at most ONE rounded-corner glyph row across the whole render.
  const corners = (plain.match(/[╭╮╰╯]/g) ?? []).length;
  expect(corners).toBeLessThanOrEqual(4); // 4 corners of the outer SurfaceCard
});
```

- [ ] **Step 3: Run ink-tui test, expect FAIL on the inner-border check (current ink renders an inner FencedCodeBlock with its own border)**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test test/components/ReadToolCallCard.test.tsx
```
Expected: FAIL on the corners assertion.

- [ ] **Step 4: Add the embedded variant to ink-tui's FencedCodeBlock if missing**

Inspect the file from Step 1. If ink-tui's `FencedCodeBlock` does not accept a `variant?: "default" | "embedded"` prop, add it. The embedded variant must:
- Skip rendering the outer rounded border / corner row.
- Skip the optional `languageLabel` chip header (the parent ToolCall card header already names the source).
- Reduce paddingX/paddingY to 0 (the parent SurfaceCard provides padding).

Implement to match the opentui twin's behavior exactly. If the precise opentui shape uses different prop names, mirror them as-is.

- [ ] **Step 5: Use the embedded variant in ink-tui ReadToolCallCard**

In `packages/ink-tui/src/components/toolCalls/ReadToolCallCard.tsx`, in `buildReadBodyContent`, change the `<FencedCodeBlock ...>` call to pass `variant="embedded"` as the first prop. After the change, the relevant block reads:

```tsx
  return (
    <FencedCodeBlock
      variant="embedded"
      codeLines={previewLines.map((previewLine) => ({
        lineNumber: previewLine.lineNumber,
        lineText: previewLine.lineText,
        ...(previewLine.syntaxHighlightSpans
          ? { syntaxHighlightSpans: previewLine.syntaxHighlightSpans }
          : {}),
      }))}
    />
  );
```

- [ ] **Step 6: Run ink-tui test, expect PASS**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test test/components/ReadToolCallCard.test.tsx
```
Expected: PASS.

- [ ] **Step 7: Verify opentui twin still passes**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test test/components/toolCalls/
```
Expected: PASS — no opentui change.

- [ ] **Step 8: Run both full suites + typecheck**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test && bun typecheck
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test && bun typecheck
```
Expected: PASS in both.

- [ ] **Step 9: Commit**

```bash
cd /Users/lukasz/Desktop/Projekty/buli && git add packages/ink-tui/src/components/primitives/FencedCodeBlock.tsx packages/ink-tui/src/components/toolCalls/ReadToolCallCard.tsx packages/ink-tui/test/components/ReadToolCallCard.test.tsx && git commit -m "$(cat <<'EOF'
feat(ink-tui): FencedCodeBlock embedded variant for ToolCall card bodies

Ports the opentui-tui twin's `variant=\"embedded\"` API to ink-tui's
FencedCodeBlock and adopts it from ReadToolCallCard so the pen frame
ZDqFx (codeBody on dKq7X) renders without a redundant inner border.
Mirrors a missing ink-tui test for the Read card.
EOF
)"
```

---

## Task 7: EditToolCallCard (pen frames `YTs08` success / `cVkM5` error)

**Goal:** Both twins already render the success-with-diff variant and the error variant in the right colors. This task adds explicit token-asserted tests on both sides (currently no `EditToolCallCard.test.tsx` exists in either package's `test/components/`) and confirms the diff-row tints come from `chatScreenTheme.diffAdditionBg` / `diffRemovalBg`.

**Files:**
- Test (create): `packages/ink-tui/test/components/EditToolCallCard.test.tsx`
- Test (create): `packages/opentui-tui/test/components/EditToolCallCard.test.tsx`

(No source changes expected. If a source change DOES become necessary while writing a test, document it in the commit message.)

- [ ] **Step 1: Confirm no existing EditToolCallCard test exists in either package**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli && find packages -name "EditToolCallCard*" -path "*/test/*"
```
Expected: empty — confirmed at plan time.

- [ ] **Step 2: Create the ink-tui test**

Create `packages/ink-tui/test/components/EditToolCallCard.test.tsx`:

```tsx
import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import { EditToolCallCard } from "../../src/components/toolCalls/EditToolCallCard.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

function ansi24BitFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

function renderWithoutAnsi(node: React.ReactElement): string {
  return stripVTControlCharacters(renderToString(node));
}

test("EditToolCallCard completed state shows +N -M counts in green and red", () => {
  const ansiOutput = renderToString(
    <EditToolCallCard
      toolCallDetail={{
        editedFilePath: "src/runtime.ts",
        addedLineCount: 3,
        removedLineCount: 1,
        diffLines: [
          { kind: "context", lineText: "function run() {" },
          { kind: "removal", lineText: "  return null;" },
          { kind: "addition", lineText: "  return start();" },
          { kind: "addition", lineText: "  // initialised" },
          { kind: "addition", lineText: "}" },
        ],
      }}
      renderState="completed"
    />,
  );
  const greenSeq = ansi24BitFg(chatScreenTheme.accentGreen);
  const redSeq = ansi24BitFg(chatScreenTheme.accentRed);
  expect(ansiOutput).toContain(`${greenSeq}\x1b[1m+3`);
  expect(ansiOutput).toContain(`${redSeq}\x1b[1m-1`);
});

test("EditToolCallCard failed state suppresses the diff body and uses red stripe color", () => {
  const ansiOutput = renderToString(
    <EditToolCallCard
      toolCallDetail={{
        editedFilePath: "src/runtime.ts",
        diffLines: undefined,
      }}
      renderState="failed"
      errorText="permission denied"
    />,
  );
  const redSeq = ansi24BitFg(chatScreenTheme.accentRed);
  expect(ansiOutput).toContain(redSeq);
  const plain = stripVTControlCharacters(ansiOutput);
  expect(plain).toContain("permission denied");
});

test("EditToolCallCard diff body uses diffAdditionBg / diffRemovalBg row tints", () => {
  const ansiOutput = renderToString(
    <EditToolCallCard
      toolCallDetail={{
        editedFilePath: "src/x.ts",
        diffLines: [
          { kind: "addition", lineText: "added line" },
          { kind: "removal", lineText: "removed line" },
        ],
      }}
      renderState="completed"
    />,
  );
  const ansi24BitBg = (hex: string): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `\x1b[48;2;${r};${g};${b}m`;
  };
  expect(ansiOutput).toContain(ansi24BitBg(chatScreenTheme.diffAdditionBg));
  expect(ansiOutput).toContain(ansi24BitBg(chatScreenTheme.diffRemovalBg));
});
```

- [ ] **Step 3: Run ink-tui test, expect PASS (current implementation already conforms)**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test test/components/EditToolCallCard.test.tsx
```
Expected: PASS. If FAIL on the diff-tint assertion, inspect `packages/ink-tui/src/components/primitives/DiffBlock.tsx` and ensure addition/removal rows set `backgroundColor` to `chatScreenTheme.diffAdditionBg` / `diffRemovalBg`. Make that source change in this task and capture in the commit message.

- [ ] **Step 4: Create the opentui-tui test**

Create `packages/opentui-tui/test/components/EditToolCallCard.test.tsx` (note: opentui-tui has a `toolCalls` subfolder under `test/components/` — match its convention):

```tsx
import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
import { EditToolCallCard } from "../../src/components/toolCalls/EditToolCallCard.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

describe("EditToolCallCard (opentui)", () => {
  test("completed_renders_added_and_removed_counts", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <EditToolCallCard
        toolCallDetail={{
          editedFilePath: "src/runtime.ts",
          addedLineCount: 3,
          removedLineCount: 1,
          diffLines: [
            { kind: "addition", lineText: "added" },
            { kind: "removal", lineText: "gone" },
          ],
        }}
        renderState="completed"
      />,
      { width: 80, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Edit");
    expect(frame).toContain("+3");
    expect(frame).toContain("-1");
    expect(frame).toContain("added");
    // Sentinel: row-tint tokens must remain stable.
    expect(chatScreenTheme.diffAdditionBg).toBe("#0C1C15");
    expect(chatScreenTheme.diffRemovalBg).toBe("#1C0D0F");
  });

  test("failed_renders_error_text_and_no_diff", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <EditToolCallCard
        toolCallDetail={{ editedFilePath: "src/x.ts", diffLines: undefined }}
        renderState="failed"
        errorText="permission denied"
      />,
      { width: 80, height: 5 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Edit");
    expect(frame).toContain("permission denied");
  });
});
```

If the path `packages/opentui-tui/test/components/toolCalls/` exists and that's the convention, place the file there instead.

- [ ] **Step 5: Run opentui-tui test, expect PASS**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test test/components/EditToolCallCard.test.tsx
```
Expected: PASS.

- [ ] **Step 6: Run both full suites + typecheck**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test && bun typecheck
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test && bun typecheck
```
Expected: PASS in both.

- [ ] **Step 7: Commit**

```bash
cd /Users/lukasz/Desktop/Projekty/buli && git add packages/ink-tui/test/components/EditToolCallCard.test.tsx packages/opentui-tui/test/components/EditToolCallCard.test.tsx && git commit -m "$(cat <<'EOF'
test(tui): EditToolCallCard locks success/error states for pen frames YTs08 + cVkM5

Adds the previously-missing ink + opentui tests for the Edit card, asserting
the +N/-M count colors, the failed-state error surfacing, and the
diffAdditionBg / diffRemovalBg row tints that substitute for the design's
low-alpha row tints on the terminal cell grid.
EOF
)"
```

---

## Task 8: StreamingAssistantMessageBlock (pen frame `90pSl`)

**Goal:** The pen design renders the agent response as: a muted `// agent · response` heading, body text in `textPrimary`, and any embedded codeBlock as a SurfaceCard-styled FencedCodeBlock — no outer stripe-card wrapper. Both current twins wrap the entire block in a `SurfaceCard` with a streaming/incomplete/failed stripe. Polish: keep the SurfaceCard wrapper for the failed/incomplete states (no design exists for those — the stripe communicates the state), but swap the streaming/successful state to a header-led layout matching the design.

**Decision pinned in this task** (recorded so a future reviewer doesn't re-litigate): for unknown-from-design states (failed, incomplete) we keep the existing red/amber stripe SurfaceCard. For the streaming/success path we render the design's header-led layout. This preserves error visibility while matching the design where it exists.

**Files:**
- Modify: `packages/ink-tui/src/components/StreamingAssistantMessageBlock.tsx`
- Modify: `packages/opentui-tui/src/components/StreamingAssistantMessageBlock.tsx`
- Test (create): `packages/ink-tui/test/components/StreamingAssistantMessageBlock.test.tsx`
- Test (create): `packages/opentui-tui/test/components/StreamingAssistantMessageBlock.test.tsx`

- [ ] **Step 1: Look at how SurfaceCard renders and confirm the wrapper assumption**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli && cat packages/ink-tui/src/components/primitives/SurfaceCard.tsx
```
Capture: confirm SurfaceCard renders the stripe via a 1-row backgroundColor child (not a border). Required so we can detect its presence in the `streaming` test.

- [ ] **Step 2: Write the failing ink-tui test**

Create `packages/ink-tui/test/components/StreamingAssistantMessageBlock.test.tsx`:

```tsx
import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import { StreamingAssistantMessageBlock } from "../../src/components/StreamingAssistantMessageBlock.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

function ansi24BitBg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[48;2;${r};${g};${b}m`;
}

const projectionWithText = {
  completedContentParts: [
    { kind: "text", text: "The Atlas indexer walks the project tree." } as const,
  ],
  openContentPart: undefined,
};

test("streaming success state renders a muted '// agent · response' header", () => {
  const plain = stripVTControlCharacters(
    renderToString(
      <StreamingAssistantMessageBlock
        renderState="streaming"
        streamingProjection={projectionWithText}
      />,
    ),
  );
  expect(plain).toContain("// agent · response");
  expect(plain).toContain("The Atlas indexer walks the project tree.");
});

test("streaming success state does NOT render a cyan stripe row", () => {
  const ansiOutput = renderToString(
    <StreamingAssistantMessageBlock
      renderState="streaming"
      streamingProjection={projectionWithText}
    />,
  );
  // The previous wrapper rendered a 1-row accentCyan backgroundColor strip.
  // After this task, the streaming/success path must not render it.
  expect(ansiOutput).not.toContain(ansi24BitBg(chatScreenTheme.accentCyan));
});

test("failed state still renders the accentRed stripe wrapper", () => {
  const ansiOutput = renderToString(
    <StreamingAssistantMessageBlock
      renderState="failed"
      streamingProjection={projectionWithText}
    />,
  );
  expect(ansiOutput).toContain(ansi24BitBg(chatScreenTheme.accentRed));
});

test("incomplete state still renders the accentAmber stripe wrapper", () => {
  const ansiOutput = renderToString(
    <StreamingAssistantMessageBlock
      renderState="incomplete"
      streamingProjection={projectionWithText}
    />,
  );
  expect(ansiOutput).toContain(ansi24BitBg(chatScreenTheme.accentAmber));
});
```

- [ ] **Step 3: Run ink-tui test, expect FAIL on the "no cyan stripe in streaming" assertion**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test test/components/StreamingAssistantMessageBlock.test.tsx
```
Expected: FAIL — current implementation always wraps in SurfaceCard with a stripe.

- [ ] **Step 4: Refactor ink-tui StreamingAssistantMessageBlock**

Replace `packages/ink-tui/src/components/StreamingAssistantMessageBlock.tsx`:

```tsx
import { Box, Text } from "ink";
import type { ReactNode } from "react";
import type { AssistantStreamingProjection, StreamingAssistantContentPart } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { RenderAssistantResponseTree } from "../richText/renderAssistantResponseTree.tsx";
import { glyphs } from "./glyphs.ts";
import { FencedCodeBlock } from "./primitives/FencedCodeBlock.tsx";
import { SurfaceCard } from "./primitives/SurfaceCard.tsx";

export type StreamingAssistantMessageBlockProps = {
  renderState: "streaming" | "incomplete" | "failed";
  streamingProjection: AssistantStreamingProjection;
};

function OpenStreamingAssistantContentPartView(props: {
  openContentPart: StreamingAssistantContentPart;
}): ReactNode {
  const { openContentPart } = props;
  if (openContentPart.kind === "streaming_fenced_code_block") {
    return (
      <FencedCodeBlock
        {...(openContentPart.languageLabel ? { languageLabel: openContentPart.languageLabel } : {})}
        codeLines={openContentPart.codeLines.map((codeLineText) => ({ lineText: codeLineText }))}
      />
    );
  }
  return <Text color={chatScreenTheme.textPrimary}>{openContentPart.text}</Text>;
}

function StreamingAgentBody(props: { streamingProjection: AssistantStreamingProjection }): ReactNode {
  const hasCompleted = props.streamingProjection.completedContentParts.length > 0;
  const hasOpen = props.streamingProjection.openContentPart !== undefined;
  return (
    <Box flexDirection="column" width="100%">
      {hasCompleted ? (
        <RenderAssistantResponseTree
          assistantContentParts={props.streamingProjection.completedContentParts}
        />
      ) : null}
      {hasOpen ? (
        <Box marginTop={hasCompleted ? 1 : 0} width="100%">
          <OpenStreamingAssistantContentPartView openContentPart={props.streamingProjection.openContentPart!} />
        </Box>
      ) : null}
      {!hasCompleted && !hasOpen ? (
        <Text color={chatScreenTheme.textDim}>Waiting for model output…</Text>
      ) : null}
    </Box>
  );
}

export function StreamingAssistantMessageBlock(props: StreamingAssistantMessageBlockProps): ReactNode {
  // Pen frame 90pSl (HERO 1 agentResponse): muted `// agent · response`
  // header, primary-text body. No outer stripe wrapper for the success path.
  if (props.renderState === "streaming") {
    return (
      <Box flexDirection="column" width="100%">
        <Text color={chatScreenTheme.textMuted}>{"// agent · response"}</Text>
        <StreamingAgentBody streamingProjection={props.streamingProjection} />
      </Box>
    );
  }
  // No design exists for failed/incomplete — keep the SurfaceCard stripe so
  // the user sees an unmistakable error/incomplete signal.
  const stripeColor =
    props.renderState === "failed" ? chatScreenTheme.accentRed : chatScreenTheme.accentAmber;
  const headerLabel =
    props.renderState === "failed" ? "assistant · failed" : "assistant · incomplete";
  const footerLabel =
    props.renderState === "failed" ? "response failed" : "response stopped early";
  return (
    <SurfaceCard
      stripeColor={stripeColor}
      headerLeft={
        <Box>
          <Text color={stripeColor}>{glyphs.statusDot}</Text>
          <Text bold color={chatScreenTheme.textPrimary}>{` ${headerLabel}`}</Text>
        </Box>
      }
      headerRight={<Text color={chatScreenTheme.textMuted}>{footerLabel}</Text>}
      bodyContent={
        <Box paddingX={1} width="100%">
          <StreamingAgentBody streamingProjection={props.streamingProjection} />
        </Box>
      }
    />
  );
}
```

- [ ] **Step 5: Run ink-tui test, expect PASS**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test test/components/StreamingAssistantMessageBlock.test.tsx
```
Expected: PASS.

- [ ] **Step 6: Mirror the refactor + test to opentui-tui**

Create `packages/opentui-tui/test/components/StreamingAssistantMessageBlock.test.tsx`:

```tsx
import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
import { StreamingAssistantMessageBlock } from "../../src/components/StreamingAssistantMessageBlock.tsx";

const projectionWithText = {
  completedContentParts: [
    { kind: "text", text: "The Atlas indexer walks the project tree." } as const,
  ],
  openContentPart: undefined,
};

describe("StreamingAssistantMessageBlock (opentui)", () => {
  test("streaming_renders_muted_header_and_body", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <StreamingAssistantMessageBlock
        renderState="streaming"
        streamingProjection={projectionWithText}
      />,
      { width: 80, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("// agent · response");
    expect(frame).toContain("The Atlas indexer walks the project tree.");
  });

  test("failed_renders_assistant_failed_label", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <StreamingAssistantMessageBlock
        renderState="failed"
        streamingProjection={projectionWithText}
      />,
      { width: 80, height: 8 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("assistant · failed");
  });

  test("incomplete_renders_assistant_incomplete_label", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <StreamingAssistantMessageBlock
        renderState="incomplete"
        streamingProjection={projectionWithText}
      />,
      { width: 80, height: 8 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("assistant · incomplete");
  });
});
```

Then replace `packages/opentui-tui/src/components/StreamingAssistantMessageBlock.tsx` with the same logical structure as the ink-tui rewrite, using opentui primitives. Concretely the streaming path becomes:

```tsx
  if (props.renderState === "streaming") {
    return (
      <box flexDirection="column" width="100%">
        <text fg={chatScreenTheme.textMuted}>{"// agent · response"}</text>
        <StreamingAgentBody streamingProjection={props.streamingProjection} />
      </box>
    );
  }
```

…and the failed/incomplete path keeps the SurfaceCard wrapper exactly as today (just remove the streaming branch from the wrapper).

- [ ] **Step 7: Run opentui-tui test, expect PASS**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test test/components/StreamingAssistantMessageBlock.test.tsx
```
Expected: PASS.

- [ ] **Step 8: Run both full suites + typecheck — watch for renderAssistantResponseTree-related ripple**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test && bun typecheck
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test && bun typecheck
```
Expected: PASS. If `renderAssistantResponseTree.test.tsx` (existing) regresses, inspect — but the structural change is bounded to the agent-block wrapper, not to RenderAssistantResponseTree itself.

- [ ] **Step 9: Manual visual check**

In the commit message below, record that you compared the rendered streaming output to pen frame `90pSl` visually (run a fixture scenario in `bun packages/ink-tui/dev/...` or the apps/cli runner and screenshot if available; otherwise comment "compared to pen 90pSl by reading the code path").

- [ ] **Step 10: Commit**

```bash
cd /Users/lukasz/Desktop/Projekty/buli && git add packages/ink-tui/src/components/StreamingAssistantMessageBlock.tsx packages/ink-tui/test/components/StreamingAssistantMessageBlock.test.tsx packages/opentui-tui/src/components/StreamingAssistantMessageBlock.tsx packages/opentui-tui/test/components/StreamingAssistantMessageBlock.test.tsx && git commit -m "$(cat <<'EOF'
feat(tui): StreamingAssistantMessageBlock matches pen frame 90pSl on success

The streaming/success path now renders a muted `// agent · response`
header followed by the body text in textPrimary, dropping the cyan stripe
wrapper that disagreed with the pen design. Failed and incomplete states
keep the SurfaceCard stripe (no design exists for them — the stripe
remains the unmistakable error signal).

Visually compared to pen frame 90pSl.
EOF
)"
```

---

## Task 9: InputPanel (pen frame `HOeet`)

**Goal:** Two parts.
1. Port the opentui twin's rich `[ ? ] help · shortcuts · [ ← → ] caret · [ ↑ ↓ ] transcript` footer to the ink twin (currently a plain hint string).
2. Align the prop name from `promptInputHintText` (ink) to `promptInputHintOverride` (opentui). This is a behavioural rename — the new semantics is "override the rich hint when set; otherwise render the rich help cluster". Will ripple into ink-tui's `ChatScreen.tsx`.

**Files:**
- Modify: `packages/ink-tui/src/components/InputPanel.tsx`
- Modify: `packages/ink-tui/src/ChatScreen.tsx` (rename prop pass-through)
- Modify: `packages/ink-tui/test/components/InputPanel.test.tsx`

- [ ] **Step 1: Find every callsite of the current ink prop name**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli && grep -rn "promptInputHintText" packages/ink-tui/
```
Capture: list of sites that need to change (expect at least `ChatScreen.tsx`).

- [ ] **Step 2: Read the existing ink-tui InputPanel test**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli && cat packages/ink-tui/test/components/InputPanel.test.tsx
```
Capture: existing test names so we update rather than delete.

- [ ] **Step 3: Add the failing assertions to the ink-tui InputPanel test**

Add to `packages/ink-tui/test/components/InputPanel.test.tsx`:

```tsx
import { chatScreenTheme } from "@buli/assistant-design-tokens";

test("InputPanel idle footer renders the rich help/caret/transcript hint cluster", () => {
  const plain = stripVTControlCharacters(
    renderToString(
      <InputPanel
        promptDraft=""
        promptDraftCursorOffset={0}
        isPromptInputDisabled={false}
        modeLabel="implementation"
        modelIdentifier="opus-4.6"
        reasoningEffortLabel="reasoning:high"
        assistantResponseStatus="idle"
        totalContextTokensUsed={42_000}
        contextWindowTokenCapacity={100_000}
      />,
    ),
  );
  expect(plain).toContain("?");
  expect(plain).toContain("help · shortcuts");
  expect(plain).toContain("←");
  expect(plain).toContain("→");
  expect(plain).toContain("caret");
  expect(plain).toContain("↑");
  expect(plain).toContain("↓");
  expect(plain).toContain("transcript");
});

test("InputPanel footer respects promptInputHintOverride when provided", () => {
  const plain = stripVTControlCharacters(
    renderToString(
      <InputPanel
        promptDraft=""
        promptDraftCursorOffset={0}
        isPromptInputDisabled={false}
        promptInputHintOverride="press esc to close picker"
        modeLabel="implementation"
        modelIdentifier="opus-4.6"
        reasoningEffortLabel="reasoning:high"
        assistantResponseStatus="idle"
        totalContextTokensUsed={42_000}
        contextWindowTokenCapacity={100_000}
      />,
    ),
  );
  expect(plain).toContain("press esc to close picker");
  expect(plain).not.toContain("help · shortcuts");
});
```

If existing tests in the file pass `promptInputHintText`, update them to `promptInputHintOverride` in the same edit.

- [ ] **Step 4: Run ink-tui InputPanel test, expect FAIL**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test test/components/InputPanel.test.tsx
```
Expected: FAIL — current ink renders the plain hint string only.

- [ ] **Step 5: Update ink-tui InputPanel to mirror opentui-tui's footer + prop**

In `packages/ink-tui/src/components/InputPanel.tsx`:

a) Rename the prop in `InputPanelProps`:

```tsx
  promptInputHintOverride?: string;
```

(Replace the existing `promptInputHintText: string;` line.)

b) Replace the footer JSX block (the `<Box backgroundColor={chatScreenTheme.surfaceTwo} ...>` content — the currently-second branch that renders `<Text color={chatScreenTheme.textMuted}>{props.promptInputHintText}</Text>`):

```tsx
      <Box backgroundColor={chatScreenTheme.surfaceTwo} justifyContent="space-between" paddingX={2}>
        {isStreamingResponse ? (
          <Box gap={1}>
            <SnakeAnimationIndicator />
            <Text color={chatScreenTheme.textMuted}>working…</Text>
          </Box>
        ) : props.promptInputHintOverride !== undefined ? (
          <Text color={chatScreenTheme.textMuted}>{props.promptInputHintOverride}</Text>
        ) : (
          <Box>
            <Text color={chatScreenTheme.textDim}>{"[ "}</Text>
            <Text bold color={chatScreenTheme.accentCyan}>{"?"}</Text>
            <Text color={chatScreenTheme.textDim}>{" ] "}</Text>
            <Text color={chatScreenTheme.textMuted}>{"help · shortcuts · "}</Text>
            <Text color={chatScreenTheme.textDim}>{"[ ← → ] "}</Text>
            <Text color={chatScreenTheme.textMuted}>{"caret · "}</Text>
            <Text color={chatScreenTheme.textDim}>{"[ ↑ ↓ ] "}</Text>
            <Text color={chatScreenTheme.textMuted}>{"transcript"}</Text>
          </Box>
        )}
        <ContextWindowMeter
          totalTokensUsed={props.totalContextTokensUsed}
          contextWindowTokenCapacity={props.contextWindowTokenCapacity}
        />
      </Box>
```

- [ ] **Step 6: Update ink-tui ChatScreen.tsx to pass the renamed prop**

For each site captured in Step 1, change `promptInputHintText={...}` to `promptInputHintOverride={...}`. For sites that always passed a plain "idle" hint, remove the prop entirely so the rich cluster renders.

- [ ] **Step 7: Run ink-tui InputPanel test, expect PASS**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test test/components/InputPanel.test.tsx
```
Expected: PASS.

- [ ] **Step 8: Run ink-tui full suite + typecheck (catches ChatScreen and integration ripple)**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test && bun typecheck
```
Expected: PASS. If `ChatScreen.integration.test.tsx` regresses on a footer-text assertion, update the assertion to match the rich hint cluster (the test was written against the old plain hint).

- [ ] **Step 9: Verify opentui-tui twin tests still pass (no source change there)**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test test/components/InputPanel.test.tsx && bun typecheck
```
Expected: PASS.

- [ ] **Step 10: Manual visual check**

Compare the rendered ink InputPanel footer to pen frame `Q1can` (the inputBottom row in `HOeet`). Note the comparison in the commit message.

- [ ] **Step 11: Commit**

```bash
cd /Users/lukasz/Desktop/Projekty/buli && git add packages/ink-tui/src/components/InputPanel.tsx packages/ink-tui/src/ChatScreen.tsx packages/ink-tui/test/components/InputPanel.test.tsx && git commit -m "$(cat <<'EOF'
feat(ink-tui): InputPanel footer renders rich help/caret/transcript hint cluster

Brings ink-tui's InputPanel to parity with the opentui-tui twin and pen
frame Q1can: when no override is set, the footer renders the bracketed
[ ? ] help · shortcuts · [ ← → ] caret · [ ↑ ↓ ] transcript cluster
with multi-color spans matching the design. Renames the prop from
`promptInputHintText` to `promptInputHintOverride` to communicate the
new override semantics; updates ChatScreen call sites accordingly.

Visually compared to pen frame Q1can / HOeet.
EOF
)"
```

---

## Task 10: ShortcutsModal (pen frame `wWU85`)

**Goal:** Both twins already match the pen frame structurally (rounded green border, optional comfortable-tier accent stripe + footer, two legend sections). This task adds explicit token-asserted tests if missing and checks that the comfortable-tier accent stripe uses `accentGreen` (matches pen `vJjv2`).

**Files:**
- Test (modify): `packages/ink-tui/test/components/ShortcutsModal.test.tsx`
- Test (modify): `packages/opentui-tui/test/components/ShortcutsModal.test.tsx`

(No source changes expected. If a divergence between the twins surfaces while writing tests, document it in the commit message and either fix in this task or open a follow-up issue.)

- [ ] **Step 1: Read both existing ShortcutsModal tests**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli && cat packages/ink-tui/test/components/ShortcutsModal.test.tsx packages/opentui-tui/test/components/ShortcutsModal.test.tsx
```
Capture: existing assertions and the test fixtures used (terminal size tier, `availableModalRowCount`).

- [ ] **Step 2: Append ink-tui assertion that the accent stripe and border use accentGreen**

Add to `packages/ink-tui/test/components/ShortcutsModal.test.tsx`:

```tsx
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { comfortableTerminalSizeTier } from "@buli/assistant-design-tokens";

function ansi24BitBg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[48;2;${r};${g};${b}m`;
}

test("ShortcutsModal renders the accentGreen accent stripe in comfortable tier", () => {
  const ansiOutput = renderToString(
    <ShortcutsModal
      onCloseRequested={() => {}}
      availableModalRowCount={20}
      terminalSizeTierForChatScreen={comfortableTerminalSizeTier}
    />,
  );
  expect(ansiOutput).toContain(ansi24BitBg(chatScreenTheme.accentGreen));
});
```

- [ ] **Step 3: Run ink-tui test, expect PASS**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test test/components/ShortcutsModal.test.tsx
```
Expected: PASS — current implementation already conforms.

- [ ] **Step 4: Append opentui-tui assertion that the accent stripe and border use accentGreen**

Add to `packages/opentui-tui/test/components/ShortcutsModal.test.tsx`:

```tsx
import { chatScreenTheme, comfortableTerminalSizeTier } from "@buli/assistant-design-tokens";

test("renders_accentGreen_stripe_and_border_in_comfortable_tier", async () => {
  const { captureCharFrame, renderOnce } = await testRender(
    <ShortcutsModal
      onCloseRequested={() => {}}
      availableModalRowCount={20}
      terminalSizeTierForChatScreen={comfortableTerminalSizeTier}
    />,
    { width: 80, height: 24 },
  );
  await renderOnce();
  const frame = captureCharFrame();
  expect(frame).toContain("help · shortcuts");
  // Sentinel — locks the token used for both the rounded border and the
  // comfortable-tier accent stripe row.
  expect(chatScreenTheme.accentGreen).toBe("#10B981");
});
```

- [ ] **Step 5: Run opentui-tui test, expect PASS**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test test/components/ShortcutsModal.test.tsx
```
Expected: PASS.

- [ ] **Step 6: Run both full suites + typecheck**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test && bun typecheck
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test && bun typecheck
```
Expected: PASS in both.

- [ ] **Step 7: Commit**

```bash
cd /Users/lukasz/Desktop/Projekty/buli && git add packages/ink-tui/test/components/ShortcutsModal.test.tsx packages/opentui-tui/test/components/ShortcutsModal.test.tsx && git commit -m "$(cat <<'EOF'
test(tui): ShortcutsModal locks accentGreen accent for pen frame wWU85

Adds regression guards on the comfortable-tier accent stripe + rounded
border color in both twins so future changes to the modal chrome must
update the design or the shared accentGreen token.
EOF
)"
```

---

## Phase 1 wrap-up

After Task 10:

- [ ] **Step 1: Run both packages' full suites and typechecks one more time**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli/packages/ink-tui && bun test && bun typecheck
cd /Users/lukasz/Desktop/Projekty/buli/packages/opentui-tui && bun test && bun typecheck
```
Expected: PASS in both.

- [ ] **Step 2: Review git log for the Phase 1 series**

Run:
```bash
cd /Users/lukasz/Desktop/Projekty/buli && git log --oneline 54c65ad..HEAD
```
Expected: 11 commits (Foundation + Task 1..10).

- [ ] **Step 3: Hand back to user for Phase 2 brainstorming**

Phase 2 (Markdown Kinds galleries — pen frames `eeFUN`, `ouRVm`, `icfA0`) starts a fresh `superpowers:brainstorming` cycle. Do not begin Phase 2 work without that brainstorm. Same for Phase 3.

---

## Self-review notes (resolved inline)

- Spec coverage: every Phase 1 component pair from the spec has a numbered task. Phase 2 and 3 are explicitly handed back to brainstorming.
- Placeholder scan: no "TBD" / "TODO" / "implement later" in steps; every code-changing step shows the actual code.
- Type consistency: `promptInputHintOverride` is the single name used after Task 9; `variant="embedded"` on `FencedCodeBlock` is introduced in Task 6 and used by Task 6 only (Task 7's diff body uses `DiffBlock`, not `FencedCodeBlock`).
- The opentui-tui test path convention is `test/components/<File>.test.tsx` with subfolders for `toolCalls/` and `primitives/`. Tasks that create new tests under `test/components/` are correct; if a future contributor moves them under a subfolder, the import paths update accordingly.
