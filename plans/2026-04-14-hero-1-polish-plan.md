# HERO 1 polish round — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the visible gap between the HERO 1 design (`j20vJ`) and the current Ink implementation. Six small Ink-native component tweaks. No contracts/engine/provider changes.

**Scope locked:** the six P-tasks below. Tool-call panels, markdown primitives, per-model context-window capacity, and mode switching remain out of scope.

**Conventions:**
- Commit directly on `main`. Plain commit messages. No `Co-Authored-By:` trailer.
- `bun test` and `bun run typecheck` must stay green after each task.
- Tests: `renderToString` + `stripVTControlCharacters`, `import { expect, test } from "bun:test"`. Match existing component test files.
- Comment style AGENTS.md §47/§60 — explain why, not what.

---

## Task P1: Remove the "No messages yet." empty placeholder

**Files:**
- Modify: `packages/ink-tui/src/components/ConversationTranscriptPane.tsx`
- Modify: `packages/ink-tui/test/app.test.tsx` (if the existing assertion set includes the empty-state string)

- [ ] **Step 1:** Open `ConversationTranscriptPane.tsx`. Find the block that renders `<Text color={chatScreenTheme.textMuted}>No messages yet.</Text>` inside a flex-centered `<Box>`. Replace the early-return with a plain empty wrapper that preserves the viewport-measurement ref:

```tsx
if (props.conversationTranscriptEntries.length === 0) {
  return <Box flexGrow={1} ref={conversationTranscriptViewportFrameRef} />;
}
```

- [ ] **Step 2:** Run `cd packages/ink-tui && bun test`. If any existing test asserts `toContain("No messages yet.")`, remove that assertion from the test file — the string is gone by design. Tests must stay at 57 pass.

- [ ] **Step 3:** `bun run typecheck` — clean.

- [ ] **Step 4:** Commit.

```bash
git add packages/ink-tui/src/components/ConversationTranscriptPane.tsx packages/ink-tui/test/app.test.tsx
git commit -m "refactor(ink-tui): drop empty transcript placeholder to match HERO 1"
```

---

## Task P2: Tighten the top bar and remove the divider row

**Files:**
- Modify: `packages/ink-tui/src/components/TopBar.tsx`
- Modify: `packages/ink-tui/src/ChatScreen.tsx`

- [ ] **Step 1:** In `TopBar.tsx`, drop `paddingY={1}` from the outer `<Box>` so the chips sit tight against the top edge. Keep `paddingX={2}`. Everything else unchanged.

- [ ] **Step 2:** In `ChatScreen.tsx`, remove the line `<Box backgroundColor={chatScreenTheme.border} height={1} />` that sits between `<TopBar />` and the transcript flex area. The `surfaceOne` background of the top bar is visually distinct enough from the `bg` transcript without a separator row; removing it also reclaims one row.

- [ ] **Step 3:** Tests — the `TopBar` tests already assert only on content strings, not layout. Run `bun test` to confirm 57 still pass. If the `app.test.tsx` asserts on the divider in any way, remove that assertion.

- [ ] **Step 4:** `bun run typecheck` — clean.

- [ ] **Step 5:** Commit.

```bash
git add packages/ink-tui/src/components/TopBar.tsx packages/ink-tui/src/ChatScreen.tsx
git commit -m "refactor(ink-tui): tighten top bar padding and drop under-bar divider row"
```

---

## Task P3: Strip the border from the assistant response block

**Files:**
- Modify: `packages/ink-tui/src/components/ConversationTranscriptPane.tsx`

- [ ] **Step 1:** Locate the `message` / `role === "assistant"` branch. Currently renders:

```tsx
<Box borderColor={chatScreenTheme.accentGreen} borderStyle="round" flexDirection="column" ... paddingX={1}>
  <Text bold color={chatScreenTheme.accentGreen}>// agent · response</Text>
  <Text color={chatScreenTheme.textPrimary}>{text}</Text>
</Box>
```

Replace with a borderless layout — one muted label line above the prose, matching pen component `90pSl`:

```tsx
<Box flexDirection="column" key={conversationTranscriptEntry.message.id} marginTop={topMargin}>
  <Text color={chatScreenTheme.textMuted}>// agent · response</Text>
  <Text color={chatScreenTheme.textPrimary}>{conversationTranscriptEntry.message.text}</Text>
</Box>
```

- [ ] **Step 2:** `bun test` — 57 pass. Existing `app.test.tsx` asserts `toContain("// agent · response")`, which still holds.

- [ ] **Step 3:** `bun run typecheck` — clean.

- [ ] **Step 4:** Commit.

```bash
git add packages/ink-tui/src/components/ConversationTranscriptPane.tsx
git commit -m "refactor(ink-tui): render assistant response block without border"
```

---

## Task P4: Blinking prompt cursor in `InputPanel`

**Files:**
- Modify: `packages/ink-tui/src/components/InputPanel.tsx`
- Modify: `packages/ink-tui/test/components/InputPanel.test.tsx`

- [ ] **Step 1:** Write a failing test. The cursor state can't be inspected directly (it's animation-driven), but we can assert that *some* representation of the cursor is present when input isn't disabled. Append to `InputPanel.test.tsx`:

```tsx
test("InputPanel renders a cursor indicator when prompt input is enabled", () => {
  const output = renderWithoutAnsi(
    <InputPanel
      promptDraft="hello"
      isPromptInputDisabled={false}
      promptInputHintText=""
      modeLabel="implementation"
      modelIdentifier="opus-4.6"
      reasoningEffortLabel="high"
      assistantResponseStatus="waiting_for_user_input"
      tokenUsagePercentageOfContextWindow={undefined}
    />,
  );
  // The cursor is either a block character or the underscore fallback;
  // we accept either since useAnimation frame is non-deterministic at render time.
  const hasCursor = output.includes("█") || output.includes("▌") || output.includes("_");
  expect(hasCursor).toBe(true);
});

test("InputPanel does not render a cursor indicator when prompt input is disabled", () => {
  const output = renderWithoutAnsi(
    <InputPanel
      promptDraft="hello"
      isPromptInputDisabled
      promptInputHintText=""
      modeLabel="implementation"
      modelIdentifier="opus-4.6"
      reasoningEffortLabel="high"
      assistantResponseStatus="streaming_assistant_response"
      tokenUsagePercentageOfContextWindow={undefined}
    />,
  );
  // With the prompt disabled the cursor suffix/block should not appear at the
  // end of the rendered prompt line.
  expect(output).not.toMatch(/hello█/);
  expect(output).not.toMatch(/hello▌/);
  expect(output).not.toMatch(/hello_/);
});
```

- [ ] **Step 2:** Run tests to verify they fail (or trivially pass if the existing `_` suffix already matches the first test but the second should fail because `hello_` currently renders).

- [ ] **Step 3:** Update `InputPanel.tsx` to use `useAnimation` for a blinking cursor.

Ink's `useAnimation` returns a tick counter. Use it to flip a cursor character on/off every ~500ms. The rate is controlled by passing `{ interval: 500 }` to `useAnimation` if supported, or by taking the tick modulo 2 at whatever default rate is surfaced by Ink 7.

Read Ink 7's `useAnimation` API surface inside `packages/ink-tui/node_modules/ink/build/hooks/use-animation.d.ts` (or the re-exported shape at `node_modules/ink/build/hooks/use-animation.js`) before deciding the exact call form. If the API only exposes a tick counter without interval control, fall back to computing a `Math.floor(Date.now() / 500) % 2` visibility flag and request re-render each tick.

Implementation sketch (adjust based on what the API actually exposes):

```tsx
import { Box, Text, useAnimation } from "ink";
// ...
export function InputPanel(props: InputPanelProps) {
  const { tick } = useAnimation();
  const isCursorVisible = tick % 2 === 0;
  const cursorCharacter = !props.isPromptInputDisabled && isCursorVisible ? "█" : " ";
  // ... rest of component body unchanged except where `cursorSuffix` was used.
}
```

If `useAnimation` doesn't exist in the installed Ink version or has a different signature, escalate `NEEDS_CONTEXT` and report the exact API surface available.

- [ ] **Step 4:** Run `bun test` — must pass all 59 (57 prior + 2 new).

- [ ] **Step 5:** `bun run typecheck` — clean.

- [ ] **Step 6:** Commit.

```bash
git add packages/ink-tui/src/components/InputPanel.tsx packages/ink-tui/test/components/InputPanel.test.tsx
git commit -m "feat(ink-tui): blink the prompt cursor while input is enabled"
```

---

## Task P5: Snake animation + `working…` label in the `InputPanel` footer

**Files:**
- Create: `packages/ink-tui/src/components/SnakeAnimationIndicator.tsx`
- Create: `packages/ink-tui/test/components/SnakeAnimationIndicator.test.tsx`
- Modify: `packages/ink-tui/src/components/InputPanel.tsx`
- Modify: `packages/ink-tui/test/components/InputPanel.test.tsx`

- [ ] **Step 1:** Create `SnakeAnimationIndicator.tsx`:

```tsx
import { Box, Text, useAnimation } from "ink";
import React from "react";
import { chatScreenTheme } from "../chatScreenTheme.ts";
import { glyphs } from "./glyphs.ts";

// Renders the six-cell snake from pen component snakeA1-A6: four green
// rectangles and two amber ellipses, with the ellipse positions cycling
// through the six slots to signal live work. Used by InputPanel's footer
// while the assistant response is streaming.
const SNAKE_CELL_COUNT = 6;
const ELLIPSE_COUNT = 2;

export function SnakeAnimationIndicator() {
  const { tick } = useAnimation();
  const firstEllipseIndex = tick % SNAKE_CELL_COUNT;
  const secondEllipseIndex = (tick + 1) % SNAKE_CELL_COUNT;

  return (
    <Box>
      {Array.from({ length: SNAKE_CELL_COUNT }, (_, cellIndex) => {
        const isEllipseCell =
          cellIndex === firstEllipseIndex || cellIndex === secondEllipseIndex;
        return (
          <Text
            color={isEllipseCell ? chatScreenTheme.accentAmber : chatScreenTheme.accentGreen}
            key={cellIndex}
          >
            {isEllipseCell ? glyphs.snakeEllipse : glyphs.snakeRectangle}
          </Text>
        );
      })}
    </Box>
  );
}
```

- [ ] **Step 2:** Create test `SnakeAnimationIndicator.test.tsx`:

```tsx
import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import { SnakeAnimationIndicator } from "../../src/components/SnakeAnimationIndicator.tsx";

function renderWithoutAnsi(node: React.ReactElement) {
  return stripVTControlCharacters(renderToString(node));
}

test("SnakeAnimationIndicator renders six cells combining green rectangles and amber ellipses", () => {
  const output = renderWithoutAnsi(<SnakeAnimationIndicator />);
  const rectangleCount = [...output].filter((character) => character === "▰").length;
  const ellipseCount = [...output].filter((character) => character === "●").length;
  expect(rectangleCount + ellipseCount).toBe(6);
  expect(ellipseCount).toBe(2);
});
```

- [ ] **Step 3:** Modify `InputPanel.tsx` footer. Replace the current footer body:

```tsx
<Box backgroundColor={chatScreenTheme.surfaceTwo} justifyContent="space-between" paddingX={2}>
  <Text color={chatScreenTheme.textMuted}>
    {isStreamingResponse ? "working…" : props.promptInputHintText}
  </Text>
  <Text color={chatScreenTheme.textMuted}>
    {props.tokenUsagePercentageOfContextWindow === undefined
      ? "ctx --"
      : `ctx ${props.tokenUsagePercentageOfContextWindow}%`}
  </Text>
</Box>
```

with a streaming-aware left slot that shows the snake next to the label:

```tsx
<Box backgroundColor={chatScreenTheme.surfaceTwo} justifyContent="space-between" paddingX={2}>
  {isStreamingResponse ? (
    <Box gap={1}>
      <SnakeAnimationIndicator />
      <Text color={chatScreenTheme.textMuted}>working…</Text>
    </Box>
  ) : (
    <Text color={chatScreenTheme.textMuted}>{props.promptInputHintText}</Text>
  )}
  <Text color={chatScreenTheme.textMuted}>
    {props.tokenUsagePercentageOfContextWindow === undefined
      ? "ctx --"
      : `ctx ${props.tokenUsagePercentageOfContextWindow}%`}
  </Text>
</Box>
```

Add `import { SnakeAnimationIndicator } from "./SnakeAnimationIndicator.tsx";` at the top.

- [ ] **Step 4:** Append an assertion to `InputPanel.test.tsx` that the snake appears only while streaming:

```tsx
test("InputPanel shows the snake animation only while assistant response is streaming", () => {
  const streamingOutput = renderWithoutAnsi(
    <InputPanel
      promptDraft=""
      isPromptInputDisabled
      promptInputHintText="idle hint"
      modeLabel="implementation"
      modelIdentifier="opus-4.6"
      reasoningEffortLabel="high"
      assistantResponseStatus="streaming_assistant_response"
      tokenUsagePercentageOfContextWindow={undefined}
    />,
  );
  const idleOutput = renderWithoutAnsi(
    <InputPanel
      promptDraft=""
      isPromptInputDisabled={false}
      promptInputHintText="idle hint"
      modeLabel="implementation"
      modelIdentifier="opus-4.6"
      reasoningEffortLabel="high"
      assistantResponseStatus="waiting_for_user_input"
      tokenUsagePercentageOfContextWindow={undefined}
    />,
  );
  expect(streamingOutput).toMatch(/▰|●/);
  expect(idleOutput).not.toMatch(/▰/);
});
```

- [ ] **Step 5:** `bun test` — 61 pass (59 after P4 + 1 snake + 1 toggle). `bun run typecheck` — clean.

- [ ] **Step 6:** Commit.

```bash
git add packages/ink-tui/src/components/SnakeAnimationIndicator.tsx packages/ink-tui/test/components/SnakeAnimationIndicator.test.tsx packages/ink-tui/src/components/InputPanel.tsx packages/ink-tui/test/components/InputPanel.test.tsx
git commit -m "feat(ink-tui): animate the input-panel working indicator with the HERO 1 snake"
```

---

## Task P6: Live reasoning timer in `ReasoningStreamBlock`

**Files:**
- Modify: `packages/ink-tui/src/components/ReasoningStreamBlock.tsx`

- [ ] **Step 1:** The current `ReasoningStreamBlock` computes `elapsedSeconds = ((Date.now() - reasoningStartedAtMs) / 1000).toFixed(1)` at render. Without periodic re-renders, the displayed value freezes. Pull `useAnimation` into the component to force a re-render each tick. The tick value itself is unused for rendering; it only drives component refresh.

Updated imports + hook call:

```tsx
import { Box, Text, useAnimation } from "ink";
// ...
export function ReasoningStreamBlock(props: ReasoningStreamBlockProps) {
  useAnimation();
  const elapsedSeconds = ((Date.now() - props.reasoningStartedAtMs) / 1000).toFixed(1);
  // ... rest of component unchanged
}
```

If Ink 7's `useAnimation` signature does not force a re-render on each tick, use a local `useState` bumped via `setInterval` / `useEffect` as a fallback. Keep the interval at 100 ms to match the design's tenth-of-a-second precision.

- [ ] **Step 2:** The existing `ReasoningStreamBlock` tests assert on rendered text only ("// reasoning", body text). They should keep passing. No new test — timer liveness is an animation behavior best verified visually.

- [ ] **Step 3:** `bun test` — 61 pass. `bun run typecheck` — clean.

- [ ] **Step 4:** Commit.

```bash
git add packages/ink-tui/src/components/ReasoningStreamBlock.tsx
git commit -m "feat(ink-tui): tick reasoning elapsed timer every animation frame"
```

---

## Final verification

- `bun run test` at repo root — all 5 workspaces green.
- `bun run typecheck` at repo root — all 5 workspaces clean.
- `bun run dev:cli` — visually confirm against HERO 1:
  - Empty transcript area (no center placeholder).
  - Top bar chips sit tight at the top; no separator row below.
  - Snake animation + `working…` during streaming; hint text when idle.
  - Prompt cursor blinks while input is enabled; static/absent while disabled.
  - Reasoning block timer ticks live while the model is thinking.
  - Assistant response renders borderless under a muted `// agent · response` label.

## Out of scope (unchanged from main spec)

Tool-call panels, markdown primitives, turn footer, plan proposals, mode switching, per-model context-window capacity sourcing, model-selection overlay redesign.
