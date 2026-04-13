# buli

`buli` is a local-first, terminal-only coding agent built for one user: you.

This repository currently contains the first working scaffold: OpenAI/ChatGPT browser OAuth, a fullscreen terminal chat screen, streamed assistant responses, available model discovery, model and reasoning selection, and final input/output/reasoning token display in the status bar. It is intentionally small so the architecture can be inspected before tools, sessions, branching, and extensions are added.

## Current Status

V1 currently includes:

- Bun workspace monorepo
- OpenAI/ChatGPT browser OAuth
- UI-agnostic assistant response engine
- OpenAI assistant response adapter
- Ink terminal chat UI with:
  - `ConversationTranscriptPane`
  - `PromptDraftPane`
  - `ModelAndReasoningSelectionPane`
  - `ChatSessionStatusBar`
- provider-backed available model discovery
- model selection and reasoning-effort selection
- final `input`, `output`, and `reasoning` token display

V1 intentionally does not include yet:

- `read`, `write`, `edit`, or `bash`
- tool-call rendering
- session persistence
- session branching
- extension loading
- process RPC

## Requirements

- `bun`
- `Node 24`

## Recommended Workflow

This is the simplest way to use the project during development.

Install dependencies:

```bash
bun install
```

Register the global `buli` command once:

```bash
bun run link:cli
```

That installs a global source-runner command in Bun's global bin directory. Once
that directory is on your `PATH`, you can run `buli` from any directory on this
machine.

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

We use the source runner as the primary development workflow because every `buli`
invocation runs the latest code from the repo without waiting for a rebuild,
even when launched outside the repo. The global wrapper also pins `tsx` to this
repo's `tsconfig.json`, so JSX and other TypeScript settings stay consistent no
matter where you run `buli` from.

## What `buli login` Does

`buli login`:

- starts a local OAuth callback flow
- opens your browser for OpenAI/ChatGPT authentication
- stores credentials locally in `~/.buli/auth.json`

After that, `buli` can use the stored auth without asking you to log in again every run.

## Repo-Only Quick Start

If you do not want to register a global command yet, you can run the current scaffold directly from the repo:

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
- submit the prompt draft and see your message appear in the conversation transcript immediately
- watch the assistant response stream into the conversation transcript
- press `Ctrl+L` to open model selection inside the TUI
- choose a model and, when supported, choose a reasoning effort
- list available models with `buli models`
- scroll the fullscreen conversation transcript with `Up`, `Down`, `PageUp`, `PageDown`, `Home`, and `End`
- start the app with a preselected model using `--model`
- start the app with a preselected reasoning effort using `--reasoning`
- see final input/output/reasoning token usage in the status bar

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

If the selected model supports reasoning choices, the UI opens a second step so you can choose the reasoning effort for that model.

## Fullscreen Mode

Plain `buli` starts the terminal UI in Ink's alternate screen buffer.

That means:

- Buli takes over the visible terminal screen while it is running
- your previous shell content is restored when Buli exits
- scrollback is not available while the fullscreen session is active
- transcript navigation happens inside the app instead of using terminal scrollback

This is the default interactive experience.

Inside the fullscreen session:

- `Up` and `Down` scroll one row at a time
- `PageUp` and `PageDown` scroll one viewport page at a time
- `Home` jumps to the oldest visible transcript rows
- `End` jumps back to the newest transcript rows

When you are already at the bottom of the transcript, new streamed assistant text stays in view automatically. If you scroll upward to read older rows, new streamed text does not pull the viewport back down until you return to the bottom.

## Buildable CLI Workflow

The built CLI exists as a packaging check. We keep it because later we will want a real installable package, but it is not the main development loop.

Build the bundle:

```bash
bun run build:cli
```

Run the built wrapper directly:

```bash
node apps/cli/bin/buli.js
```

If you want to continuously rebuild that packaged path while testing it, run:

```bash
bun run dev:cli
```

## Troubleshooting

`buli: command not found`

- run `bun run link:cli`
- then ensure Bun's global bin directory is on your `PATH`:

```bash
export PATH="$(bun pm bin -g):$PATH"
```

`buli` says dependencies are not installed

- run `bun install` in this repository
- then rerun `buli`

`buli` requires a TTY

- run `buli` in an interactive terminal
- avoid running it through non-interactive shells, pipes, or test harnesses

`OpenAI auth not found. Run \`buli login\`.`

- run `buli login`
- if needed, check whether `~/.buli/auth.json` exists

## Project Structure

- `apps/cli`
  - composition root and CLI entrypoints
- `packages/contracts`
  - shared schemas for transcript messages, assistant response events, model metadata, and token usage
- `packages/engine`
  - UI-agnostic assistant response orchestration
- `packages/openai`
  - OAuth, token refresh, OpenAI transport, available model discovery, usage parsing
- `packages/ink-tui`
  - terminal chat screen rendering, alternate-screen integration, and chat screen state transitions

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

- `bun` is used for package management and workspaces.
- The CLI/TUI runtime target is `Node 24`.
- Exact token counts are provider-derived and reasoning tokens are shown after a completed assistant response.
- The source-runner is the preferred development workflow because it avoids unnecessary rebuild steps while the product is still changing quickly, even when you launch `buli` from another directory.
