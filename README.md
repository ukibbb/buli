# Buli

Buli is a local-first terminal software engineering partner built for one workflow: helping Lukasz understand systems, reason through options, and apply agreed code changes with strong engineering judgment.

It is not optimized for autonomous coding throughput. Buli is designed to enhance thinking around architecture, code organization, code quality, best practices, design tradeoffs, and performance. Implementation is the apply step after understanding, discussion, planning, and agreement.

## What Buli Is

Buli is currently a fullscreen terminal chat app built with Bun, the OpenAI Responses API, and OpenTUI.

It runs in the current workspace, stores sessions locally, and exposes a small tool surface for codebase inspection and approved changes. The core assistant runtime is kept outside the terminal renderer so the engine, contracts, state, provider adapter, and UI can evolve independently.

## What Buli Optimizes For

- Understanding how code and systems work before changing them.
- Explaining architecture, boundaries, state flow, and ownership in plain language.
- Comparing viable implementation options and their tradeoffs.
- Improving code quality, maintainability, tests, and readability.
- Treating best practices as context-sensitive engineering tools, not cargo-cult rules.
- Discussing performance through evidence, constraints, hot paths, and risk.
- Applying changes only after the intended outcome and approach are clear.

## What Buli Is Not

- Not a cloud-hosted runtime.
- Not a web or desktop app.
- Not a multi-user or team product.
- Not a generic autonomous coding agent.
- Not a replacement for the user's judgment.

## Current Workflow

Buli's default workflow is:

1. Understand the question, system, or decision.
2. Inspect relevant files, tests, contracts, configs, and call sites.
3. Explain what is happening and why it matters.
4. Compare options, risks, and tradeoffs when there is a real choice.
5. Plan the agreed change with concrete files and verification.
6. Apply the smallest correct change.
7. Verify the result.

## Features

- Fullscreen terminal chat UI.
- OpenAI/ChatGPT browser OAuth login.
- OpenAI model discovery through the authenticated backend.
- Startup model selection with `--model`.
- Startup reasoning-effort selection with `--reasoning`.
- Runtime model and reasoning selection with `/model`.
- Three assistant operating modes: Understand, Plan, and Implementation.
- `Tab` cycles the active operating mode in the prompt.
- Streaming assistant responses with reasoning-summary display.
- Local workspace tools for `read`, `glob`, `grep`, `edit`, `write`, and `bash`.
- Tree-sitter-backed codebase knowledge queries for indexed TypeScript, TSX, and Python files.
- Approval flow for bash commands and file mutations.
- Local persisted conversation sessions per workspace.
- Session switching and deletion with `/sessions`.
- New-session creation with `/clear`.
- Manual context compaction with `/compact`.
- Optional automatic compaction through `BULI_AUTO_COMPACT_THRESHOLD`.
- HTML transcript export with `/export-session`.
- Prompt context references with `@...` selection.
- Clipboard image attachments in prompts when the terminal and OS support it.
- HTML exports with readable transcript styling and code-copy support.

## Requirements

- Bun 1.3.12 or newer.

If `bun` is not found, install Bun and make the install path available in the current shell:

```bash
curl -fsSL https://bun.com/install | bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
bun --version
```

## Installation

Install dependencies:

```bash
bun install
```

Register the global `buli` command once:

```bash
bun run link:cli
```

`bun run link:cli` links `buli` to this repo's source runner. That means every new `buli` command runs the current TypeScript source from this checkout; no rebuild is needed after source changes.

If `buli` is not found afterward, make sure Bun's install bin directory is on your `PATH`:

```bash
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"
```

## Usage

Authenticate first:

```bash
buli login
```

List available models:

```bash
buli models
```

Start the fullscreen chat UI from any project directory:

```bash
buli
```

Start with a specific model or reasoning effort:

```bash
buli --model gpt-5.5 --reasoning high
```

Choose bash approval behavior:

```bash
buli --bash-approval risk_based
buli --bash-approval trusted
```

Plain `buli` defaults to `trusted`. In `trusted`, Buli auto-runs every Bash command when the active operating mode allows Bash execution. Read-only operating modes still block Bash execution. Use `risk_based` when you want Buli to auto-run clearly non-destructive inspection and local verification commands such as `bun --filter @buli/engine test`, `bun run typecheck`, and `tsc --noEmit -p tsconfig.json`, while still asking before package installs, build/dev scripts, file-system mutations, git/GitHub mutations, network side effects, and ambiguous shell syntax.

Show CLI help:

```bash
buli help
```

The current CLI shape is:

```text
Usage: buli [login|models|help] [--model <id>] [--reasoning <none|minimal|low|medium|high|xhigh>] [--bash-approval <risk_based|trusted>]
```

Defaults:

- Model: `gpt-5.5`.
- Reasoning effort: `medium`.
- Bash approval mode: `trusted` for the CLI, overridable with `--bash-approval` or `BULI_BASH_APPROVAL_MODE`.

## Repo-Only Development Start

The simplest development loop is to register the source-runner command once:

```bash
bun install
bun run link:cli
buli
```

After that, edit the repo and start a new `buli` process. The command reads the latest source directly, so there is no rebuild watcher to keep running for this workflow.

You can also run the source CLI without registering the global command:

```bash
bun install
bun run login
bun run start:cli
bun run start:cli -- --model gpt-5.5 --reasoning high
```

The source runner is the preferred development workflow while the product changes quickly because every run uses the latest repo code without a rebuild.

Use the packaged build workflow only when you specifically need to test the built CLI bundle:

```bash
bun run build:cli
```

To rebuild the packaged CLI bundle on each change, run the watcher:

```bash
bun run dev:cli
```

`bun run dev:cli` watches and rebuilds `apps/cli/dist/cli.js`. It is separate from the global source-runner command created by `bun run link:cli`.

## In-App Commands

Type these in the prompt:

- `/help` opens command and keyboard shortcut help.
- `/model` opens model and reasoning selection.
- `/clear` starts a new conversation session for the workspace.
- `/compact` summarizes older context for the active session.
- `/sessions` opens saved session switching and deletion.
- `/export-session` writes and opens an HTML transcript export.
- `/thinking` toggles reasoning-summary visibility.

## Keyboard Shortcuts

- `Tab` cycles the active operating mode in the prompt.
- `Enter` submits the prompt or confirms the highlighted item in an open picker.
- `Shift+Enter` or `Ctrl+Enter` inserts a newline in the prompt.
- `Esc` closes an open panel or picker; during an active assistant turn it requests interruption.
- `Up` and `Down` move through open slash-command, context, model, reasoning, and session selections.
- `PageUp` and `PageDown` scroll the transcript by page.
- `Delete` or `Backspace` removes prompt text, removes image placeholders, or starts/confirms deletion for the highlighted saved session.
- `Y` approves and `N` denies a pending tool request.
- `Ctrl+V` pastes a clipboard image into the prompt when the prompt is editable.

## Operating Modes

Buli has three primary modes. They are workflow posture, not separate products.

- Understand Agent is read-only and discussion-first. It researches and explains how the system works before planning or applying code.
- Plan Agent is read-only and produces an executable implementation plan grounded in inspected files.
- Implementation Agent applies the agreed direction, keeps the slice small, and verifies important behavior.

Use `Tab` in the prompt to cycle modes.

## Codebase Knowledge Indexing

Buli builds a workspace-local codebase knowledge index to make broad structural questions cheaper than repeatedly scanning files from scratch.

- Indexing starts in the background when the fullscreen chat app starts. Startup does not wait for the index to finish.
- The first `query_codebase_knowledge` call waits for the in-flight startup index if it is still running.
- The index is persisted at `./.buli/index/codebase-knowledge.json` inside the current workspace.
- The index stores Tree-sitter-derived summaries, symbols, imports, evidence ranges, freshness, and content hashes. It does not store raw source text.
- Supported languages are TypeScript (`.ts`, `.mts`, `.cts`), TSX (`.tsx`), and Python (`.py`, `.pyi`, `.pyw`).
- Buli uses `web-tree-sitter` with WASM grammars from `tree-sitter-typescript` and `tree-sitter-python`.
- Workspace indexing includes `./.buli/**`, but skips generated index files under `./.buli/index/`.
- File changes made through Buli mutation tools refresh the changed files in the index. File changes made outside Buli are picked up by the next startup scan.

## Local Data

Buli stores local state under `~/.buli`.

- Auth: `~/.buli/auth.json`.
- Conversation sessions: `~/.buli/conversation-sessions`.
- HTML exports: `~/.buli/session-exports`.

Buli also stores workspace-local codebase knowledge under the current project:

- Codebase knowledge index: `./.buli/index/codebase-knowledge.json`.

Auth files, session directories, exports, and diagnostic logs are written with private file permissions where Buli creates them.

Configuration environment variables:

- `BULI_BASH_APPROVAL_MODE`: sets the default bash approval mode to `risk_based` or `trusted`.
- `BULI_AUTO_COMPACT_THRESHOLD`: enables automatic compaction at a context-usage ratio from `0` through `1`.
- `BULI_PROMPT_CONTEXT_ROOT`: changes the root used for prompt-context browsing.
- `BULI_PROVIDER_HOST_COMMAND`: JSON argv array for an external provider protocol host, for example `["/path/to/provider-host"]`.
- `BULI_CONSOLE_LOG_FILE`: writes console output to a private log file.
- `BULI_CONSOLE_LOG_RESET`: clears `BULI_CONSOLE_LOG_FILE` before a run when set to `1`, `true`, `yes`, or `on`.

## Fullscreen Terminal Behavior

Plain `buli` starts the terminal UI in the alternate screen buffer.

That means:

- Buli takes over the visible terminal screen while it is running.
- Previous shell content is restored when Buli exits.
- Terminal scrollback is not the main transcript navigation mechanism during a fullscreen session.
- Transcript navigation happens inside the app.

If you run Buli inside tmux, enable focus events so pane switches pass focus changes through reliably:

```tmux
set -g focus-events on
```

## Architecture

Buli is a Bun workspace monorepo with typed package boundaries.

Current packages:

- `apps/cli`: CLI entrypoints, command composition, auth/session wiring, and HTML session export.
- `packages/codebase-knowledge`: Tree-sitter-backed codebase structure indexing, local knowledge persistence, ranking, and query result formatting.
- `packages/contracts`: shared schemas and types for assistant events, messages, sessions, tools, providers, models, token usage, and plans.
- `packages/engine`: UI-agnostic assistant runtime, conversation history, tool execution, approvals, prompt context expansion, compaction, and system prompts.
- `packages/openai`: browser OAuth, auth storage, token refresh, Responses API transport, model discovery, streaming parsing, and tool-call continuation.
- `packages/chat-app-controller`: renderer-neutral chat actions for assistant turns, mode-sensitive UI effects, session operations, model loading, prompt context, compaction, export, and interruption.
- `packages/chat-session-state`: reducer and selector state for conversation messages, prompt drafts, model selection, slash commands, prompt context, sessions, reasoning visibility, and approvals.
- `packages/prompt-context-core`: parsing and replacement logic for `@...` prompt-context references.
- `packages/tui`: OpenTUI React renderer, chat screen, keyboard and paste behavior, transcript rendering, selection panes, and terminal-specific integration.
- `packages/assistant-design-tokens`: shared colors, spacing, and border tokens derived from the design source.
- `packages/chat-session-fixtures`: canonical session fixtures used by shared state tests.

Important architectural choices:

- The TUI renders typed state and events. It does not own core assistant behavior.
- The engine is provider-independent where practical.
- OpenAI-specific auth and transport behavior stay inside `@buli/openai`.
- Contracts are explicit and serializable so future process-boundary work remains possible.
- Local persistence uses inspectable files instead of a remote service.
- Runtime gates enforce approval flow instead of relying only on prompt wording.

## Development Commands

Run all tests:

```bash
bun run test
```

Run all typechecks:

```bash
bun run typecheck
```

Build the CLI bundle:

```bash
bun run build:cli
```

Watch the packaged CLI bundle when testing built output:

```bash
bun run dev:cli
```

This watcher is optional for normal development. The globally linked `buli` command uses the source runner and picks up source changes on each new run.

Register the global source-runner command:

```bash
bun run link:cli
```

## Design Source

The HERO 1 single-pane layout lives in `novibe.space/designs/my-design.pen` frame `j20vJ`. Terminal rendering constraints are documented in `terminal-rendering-limitations.md`.

## Status

Buli is an active local-first personal tool. The current app is usable as a terminal engineering partner, but the product surface is still evolving quickly. README claims should be treated as current behavior, not a compatibility promise.
