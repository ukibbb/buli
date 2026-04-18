# buli

`buli` is a local-first, terminal-only agentic software engineering agent built for one user: ukibbb.

This repository now contains the first real local agent slice: OpenAI/ChatGPT browser OAuth, a fullscreen HERO 1 terminal chat screen, streamed assistant responses with a live reasoning-summary block that collapses into a compact chip once thinking ends, available model discovery, model and reasoning-effort selection, in-memory cross-turn conversation history, and a first local `bash` tool with explicit approval before execution.

 # Current Status

V1 currently includes:

- Bun workspace monorepo
- OpenAI/ChatGPT browser OAuth
- UI-agnostic assistant response engine
- OpenAI assistant response adapter
- Ink terminal chat UI with:
  - `TopBar` (working directory)
  - `ConversationTranscriptPane` (dispatches on every transcript entry kind)
  - `UserPromptBlock`
  - `ReasoningStreamBlock` (streaming reasoning summary, amber accent)
  - `ReasoningCollapsedChip` (post-reasoning chip with duration and token count)
  - `ModelAndReasoningSelectionPane`
  - `InputPanel` (prompt draft, mode/model header strip, context-window footer)
  - `ShortcutsModal` (current keyboard shortcuts help)
- provider-backed available model discovery
- model selection and reasoning-effort selection
- streaming reasoning-summary display (live thinking block while the model reasons, collapsed chip after reasoning ends showing elapsed seconds and, once the response completes, reasoning token count)
- engine-owned in-memory conversation history that carries prior user prompts, assistant replies, and completed `bash` tool outcomes across turns during the current session
- first local `bash` tool wired through the engine and OpenAI Responses function-calling loop
- explicit tool approval flow: `y` approves the pending bash command, `n` denies it, and the model continues the same turn after the decision
- HERO 1 visual design (see `ink-limitations.md` for terminal cell-grid translations)
- typed `AssistantContentPart` discriminated union in `@buli/contracts` (paragraph, heading, bulleted/numbered/checklist, fenced code block, callout, horizontal rule, plus inline spans)
- engine-side markdown parser (`parseAssistantResponseIntoContentParts` in `@buli/engine`) that attaches typed content parts to the completed assistant message
- second terminal renderer `@buli/opentui-tui` backed by `@opentui/react`, with the same component inventory as ink-tui
- shared design tokens (`@buli/assistant-design-tokens`) consumed by both renderers
- shared test fixtures (`@buli/assistant-transcript-fixtures`) asserting both reducers interpret the same event sequences identically
- `--ui ink|opentui` flag on the CLI to pick a renderer per invocation (`ink` default)

V1 intentionally does not include yet:

- `read`, `write`, `edit`, or wider multi-tool support beyond `bash`
- session persistence
- session branching
- extension loading
- process RPC

## Requirements

- `Bun 1.3.12` or newer

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
even when launched outside the repo. The global wrapper also keeps the runtime on
`bun` end to end, so the source workflow and the packaged CLI exercise the same
runtime for both Ink and OpenTUI.

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
- see the model's reasoning summary stream into the transcript as a live thinking block, then collapse into a compact chip once reasoning ends
- read the collapsed chip's elapsed reasoning time and, after the response completes, its reasoning token count
- press `?` on an empty prompt to open shortcuts help
- press `Ctrl+L` to open model selection inside the TUI
- choose a model and, when supported, choose a reasoning effort
- approve a pending `bash` command with `y` or deny it with `n`
- ask follow-up questions that depend on earlier assistant replies and completed `bash` results inside the same fullscreen session
- list available models with `buli models`
- scroll the fullscreen conversation transcript with `Up`, `Down`, `PageUp`, `PageDown`, `Home`, and `End`
- start the app with a preselected model using `--model`
- start the app with a preselected reasoning effort using `--reasoning`
- see reasoning token usage on the collapsed reasoning chip after the assistant response completes
- `buli --ui opentui` launches the chat UI with the OpenTUI renderer instead of Ink
- both renderers read the same typed `AssistantContentPart[]` from the completed assistant message, so markdown structure (headings, lists, code blocks, callouts) is rendered identically in semantics

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
bun apps/cli/bin/buli.js
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

Current packages:

- `apps/cli`
  - composition root and CLI entrypoints
- `packages/contracts`
  - shared schemas for transcript messages, assistant response events, model metadata, token usage, canonical conversation history, typed tool requests, and typed assistant content parts
- `packages/engine`
  - UI-agnostic conversation runner, in-memory history projection, approval flow, local `bash` execution, and markdown parser
- `packages/openai`
  - OAuth, token refresh, Responses transport, available model discovery, function-call parsing, and same-turn continuation after tool output
- `packages/ink-tui`
  - terminal chat screen rendering, reasoning-summary and prompt components, alternate-screen integration, and chat screen state transitions
- `packages/opentui-tui`
  - second terminal chat renderer using `@opentui/react`, same component inventory as ink-tui
- `packages/assistant-design-tokens`
  - shared color, border, and spacing tokens from the `.pen` design file
- `packages/assistant-transcript-fixtures`
  - canonical typed-part scenarios consumed by engine and both TUI tests

## Design Source of Truth

The HERO 1 single-pane layout lives in the Pencil design file at
`novibe.space/designs/my-design.pen` (frame `j20vJ`). The per-component
library backing it is in the same file at frame `idXGN` (43 reusable
components covering reasoning, prose, lists, code, tool calls, and behavior
blocks). Pen-file pixel values, sub-row accent heights, corner radius on
filled surfaces, and font-size hierarchy do not translate 1:1 to a terminal
cell grid. The documented translations — palette table, pixel-to-cell
mapping, Lucide-to-Unicode glyph substitutions — live in `ink-limitations.md`.
The dual-TUI implementation spec at
`plans/2026-04-16-dual-tui-opentui-design.md` documents the
visual-fidelity mapping applied in both renderers.

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
- The source-runner is the preferred development workflow because it avoids unnecessary rebuild steps while the product is still changing quickly, even when you launch `buli` from another directory.
