# HERO 1 single-pane TUI with streaming reasoning — design spec

Status: approved via brainstorming, ready for implementation planning
Date: 2026-04-14
Target branch: feature branch off `main`

## Goal

Replace the current `ChatScreen` visual shell with the HERO 1 · Classic Single-Pane
design (`j20vJ`) from `novibe.space/designs/my-design.pen` and render two new
conversation transcript blocks end-to-end from real provider events:

- `UserPromptBlock` (`GgP0q`) when the user submits a prompt.
- `ReasoningStream` (`WU3cj`) while the model is producing reasoning summary text,
  collapsing into `ReasoningCollapsed` (`J2ZNB`) once reasoning ends.
- Existing assistant text response restyled to HERO 1's agent-response layout.

The design in the pen file is the source of truth. Pen pixel values translate to
terminal cells through one documented mapping rule (`./ink-limitations.md`).

Tool-call panels, markdown primitives, turn-footer metadata, plan proposals, and
approval banners are out of scope for this round and listed explicitly at the
end of this document.

## Why this order of work

Approach: bottom-up, one vertical slice end-to-end. Each slice compiles and is
demo-able in isolation. This matches AGENTS.md §5 (fix the root cause, don't
patch around it), §7 (TDD against real behavior), and §17 (real integration
tests for persistence-sensitive event pipelines).

The five changes are staged so that by the time the shell re-skin lands last,
the reasoning + response pipeline is already tested and wired.

## Architecture overview

Five packages touched, no new Protocols or interfaces. The OpenAI provider is
already the only real external-system seam; everything else uses concrete
collaborators (AGENTS.md §33).

### Data flow

```
OpenAI Responses API SSE
  → @buli/openai parseOpenAiStream
      emits ProviderStreamEvent (extended with reasoning variants)
  → @buli/engine AssistantResponseRuntime
      maps to AssistantResponseEvent (extended with reasoning variants)
  → ChatScreen useInput + applyAssistantResponseEventToChatScreenState
      folds into ChatScreenState.conversationTranscript
  → ConversationTranscriptPane
      dispatches on transcript entry kind
      → ReasoningStreamBlock (streaming_reasoning_summary)
      → ReasoningCollapsedChip (completed_reasoning_summary)
      → UserPromptBlock (message, role=user)
      → existing assistant block, restyled (message, role=assistant)
      → existing error block, restyled (error)
```

### Packages and file touch list

- `packages/contracts/src/events.ts` — add three assistant reasoning events.
- `packages/contracts/src/provider.ts` — add three provider reasoning events.
- `packages/contracts/test/contracts.test.ts` — extended round-trip tests.
- `packages/openai/src/provider/stream.ts` — parse `response.reasoning_summary_text.delta/.done`.
- `packages/openai/test/stream.test.ts` — extended with SSE fixture.
- `packages/openai/test/fixtures/reasoning-plus-text.sse.txt` — new fixture file.
- `packages/engine/src/runtime.ts` — pass-through arms for reasoning events.
- `packages/engine/test/runtime.test.ts` — extended.
- `packages/ink-tui/src/chatScreenState.ts` — new transcript entry kinds + reducer arms.
- `packages/ink-tui/src/chatScreenTheme.ts` — rewritten with pen file palette.
- `packages/ink-tui/src/contextWindowUsage.ts` — new helper.
- `packages/ink-tui/src/components/glyphs.ts` — new, unicode substitutions.
- `packages/ink-tui/src/components/TopBar.tsx` — new.
- `packages/ink-tui/src/components/UserPromptBlock.tsx` — new.
- `packages/ink-tui/src/components/ReasoningStreamBlock.tsx` — new.
- `packages/ink-tui/src/components/ReasoningCollapsedChip.tsx` — new.
- `packages/ink-tui/src/components/InputPanel.tsx` — new (replaces `PromptDraftPane` and `ChatSessionStatusBar`).
- `packages/ink-tui/src/components/ConversationTranscriptPane.tsx` — extended dispatch.
- `packages/ink-tui/src/ChatScreen.tsx` — wiring only; keyboard logic unchanged.
- `packages/ink-tui/src/components/PromptDraftPane.tsx` — deleted.
- `packages/ink-tui/src/components/ChatSessionStatusBar.tsx` — deleted.
- `packages/ink-tui/test/components/*.test.tsx` — one test file per new component.
- `packages/ink-tui/test/state.test.ts` — extended (existing file covers reducer).
- `packages/ink-tui/test/app.test.tsx` — updated: remove imports of the deleted
  `PromptDraftPane` and `ChatSessionStatusBar`, update assertions to the HERO 1
  top bar text (no more "Conversation" heading — it lives only in the top-bar path).
- `packages/ink-tui/test/ChatScreen.integration.test.tsx` — new.
- `packages/ink-tui/src/index.ts` — public exports updated: add `TopBar`,
  `InputPanel`, `UserPromptBlock`, `ReasoningStreamBlock`, `ReasoningCollapsedChip`;
  remove `PromptDraftPane`, `ChatSessionStatusBar`.

## Step 1 — Contracts: assistant reasoning events

`packages/contracts/src/events.ts` gains three arms on the existing
`AssistantResponseEventSchema` discriminated union. TypeScript exhaustiveness
makes every downstream consumer handle them (AGENTS.md §38).

```ts
export const AssistantReasoningSummaryStartedEventSchema = z
  .object({ type: z.literal("assistant_reasoning_summary_started") })
  .strict();

export const AssistantReasoningSummaryTextChunkEventSchema = z
  .object({
    type: z.literal("assistant_reasoning_summary_text_chunk"),
    text: z.string(),
  })
  .strict();

export const AssistantReasoningSummaryCompletedEventSchema = z
  .object({
    type: z.literal("assistant_reasoning_summary_completed"),
    reasoningDurationMs: z.number().int().nonnegative(),
  })
  .strict();
```

Naming choices:

- `AssistantReasoningSummary*` uses the OpenAI Responses API domain term —
  the raw chain-of-thought is never exposed; what the API emits is a summary.
- `reasoningDurationMs` carries unit and the event it names (AGENTS.md time-value
  naming rule).
- Three types instead of one with a `status` field — lifecycle stages are
  explicit at the type level (AGENTS.md §38).
- No `failed` variant — reasoning failures propagate as
  `assistant_response_failed` for the whole turn; one error path, not two.

`reasoningTokenCount` is deliberately **not** on the completed event. The
Responses API only delivers reasoning token counts in the final
`response.completed` usage payload. The state reducer back-fills the chip when
`assistant_response_completed` arrives with its existing `TokenUsage.reasoning`
field.

Header comment at the top of `events.ts` (new) explains that reasoning events
stream alongside text events within a single turn, and why they need
independent lifecycle (AGENTS.md §47, §60).

### Tests

Extend `packages/contracts/test/contracts.test.ts` with:

- `parses_a_started_reasoning_summary_event`
- `parses_a_reasoning_summary_text_chunk_event`
- `parses_a_reasoning_summary_completed_event_with_non_negative_duration`
- `rejects_a_reasoning_summary_chunk_with_missing_text`
- `rejects_a_reasoning_summary_completed_event_with_negative_duration`

## Step 2 — OpenAI provider: Responses API SSE translation

### Provider-level events

`packages/contracts/src/provider.ts` gains three mirrored arms on
`ProviderStreamEventSchema`:

```ts
ProviderReasoningSummaryStartedEventSchema:
  { type: "reasoning_summary_started" }

ProviderReasoningSummaryTextChunkEventSchema:
  { type: "reasoning_summary_text_chunk", text: string }

ProviderReasoningSummaryCompletedEventSchema:
  { type: "reasoning_summary_completed", reasoningDurationMs: number }
```

### Parser

`packages/openai/src/provider/stream.ts` adds:

- `ReasoningDeltaChunkSchema` for `response.reasoning_summary_text.delta`
  (with `delta: string` and `item_id`).
- `ReasoningDoneChunkSchema` for `response.reasoning_summary_text.done`.

Three local state slots (local to `parseOpenAiStream`):

- `reasoningStartedAtMs: number | undefined` — set on the first reasoning delta
  in a turn.
- `hasEmittedReasoningStarted: boolean` — gate the started event so consecutive
  reasoning summary parts within one turn emit one started/completed pair.
- `hasSeenPartSeparator: boolean` — between a `.done` and the next `.delta` we
  inject a `\n\n` separator chunk so multiple summary parts render as paragraphs
  within one entry.

Arm logic per AGENTS.md §13 (no follow-ups left open):

- `response.reasoning_summary_text.delta`
  - If `!hasEmittedReasoningStarted`: set `reasoningStartedAtMs = performance.now()`,
    set `hasEmittedReasoningStarted = true`, yield
    `{ type: "reasoning_summary_started" }`.
  - If `hasSeenPartSeparator`: yield
    `{ type: "reasoning_summary_text_chunk", text: "\n\n" }`, then
    `hasSeenPartSeparator = false`.
  - Yield `{ type: "reasoning_summary_text_chunk", text: delta }`.
- `response.reasoning_summary_text.done`
  - Set `hasSeenPartSeparator = true`. Do **not** emit completion yet.
- Any non-reasoning event when `hasEmittedReasoningStarted` is true
  - Yield `{ type: "reasoning_summary_completed", reasoningDurationMs: now - reasoningStartedAtMs }`,
    then reset all three slots, then process the current event as before.

Timing is captured provider-side because it is closest to the wire
(AGENTS.md §17).

### Runtime pass-through

`packages/engine/src/runtime.ts` gains three switch arms that map each provider
reasoning event to its assistant counterpart. No policy, no timing work.
The runtime trusts the provider's clock.

### Tests

- `packages/openai/test/stream.test.ts` — new fixture
  `packages/openai/test/fixtures/reasoning-plus-text.sse.txt` contains real
  Responses API frames (delta parts split across multiple `.delta` frames plus
  two `.done` parts followed by text output). Tests:
  - `emits_reasoning_summary_started_on_first_reasoning_delta`
  - `emits_reasoning_summary_text_chunks_in_order_across_parts`
  - `injects_paragraph_separator_between_consecutive_reasoning_parts`
  - `emits_reasoning_summary_completed_with_monotonic_duration_before_text_delta`
  - `does_not_emit_reasoning_summary_completed_when_no_reasoning_occurred`
- `packages/engine/test/runtime.test.ts`:
  - `passes_reasoning_summary_started_through_from_provider`
  - `passes_reasoning_summary_text_chunk_through_from_provider`
  - `passes_reasoning_summary_completed_through_from_provider`
  - `interleaves_reasoning_events_with_response_started_and_text_chunks_in_order`

## Step 3 — ChatScreen state: transcript entry kinds and reducer

`packages/ink-tui/src/chatScreenState.ts`:

### Entry kinds

```ts
export type ConversationTranscriptEntry =
  | { kind: "message"; message: TranscriptMessage }
  | { kind: "error"; text: string }
  | {
      kind: "streaming_reasoning_summary";
      reasoningSummaryId: string;
      reasoningSummaryText: string;
      reasoningStartedAtMs: number;
    }
  | {
      kind: "completed_reasoning_summary";
      reasoningSummaryId: string;
      reasoningSummaryText: string;
      reasoningDurationMs: number;
      reasoningTokenCount: number | undefined;
    };
```

Two distinct kinds instead of one with a `status` field — AGENTS.md §38.

### State field

`ChatScreenState` gains `currentStreamingReasoningSummaryId: string | undefined`.
Parallel to the existing `streamingAssistantMessageId`. Set on
`assistant_reasoning_summary_started`, cleared on `assistant_reasoning_summary_completed`.

### Reducer arms

Added to `applyAssistantResponseEventToChatScreenState`:

- `assistant_reasoning_summary_started`
  - Generate a `reasoningSummaryId` via `randomUUID()`.
  - Record `reasoningStartedAtMs = Date.now()`.
  - Append a `streaming_reasoning_summary` entry.
  - Set `currentStreamingReasoningSummaryId`.
- `assistant_reasoning_summary_text_chunk`
  - If no matching streaming entry exists: no-op (defensive; covers out-of-order
    delivery). Test: `ignores_reasoning_text_chunks_without_a_matching_streaming_id`.
  - Otherwise append chunk to `reasoningSummaryText`.
- `assistant_reasoning_summary_completed`
  - Find streaming entry by id.
  - Replace in place with `completed_reasoning_summary` (same id, same text,
    adds `reasoningDurationMs`, `reasoningTokenCount: undefined`).
  - Clear `currentStreamingReasoningSummaryId`.

Extended arm on the existing `assistant_response_completed`:

- After the existing message replacement, walk the transcript backward to the
  most recent user message; for every `completed_reasoning_summary` encountered
  in that range, set `reasoningTokenCount = usage.reasoning`.

The reducer function gets a block comment at the top explaining the
lifecycle transition `streaming → completed → token-backfilled`.

### Tests

Extend `packages/ink-tui/test/state.test.ts`:

- `appends_a_streaming_reasoning_summary_when_reasoning_starts`
- `grows_the_streaming_reasoning_summary_as_text_chunks_arrive`
- `replaces_streaming_reasoning_summary_with_completed_reasoning_summary_on_reasoning_end`
- `back_fills_reasoning_token_count_when_assistant_response_completes`
- `ignores_reasoning_text_chunks_without_a_matching_streaming_id`
- `treats_consecutive_reasoning_summary_parts_within_one_turn_as_a_single_entry`

## Step 4 — Ink components and theme

### Theme — 1:1 with pen palette

`packages/ink-tui/src/chatScreenTheme.ts` rewritten using the pen file's
`get_variables` output. Full mapping documented in `./ink-limitations.md`.

```ts
export const chatScreenTheme = {
  bg: "#0A0A0F",
  surfaceOne: "#111118",
  surfaceTwo: "#16161F",
  surfaceThree: "#1C1C28",
  border: "#2A2A3A",
  borderSubtle: "#1E1E2E",
  textPrimary: "#F1F5F9",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",
  textDim: "#475569",
  accentGreen: "#10B981",
  accentAmber: "#F59E0B",
  accentCyan: "#22D3EE",
  accentRed: "#EF4444",
  accentPrimary: "#6366F1",
  accentPrimaryMuted: "#818CF8",
  accentPurple: "#A855F7",
} as const;
```

Outer padding and panel gap drop to `0`; HERO 1 is edge-to-edge.

### Pixel-to-cell helper

New file `packages/ink-tui/src/toTerminalCellsFromDesignPixels.ts` exports
one function used wherever a pen pixel value maps into Ink `gap`/`padding`/`width`/`height`.
Rule and table documented in `./ink-limitations.md`.

### Glyphs

`packages/ink-tui/src/components/glyphs.ts` exports named unicode constants
for every Lucide icon used in HERO 1. Table in `./ink-limitations.md`.

### Components

One concern per component. Shared props pattern: a typed props interface,
named after the component plus `Props`.

**`ReasoningStreamBlock.tsx`**

Renders one `streaming_reasoning_summary` transcript entry.

- Header: `<Text color={accentAmber}>●</Text>`, `<Text dimColor>// reasoning</Text>`,
  elapsed-seconds timer (one decimal), trailing `· · ·` amber that cycles
  frame count via `useAnimation`.
- Body: a `<Box>` with only-left border (`borderLeft={true}`, other sides `false`)
  in `textDim`, `paddingLeft={2}`, `<Text italic dimColor>` for
  `reasoningSummaryText`, and at the very end a 1-cell blinking block
  (`<Text backgroundColor={accentAmber}> </Text>` toggled via `useAnimation`
  tick modulo 2).

Component header comment states the render responsibility and that this is the
pre-completion lifecycle stage.

**`ReasoningCollapsedChip.tsx`**

Renders one `completed_reasoning_summary` entry.

- Single row: `<Text dimColor>› // thinking · 3.2s</Text>` plus, when
  `reasoningTokenCount !== undefined`, `· 1248 tokens`.
- Duration formatted to one decimal second.

Component header comment states this is the post-completion lifecycle stage.

**`UserPromptBlock.tsx`**

Renders a `message` entry with `role === "user"`. Row-based layout matching
`GgP0q`: cyan `>` caret, prompt text in `textPrimary`, left padding on body
so the caret column aligns. No separate header row.

**`TopBar.tsx`**

Replaces the inline `topApplicationBar` JSX.

- Flex row, `justifyContent="space-between"`, `paddingX={2} paddingY={1}`,
  `backgroundColor={surfaceOne}`.
- Left: `<Text color={accentGreen}>●</Text>`, working directory path in
  `textSecondary`.
- Right: mode chip (`<Box borderStyle="round" borderColor={accentGreen}>` with
  inner green dot + `implementation`), model chip (`<Box borderStyle="round"
  borderColor={border}>` with inner `opus-4.6 · high`), close `×` in `textMuted`.

Props:

```ts
export type TopBarProps = {
  workingDirectoryPath: string;
  modeLabel: string;
  modelIdentifier: string;
  reasoningEffortLabel: string;
};
```

**`InputPanel.tsx`**

Replaces `PromptDraftPane` and `ChatSessionStatusBar`; absorbs status into the
footer so there is one source of truth for status presentation.

- Outer `<Box borderStyle="round" borderColor={accentGreen} flexDirection="column">`.
- Header strip: `[ ● implementation ]` left, `[ opus-4.6 · reasoning:high ]`
  right, `textMuted` brackets and separators.
- Body: green `>` caret, prompt text, blinking cursor block (1-cell
  `backgroundColor={textPrimary}` toggled via `useAnimation`).
- Footer: left — snake animation (6 cells cycling rectangles `▰` and amber
  ellipses `●` via `useAnimation`), `working…` when
  `assistantResponseStatus === "streaming_assistant_response"`, otherwise the
  scroll/help hint text. Right — `ctx`, progress track sized 12 cells
  (`▓`/`░`), percentage in `accentCyan` or dim `--` when unknown.

Props:

```ts
export type InputPanelProps = {
  promptDraft: string;
  isPromptInputDisabled: boolean;
  promptInputHintText: string;
  modeLabel: string;
  modelIdentifier: string;
  reasoningEffortLabel: string;
  assistantResponseStatus: AssistantResponseStatus;
  tokenUsagePercentageOfContextWindow: number | undefined;
};
```

**`ConversationTranscriptPane.tsx`**

Extended dispatch only; viewport measurement logic unchanged.

```
"message" role=user              → <UserPromptBlock />
"message" role=assistant         → existing assistant block (HERO 1-styled)
"streaming_reasoning_summary"    → <ReasoningStreamBlock />
"completed_reasoning_summary"    → <ReasoningCollapsedChip />
"error"                          → existing error block (accentRed stripe)
```

### Context-window percentage helper

`packages/ink-tui/src/contextWindowUsage.ts`:

```ts
export function calculateContextWindowFillPercentage(input: {
  totalTokensUsed: number;
  contextWindowTokenCapacity: number;
}): number
```

Returns `0..100`. The caller decides whether to invoke it at all — when the
selected model has no declared capacity (current state of the catalog),
`InputPanel` receives `tokenUsagePercentageOfContextWindow: undefined` and
renders `--` in the ctx slot.

Per-model capacity wiring is explicitly out of scope this round.

### Tests

Rendered via Ink's `renderToString` with `stripVTControlCharacters` — matches
the existing pattern in `packages/ink-tui/test/app.test.tsx`. No new dev
dependency. Assertions check real rendered text.

- `ReasoningStreamBlock.test.tsx`:
  - `renders_amber_dot_label_and_elapsed_timer_in_header`
  - `appends_streaming_text_to_body_on_rerender`
- `ReasoningCollapsedChip.test.tsx`:
  - `renders_thinking_duration_in_seconds_with_one_decimal`
  - `omits_token_count_clause_when_token_count_is_unknown`
  - `renders_token_count_clause_when_token_count_is_known`
- `UserPromptBlock.test.tsx`:
  - `renders_cyan_caret_and_prompt_text`
- `TopBar.test.tsx`:
  - `renders_working_directory_path_in_left_slot`
  - `renders_mode_and_model_chips_in_right_slot`
- `InputPanel.test.tsx`:
  - `renders_mode_and_model_labels_in_header_strip`
  - `renders_working_indicator_only_while_assistant_response_is_streaming`
  - `renders_context_window_percentage_when_token_usage_is_known`
  - `renders_dim_placeholder_when_context_window_capacity_is_unknown`

## Step 5 — ChatScreen orchestration

`packages/ink-tui/src/ChatScreen.tsx` edits:

Layout tree:

```jsx
<Box backgroundColor={bg} flexDirection="column" height={rows}>
  <TopBar … />
  <Box height={1} backgroundColor={border} />          {/* h1Divider1 */}
  <Box flexGrow={1} overflow="hidden">
    <ConversationTranscriptPane … />
  </Box>
  <Box height={1} backgroundColor={accentGreen} />     {/* h1Divider2 */}
  <InputPanel … />
</Box>
```

Derived props computed once at the top:

- `workingDirectoryPath = process.cwd()`.
- `modeLabel = "implementation"` (hardcoded — mode switching out of scope).
- `modelIdentifier = chatScreenState.selectedModelId`.
- `reasoningEffortLabel = chatScreenState.selectedReasoningEffort ?? "default"`.
- `tokenUsagePercentageOfContextWindow` — `undefined` this round.

Unchanged: `useInput` body, model-selection reducer, viewport scroll state,
keyboard hint text.

### Integration test

`packages/ink-tui/test/ChatScreen.integration.test.tsx`:

- `renders_streaming_reasoning_then_collapses_to_chip_after_assistant_response_completes`

The test drives a full turn through the reducer with a scripted event sequence
(`assistant_response_started → assistant_reasoning_summary_started →
assistant_reasoning_summary_text_chunk x3 → assistant_reasoning_summary_completed →
assistant_response_text_chunk x3 → assistant_response_completed`) and asserts
the rendered frame at each milestone.

## Multi-part reasoning decision

The Responses API can emit multiple reasoning summary parts per turn. This
spec collapses all parts into **one** transcript entry per turn. Provider
logic (Step 2) gates `reasoning_summary_started` behind a boolean and emits
`reasoning_summary_completed` only when the first non-reasoning event arrives
(`response.output_text.delta` or `response.completed`). Between parts, a
`\n\n` chunk is injected so they render as paragraphs within one entry.

This keeps the reducer's `currentStreamingReasoningSummaryId` lifetime clean
and matches the design — one collapsed chip per turn. AGENTS.md §13 — decision
made here, not deferred.

## Comment style

All new and modified code follows AGENTS.md §47 / §60: comments explain **why**,
what constraint they satisfy, or how state changes over time. No comments
re-describe what the code does. Existing comments in `chatScreenState.ts` and
`ChatScreen.tsx` are the reference.

Per file type:

- Contract schemas — one header block explaining what the reasoning-summary
  event stream represents and why it is a separate lifecycle from response text.
- Provider / runtime translators — per-arm comment only where mapping from the
  external protocol needs explanation (e.g., timing measured provider-side
  because it is closest to the wire).
- State reducer arms — block comment at the top of the reducer describing the
  lifecycle transition `streaming → completed → token-backfilled`.
- Ink components — one comment at the top stating render responsibility and
  the lifecycle stage rendered. No line comments inside JSX.

## Out of scope for this round

Deferred to follow-up specs, listed so nothing leaks by accident:

1. Tool-call panels (`ToolCall-Read`, `ToolCall-Grep`, `ToolCall-Edit` success
   + error, diff highlighting).
2. Agent-response markdown primitives beyond plain text (`Heading1/2/3`,
   `Paragraph`, `BulletedList`, `NumberedList`, `FencedCodeBlock`, `InlineBold`,
   `InlineItalic`, `InlineStrike`, `InlineLink`, `InlineCode`, `Callout*`,
   `Table`, `KeyValueList`, `FileRef-*`, `Checklist`, `DiffBlock`, `ShellBlock`,
   `NestedList`).
3. Turn footer (`qfHh3`) with per-turn token counts + model badge.
4. `PlanProposal`, `ErrorBanner`, `RateLimitNotice`, `ToolApproval` blocks.
5. Mode switching — `implementation` is hardcoded this round.
6. Per-model context-window capacity sourcing — this round renders `--` when
   capacity is unknown.
7. Model-selection overlay redesign.

## Definition of done

- All new tests named in this spec exist and pass.
- `bun run typecheck` and `bun run test` pass from the repo root.
- A manual demo run shows: top bar with working directory + mode + model
  chips, green divider, transcript with user prompt + streaming reasoning
  block that collapses to a chip on reasoning end + assistant response that
  streams in, green divider, input panel with snake animation while
  streaming and hint text when idle.
- All files touched match the commit surface list above; no drift into
  out-of-scope areas.
- `./ink-limitations.md` remains the single source of truth for terminal
  fidelity translations; any new fidelity gap discovered during
  implementation is added to that file before the feature ships.
