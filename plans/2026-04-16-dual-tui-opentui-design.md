# Dual TUI (Ink + OpenTUI) With Typed Assistant Parts

| Field | Value |
| --- | --- |
| Date | 2026-04-16 |
| Status | Revised — corrected current-state assumptions after code read |
| Revision | 2 (original at commit `58f7155`; this revision corrects the current-state description after reading the actual codebase) |
| Branch | `feature/opentui-tui-and-typed-assistant-parts` |
| Depends on | `docs/buli-package-roadmap.md` (Slice 2) |
| Design source | `../novibe.space/designs/my-design.pen` nodes `idXGN` (component library) and `j20vJ` (HERO 1 assembled screen) |

## 1. Goal

Build two interchangeable terminal UIs for `buli`, both rendering the same typed assistant transcript against the `.pen` design system:

- `@buli/ink-tui` — existing per-part component tree, updated to consume typed content parts from the engine instead of re-parsing the assistant's flat text at render time.
- `@buli/opentui-tui` — new package, same component inventory as ink-tui, rendered via `@opentui/react`.

The user picks a renderer per invocation with `--ui ink|opentui`. Both consume the same `AssistantResponseRunner` seam that already exists in `@buli/engine`.

The underlying driver is roadmap Slice 2: lift the markdown parser out of ink-tui and into `@buli/engine` so assistant messages carry typed `AssistantContentPart[]` alongside their flat text. Both TUIs consume the typed parts directly — no per-render parsing, and opentui-tui can read the same structured content without importing ink-tui code.

Tool-call events, `PlanProposal`, `RateLimitNotice`, `ToolApproval`, and `ErrorBanner` components already exist in ink-tui and in `@buli/contracts`. Those are **not** deferred — opentui-tui will implement equivalents of each from scratch, and the shared data path already works end-to-end for them today.

## 2. Scope

### 2.1. Current state (what already exists)

This section is the ground truth the rest of the spec builds on. Do not re-introduce assumptions that contradict it.

**`@buli/contracts` already has:**
- 18 `AssistantResponseEvent` variants covering response lifecycle (started / text_chunk / completed / incomplete / failed), reasoning summary lifecycle (started / text_chunk / completed), tool-call lifecycle (started / completed / failed) with typed `ToolCallDetail` per tool (read, grep, edit, bash, todowrite, task), turn_completed, rate_limit_pending, tool_approval_requested, plan_proposed.
- `ToolCallDetail` discriminated union with per-tool preview payloads (file contents, diff lines, shell output, grep matches, todo items).
- `SyntaxHighlightSpan` for code-block syntax coloring.
- `PlanStep` for plan proposals.
- `TranscriptMessage` shape: `{ id, role: "user" | "assistant", text: string }`. Flat text — this is the one contract that needs extending.

**`@buli/engine/src/runtime.ts` already:**
- Accumulates `streamedAssistantText` locally during streaming (still needed for the flat `TranscriptMessage.text` field).
- Forwards every provider event to the correct `AssistantResponseEvent`.
- Emits `AssistantResponseCompletedEvent` carrying the final `TranscriptMessage` with flat text.
- Handles reasoning, tool-call, plan, rate-limit, and approval flows — no changes needed there.

**`@buli/ink-tui` already has ~30 components and a fully typed `ConversationTranscriptEntry` union** (11 kinds: `message`, `error`, `incomplete_response_notice`, `streaming_reasoning_summary`, `completed_reasoning_summary`, `streaming_tool_call`, `completed_tool_call`, `failed_tool_call`, `plan_proposal`, `rate_limit_notice`, `tool_approval_request`, `turn_footer`). `ConversationTranscriptPane` dispatches per kind. Existing component tree:
- `components/behavior/` — `ErrorBannerBlock`, `IncompleteResponseNoticeBlock`, `PlanProposalBlock`, `RateLimitNoticeBlock`, `ToolApprovalRequestBlock`.
- `components/toolCalls/` — `ToolCallEntryView` + per-tool cards (`ReadToolCallCard`, `GrepToolCallCard`, `EditToolCallCard`, `BashToolCallCard`, `TodoWriteToolCallCard`, `TaskToolCallCard`) + `ToolCallCardHeaderSlots`.
- `components/primitives/` — `Paragraph`, `Heading1/2/3`, `BulletedList`, `NumberedList`, `NestedList`, `Checklist`, `FencedCodeBlock`, `DiffBlock`, `ShellBlock`, `InlineMarkdownText`, `Callout`, `FileReference`, `DataTable`, `KeyValueList`, `StreamingCursor`, `SnakeAnimationIndicator`, `SurfaceCard`, `Stripe`.
- Chrome: `ChatScreen`, `TopBar`, `InputPanel`, `ModelAndReasoningSelectionPane`, `ShortcutsModal`, `ConversationTranscriptPane`, `UserPromptBlock`, `ReasoningStreamBlock`, `ReasoningCollapsedChip`, `TurnFooter`.
- `richText/parseAssistantResponseMarkdown.ts` produces `AssistantMarkdownBlock[]` (paragraph, heading, bulleted_list, numbered_list, checklist, fenced_code, callout, horizontal_rule) with `InlineMarkdownSpan[]` inlines.
- `richText/renderAssistantResponseTree.tsx` dispatches each block kind to the matching primitive. Called from `ConversationTranscriptPane` on every render for every assistant message, which re-parses the flat text each time.

**`chatScreenTheme.ts` already holds** the design-token palette sourced 1:1 from the `.pen`. Extracting it is a move, not a new design.

**The real gap to close:**
1. Move the markdown parser (`parseAssistantResponseMarkdown`) from `ink-tui/src/richText/` into `@buli/engine`.
2. Extend `TranscriptMessage` with `contentParts: AssistantContentPart[]` alongside the existing `text` field.
3. Relocate `AssistantMarkdownBlock` / `InlineMarkdownSpan` types into `@buli/contracts` under the domain names `AssistantContentPart` / `InlineSpan`.
4. Engine runs the parser inside `AssistantResponseRuntime` so the `AssistantResponseCompletedEvent` ships `message.contentParts`.
5. ink-tui's `renderAssistantResponseTree` reads `message.contentParts` from the transcript entry instead of calling the parser.
6. opentui-tui is new: it needs every one of the ~30 components above reimplemented against `@opentui/react`, consuming the same `ConversationTranscriptEntry` kinds.
7. Design tokens extracted into `@buli/assistant-design-tokens`; both TUIs import from there.
8. Fixtures package added.
9. `--ui ink|opentui` flag added to the CLI.

### 2.2. Deferred (not in this slice)

- Real tool-call execution (`read`, `glob`, `grep`, `write`, `edit`, `apply_patch`, `bash`). The UI for tool calls exists; the engine-side tool loop does not and is explicitly out of scope for this slice. Tool-call events in the current code are wired through from the provider; a local tool loop comes later.
- Session persistence — roadmap Slice 5.
- Streaming content-part events (incremental per-part `ContentPartAppended` / `Updated` / `Closed` updates). We start with parse-at-completion: the parser runs once inside the runtime when the provider stream completes, and the completed-event carries the final typed parts. During streaming, the TUI keeps its current behavior of rendering from the growing flat text. This is a deliberate simplification — it preserves today's streaming UX with one less moving part. Incremental per-part events are a follow-up if parse-on-render becomes a performance problem.

### 2.3. Non-goals

- Pixel-perfect reproduction of `.pen` font sizes. Terminals render one cell per character; hierarchy is expressed via weight, color, and layout instead.
- Animated shadows or blur effects. Terminals cannot render `effect: shadow` or `background_blur`.
- Shared rendering code between the two TUIs. Per `AGENTS.md` §16, cross-renderer abstraction would be substitution-on-paper; fixtures enforce the correctness contract instead.
- A from-scratch ink-tui rewrite. Only the wiring between the transcript entry and the rendered tree changes; every existing component stays.

## 3. Package Layout

```
packages/
  contracts/                            ← add AssistantContentPart + InlineSpan;
                                           extend TranscriptMessage with contentParts
  openai/                               ← untouched
  engine/                               ← host the relocated markdown parser;
                                           runtime attaches contentParts at completion
  ink-tui/                              ← one seam flip in renderAssistantResponseTree;
                                           delete the local parser;
                                           switch chatScreenTheme → design-tokens import
  opentui-tui/                          ← NEW package, full component tree against
                                           @opentui/react, same consumer contract as ink-tui
  assistant-design-tokens/              ← NEW; extracted from ink-tui's chatScreenTheme.ts
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

## 4. Contract Additions

Lives in `@buli/contracts`. Narrow scope — two new types plus one field added to an existing schema. No event kinds added, none renamed, none removed.

### 4.1. `AssistantContentPart`

```ts
export type AssistantContentPart =
  | ParagraphPart
  | HeadingPart
  | BulletedListPart
  | NumberedListPart
  | ChecklistPart
  | FencedCodeBlockPart
  | CalloutPart
  | HorizontalRulePart;
```

| `kind` | Fields |
| --- | --- |
| `paragraph` | `inlineSpans: InlineSpan[]` |
| `heading` | `headingLevel: 1 \| 2 \| 3, inlineSpans: InlineSpan[]` |
| `bulleted_list` | `itemSpanArrays: InlineSpan[][]` |
| `numbered_list` | `itemSpanArrays: InlineSpan[][]` |
| `checklist` | `items: { isChecked: boolean; inlineSpans: InlineSpan[] }[]` |
| `fenced_code_block` | `languageLabel?: string; codeLines: string[]` |
| `callout` | `severity: "info" \| "success" \| "warn" \| "error"; titleText?: string; inlineSpans: InlineSpan[]` |
| `horizontal_rule` | (no fields) |

Field names mirror the existing ink-tui parser output (`inlineSpans`, `itemSpanArrays`, `headingLevel`, `languageLabel`, `codeLines`) so the move is a straight rename of the top-level tag (`blockKind` → `kind`) and `fenced_code` → `fenced_code_block`. Everything else is preserved.

No `status` field on parts. This slice does per-turn parse-at-completion, so every part the engine emits is already in its final state.

Nested lists are not modeled here. The existing ink-tui `NestedList` primitive is a renderer-side composition over `BulletedList`/`NumberedList` items — not a parser output. If the model emits nested list markdown, it collapses into flat list items at parse time (the current behavior; unchanged).

### 4.2. `InlineSpan`

```ts
export type InlineSpan =
  | InlineTextSpan
  | InlineBoldSpan
  | InlineItalicSpan
  | InlineStrikeSpan
  | InlineLinkSpan
  | InlineCodeSpan;
```

Mirrors the existing `InlineMarkdownSpan` shape in `packages/ink-tui/src/components/primitives/InlineMarkdownText.tsx`. The move is a rename (`InlineMarkdownSpan` → `InlineSpan`) plus relocation into `@buli/contracts`. Bold/italic/strike/code hold a plain string. Link holds `{ linkText, linkTarget }`.

### 4.3. `TranscriptMessage` extension

Existing schema in `packages/contracts/src/messages.ts`:

```ts
export const TranscriptMessageSchema = z.object({
  id: z.string().min(1),
  role: MessageRoleSchema,
  text: z.string(),
}).strict();
```

New field added:

```ts
export const TranscriptMessageSchema = z.object({
  id: z.string().min(1),
  role: MessageRoleSchema,
  text: z.string(),
  assistantContentParts: z.array(AssistantContentPartSchema).optional(),
}).strict();
```

Optional for schema compatibility with user messages (users don't carry parsed parts). Assistant messages always set it; user messages always omit it. Validated by Zod.

### 4.4. Event vocabulary — unchanged

The existing 18 `AssistantResponseEvent` variants stay exactly as they are. No renames, no new kinds. The only effect of this slice on events is that `AssistantResponseCompletedEvent.message` now carries `assistantContentParts` because `TranscriptMessage` carries it.

Existing events stay authoritative for their domains:
- reasoning: `assistant_reasoning_summary_*`
- tool calls: `assistant_tool_call_*`
- plan: `assistant_plan_proposed`
- rate limit: `assistant_rate_limit_pending`
- approval: `assistant_tool_approval_requested`
- lifecycle: `assistant_response_started` / `_text_chunk` / `_completed` / `_incomplete` / `_failed`
- cosmetic: `assistant_turn_completed`

The TUIs continue to fold these events into their own transcript-entry unions. No shared fold function in contracts — see §6.4 for why.

## 5. Engine-Side Parsing

The parser that turns assistant markdown text into typed content parts already exists — at `packages/ink-tui/src/richText/parseAssistantResponseMarkdown.ts`. This slice relocates it into `@buli/engine` and wires it into the runtime so the completed `TranscriptMessage` ships with typed `contentParts`. The parser code itself is kept; only its location, import surface, and the name of its return type change.

### 5.1. Relocating the parser

The existing parser at `packages/ink-tui/src/richText/parseAssistantResponseMarkdown.ts` moves to `packages/engine/src/assistantContentPartParser.ts`. Same line-oriented logic it has today. Rules already covered:

| Line pattern | Produces |
| --- | --- |
| ATX headings (`# `, `## `, `### `) | `heading` part, level 1/2/3 |
| Fenced code (```` ``` ````) | `fenced_code_block` part |
| Bulleted list (`- `, `* `) | `bulleted_list` part with `items: InlineSpan[][]` |
| Numbered list (`1. `, …) | `numbered_list` part |
| Checklist (`- [ ] `, `- [x] `) | `checklist` part |
| GitHub callout (`> [!info]` etc.) | `callout` part with severity |
| Horizontal rule (`---`) | `horizontal_rule` part |
| Anything else | `paragraph` part |

The parser function signature becomes:

```ts
export function parseAssistantResponseIntoContentParts(
  assistantResponseText: string,
): readonly AssistantContentPart[];
```

The return type is imported from `@buli/contracts` (see §4 for the renamed types). Internally the parser's block-kind naming aligns with the contract:

- `blockKind: "paragraph"` → `kind: "paragraph"`
- `blockKind: "heading"` → `kind: "heading"`
- `blockKind: "bulleted_list"` → `kind: "bulleted_list"`
- `blockKind: "numbered_list"` → `kind: "numbered_list"`
- `blockKind: "checklist"` → `kind: "checklist"`
- `blockKind: "fenced_code"` → `kind: "fenced_code_block"` (name alignment with §4.3)
- `blockKind: "callout"` → `kind: "callout"`
- `blockKind: "horizontal_rule"` → `kind: "horizontal_rule"` (not in original §4.3 — adding to the contract since the parser emits it)

### 5.2. Runtime integration

`packages/engine/src/runtime.ts` keeps the `streamedAssistantText` accumulator for the flat `TranscriptMessage.text` field. At the terminal `"completed"` arm, it also parses the accumulated text into typed parts and attaches them to the completed message:

```ts
// Remaining arm: providerStreamEvent.type === "completed".
yield createCompletedAssistantResponseEvent({
  assistantText: streamedAssistantText,
  assistantContentParts: parseAssistantResponseIntoContentParts(streamedAssistantText),
  usage: providerStreamEvent.usage,
});
```

`createCompletedAssistantResponseEvent` (in `packages/engine/src/turn.ts`) gains a required `assistantContentParts` input and threads it into the `TranscriptMessage` it constructs.

### 5.3. No new accumulator, no new event kinds

The original spec proposed an `AssistantTurnPartAccumulator` + `ContentPartAppendedEvent` / `ContentPartUpdatedEvent` / `ContentPartClosedEvent` event types for live per-part streaming. Deferred. Rationale:

- Current ink-tui already renders streamed text into typed parts by re-parsing on render. That works; the performance is acceptable.
- Parse-at-completion is one file of change in the runtime, no new event vocabulary, and keeps the `AssistantResponseEvent` shape stable across the slice.
- Incremental per-part events can be layered on later if parse-on-render shows up as a real performance issue. The contract we add in §4 does not foreclose that — `AssistantContentPart` is the correct shape for incremental events too.

### 5.4. Error path

- Provider errors → `assistant_response_failed` event (already exists). The TUI renders them through the existing `ErrorBannerBlock`.
- `assistant_response_incomplete` → already exists; ink-tui already renders `IncompleteResponseNoticeBlock`. No change.
- `assistant_rate_limit_pending` → already exists; renders through `RateLimitNoticeBlock`. No change.

## 6. Renderer Packages

### 6.1. ink-tui — narrow, targeted changes

Everything structural in ink-tui stays: the 11-kind `ConversationTranscriptEntry` union in `chatScreenState.ts`, the `applyAssistantResponseEventToChatScreenState` reducer, the `ConversationTranscriptPane` dispatcher, every component under `components/`, viewport state, relay, top bar, input panel, shortcuts modal, model selection pane.

Files touched:

| File | Change |
| --- | --- |
| `packages/ink-tui/src/richText/parseAssistantResponseMarkdown.ts` | **Deleted.** The parser lives in `@buli/engine` now. |
| `packages/ink-tui/src/richText/renderAssistantResponseTree.tsx` | Reads `message.assistantContentParts` from props instead of calling `parseAssistantResponseMarkdown(message.text)`. Fallback to empty array if absent (defensive, but the engine always sets it on assistant messages). |
| `packages/ink-tui/src/components/primitives/InlineMarkdownText.tsx` | `InlineMarkdownSpan` type import switches to `InlineSpan` from `@buli/contracts`. Component implementation unchanged. |
| `packages/ink-tui/src/components/primitives/Checklist.tsx` | `ChecklistItem` type moves to `@buli/contracts` as part of `AssistantContentPart`. Import path updates. |
| `packages/ink-tui/src/components/primitives/Callout.tsx` | `CalloutSeverity` type moves to `@buli/contracts`. Import path updates. |
| `packages/ink-tui/src/chatScreenTheme.ts` | **Deleted.** Theme tokens live in `@buli/assistant-design-tokens` now. |
| Every component that imports `chatScreenTheme` | Switches to `import { chatScreenTheme } from "@buli/assistant-design-tokens"`. |
| `packages/ink-tui/src/index.ts` | Exports renamed: `renderChatScreenInTerminal` → `renderChatScreenInTerminalWithInk`. |

No component logic changes. No new components. The reducer, the dispatcher, and the relay are untouched. The flat `message.text` field stays for rendering during streaming (when `assistantContentParts` is still absent from the growing message); once the completion event arrives with parts, the renderer uses those instead of re-parsing.

### 6.2. opentui-tui — new package, same component inventory

`packages/opentui-tui/` is greenfield. It mirrors ink-tui's layout and component responsibilities, reimplemented against `@opentui/react`. Layout:

```
packages/opentui-tui/src/
  index.ts                                 ← renderChatScreenInTerminalWithOpentui(input)
  ChatScreen.tsx
  chatScreenState.ts                       ← local reducer (same shape as ink-tui's)
  conversationTranscriptViewportState.ts
  relayAssistantResponseRunnerEvents.ts
  richText/
    renderAssistantResponseTree.tsx        ← reads message.assistantContentParts
  components/
    ConversationTranscriptPane.tsx
    ConversationTranscriptEntryView.tsx    ← per-kind dispatcher
    TopBar.tsx
    InputPanel.tsx
    ModelAndReasoningSelectionPane.tsx
    ShortcutsModal.tsx
    UserPromptBlock.tsx
    ReasoningStreamBlock.tsx
    ReasoningCollapsedChip.tsx
    TurnFooter.tsx
    SnakeAnimationIndicator.tsx
    behavior/
      ErrorBannerBlock.tsx
      IncompleteResponseNoticeBlock.tsx
      PlanProposalBlock.tsx
      RateLimitNoticeBlock.tsx
      ToolApprovalRequestBlock.tsx
    toolCalls/
      ToolCallEntryView.tsx
      ToolCallCardHeaderSlots.tsx
      ReadToolCallCard.tsx
      GrepToolCallCard.tsx
      EditToolCallCard.tsx
      BashToolCallCard.tsx
      TodoWriteToolCallCard.tsx
      TaskToolCallCard.tsx
    primitives/
      Paragraph.tsx
      Heading1.tsx
      Heading2.tsx
      Heading3.tsx
      BulletedList.tsx
      NumberedList.tsx
      NestedList.tsx
      Checklist.tsx
      FencedCodeBlock.tsx
      DiffBlock.tsx
      ShellBlock.tsx
      InlineMarkdownText.tsx
      Callout.tsx
      FileReference.tsx
      DataTable.tsx
      KeyValueList.tsx
      StreamingCursor.tsx
      SurfaceCard.tsx
      Stripe.tsx
      glyphs.ts
```

Each component covers the same responsibility as its ink-tui counterpart. Implementations differ because layout primitives differ (`@opentui/react` has its own components; Ink has `Box` / `Text` via yoga). Visual output matches the `.pen` designs identically, by construction — both TUIs import the same tokens from `@buli/assistant-design-tokens` and apply the same visual-fidelity mapping from §6.4.

Export surface of `index.ts` mirrors ink-tui's:

```ts
export function renderChatScreenInTerminalWithOpentui(input: {
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  loadAvailableAssistantModels: () => Promise<AvailableAssistantModel[]>;
  assistantResponseRunner: AssistantResponseRunner;
}): <OpentuiInstance>;
```

The `@opentui/react` dependency is wired via workspace path to `tui/opentui/packages/react`.

### 6.3. Shared state-folding

Each TUI keeps its own `applyAssistantResponseEventToChatScreenState` reducer, consuming the same `AssistantResponseEvent` union from `@buli/contracts`. The reducers produce the same `ConversationTranscriptEntry` shape.

The original spec proposed a shared `foldAssistantResponseEventIntoTranscript` function in `@buli/engine`. Removed from this slice — ink-tui's reducer already exists, works, and has tests. Copying its logic into opentui-tui is faster and clearer than extracting it into engine and having both TUIs import from there. The reducer is small enough that divergence risk is low, and the fixtures package (see §7) catches any drift.

Each TUI owns its local screen state (input draft, model picker, scroll position, shortcuts modal, keyboard dispatch). None of that is shared.

### 6.4. Visual-fidelity mapping

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
    assistantReplyWithHeadingAndBulletedList.ts
    assistantReplyWithFencedCodeBlockAndInlineCode.ts
    assistantReplyWithCalloutSeverityVariants.ts
    assistantReplyWithChecklistProgression.ts
    assistantReplyWithToolCallReadPreview.ts
    assistantReplyWithToolCallGrepMatches.ts
    assistantReplyWithToolCallEditDiff.ts
    assistantReplyWithToolCallBashOutput.ts
    assistantReplyWithToolCallTodoWrite.ts
    assistantReplyWithPlanProposal.ts
    assistantReplyWithToolApprovalRequest.ts
    errorBannerFromProviderStreamFailure.ts
    incompleteResponseNotice.ts
    rateLimitNoticeWithRetryAfter.ts
```

Each scenario file exports:

```ts
export type AssistantTranscriptScenario = {
  responseEventSequence: readonly AssistantResponseEvent[];
  // The transcript state each TUI's reducer should reach after
  // applying every event in order, starting from an empty transcript.
  expectedConversationTranscriptEntries: readonly ConversationTranscriptEntryShape[];
};

export const <scenarioName>: AssistantTranscriptScenario = { ... };
```

The fixture package does **not** import a reducer from either TUI. It declares the expected *shape* of each entry (kind + key fields) and each TUI's reducer test asserts that its own reducer output matches. This keeps the fixture dependency-free and lets both TUI reducers be verified against the same contract.

Used three ways:
1. **ink-tui reducer tests** — feed the event sequence through `applyAssistantResponseEventToChatScreenState`, assert the resulting transcript matches the fixture's expected entries.
2. **opentui-tui reducer tests** — same as above with its own reducer.
3. **TUI rendering snapshots** — each TUI renders the final transcript; snapshots stored per-TUI (they look different by design, same semantic content).

Per `AGENTS.md` "Practical Naming Examples", scenario names read like domain sentences rather than numeric suffixes.

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
| `@buli/contracts` | Zod parse/serialize round-trips for new `AssistantContentPart` variants, `InlineSpan` variants, and extended `TranscriptMessage` (with and without `assistantContentParts`). Existing event schemas keep their current tests. | Real Zod. |
| `@buli/engine` | (a) `parseAssistantResponseIntoContentParts` — one test per `AssistantContentPart` variant the parser emits (paragraph, heading 1/2/3, bulleted list, numbered list, checklist, fenced code, callout, horizontal rule), plus the existing edge-case tests relocated from ink-tui. (b) `AssistantResponseRuntime` — extend existing tests to assert `assistant_response_completed` carries `message.assistantContentParts`. | Real parser, real runtime. Existing test fakes reused. |
| `@buli/openai` | Existing SSE parse tests unchanged. | As-is. |
| `@buli/ink-tui` | (a) Existing reducer tests pass unchanged (the reducer is not edited). (b) New `renderAssistantResponseTree` test: passes typed parts directly and asserts the same primitive tree that the old parse-on-render path produced. (c) Existing integration tests pass unchanged once they are updated to feed completed events carrying `assistantContentParts`. | Real reducer. Stub runner is a real seam (cross-context, test-only implementation) per `AGENTS.md` §17. |
| `@buli/opentui-tui` | Same layers as ink-tui: reducer tests, per-component snapshot tests via `@opentui/react` test utilities, integration test driving the chat screen with a fixture scenario via a stub `AssistantResponseRunner`. Snapshots per-TUI, intentionally not shared with ink-tui. | Real reducer, real `@opentui/react` renderer. |
| `@buli/assistant-design-tokens` | Static token value validation (hex format, enum exhaustiveness). | Real. |
| `@buli/assistant-transcript-fixtures` | Self-test: the scenario event sequences schema-validate against `AssistantResponseEventSchema`; the expected entry shapes are well-formed. No reducer runs inside the fixtures package itself. | Real Zod. |
| `apps/cli` | `runCli` with `--ui ink`, `--ui opentui`, and `--ui bogus` — via existing `commandHandlers` injection in `apps/cli/src/main.ts:66`. | Existing stubbed handlers. |

### 9.2. Test naming

Per `AGENTS.md` "Practical Naming Examples → Test names should read like business rules" — tests read like business rules:

- `parses_triple_backtick_line_as_fenced_code_block_part`
- `attaches_assistant_content_parts_to_completed_response_event`
- `renders_reasoning_collapsed_with_duration_and_token_count`
- `dispatches_opentui_renderer_when_ui_flag_set_to_opentui`
- `folds_reasoning_summary_text_chunk_into_streaming_reasoning_entry`
- `renders_file_reference_pill_when_content_part_is_file_reference`

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

1. **Scope** — move the markdown parser into the engine and attach typed `AssistantContentPart[]` to the completed assistant message; build opentui-tui as a second renderer with the full existing component inventory. Existing tool-call, plan, rate-limit, approval, reasoning pipelines stay as-is.
2. **CLI surface** — `--ui ink|opentui` flag on the default interactive command. `ink` default.
3. **ink-tui treatment** — targeted seam flip, not a rewrite. `renderAssistantResponseTree` reads typed parts from the transcript message; the local parser is deleted. Every existing component stays. Theme imports switch to `@buli/assistant-design-tokens`.
4. **Cross-TUI sharing** — Approach 3: independent renderers, shared fixtures package. Each TUI owns its own reducer; the fixtures declare the expected transcript entry shapes and both reducers are asserted against them. No shared fold function.
5. **Design tokens** — extracted from ink-tui's `chatScreenTheme.ts` into `@buli/assistant-design-tokens`. Both TUIs import from there.
6. **Parse-at-completion, not incremental.** The engine parses the accumulated assistant text once when the provider stream completes. During streaming, each TUI renders from the growing flat text (current behavior). Incremental per-part events are deferred; the `AssistantContentPart` contract does not foreclose them.
7. **Existing event vocabulary preserved.** No renames, no new event kinds. The 18 `AssistantResponseEvent` variants in `@buli/contracts` stay exactly as-is. The only contract change is adding `assistantContentParts` to `TranscriptMessage`.
8. **Existing transcript entry unions preserved.** Each TUI keeps its `ConversationTranscriptEntry` shape (11 kinds today). Not lifted into contracts — that's TUI-local state shape, not a data contract.
9. **No `TurnEntry` nesting of reasoning inside assistant turns.** Reasoning stays as its own transcript entry kind (`streaming_reasoning_summary` / `completed_reasoning_summary`), matching the current code. Earlier spec proposal to nest reasoning inside an `AssistantTurnEntry` is dropped — it would re-architect working code for no slice-level benefit.
10. **Existing `TurnFooter` stays as an entry kind.** Already works in current ink-tui as `kind: "turn_footer"`; opentui-tui mirrors this.

## 12. Open Questions for Implementation

Questions that do not block the plan but need an answer during implementation:

- **Parser test relocation.** The existing `packages/ink-tui/test/parseAssistantResponseMarkdown.test.ts` covers the parser's edge cases today. Those tests move with the parser into `packages/engine/test/`. Trivial — noting here so it isn't forgotten.
- **Type-name migration of `InlineMarkdownSpan` consumers.** Several ink-tui components import `InlineMarkdownSpan` from `components/primitives/InlineMarkdownText.tsx`. After the type moves to `@buli/contracts` as `InlineSpan`, update all consumer imports. Exact files to touch are identified during the plan pass.
- **Type-name migration of `AssistantMarkdownBlock` consumers.** Same as above for the block type. The renderer uses it as `AssistantMarkdownBlock` today; renames to `AssistantContentPart` at the import boundary.
- **Keyboard shortcuts parity.** Verify `@opentui/react` input handling supports the same keys ink-tui binds (Ctrl+L, arrows, Home/End, PageUp/PageDown, Enter, Esc, `?`). If any key is unsupported, pick the nearest equivalent and document the divergence.
- **Code-block scrolling.** Long fenced code blocks may exceed transcript viewport height. Behavior should match across TUIs (today ink-tui does horizontal overflow via `chalk`-padded lines). Carry that behavior into opentui-tui.

---

**End of spec.**
