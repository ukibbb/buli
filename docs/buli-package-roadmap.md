# Buli Package Roadmap

This document maps the example-agent research onto the current `buli` package shape.

## Current `buli` Shape

Today `buli` has these main runtime packages and entry points:

- `packages/contracts`
- `packages/engine`
- `packages/openai`
- `packages/tui`
- `apps/cli`

Current reality from the codebase:

- `packages/contracts` already models typed assistant events, tool details, and rich content parts
- `packages/engine` owns the assistant runtime, conversation history projection, and local `bash` tool loop
- `packages/openai` owns OAuth, request construction, model discovery, and stream parsing
- `packages/tui` owns fullscreen rendering and local screen behavior over shared chat-session state
- `apps/cli` is the composition root for login, models, interactive chat, file-backed sessions, and HTML session export

## Core Recommendation

Do not import one example repo wholesale.

Keep the product north star explicit: `buli` is a learning-first engineering
partner. Package boundaries should support understanding, explanation,
tradeoff analysis, and agreed code application rather than autonomous coding
throughput.

Instead:

1. copy the smallest good ideas into the existing package shape
2. keep the renderer concerns inside `@buli/tui`
3. add new packages only when a boundary becomes real enough to justify one

## Package References

The most useful reference repos by package are:

| `buli` package | Primary references | Secondary references |
| --- | --- | --- |
| `packages/contracts` | `pi-mono`, `opencode` | `codex` |
| `packages/openai` | `codex`, `goose` | `kilocode`, `opencode` |
| `packages/engine` | `pi-mono`, `opencode` | `crush` |
| `packages/tui` | current `buli`, `opencode`, `crush` | `codex` |

## Guardrails

These are the main architectural guardrails to keep.

1. Keep `@buli/openai` provider-specific.
2. Keep `@buli/engine` UI-agnostic.
3. Keep `@buli/contracts` provider-neutral and serializable.
4. Keep `@buli/tui` focused on rendering and local screen state.
5. Keep the first context architecture simple: canonical entries plus projection rules, not stored visibility flags.
6. Keep stored sessions append-only and canonical; do not add branch UI before the core tool loop and projection model are proven.
7. Do not add a large extension system yet.
8. Do not add a separate tools package until the tool surface is real.
9. Do not widen mutation tools faster than the learning/agreement/apply workflow can explain and constrain them.

## Rollout Order

The best order remains:

1. move the base system prompt and model-context projection into `@buli/engine`
2. keep strengthening canonical session-entry contracts and in-memory history
3. reshape the provider and engine boundary around tool intent versus local execution
4. keep the learning-first agreement gate clear before widening mutation power
5. add more real tools incrementally after the read/search/apply loop is reliable
6. keep approval UX functional in `@buli/tui`
7. harden append-only persistence and restore canonical history on resume
8. add compaction and widen the tool surface only when the runtime justifies it

## Package Responsibilities

### `packages/contracts`

Owns provider-neutral stream events, assistant turn events, transcript content models, canonical session-entry contracts, and tool call/result contracts.

### `packages/openai`

Owns OpenAI auth, token refresh, request construction, stream parsing, usage normalization, and provider-side same-turn continuation for Responses tool loops.

### `packages/engine`

Owns assistant runtime orchestration, history projection, tool approval flow, local tool execution, and assistant text-part building.

### `packages/tui`

Owns the fullscreen terminal product UI: app shell, transcript rendering, composer, keyboard behavior, local viewport behavior, and status surfaces.

### `apps/cli`

Owns command parsing and runtime composition.
