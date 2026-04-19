# buli

`buli` is a local-first, terminal-only software engineering agent for one user: ukibbb.

The current app is a fullscreen terminal chat experience built on Bun, the OpenAI Responses API, and a single OpenTUI-backed renderer in `@buli/tui`.

## Current Status

V1 currently includes:

- Bun workspace monorepo
- OpenAI/ChatGPT browser OAuth
- UI-agnostic assistant response engine
- OpenAI assistant response adapter
- shared chat-session state package used by the TUI
- OpenTUI-backed terminal chat UI in `@buli/tui` with:
  - `TopBar`
  - `ConversationMessageList`
  - `UserPromptBlock`
  - `ReasoningStreamBlock`
  - `ReasoningCollapsedChip`
  - `ModelAndReasoningSelectionPane`
  - `InputPanel`
  - `ShortcutsModal`
- provider-backed available model discovery
- model selection and reasoning-effort selection
- streaming reasoning-summary display
- engine-owned in-memory conversation history across turns during one session
- first local `bash` tool wired through the engine and OpenAI Responses function-calling loop
- explicit tool approval flow: `y` approves the pending bash command, `n` denies it
- HERO 1 visual design translated to terminal constraints
- typed message and content-part contracts in `@buli/contracts`
- shared design tokens in `@buli/assistant-design-tokens`
- shared chat-session fixtures in `@buli/chat-session-fixtures`

V1 intentionally does not include yet:

- `read`, `write`, `edit`, or wider multi-tool support beyond `bash`
- session persistence
- session branching
- extension loading
- process RPC

## Requirements

- `Bun 1.3.12` or newer

## Recommended Workflow

Install dependencies:

```bash
bun install
```

Register the global `buli` command once:

```bash
bun run link:cli
```

If `buli` is not found afterward, make sure Bun's global bin directory is on your `PATH`:

```bash
export PATH="$(bun pm bin -g):$PATH"
```

Then use the command normally from any directory:

```bash
buli login
buli models
buli
buli --model gpt-5.4 --reasoning high
```

We use the source runner as the primary development workflow because every `buli` invocation runs the latest repo code without waiting for a rebuild.

## What `buli login` Does

`buli login`:

- starts a local OAuth callback flow
- opens your browser for OpenAI/ChatGPT authentication
- stores credentials locally in `~/.buli/auth.json`

## Repo-Only Quick Start

```bash
bun install
bun run login
bun run start:cli
bun run start:cli -- --model gpt-5.4 --reasoning high
```

## What You Can Do Today

After logging in, you can:

- open the fullscreen terminal chat UI
- type a prompt draft
- submit the prompt draft and see your message appear immediately
- watch the assistant response stream into one assistant message that grows part by part
- see the model's reasoning summary stream live, then collapse into a compact chip once reasoning ends
- read the collapsed chip's elapsed reasoning time and final reasoning token count
- press `?` on an empty prompt to open shortcuts help
- press `Ctrl+L` to open model selection
- choose a model and, when supported, choose a reasoning effort
- approve a pending `bash` command with `y` or deny it with `n`
- ask follow-up questions that depend on earlier replies and completed `bash` results inside the same fullscreen session
- list available models with `buli models`
- scroll the conversation transcript with `Up`, `Down`, `PageUp`, `PageDown`, `Home`, and `End`
- start the app with a preselected model using `--model`
- start the app with a preselected reasoning effort using `--reasoning`

If auth is missing, `buli` exits cleanly and tells you to run `buli login` first.

## Model Selection

You can inspect and change models in three ways:

- `buli models` lists the available models from the authenticated OpenAI backend
- `buli --model <id>` starts the terminal UI with a selected model already chosen
- `buli --reasoning <none|minimal|low|medium|high|xhigh>` starts the terminal UI with a selected reasoning effort already chosen

Inside the fullscreen terminal UI:

- press `Ctrl+L` to open model selection
- use the arrow keys to move the highlight
- press `Enter` to confirm the highlighted choice
- press `Esc` to close the selection flow

## Fullscreen Mode

Plain `buli` starts the terminal UI in the alternate screen buffer.

That means:

- Buli takes over the visible terminal screen while it is running
- your previous shell content is restored when Buli exits
- scrollback is not available while the fullscreen session is active
- transcript navigation happens inside the app instead of using terminal scrollback

If you run Buli inside tmux, enable `focus-events` so pane switches pass focus changes through reliably:

```tmux
set -g focus-events on
```

## Project Structure

Current packages:

- `apps/cli`
  - composition root and CLI entrypoints
- `packages/contracts`
  - shared schemas for conversation messages, message parts, assistant turn events, model metadata, token usage, canonical history, typed tool requests, and typed assistant content parts
- `packages/chat-session-state`
  - shared reducer, selectors, prompt editing state, prompt-context selection state, and model-selection state
- `packages/engine`
  - UI-agnostic conversation runner, in-memory history projection, approval flow, local `bash` execution, and assistant text-part building
- `packages/openai`
  - OAuth, token refresh, Responses transport, available model discovery, function-call parsing, and same-turn continuation after tool output
- `packages/tui`
  - terminal chat screen rendering, message-part views, fullscreen integration, and OpenTUI-specific viewport behavior over the shared chat-session state
- `packages/assistant-design-tokens`
  - shared color, border, and spacing tokens from the `.pen` design file
- `packages/chat-session-fixtures`
  - canonical message and part scenarios consumed by shared chat-session-state tests

## Design Source Of Truth

The HERO 1 single-pane layout lives in `novibe.space/designs/my-design.pen` (frame `j20vJ`). The documented terminal translations for spacing, glyphs, and other cell-grid constraints live in `terminal-rendering-limitations.md`.

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

Watch the packaged CLI bundle:

```bash
bun run dev:cli
```

Register the global source-runner command:

```bash
bun run link:cli
```

## Notes

- `bun` 1.3.12+ is used for package management, workspaces, and the CLI/TUI runtime.
- Exact token counts are provider-derived and reasoning tokens are shown after a completed assistant response.
- The source runner is the preferred development workflow because it avoids unnecessary rebuild steps while the product is still changing quickly.
