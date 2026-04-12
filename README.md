# buli

`buli` is a local-first, terminal-only coding agent built for one user: you.

This repository currently contains the first working scaffold: OpenAI/ChatGPT browser OAuth, a fullscreen Ink TUI, streamed GPT responses, and final input/output/reasoning token display in the status bar. It is intentionally small so the architecture can be inspected before tools, sessions, branching, and extensions are added.

## Current Status

V1 currently includes:

- Bun workspace monorepo
- OpenAI/ChatGPT browser OAuth
- UI-agnostic engine runtime
- OpenAI streaming adapter
- Ink TUI with:
  - `TranscriptPane`
  - `ComposerPane`
  - `StatusBar`
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

If `buli` is not found afterward, make sure Bun's global bin directory is on your `PATH`:

```bash
export PATH="$(bun pm bin -g):$PATH"
```

Then use the command normally:

```bash
buli login
buli chat
```

We use the source runner as the primary development workflow because every `buli` invocation runs the latest code from the repo without waiting for a rebuild.

## What `buli login` Does

`buli login`:

- starts a local OAuth callback flow
- opens your browser for OpenAI/ChatGPT authentication
- stores credentials locally in `~/.buli/auth.json`

After that, `buli chat` can use the stored auth without asking you to log in again every run.

## Repo-Only Quick Start

If you do not want to register a global command yet, you can run the current scaffold directly from the repo:

```bash
bun install
bun run login
bun run chat
```

## What You Can Do Today

After logging in, you can:

- open the fullscreen terminal UI
- type a prompt
- see your prompt in the transcript
- watch GPT stream the response into the transcript
- see final input/output/reasoning token usage in the status bar

If auth is missing, `buli chat` exits cleanly and tells you to run `buli login` first.

## Buildable CLI Workflow

The built CLI exists as a packaging check. We keep it because later we will want a real installable package, but it is not the main development loop.

Build the bundle:

```bash
bun run build:cli
```

Run the built wrapper directly:

```bash
node apps/cli/bin/buli.js chat
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

`OpenAI auth not found. Run \`buli login\`.`

- run `buli login`
- if needed, check whether `~/.buli/auth.json` exists

## Project Structure

- `apps/cli`
  - composition root and CLI entrypoints
- `packages/contracts`
  - shared serializable types and schemas
- `packages/engine`
  - UI-agnostic runtime orchestration
- `packages/openai`
  - OAuth, token refresh, OpenAI transport, usage parsing
- `packages/ink-tui`
  - Ink rendering and TUI state

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
- Exact token counts are provider-derived and reasoning tokens are shown after a completed assistant turn.
- The source-runner is the preferred development workflow because it avoids unnecessary rebuild steps while the product is still changing quickly.
