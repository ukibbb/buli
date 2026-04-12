# buli

`buli` is a local-first, terminal-only coding agent built for one user: you.

The current repository contains the first working scaffold: OpenAI/ChatGPT browser OAuth, a fullscreen Ink TUI, streamed GPT responses, and final input/output/reasoning token display in the status bar. It is intentionally small so the architecture can be inspected before tools, sessions, branching, and extensions are added.

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

## Quick Start

```bash
bun install
bun run login
bun run chat
```

## Using The Global `buli` Command During Development

The primary development workflow uses the source runner directly instead of the built bundle. We do it this way because it is the simplest loop: every `buli` invocation runs the latest code from the repo without waiting for a rebuild.

Register the source runner once:

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

## Buildable CLI Workflow

The built CLI still exists as a separate packaging check. We keep it because later we will want a real installable package, but it is not the main development loop.

Build the bundle:

```bash
bun run build:cli
```

Run the built wrapper directly:

```bash
node apps/cli/bin/buli.js chat
```

If you want to continuously rebuild the packaged CLI while testing that path, run:

```bash
bun run dev:cli
```

## What You Can Do Today

After logging in, you can:

- open the fullscreen terminal UI
- submit a prompt
- watch GPT stream the response into the transcript
- see final input/output/reasoning token usage in the status bar

Without auth, `buli chat` exits cleanly and tells you to run `buli login` first.

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

## Notes

- `bun` is used for package management and workspaces.
- The CLI/TUI runtime target is `Node 24`.
- Exact token counts are provider-derived and reasoning tokens are shown after a completed assistant turn.
- The source-runner is the preferred development workflow because it avoids unnecessary rebuild steps while the product is still changing quickly.
