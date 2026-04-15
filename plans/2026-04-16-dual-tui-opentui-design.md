# Dual TUI (Ink + OpenTUI) With Typed Assistant Parts

| Field | Value |
| --- | --- |
| Date | 2026-04-16 |
| Status | Proposed — pending user review |
| Branch | `feature/opentui-tui-and-typed-assistant-parts` |
| Depends on | `docs/buli-package-roadmap.md` (Slice 2) |
| Design source | `../novibe.space/designs/my-design.pen` nodes `idXGN` (component library) and `j20vJ` (HERO 1 assembled screen) |

## 1. Goal

Build two interchangeable terminal UIs for `buli`, both rendering the same typed assistant transcript against the `.pen` design system:

- `@buli/ink-tui` — reworked from the current flat-text renderer into a per-part component tree.
- `@buli/opentui-tui` — new package, same component inventory, rendered via `@opentui/react`.

The user picks a renderer per invocation with `--ui ink|opentui`. Both consume the same `AssistantResponseRunner` seam that already exists in `@buli/engine`.

The underlying driver for the rework is roadmap Slice 2: replace the flat `streamedAssistantText` string with a typed `AssistantContentPart` discriminated union, so both TUIs can render structured output (headings, lists, code blocks, callouts, inline formatting) rather than raw markdown characters.

Scope is bounded to Slice 2 in the roadmap. Tool-call components (`ToolCall-Read`, `ToolCall-Grep`, `ToolCall-Edit`, `ToolCall-Bash`, `ToolCall-TodoWrite`, `ToolCall-Task`), `DiffBlock`, `ShellBlock`, `PlanProposal`, and `ToolApproval` from the `.pen` library are explicitly deferred to Slices 3–4.

## 2. Scope

### In this slice

- `@buli/contracts` gains the typed `AssistantContentPart` union, `InlineSpan` union, `TranscriptEntry` union, and expanded `AssistantResponseEvent` vocabulary.
- `@buli/engine` gains `AssistantTurnPartAccumulator`, `classifyAssistantTextLine`, and `foldAssistantResponseEventIntoTranscript`. `AssistantResponseRuntime` loses its flat `streamedAssistantText` field.
- `@buli/ink-tui` is reworked from scratch against the typed union. Existing components (`ConversationTranscriptPane`, flat `ChatScreen` composition) are replaced, not extended.
- `@buli/opentui-tui` is new. Same component inventory as ink-tui, built on `@opentui/react`.
- `@buli/assistant-design-tokens` is new. Holds shared color, border, and spacing values ported from the `.pen`.
- `@buli/assistant-transcript-fixtures` is new. Holds canonical typed-part scenarios consumed by engine and both TUI tests.
- `apps/cli` gains `--ui ink|opentui`. `ink` is the default.

### Deferred to future slices

- Tool calls (read/glob/grep/write/edit/apply_patch/bash) — roadmap Slices 3–4.
- `DiffBlock`, `ShellBlock`, `PlanProposal`, `ToolApproval` components — require tool-call data.
- `Table`, `KeyValueList` components — prose data exists but model rarely emits structured tabular markdown; revisit when there is a real data source.
- Session persistence — roadmap Slice 5.

### Non-goals

- Pixel-perfect reproduction of `.pen` font sizes. Terminals render one cell per character; hierarchy is expressed via weight, color, and layout instead.
- Animated shadows or blur effects. Terminals cannot render `effect: shadow` or `background_blur`.
- Shared rendering code between the two TUIs. Per `AGENTS.md` §16, cross-renderer abstraction would be substitution-on-paper; fixtures enforce the correctness contract instead.
- Compat shim on ink-tui. The rework is a full replacement against the same typed-part model that drives opentui-tui.

## 3. Package Layout

```
packages/
  contracts/                            ← expanded typed-part union + events
  openai/                               ← untouched
  engine/                               ← accumulator + classifier + fold
  ink-tui/                              ← reworked from scratch
  opentui-tui/                          ← NEW
  assistant-design-tokens/              ← NEW, small
  assistant-transcript-fixtures/        ← NEW, test-only
apps/
  cli/                                  ← --ui flag, dispatch
```

Dependency direction (one-way):

```
apps/cli
  ↓
packages/ink-tui        packages/opentui-tui
  ↓                       ↓
packages/engine
  ↓
packages/contracts
```

Both TUIs additionally depend on `@buli/assistant-design-tokens`. The fixtures package depends only on `@buli/contracts`. `@buli/opentui-tui` depends on `@opentui/react` via workspace path at `tui/opentui/packages/react`.

Guardrails (per roadmap §Guardrails) preserved:
- `@buli/engine` stays UI-agnostic.
- `@buli/contracts` stays provider-neutral and serializable.
- `@buli/openai` is not touched this slice.
- Each TUI owns its own rendering and local screen state only.

## 4. Typed-Parts Contract

Lives in `@buli/contracts`. Three nested layers.

### 4.1. Layer 1 — `TranscriptEntry`

Top-level items the TUIs render in order:

```ts
export type TranscriptEntry =
  | UserPromptEntry
  | AssistantTurnEntry
  | ErrorBannerEntry
  | RateLimitNoticeEntry;
```

| `kind` | Purpose |
| --- | --- |
| `user_prompt` | One user submission. `{ id, submittedAt, text }`. |
| `assistant_turn` | One assistant response with reasoning, content parts, and usage. See §4.2. |
| `error_banner` | Turn-level failure (auth error, parse error, stream abort). `{ id, occurredAt, title, detail? }`. |
| `rate_limit_notice` | Rate-limit hit. `{ id, occurredAt, retryAfterMs?, message }`. |

### 4.2. Layer 2 — `AssistantTurnEntry`

```ts
export type AssistantTurnEntry = {
  kind: "assistant_turn";
  id: string;
  status: AssistantTurnStatus;
  startedAt: number;
  completedAt?: number;
  reasoningSummary?: AssistantTurnReasoningSummary;
  contentParts: AssistantContentPart[];
  usage?: AssistantTurnUsage;
};

export type AssistantTurnStatus =
  | "awaiting_first_event"
  | "reasoning_summary_streaming"
  | "content_streaming"
  | "completed"
  | "errored";

export type AssistantTurnReasoningSummary =
  | { status: "streaming"; textSoFar: string; elapsedMs: number }
  | { status: "completed"; text: string; totalMs: number; tokenCount?: number };

export type AssistantTurnUsage = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
};
```

Notes:
- Reasoning is nested inside the turn, not a sibling transcript entry. The turn is the unit of retry/error/usage and the `.pen` visual grouping matches this.
- `TurnFooter` from the `.pen` library is not a data kind — renderers derive footer view data from `usage`, `completedAt - startedAt`, and `status`.
- `AssistantTurnStatus` uses distinct stage values per `AGENTS.md` §22 (lifecycle explicit in the type, not a `status` string with unconstrained values).

### 4.3. Layer 3 — `AssistantContentPart`

```ts
export type AssistantContentPart =
  | ParagraphPart
  | HeadingPart
  | BulletedListPart
  | NumberedListPart
  | ChecklistPart
  | FencedCodeBlockPart
  | CalloutPart
  | FileReferencePart;
```

| `kind` | Fields |
| --- | --- |
| `paragraph` | `id, status, spans: InlineSpan[]` |
| `heading` | `id, status, level: 1 \| 2 \| 3, spans: InlineSpan[]` |
| `bulleted_list` | `id, status, items: AssistantListItem[]` (recursive, supports nested lists) |
| `numbered_list` | `id, status, items: AssistantListItem[]` |
| `checklist` | `id, status, items: { checked: boolean; spans: InlineSpan[] }[]` |
| `fenced_code_block` | `id, status, language?: string, content: string` |
| `callout` | `id, status, severity: "info" \| "success" \| "warn" \| "error", spans: InlineSpan[]` |
| `file_reference` | `id, status, path: string, lineRange?: { start: number; end: number }` |

`status` on each part: `"streaming" | "completed"`. The `StreamingCursor` in the `.pen` is a visual affordance the renderer attaches to whichever part has `status: "streaming"`. It is not a content-part kind.

`AssistantListItem` is recursive:

```ts
export type AssistantListItem = {
  spans: InlineSpan[];
  nestedList?: BulletedListPart | NumberedListPart;
};
```

### 4.4. `InlineSpan`

```ts
export type InlineSpan =
  | InlineTextSpan
  | InlineBoldSpan
  | InlineItalicSpan
  | InlineStrikeSpan
  | InlineLinkSpan
  | InlineCodeSpan;
```

Non-nested by default. `InlineLinkSpan.children: InlineSpan[]` holds the link text and allows bold/italic inside a link. All other spans hold a plain string — nested formatting outside of links is not represented (the model rarely emits it and flattening it at parse time is correct).

### 4.5. `AssistantResponseEvent` vocabulary

```ts
export type AssistantResponseEvent =
  | AssistantTurnStartedEvent
  | ReasoningSummaryStreamingUpdatedEvent
  | ReasoningSummaryCompletedEvent
  | ContentPartAppendedEvent
  | ContentPartUpdatedEvent
  | ContentPartClosedEvent
  | AssistantTurnCompletedEvent
  | AssistantTurnErroredEvent;
```

Each event carries the turn id plus minimal payload:
- `ContentPartAppendedEvent`: full part object with `status: "streaming"`.
- `ContentPartUpdatedEvent`: `partId` + patch (text delta for paragraphs/headings/code blocks; item append for lists).
- `ContentPartClosedEvent`: `partId` only — the TUI flips `status` to `"completed"` in its local transcript.
- `AssistantTurnCompletedEvent`: terminal, carries `usage` and `completedAt`.
- `AssistantTurnErroredEvent`: terminal, carries a structured error.

Per `AGENTS.md` §3/§15/§18: every event variant is its own shape with its own fields. No `{ type, payload: unknown }` escape hatch.

## 5. Engine Streaming Lifecycle

Two new collaborators inside `@buli/engine`, plus changes to `AssistantResponseRuntime`.

### 5.1. `classifyAssistantTextLine`

Pure function. Input: one finalized line of assistant text plus the current accumulator state. Output: a classification intent.

```ts
export type AssistantTextLineClassification =
  | { intent: "start_new_part"; part: AssistantContentPart }
  | { intent: "append_to_current_part" }
  | { intent: "close_current_part" }
  | { intent: "toggle_fenced_code_block"; language?: string };
```

Detection rules (line-prefix based, no regex required beyond leading-character checks):

| Line pattern | Intent |
| --- | --- |
| ```` ``` ```` opening fence | `toggle_fenced_code_block` (enter) |
| ```` ``` ```` closing fence | `toggle_fenced_code_block` (exit) |
| `# ` | `start_new_part` (heading level 1) |
| `## ` | `start_new_part` (heading level 2) |
| `### ` | `start_new_part` (heading level 3) |
| `- `, `* ` | `start_new_part` (bulleted_list) or append to existing bulleted list |
| `1. `, `2. `, … | `start_new_part` (numbered_list) or append to existing numbered list |
| `- [ ] `, `- [x] ` | `start_new_part` (checklist) or append to existing checklist |
| `> [!info]`, `> [!success]`, `> [!warn]`, `> [!error]` | `start_new_part` (callout) |
| blank line | `close_current_part` |
| any other | `start_new_part` (paragraph) or `append_to_current_part` if current part is a paragraph |

Inline spans (`bold`, `italic`, `strike`, `link`, `code`) are parsed from each finalized line by a small tokenizer that runs once per line, not per character.

Inside a fenced code block, the classifier short-circuits and returns `append_to_current_part` until the closing fence.

### 5.2. `AssistantTurnPartAccumulator`

A concrete typed struct plus pure reducer functions. Not an interface, not a class — per `AGENTS.md` §16, no abstraction for substitution-on-paper.

```ts
export type AssistantTurnPartAccumulatorState = {
  turnId: string;
  status: AssistantTurnStatus;
  reasoningSummary?: AssistantTurnReasoningSummary;
  contentParts: AssistantContentPart[];
  partialLineBuffer: string;
  isInsideFencedCodeBlock: boolean;
  fencedCodeBlockLanguage?: string;
  startedAt: number;
};

export function applyProviderEventToAssistantTurnPartAccumulator(
  accumulatorState: AssistantTurnPartAccumulatorState,
  providerEvent: ProviderStreamEvent,
): {
  nextState: AssistantTurnPartAccumulatorState;
  emittedResponseEvents: AssistantResponseEvent[];
};
```

Three responsibilities, strictly separated (`AGENTS.md` §4):
1. Reasoning-summary events → update `reasoningSummary`, emit `ReasoningSummaryStreamingUpdatedEvent` or `ReasoningSummaryCompletedEvent`.
2. Assistant-text deltas → append to `partialLineBuffer`; on newline, run `classifyAssistantTextLine`, update `contentParts`, emit `ContentPartAppendedEvent` / `ContentPartUpdatedEvent` / `ContentPartClosedEvent`.
3. Provider `completed` / `error` → close any still-open part, emit `AssistantTurnCompletedEvent` or `AssistantTurnErroredEvent`.

**Mid-line streaming:** each delta appends to `partialLineBuffer` and emits a `ContentPartUpdatedEvent` with the current partial text so the TUI can render character-by-character streaming without reclassifying.

**On newline:** the classifier runs. If the line closes the current part, emit `ContentPartClosedEvent`. If it opens a new one, emit `ContentPartAppendedEvent`. If it appends, emit `ContentPartUpdatedEvent`.

### 5.3. `foldAssistantResponseEventIntoTranscript`

Pure function in `@buli/engine`. Both TUIs import and call it to fold the event stream into transcript state.

```ts
export function foldAssistantResponseEventIntoTranscript(
  currentTranscript: readonly TranscriptEntry[],
  event: AssistantResponseEvent,
): readonly TranscriptEntry[];
```

This is the *semantic* fold — turning events into a transcript with current part states. Per `AGENTS.md` §16, it lives with the engine because it is a data concern shared across two bounded contexts (a real seam). It is not a rendering concern.

### 5.4. `AssistantResponseRuntime` changes

Becomes thinner:
- Loses the flat `streamedAssistantText` field.
- Holds one `AssistantTurnPartAccumulatorState` per active turn.
- Forwards provider events through `applyProviderEventToAssistantTurnPartAccumulator`.
- Fans out the emitted `AssistantResponseEvent`s to subscribers (the TUI).
- Continues to expose the same `AssistantResponseRunner` interface to TUIs — the TUI-facing seam does not change.

### 5.5. Error path

- The classifier cannot fail (any line has a valid classification; `paragraph` is the default).
- Provider errors become `AssistantTurnErroredEvent`, which the TUI folds into an `error_banner` transcript entry.
- Rate-limit SSE events from `@buli/openai` (already parsed in `packages/openai/src/provider/stream.ts`) become `rate_limit_notice` transcript entries — the runtime emits a dedicated event the fold handles.

## 6. Renderer Packages

### 6.1. Internal structure (applies to both TUIs identically)

```
packages/<tui>/src/
  index.ts                           ← renderChatScreenInTerminalWith<Tui>(input)
  ChatScreen.tsx                     ← top-level screen composition
  chatScreenState.ts                 ← local screen state + reducer
  conversationTranscriptViewportState.ts
  components/
    screen-chrome/
      TopBar.tsx
      InputPanel.tsx                  ← inputTop + inputBody + inputBottom
      ModelAndReasoningSelectionPane.tsx
    transcript-entries/
      UserPromptBlock.tsx
      AssistantTurnView.tsx           ← composes reasoning + parts + footer
      ErrorBanner.tsx
      RateLimitNotice.tsx
    reasoning/
      ReasoningStream.tsx
      ReasoningCollapsed.tsx
      StreamingCursor.tsx
    content-parts/
      ParagraphPart.tsx
      HeadingPart.tsx
      BulletedListPart.tsx
      NumberedListPart.tsx
      ChecklistPart.tsx
      FencedCodeBlockPart.tsx
      CalloutPart.tsx
      FileReferencePart.tsx
    inline-spans/
      InlineText.tsx
      InlineBold.tsx
      InlineItalic.tsx
      InlineStrike.tsx
      InlineLink.tsx
      InlineCode.tsx
```

Roughly 24 components per TUI. Export surface of `index.ts` stays the same shape as today's `ink-tui/src/index.ts`:

```ts
export function renderChatScreenInTerminalWith<Tui>(input: {
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  loadAvailableAssistantModels: () => Promise<AssistantModel[]>;
  assistantResponseRunner: AssistantResponseRunner;
}): <Instance>;
```

### 6.2. ink-tui rework (not extension)

The current `ConversationTranscriptPane`, flat `ChatScreen.tsx` composition, `UserPromptBlock`, `ReasoningStreamBlock`, and `ReasoningCollapsedChip` are replaced. Per `AGENTS.md` §5 the rework targets the root (flat-text assumption) rather than patching typed parts on top.

The existing pure-reducer pattern in `chatScreenState.ts` is preserved. Viewport state (`conversationTranscriptViewportState.ts`) is preserved. Event wiring (`relayAssistantResponseRunnerEvents.ts`) adapts to the new `AssistantResponseEvent` vocabulary.

### 6.3. opentui-tui (new)

Same structure. Uses `@opentui/react` primitives in place of `ink` components. Test utilities from `tui/opentui/packages/react/src/test-utils.ts`.

`@buli/opentui-tui` depends on `@opentui/react` via workspace path. The bundled `tui/opentui/` repo is already part of the monorepo.

### 6.4. Shared state-folding

Both TUIs import `foldAssistantResponseEventIntoTranscript` from `@buli/engine` and call it from within their own `chatScreenState.ts` reducer. This is the only semantic logic shared between the two TUIs.

Each TUI owns locally (not shared):
- Input draft state.
- Model/reasoning picker state.
- Scroll position and viewport measurements.
- Shortcuts-help modal state.
- Keyboard binding dispatch.

### 6.5. Visual-fidelity mapping

The `.pen` designs are the visual spec. Applied identically in both TUIs, translated via `@buli/assistant-design-tokens`:

| `.pen` concept | Terminal translation |
| --- | --- |
| Color tokens (`$cyan`, `$amber`, `$green`, `$red`, `$primary`, `$surface-1/2/3`, `$bg`, `$text-primary/secondary/muted/dim`, `$border`, `$border-subtle`) | Truecolor ANSI hex, exported from `@buli/assistant-design-tokens`. |
| `stroke: { fill: <token> }` | Box-drawing characters (`─ │ ╭ ╮ ╰ ╯`) in the token's color. |
| `cornerRadius: $radius-sm` or `$radius-md` | Rounded corners (`╭ ╮ ╰ ╯`). Both tokens collapse to the same glyph. |
| `fontSize` (11/12/13/14) | Ignored. All text is one cell tall. |
| `fontWeight: 500` | Regular. |
| `fontWeight: 700` | Bold. |
| `fontStyle: italic` | Italic (terminal-supported). |
| `padding: [N, M]` | Empty rows / space-padded columns. |
| `gap: N` | Empty rows between flex children. |
| `width: "fill_container"` | Flex-grow in the framework's layout primitives. |
| `effect: shadow`, `background_blur` | Not rendered. |
| Inline decorative strings (`├─`, `└─`, `>_`, `·`) in `.pen` text content | Preserved verbatim. |

## 7. Shared Fixtures Package

`@buli/assistant-transcript-fixtures` — test-only. Depends only on `@buli/contracts`.

```
packages/assistant-transcript-fixtures/src/
  index.ts
  scenarios/
    simpleUserPromptAndAssistantParagraphReply.ts
    reasoningSummaryStreamingMidFlight.ts
    reasoningSummaryCompletedThenMultiPartReply.ts
    assistantReplyWithHeadingAndNestedBulletedList.ts
    assistantReplyWithFencedCodeBlockAndInlineCode.ts
    assistantReplyWithCalloutSeverityVariants.ts
    assistantReplyWithChecklistProgression.ts
    assistantReplyWithFileReferenceAndLineRange.ts
    errorBannerFromProviderStreamFailure.ts
    rateLimitNoticeWithRetryAfter.ts
    streamingContentPartsWithCursorOnTail.ts
```

Each scenario file exports:

```ts
export const <scenarioName>: AssistantTranscriptScenario = {
  startingTranscript: readonly TranscriptEntry[],
  responseEventSequence: readonly AssistantResponseEvent[],
  expectedTranscriptAfterFullApplication: readonly TranscriptEntry[],
};
```

Used three ways:
1. **Engine tests** — verify `foldAssistantResponseEventIntoTranscript` produces the expected transcript from the event sequence.
2. **TUI reducer tests** — verify each TUI's `chatScreenState` reducer handles the resulting transcript without drops or reordering.
3. **TUI rendering snapshots** — each TUI renders the final transcript; snapshots stored per-TUI (they look different by design).

Per `AGENTS.md` §20, scenario names read like domain sentences rather than numeric suffixes.

## 8. CLI Wiring

### 8.1. `apps/cli/src/main.ts`

`parseInteractiveChatStartOptions` extended with `--ui`:

```
--ui ink | opentui        (default: ink)
```

Parsed into `InteractiveChatStartOptions.selectedTerminalUserInterface: "ink" | "opentui"`. Invalid values return `undefined` (same failure path as a bad `--model` or `--reasoning`). `USAGE` string updated.

The field name `selectedTerminalUserInterface` is intentionally long per `AGENTS.md` §20 — it reads as a precise sentence at the call site.

### 8.2. `apps/cli/src/commands/chat.ts`

Dispatches on the field:

```ts
const chatScreen = selectedTerminalUserInterface === "opentui"
  ? renderChatScreenInTerminalWithOpentui({ assistantResponseRunner, ... })
  : renderChatScreenInTerminalWithInk({ assistantResponseRunner, ... });
```

Both functions share the input shape. No dynamic imports — both packages are plain dependencies.

### 8.3. `apps/cli/package.json`

Add `@buli/opentui-tui` as a workspace dependency. No other package.json churn.

### 8.4. Export renames

- `@buli/ink-tui`: `renderChatScreenInTerminal` → `renderChatScreenInTerminalWithInk`.
- `@buli/opentui-tui`: new export `renderChatScreenInTerminalWithOpentui`.

The rename makes the intent readable at call sites (`AGENTS.md` §26).

## 9. Testing Strategy

Per `AGENTS.md` §7/§8/§17: real behavior tested directly, mocking avoided, small typed seams where unavoidable. TDD-first — failing test before implementation.

### 9.1. Per-package coverage

| Package | Focus | Real vs fake |
| --- | --- | --- |
| `@buli/contracts` | Zod parse/serialize round-trips for every typed-part, inline-span, transcript-entry, and event variant. | Real Zod. |
| `@buli/engine` | (a) `classifyAssistantTextLine` — one test per classification rule. (b) `applyProviderEventToAssistantTurnPartAccumulator` — feed event sequences, assert state + emitted events. (c) `foldAssistantResponseEventIntoTranscript` — driven by every fixture scenario. (d) `AssistantResponseRuntime` end-to-end via a real `AsyncIterable` test double carrying synthetic provider events. | Real accumulator, classifier, fold. Test-only `AsyncIterable` as the provider seam. |
| `@buli/openai` | Existing SSE parse tests unchanged. | As-is. |
| `@buli/ink-tui` | Reducer tests, per-component snapshot tests via `ink-testing-library`, integration test driving the chat screen with a fixture scenario via a stub `AssistantResponseRunner`. | Real reducer. Stub runner is a real seam (cross-context, test-only implementation) per `AGENTS.md` §17. |
| `@buli/opentui-tui` | Same three layers as ink-tui, using `@opentui/react` test utilities. Snapshots per-TUI, intentionally not shared. | Same shape as ink-tui. |
| `@buli/assistant-design-tokens` | Static token value validation (hex format, enum exhaustiveness). | Real. |
| `@buli/assistant-transcript-fixtures` | Self-test: each scenario's event sequence, when folded, produces the declared expected transcript. Catches drift. | Real fold. |
| `apps/cli` | `runCli` with `--ui ink`, `--ui opentui`, and `--ui bogus` — via existing `commandHandlers` injection in `apps/cli/src/main.ts:66`. | Existing stubbed handlers. |

### 9.2. Test naming

Per `AGENTS.md` "Practical Naming Examples → Test names should read like business rules" — tests read like business rules:

- `classifies_triple_backtick_line_as_fenced_code_block_toggle`
- `emits_content_part_closed_event_when_blank_line_follows_paragraph`
- `renders_reasoning_collapsed_with_duration_and_token_count`
- `dispatches_opentui_renderer_when_ui_flag_set_to_opentui`
- `folds_reasoning_summary_streaming_update_into_assistant_turn_entry`

Not `should_classify`, `test_rendering`, `handles_input`.

### 9.3. What we don't test

- Terminal pixel output.
- Real OpenAI network calls.
- Subprocess behavior of the CLI binary — tested via `runCli` directly, not by spawning `bin/buli.js`.

## 10. Verification Commands

Per-package (run after each package's implementation lands):

```
bun --filter @buli/contracts test
bun --filter @buli/contracts typecheck
bun --filter @buli/engine test
bun --filter @buli/engine typecheck
bun --filter @buli/openai test
bun --filter @buli/openai typecheck
bun --filter @buli/assistant-design-tokens test
bun --filter @buli/assistant-design-tokens typecheck
bun --filter @buli/assistant-transcript-fixtures test
bun --filter @buli/assistant-transcript-fixtures typecheck
bun --filter @buli/ink-tui test
bun --filter @buli/ink-tui typecheck
bun --filter @buli/opentui-tui test
bun --filter @buli/opentui-tui typecheck
bun --filter @buli/cli test
bun --filter @buli/cli typecheck
```

Workspace-wide gates before commit:

```
bun run test
bun run typecheck
```

Manual smoke test before landing:

```
buli --ui ink --model gpt-5.4
buli --ui opentui --model gpt-5.4
```

Both renderers must render a live streaming response with reasoning-summary block, paragraphs, at least one heading, one bulleted list, one fenced code block, and the turn footer. Both must handle the error path (invalid auth) without crashing.

## 11. Decisions Already Taken

Captured here so they do not need to be relitigated at plan-writing time.

1. **Scope** — typed assistant parts only (roadmap Slice 2). No tools. Non-tool components from the `.pen` library go live now; tool-dependent components (`DiffBlock`, `ShellBlock`, all `ToolCall-*`, `PlanProposal`, `ToolApproval`) deferred to Slices 3–4.
2. **CLI surface** — `--ui ink|opentui` flag on the default interactive command. `ink` default.
3. **ink-tui treatment** — full rework against typed parts, not a compat shim. Ink gets its own per-part component tree.
4. **Cross-TUI sharing** — Approach 3: independent renderers, shared fixtures package. One pure fold function (`foldAssistantResponseEventIntoTranscript`) lives in `@buli/engine` because it is a data concern, not a rendering one.
5. **Design tokens** — live in their own package `@buli/assistant-design-tokens`, imported by both TUIs.
6. **Reasoning summary** — nested inside `AssistantTurnEntry`, not a sibling transcript entry.
7. **`TurnFooter`** — derived view data, not a content-part kind.
8. **`StreamingCursor`** — visual affordance, not a content-part kind. Attached by the renderer to whichever part has `status: "streaming"`.
9. **Line-oriented classification** — classifier runs on finalized lines at newline boundaries; mid-line text deltas pass through as `ContentPartUpdatedEvent` without reclassification.
10. **Accumulator shape** — concrete struct + pure reducer functions, not an interface (AGENTS.md §16).

## 12. Open Questions for Implementation

Questions that do not block the plan but need an answer during implementation:

- **Inline-span tokenizer corner cases.** Should unmatched `*` or `` ` `` be rendered literally or treated as plain text? Default to literal.
- **Nested list depth cap.** The contract allows unbounded recursion via `AssistantListItem.nestedList`. Renderers should cap visual indentation at a sensible depth (likely 4) to avoid runaway indentation on pathological model output.
- **Code-block scrolling.** Long fenced code blocks may exceed transcript viewport height. Scroll behavior — soft-wrap, horizontal scroll, or vertical overflow — should be consistent across both TUIs. Decide during implementation by reference to the `.pen` `FencedCodeBlock` component.
- **Keyboard shortcuts parity.** ink-tui has a current set of shortcuts (model picker, reasoning picker, shortcuts help, submit). opentui-tui should support the same bindings. Verify during the opentui-tui implementation that `@opentui/react` input handling supports the same keys.

---

**End of spec.**
