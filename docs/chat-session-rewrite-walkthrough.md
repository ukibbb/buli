# Chat Session Rewrite Walkthrough

This document explains the message-part rewrite in plain English.

Read `docs/current-chat-session-architecture.md` first if you want the shorter overview.

If you want the detailed render lifecycle and screen-surface precedence, read `docs/chat-lifecycle-rendering-map.md` after this document.

If you want the exhaustive UI component reference, read `docs/tui-component-rendering-reference.md`.

## What Changed At The Highest Level

The old system treated a conversation like a transcript made of many UI row types. The current system treats a conversation like:

- conversation messages
- ordered parts inside each message
- a small amount of session state outside messages

That one change drove almost every architecture improvement.

## Why The Old Shape Was Wrong

The old architecture had three main problems.

### 1. The hot path thought in transcript rows

Streaming text, tool results, reasoning, approval, and final metadata were all forced through a UI-shaped model instead of a domain-shaped one.

### 2. Renderer state owned too much domain logic

Important reducer behavior lived too close to the UI. That made architecture changes slower and made hot paths harder to optimize.

### 3. Tool-heavy turns did not fit the model naturally

Once a turn mixed assistant text, reasoning, tool calls, approval, and final metadata, the transcript-row model became a poor fit.

## The New Architecture In One Sentence

The engine emits typed assistant-turn events, the shared chat-session reducer folds them into normalized message and part state, and `@buli/tui` renders that state with OpenTUI-specific viewport mechanics.

## Package By Package

## 1. `@buli/contracts`

This package became the source of truth for the domain model.

Important files:

- `packages/contracts/src/conversationMessage.ts`
- `packages/contracts/src/conversationMessagePart.ts`
- `packages/contracts/src/conversationTurnStatus.ts`
- `packages/contracts/src/pendingToolApprovalRequest.ts`
- `packages/contracts/src/events.ts`

Key result:

- messages and parts are first-class typed concepts
- assistant turns are described as event streams, not renderer state mutations

## 2. `@buli/chat-session-state`

This package owns the shared reducer logic once.

Important files:

- `packages/chat-session-state/src/chatSessionState.ts`
- `packages/chat-session-state/src/assistantTurnEventReducer.ts`
- `packages/chat-session-state/src/chatSessionSelectors.ts`
- `packages/chat-session-state/src/promptDraftReducer.ts`
- `packages/chat-session-state/src/promptContextSelectionReducer.ts`
- `packages/chat-session-state/src/modelAndReasoningSelectionReducer.ts`

Key result:

- normalized state is shared across the app
- prompt editing, prompt-context picking, model selection, and tool approval all live in one session model

## 3. `@buli/engine`

The engine stopped feeding transcript-shaped UI concepts.

Important files:

- `packages/engine/src/runtime.ts`
- `packages/engine/src/assistantTextMessagePartBuilder.ts`

Key result:

- the engine now owns streaming text projection
- the renderer receives typed message-part updates instead of reparsing large text blobs locally

## 4. `@buli/tui`

This package is the fullscreen OpenTUI-backed renderer.

Important files:

- `packages/tui/src/index.ts`
- `packages/tui/src/relayAssistantResponseRunnerEvents.ts`
- `packages/tui/src/ChatScreen.tsx`
- `packages/tui/src/components/ConversationMessageList.tsx`
- `packages/tui/src/components/ConversationMessageRow.tsx`
- `packages/tui/src/components/messageParts/*`

Key result:

- the renderer maps `messages -> parts`
- viewport behavior stays local to the renderer
- the product uses one owned TUI package instead of parallel renderer packages

## Assistant Text Streaming

Assistant text is one evolving part.

It keeps:

- the full raw markdown text
- completed parsed content parts
- one optional open tail for unfinished content

That is much cleaner than inventing a separate streaming transcript row.

## Tool Approval

Tool approval is now explicit state instead of transcript content.

The system keeps:

- one tool-call part with `pending_approval`
- one dedicated `pendingToolApprovalRequest`

That is why the approval prompt can render below the transcript area.

## Why This Is Better

- the hot path updates smaller pieces of state
- streaming text projection lives in the engine
- the TUI is mostly a renderer over shared domain state
- tool-heavy turns fit the model naturally

## If You Want To Read The Code In Order

1. `packages/contracts/src/conversationMessage.ts`
2. `packages/contracts/src/conversationMessagePart.ts`
3. `packages/contracts/src/events.ts`
4. `packages/chat-session-state/src/chatSessionState.ts`
5. `packages/chat-session-state/src/assistantTurnEventReducer.ts`
6. `packages/engine/src/assistantTextMessagePartBuilder.ts`
7. `packages/engine/src/runtime.ts`
8. `packages/tui/src/relayAssistantResponseRunnerEvents.ts`
9. `packages/tui/src/ChatScreen.tsx`
10. `packages/tui/src/components/ConversationMessageList.tsx`
