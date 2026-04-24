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

## Reload And Restart Boundaries

`buli` currently has two different reload problems:

1. reloading file-backed instructions or prompt inputs
2. reloading running application code such as `@buli/tui`, `@buli/engine`, or `apps/cli`

These should not be treated as the same mechanism.

### What The Current Architecture Already Supports

For instruction-style inputs, `buli` can support next-turn reload without
rebuilding the whole app.

Why:

- `packages/engine/src/runtime.ts` builds the system prompt when a new turn starts
- prompt-context references are also read from disk when a new turn is prepared
- provider turns are created per submitted prompt, not once for the whole app session

Design implication:

- if repo instructions such as `AGENTS.md` are loaded during system-prompt construction, edits can affect the next turn without restarting `buli`
- this is the smallest correct form of hot reload for prompt and instruction files

### What The Current Architecture Does Not Support

`buli` does not currently support live in-process code reload of the running TUI
or engine.

Current constraints:

- `apps/cli/src/commands/chat.ts` creates the long-lived runtime and provider objects once at startup
- `packages/tui/src/index.ts` mounts one OpenTUI root once per process
- `packages/tui/src/ChatScreen.tsx` keeps active UI state in React hooks
- `packages/openai/src/provider/turnSession.ts` snapshots one `systemPromptText` for the whole active provider turn
- there is no session persistence yet
- there is no reload command surface
- there is no file-watcher-based restart path

Design implication:

- if the agent edits `packages/tui/src/**`, `packages/engine/src/**`, or `apps/cli/src/**` while the app is open, the files on disk change but the running process keeps executing the old in-memory code
- mid-turn code reload is not a safe target with the current architecture

### Reference Model From `pi-mono`

`examples/pi-mono` solves a broader reload problem because it already has a
reloadable resource and session model.

Useful reference files:

- `examples/pi-mono/packages/coding-agent/src/core/resource-loader.ts`
- `examples/pi-mono/packages/coding-agent/src/core/agent-session.ts`
- `examples/pi-mono/packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- `examples/pi-mono/packages/coding-agent/src/modes/interactive/theme/theme.ts`

The important lesson is not to copy that system wholesale.

Instead:

- use in-process reload for disk-backed instructions and similar resources
- use a process restart boundary for code changes unless the runtime is explicitly designed for hot module replacement

### Available Options

#### 1. Next-Turn Instruction Reload

Scope:

- repo instruction files such as `AGENTS.md`
- future prompt override files such as `SYSTEM.md` or `APPEND_SYSTEM.md`

Behavior:

- read fresh from disk when starting the next assistant turn
- do not mutate an already-running turn

Pros:

- smallest implementation
- matches current engine boundaries
- no watcher required for correctness
- low risk

Cons:

- only helps prompt and instruction changes
- does not reload application code

Recommended use:

- first implementation of hot reload in `buli`

#### 2. Manual Process Restart

Behavior:

- user exits and starts `buli` again

Pros:

- trivial
- robust
- correctly picks up all code changes

Cons:

- poor UX
- current in-memory session state is lost because `buli` does not yet persist chat sessions

Recommended use:

- acceptable as the current fallback
- not a good final developer workflow

#### 3. Full Process Hot Restart With State Restore

Behavior:

- watch selected source files
- detect changes
- wait until the app is idle
- snapshot restorable chat UI state
- shut down the current TUI process
- start a fresh process from source
- restore the snapshot into the new process

Pros:

- handles real code changes
- much simpler and safer than true in-process hot module replacement
- aligns with the current package boundaries

Cons:

- requires explicit snapshot and hydrate support for chat-session state
- requires restart orchestration and watcher logic
- still must not interrupt active turns unsafely

Recommended use:

- preferred long-term developer experience for code changes

#### 4. True In-Process HMR

Behavior:

- reload changed modules inside the running process
- remount or patch the TUI tree
- preserve or migrate state across module replacement

Pros:

- fastest feedback when it works

Cons:

- highest complexity
- fragile with long-lived runtime objects, active provider turns, and React or OpenTUI state
- requires careful module-boundary design and state migration rules
- not justified by the current architecture

Recommended use:

- do not target this first

### Recommended Approach

The recommended order is:

1. implement next-turn reload for repo instruction files
2. add session persistence or at least explicit chat-session snapshot and hydrate support
3. implement a dev-only full process hot restart path for code changes
4. defer true in-process HMR unless the simpler restart model proves insufficient

### Why Full Process Hot Restart Is The Right Code-Reload Boundary

For code changes, the clean boundary in the current architecture is the whole
process, not the mounted TUI subtree.

Reason:

- `buli` does not yet have a reloadable resource or session runtime like `pi-mono`
- the running TUI, engine, and provider turn objects are created once and then hold live in-memory state
- replacing only part of that graph would create stale references and unclear ownership

This means:

- prompt and instruction reload should be solved inside `@buli/engine`
- code reload should be solved as restart-and-restore, not in-place mutation

### Likely Future File Touches

If instruction reload is implemented:

- `packages/engine/src/systemPrompt.ts`
- `packages/engine/src/runtime.ts`
- a small new engine helper for reading workspace instruction files
- `packages/engine/test/systemPrompt.test.ts`
- `packages/engine/test/runtime.test.ts`

If dev-only full process hot restart is implemented later:

- `packages/chat-session-state/src/*` for snapshot and hydrate support
- `packages/tui/src/ChatScreen.tsx`
- `packages/tui/src/index.ts`
- `apps/cli/src/commands/chat.ts`
- `apps/cli` tests and selected `@buli/tui` tests

### Practical Rule

Use per-turn reload for disk-backed instructions.

Use full process restart for application code.

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

## Further Reading

- `docs/chat-lifecycle-rendering-map.md`
- `docs/tui-component-rendering-reference.md`
