# Current Chat Session Architecture

This is the shortest accurate description of how `buli` works now.

## The Core Idea

`buli` treats a conversation as:

- messages
- ordered parts inside each message
- a small amount of dedicated session state outside messages

The engine emits typed assistant-turn events, `@buli/chat-session-state` folds them into normalized state, and `@buli/tui` renders that state in a fullscreen terminal UI.

## Main Packages

### `@buli/contracts`

Important files:

- `packages/contracts/src/conversationMessage.ts`
- `packages/contracts/src/conversationMessagePart.ts`
- `packages/contracts/src/conversationTurnStatus.ts`
- `packages/contracts/src/pendingToolApprovalRequest.ts`
- `packages/contracts/src/events.ts`

This package defines the canonical types for conversation messages, message parts, assistant-turn events, and pending tool approval.

### `@buli/engine`

Important files:

- `packages/engine/src/runtime.ts`
- `packages/engine/src/assistantTextMessagePartBuilder.ts`

This package runs the assistant turn, projects streaming text into message-part updates, and emits the event stream consumed by the shared state layer.

### `@buli/chat-session-state`

Important files:

- `packages/chat-session-state/src/chatSessionState.ts`
- `packages/chat-session-state/src/assistantTurnEventReducer.ts`
- `packages/chat-session-state/src/chatSessionSelectors.ts`
- `packages/chat-session-state/src/promptDraftReducer.ts`
- `packages/chat-session-state/src/promptContextSelectionReducer.ts`
- `packages/chat-session-state/src/modelAndReasoningSelectionReducer.ts`

This package owns normalized conversation state, prompt editing, prompt-context picker state, model selection, reasoning-effort selection, and pending tool approval state.

### `@buli/tui`

Important files:

- `packages/tui/src/ChatScreen.tsx`
- `packages/tui/src/components/ConversationMessageList.tsx`
- `packages/tui/src/components/ConversationMessageRow.tsx`
- `packages/tui/src/components/messageParts/*`

This is the OpenTUI-backed renderer. It owns the fullscreen chat shell, follow-bottom transcript behavior through OpenTUI scrollbox mechanics, and the renderer-specific keyboard and viewport behavior.

## What A Streaming Turn Looks Like

1. the user submits a prompt
2. `@buli/chat-session-state` adds a completed user message
3. the engine starts an assistant turn
4. the engine emits `assistant_turn_started`
5. the engine adds and updates assistant parts over time
6. the shared reducer folds those events into normalized state
7. the TUI renders `messages -> parts`
8. the turn ends with `assistant_message_completed`, `assistant_message_incomplete`, or `assistant_message_failed`

## Assistant Message Parts

An assistant message can contain parts like:

- `assistant_text`
- `assistant_reasoning`
- `assistant_tool_call`
- `assistant_plan_proposal`
- `assistant_rate_limit_notice`
- `assistant_incomplete_notice`
- `assistant_error_notice`
- `assistant_turn_summary`

Text, reasoning, tool state, and turn metadata are separate typed concepts.

## Tool Approval

Tool approval is not transcript content. The system keeps:

- one tool-call part with status like `pending_approval`
- one dedicated `pendingToolApprovalRequest` in shared session state

That is why the approval prompt can render below the message list instead of as another transcript row.

## Why This Shape Works

- the hot path updates smaller pieces of state
- the engine owns streaming text projection instead of the renderer
- the TUI mostly reads a shared domain model instead of inventing its own state
- tool-heavy turns fit the data model naturally

## Reading Order

Read these files in order:

1. `packages/contracts/src/conversationMessage.ts`
2. `packages/contracts/src/conversationMessagePart.ts`
3. `packages/contracts/src/events.ts`
4. `packages/chat-session-state/src/chatSessionState.ts`
5. `packages/chat-session-state/src/assistantTurnEventReducer.ts`
6. `packages/engine/src/assistantTextMessagePartBuilder.ts`
7. `packages/engine/src/runtime.ts`
8. `packages/tui/src/ChatScreen.tsx`
9. `packages/tui/src/components/ConversationMessageList.tsx`
