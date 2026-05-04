# What Is Missing / Project Assessment

## High-Level Take

`buli` is already a strong local-first terminal engineering agent project. It feels like a serious product foundation rather than a thin OpenAI wrapper.

The most important strength is the architecture: provider integration, runtime behavior, shared contracts, chat-session state, terminal UI, design tokens, and fixtures/tests are separated into clear packages. That gives the project room to grow without turning into one large brittle CLI script.

The current direction is good. The main recommendation is to keep the scope disciplined: stabilize the core terminal conversation loop before adding many more agent capabilities.

## Strengths

### Clear package boundaries

The monorepo structure is well chosen:

- `apps/cli` composes the app and owns CLI entrypoints.
- `packages/contracts` owns shared schemas and typed contracts.
- `packages/engine` owns the UI-agnostic conversation runtime, history, prompt context, tool approval, and tool execution.
- `packages/openai` owns OpenAI-specific OAuth, model discovery, streaming, and function-call behavior.
- `packages/chat-session-state` owns shared reducer/selectors/state logic.
- `packages/tui` owns the OpenTUI terminal interface.
- `packages/assistant-design-tokens` keeps design decisions reusable.
- `packages/chat-session-fixtures` provides canonical conversation scenarios for tests.

This separation is a good foundation for future persistence, additional tools, alternate providers, or alternate interfaces.

### Good test coverage for the current stage

The project has tests across contracts, state, engine, OpenAI adapter, CLI, and TUI behavior. Fixture-driven tests are especially valuable for an agent app because streaming, partial messages, reasoning summaries, tool calls, approval states, and UI transitions interact in complex ways.

At the time of review, both commands passed:

```bash
bun run typecheck
bun run test
```

### Terminal UX is treated as a real product surface

The project is clearly not just printing markdown in a terminal. It has explicit work around:

- fullscreen terminal behavior
- message list rendering
- prompt input
- reasoning display/collapse
- model and reasoning selection
- slash-command interaction
- tool approval controls
- terminal-size constraints
- shared design tokens

That matters because the competitive advantage of a terminal agent is trust, clarity, speed, and low-friction control.

### Tool approval exists early

The bash approval flow is a strong sign. A local coding agent needs careful boundaries around side effects. Explicit pending approval models, visible approve/deny controls, and tests around bash approval classification are the right safety baseline.

### Scope is honest

The README clearly says what V1 includes and intentionally does not include yet. That is healthy. The project is not pretending to already support durable sessions, branching, extension loading, process RPC, or a wide tool ecosystem before the core loop is complete.

## Main Risks

### The TUI can become the gravity well

Terminal UIs tend to accumulate complexity quickly: key handling, focus behavior, async state, viewport hacks, rendering edge cases, and component-local behavior.

`packages/chat-session-state` already reduces this risk, but the project should keep pushing behavior out of OpenTUI/React components where possible.

A useful rule:

> If behavior can be tested without mounting OpenTUI, it probably should live outside `packages/tui`.

### Provider details can leak into the engine

The provider boundary is a good design choice, but agent runtimes often slowly absorb provider-specific quirks: Responses API event names, continuation behavior, reasoning-summary details, function-call shapes, and token-usage details.

The engine should continue speaking Buli-native concepts. OpenAI-specific translation should stay inside `packages/openai`.

### Bash safety gets hard quickly

The current bash approval classifier is useful, but shell safety is inherently difficult. Many command forms can hide side effects:

- shell expansion
- redirection
- aliases/functions
- command substitution
- process substitution
- `tee`
- `find -exec`
- `xargs`
- `sed -i`
- `python -c`
- `node -e`
- package-manager scripts
- network commands
- install scripts piped into shells

For V1, approval-before-risky-command is enough. Long term, `bash` should remain an escape hatch, not the primary implementation mechanism.

### No session persistence yet

The README already calls this out. Without persistence, Buli is a useful live coding assistant. With persistence, it can become a continuing local engineering companion.

Session persistence is likely one of the highest-impact missing pieces.

### Dirty worktree increases risk

The repo currently has many modified, deleted, and untracked files. That may simply reflect active development, but it increases the chance of mixing unrelated changes or losing intent.

Since typecheck and tests pass, it would be wise to commit the current coherent slice soon before continuing with larger changes.

## What Is Missing

### 1. Durable session persistence

Buli currently keeps conversation history in memory during one fullscreen session. Missing pieces likely include:

- persistent session ids
- durable message/event history
- selected model and reasoning settings per session
- tool call records
- approval/denial records
- timestamps
- workspace path
- session list/resume flow

A simple first version does not need branching. It only needs reliable save/resume.

### 2. Typed file tools

The project currently has the first local `bash` tool. The next important capability is safer typed filesystem access:

- `read_file`
- `list_directory`
- `write_file`
- `edit_file`

These should have explicit contracts and approval semantics. Typed tools are safer and easier to inspect than free-form shell commands.

### 3. A stronger tool permission model

As tools grow, Buli will need clearer permission rules:

- auto-allowed read-only actions
- explicit approval for writes
- explicit approval for network side effects
- explicit approval for destructive commands
- possibly per-session trusted operations
- clear user-facing explanation of what will happen

The approval UI already gives the project a good starting point.

### 4. Session replay/export/debugging

For an agent with streaming and tools, it is valuable to inspect what happened after the fact.

Useful missing capabilities:

- export transcript
- export raw event log
- replay a session from events
- inspect provider events versus Buli-normalized events
- attach diagnostic logs to a session

This would help both user trust and debugging.

### 5. Failure-state hardening

The core conversation lifecycle should become boringly reliable around failure cases:

- provider stream interrupted
- assistant message incomplete
- tool call denied
- tool call failed
- approval left pending
- model unavailable
- auth expired
- terminal resized during streaming
- user tries to start another turn while one is running
- app exits during an active turn

The current architecture supports this, but these scenarios should remain a priority.

### 6. Packaging/distribution decision

The project currently appears optimized for source-runner local development, which is reasonable. Before wider use, it should decide whether Buli is distributed as:

- source-runner only
- built CLI bundle
- globally linked private command
- published package
- another local install mechanism

This affects whether committed `dist` files are useful or just noise.

## Recommended Next Priorities

### Priority 1: Stabilize the conversation lifecycle

Make sure these paths are fully reliable:

- prompt submitted
- assistant stream starts
- reasoning streams correctly
- reasoning collapses correctly
- assistant text updates correctly
- tool approval pauses the turn
- approve resumes the turn
- deny resumes or completes the turn cleanly
- failed/incomplete turns are represented clearly
- UI never gets stuck in `thinking`

This is the heart of the product.

### Priority 2: Add basic session persistence

Add simple durable sessions before adding a large tool ecosystem.

A first version could store:

- session metadata
- conversation entries
- model context items
- assistant events or projected messages
- tool calls and decisions

SQLite is a good option if session listing/querying matters soon. JSONL is a good option if maximum simplicity and debuggability matter more.

### Priority 3: Add typed file tools

Add `read_file`, `list_directory`, `write_file`, and `edit_file` before expanding bash heavily.

These tools should be safer, typed, and easier to approve than arbitrary shell commands.

### Priority 4: Improve transcript/session export

Add a way to export or inspect sessions. This will improve trust and make debugging much easier.

### Priority 5: Keep TUI behavior thin

Continue moving domain behavior and state transitions into testable packages outside OpenTUI components.

## Honest Summary

`buli` is promising and unusually well-structured for its stage.

The project already has the right instincts: typed contracts, package boundaries, provider isolation, explicit tool approval, fixture-driven tests, and careful terminal UX. Those choices make it much more likely to grow safely.

The biggest danger is adding too many agent features before the core terminal conversation loop is completely stable. The strongest next move is to make the runtime/UI lifecycle dependable, then add persistence, then add safer typed tools.

If the scope stays disciplined, Buli can become a genuinely useful local engineering assistant rather than another thin AI CLI wrapper.
