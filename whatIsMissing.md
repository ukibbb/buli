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

This separation is a good foundation for future persistence hardening, additional tools, alternate providers, or alternate interfaces.

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

The README clearly says what V1 includes and intentionally does not include yet. That is healthy. The project is not pretending to already support branching, extension loading, process RPC, raw replay/debug exports, or a wide tool ecosystem before the core loop is complete.

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

### Session persistence is still young

Buli now has workspace-scoped JSONL conversation sessions, an active-session pointer, startup resume, `/sessions` switching, and HTML transcript export. That changes the main risk from "missing persistence" to "persistence reliability."

The remaining persistence risks are around corrupt or partial session files, concurrent processes in the same workspace, very large transcripts, active-turn interruption, and pending approvals that cannot be resumed after process exit.

### Dirty worktree increases risk

The repo currently has many modified, deleted, and untracked files. That may simply reflect active development, but it increases the chance of mixing unrelated changes or losing intent.

Since typecheck and tests pass, it would be wise to commit the current coherent slice soon before continuing with larger changes.

## What Is Missing

### 1. Persistence hardening and session operations

Buli now has a basic durable session layer. Missing pieces likely include:

- corrupt JSONL recovery or quarantine
- atomic or locked writes for concurrent `buli` processes
- selected model and reasoning settings per session
- explicit interrupted-turn recovery state
- durable pending-approval handling or clear restart semantics
- session rename, delete, and search flows
- compaction or summarization for very large sessions
- raw JSONL/session export from the UI

A simple first version of save/resume already exists. The next step is to make it boringly reliable.

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

HTML transcript export now exists. Useful missing capabilities remain:

- export raw JSONL/session data from the UI
- export markdown or plain-text transcript
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

### Priority 2: Harden session persistence

Basic durable sessions now exist. Harden them before adding a large tool ecosystem.

The next version should address:

- corrupt or partial session files
- concurrent writers
- active-turn interruption
- pending approvals on restart
- selected model and reasoning settings per session
- long-session compaction

The current JSONL approach is a good simple baseline. SQLite can wait until richer querying, search, or branch management becomes necessary.

### Priority 3: Add typed file tools

Add `read_file`, `list_directory`, `write_file`, and `edit_file` before expanding bash heavily.

These tools should be safer, typed, and easier to approve than arbitrary shell commands.

### Priority 4: Improve transcript/session export

HTML export exists. Add raw export, replay, and diagnostic bundles so sessions can be debugged without depending only on rendered transcript output.

### Priority 5: Keep TUI behavior thin

Continue moving domain behavior and state transitions into testable packages outside OpenTUI components.

## Honest Summary

`buli` is promising and unusually well-structured for its stage.

The project already has the right instincts: typed contracts, package boundaries, provider isolation, explicit tool approval, fixture-driven tests, and careful terminal UX. Those choices make it much more likely to grow safely.

The biggest danger is adding too many agent features before the core terminal conversation loop and new persistence layer are completely stable. The strongest next move is to make the runtime/UI lifecycle dependable, harden persistence, then add safer typed tools.

If the scope stays disciplined, Buli can become a genuinely useful local engineering assistant rather than another thin AI CLI wrapper.
