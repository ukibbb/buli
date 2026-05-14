# Agent Behavior Architecture

This document explains how serious coding agents and software engineering
assistants actually become distinctive.

It is not only a system-prompt question.

The examples in `examples/` show that behavior comes from a stack of prompt,
tooling, permissions, context loading, provider transforms, persistence, and UI
presentation.

Related docs:

- `docs/example-agents.md`
- `docs/example-agent-context-management.md`
- `docs/example-agent-tools.md`
- `docs/example-agent-file-context.md`
- `docs/buli-agent-behavior-blueprint.md`

## Executive Summary

If you want an agent to behave the way you want, you need to design at least
these layers deliberately:

1. identity
2. operating contract
3. repository instruction loading
4. tool surface and tool descriptions
5. permission and sandbox policy
6. mode or role system
7. dynamic turn context
8. persistence and compaction
9. UI and event presentation

The system prompt is only one part of that stack.

The six modern examples divide roughly into three families:

- `crush`: prompt-dominant
- `goose`: runtime-dominant
- `codex`, `opencode`, `kilocode`, and `pi-mono`: layered hybrids

The layered hybrid model is the strongest long-term architecture for `buli`, but
`buli`'s target behavior is not autonomous coding throughput. Its behavior stack
should make it a learning-first engineering partner: understand the system,
explain the mechanics, compare options and tradeoffs, recommend a path, and
apply code only after agreement.

## The Behavior Stack

### 1. Identity Layer

This is the stable answer to: who is this agent?

It includes:

- tone
- directness
- confidence style
- how much warmth or formality the agent uses
- whether the agent sounds like an operator, collaborator, reviewer, or teacher

Strong examples:

- `examples/crush/internal/agent/templates/coder.md.tpl`
- `examples/kilocode/packages/opencode/src/kilocode/soul.txt`

What these examples show:

- `crush` bakes identity directly into its coding persona prompt
- `kilocode` splits identity into a separate `soul.txt` layer so personality is
  not tangled with provider-specific instructions

Design lesson:

- keep identity stable and small
- avoid mixing volatile runtime facts into the identity layer

### 2. Operating Contract Layer

This is the stable answer to: how should the agent work?

It includes:

- whether the agent acts autonomously or discusses first
- whether the agent should teach and align with the user before implementation
- whether it must read before editing
- whether it tests after changes
- whether it should explain plans before acting
- whether it should be concise or expansive

Strong examples:

- `examples/crush/internal/agent/templates/coder.md.tpl`
- `examples/opencode/packages/opencode/src/session/prompt/gpt.txt`
- `examples/codex/codex-rs/models-manager/prompt.md`

What these examples show:

- `crush` uses a forceful operating contract with explicit do and do-not rules
- `opencode` uses a detailed GPT-family prompt that teaches tool use and
  working style
- `codex` combines a substantial base prompt with additional runtime policy
  layers

Design lesson:

- this layer usually belongs in a stable system prompt or developer-instruction
  section
- it should describe the work style, not every dynamic condition of the turn
- for learning-first products, this layer should make the explain/options/tradeoff/agreement
  gate explicit rather than leaving it implicit

### 3. Repository Instruction Layer

This is the answer to: what local project rules apply here?

It includes:

- `AGENTS.md`
- `CLAUDE.md`
- `.goosehints`
- tool-specific or product-specific local docs
- subdirectory-local rules

Strong examples:

- `examples/codex/codex-rs/core/src/agents_md.rs`
- `examples/crush/internal/config/config.go`
- `examples/goose/crates/goose/src/hints/load_hints.rs`
- `examples/opencode/packages/opencode/src/session/instruction.ts`
- `examples/pi-mono/packages/coding-agent/src/core/resource-loader.ts`

What these examples show:

- `codex` has the strongest explicit hierarchy semantics for project docs
- `crush` supports a broad ecosystem of instruction files
- `goose` loads hints dynamically as tool calls touch new directories
- `opencode` loads stable instruction files and then injects nearby ones during
  `read` operations
- `pi-mono` unifies context files, system override files, append files, skills,
  and prompts into one resource model

Design lesson:

- local instructions change behavior as much as the built-in system prompt does
- the precedence model must be explicit, not accidental

### 4. Tool Surface Layer

This is the answer to: what can the model do, and how is each capability framed?

It includes:

- which tools exist
- which tools are visible for a given model or mode
- the tool descriptions
- the tool schemas
- model-specific tool substitutions such as `apply_patch` versus `edit` and
  `write`

Strong examples:

- `examples/codex/codex-rs/tools/src/`
- `examples/crush/internal/agent/tools/`
- `examples/goose/crates/goose/src/agents/platform_extensions/developer/mod.rs`
- `examples/opencode/packages/opencode/src/tool/registry.ts`
- `examples/pi-mono/packages/coding-agent/src/core/tools/index.ts`

What these examples show:

- `crush` treats tool descriptions as part of the product voice
- `goose` uses extension instructions and tool annotations as behavior-shaping
  metadata
- `opencode` dynamically changes visible tools based on model family and agent
  mode
- `pi-mono` lets tools contribute prompt snippets and guideline bullets back
  into the system prompt

Design lesson:

- tool descriptions are prompt layers in disguise
- changing the tool set changes the agent's behavior even if the base prompt is
  unchanged

### 5. Permission And Sandbox Layer

This is the answer to: what is safe, what needs approval, and what is blocked?

It includes:

- read-only versus write capabilities
- bash approval rules
- sandbox modes
- path-specific permissions
- cached approvals
- approval UI and rejection handling

Strong examples:

- `examples/codex/codex-rs/protocol/src/models.rs`
- `examples/crush/internal/permission/`
- `examples/goose/crates/goose/src/permission/permission_inspector.rs`
- `examples/opencode/packages/opencode/src/permission/index.ts`

What these examples show:

- `codex` exposes permission and sandbox policy as explicit instructions to the
  model
- `goose` combines user rules, tool annotations, SmartApprove logic, and even
  LLM-based read-only detection
- `opencode` merges default agent rules, config rules, and session approvals

Design lesson:

- do not rely on prompt wording alone to enforce safety
- runtime gates must exist
- when useful, the model should also be told what the approval posture is

### 6. Mode And Role Layer

This is the answer to: which version of the agent is active right now?

It includes:

- build mode
- plan mode
- explore mode
- review mode
- task or subagent roles

Strong examples:

- `examples/goose` with `Auto`, `Approve`, `SmartApprove`, and `Chat`
- `examples/opencode/packages/opencode/src/agent/agent.ts`
- `examples/kilocode` agent set on top of OpenCode
- `examples/pi-mono/packages/coding-agent/src/core/agent-session.ts`

What these examples show:

- mode is often more than a label
- `opencode` plan mode changes both prompt wording and permission behavior
- `goose` makes approval posture itself part of the mode
- `pi-mono` gets some mode-like behavior through queue semantics and extension
  hooks even without the same named-mode structure

Design lesson:

- if different tasks need different behavior, separate them with modes or roles
- do not try to hide radically different workflows behind one generic prompt

### 7. Dynamic Turn Context Layer

This is the answer to: what extra context is relevant for this exact turn?

It includes:

- working directory
- active file or editor state
- nearby instruction files
- plan reminders
- file-read-local reminders
- mode transition reminders

Strong examples:

- `examples/goose/crates/goose/src/agents/moim.rs`
- `examples/opencode/packages/opencode/src/session/prompt.ts`
- `examples/opencode/packages/opencode/src/session/instruction.ts`
- `examples/opencode/packages/opencode/src/tool/read.ts`
- `examples/kilocode/packages/opencode/src/kilocode/editor-context.ts`
- `examples/pi-mono/packages/coding-agent/src/core/extensions/runner.ts`

What these examples show:

- `goose` injects synthetic live context through MOIM
- `opencode` adds synthetic plan/build reminders and injects nearby instruction
  files when a file is read
- `kilocode` deliberately splits stable environment facts from volatile
  editor-state details
- `pi-mono` lets extensions mutate the system prompt for a single turn

Design lesson:

- dynamic context usually belongs outside the base system prompt
- the more volatile the data is, the less it belongs in a static prompt builder

### 8. Persistence And Compaction Layer

This is the answer to: what survives across turns, and what does the model see
later?

It includes:

- canonical message history
- assistant message parts
- tool calls and results
- summaries and checkpoints
- replay-safe transforms
- branch or session reconstruction

Strong examples:

- `examples/codex` rollout and prompt reconstruction
- `examples/crush` summary checkpoints
- `examples/goose` explicit compaction and hint evolution
- `examples/opencode` and `examples/kilocode` structured messages and parts
- `examples/pi-mono` append-only session tree

Design lesson:

- mature agents separate stored history from active model context
- if you want a serious learning-first engineering partner, compaction and
  replay need to preserve enough context to explain decisions and tradeoffs, not
  only enough context to continue coding

### 9. UI And Event Layer

This is the answer to: how does the behavior feel to the user while it runs?

It includes:

- commentary versus final answer split
- whether tool activity is visible live
- whether approvals feel intrusive or natural
- whether the agent looks like token streaming or state streaming
- whether the interface shows reasoning summaries, plan proposals, or tool
  progress clearly

Strong examples:

- `examples/codex` TUI commentary versus final answer presentation
- `examples/opencode` SSE-backed state fan-out
- `examples/goose` multi-surface rendering over one core loop
- `examples/pi-mono` steering and follow-up queues

Design lesson:

- UI is not only a renderer
- it changes how users interpret confidence, autonomy, and transparency

## The Universal Turn Skeleton

Across the examples, the runtime loop is more consistent than the prompt text.

### 1. The User Message Enters

Examples:

- `codex` converts user input into a typed turn request
- `crush` enters through the TUI workspace and session agent path
- `goose` has multiple ingress layers for CLI, desktop, and ACP
- `opencode` and `kilocode` enter through session prompt APIs
- `pi-mono` enters through `AgentSession.prompt(...)`

Why it matters:

- this is the point where raw UI text becomes structured runtime state

### 2. Session Context Is Rebuilt

Examples:

- `opencode/packages/opencode/src/session/prompt.ts`
- `pi-mono/packages/coding-agent/src/core/agent-session.ts`
- `codex/codex-rs/core/src/session/mod.rs`

Why it matters:

- mature agents do not send the raw transcript forever
- they rebuild a model-facing context from canonical state

### 3. The Prompt Stack Is Assembled

Examples:

- `goose/crates/goose/src/agents/prompt_manager.rs`
- `opencode/packages/opencode/src/session/llm.ts`
- `pi-mono/packages/coding-agent/src/core/system-prompt.ts`
- `codex/codex-rs/core/src/session/mod.rs`

Why it matters:

- the final prompt is usually built from multiple layers, not one file

### 4. Tools And Policies Are Attached

Examples:

- `goose/crates/goose/src/agents/reply_parts.rs`
- `opencode/packages/opencode/src/tool/registry.ts`
- `codex/codex-rs/tools/src/`

Why it matters:

- the available tools and approval posture materially change what the model will
  try to do

### 5. The Provider Request Is Built

Examples:

- `codex/codex-rs/core/src/client.rs`
- `goose/crates/goose/src/providers/formats/openai_responses.rs`
- `opencode/packages/opencode/src/session/llm.ts`

Why it matters:

- model-family routing, reasoning settings, `instructions`, and tool choice all
  shape the next step

### 6. The Provider Stream Is Normalized

Examples:

- `codex/codex-rs/core/src/stream_events_utils.rs`
- `goose/crates/goose/src/providers/`
- `opencode/packages/opencode/src/provider/transform.ts`
- `pi-mono` provider event adapters

Why it matters:

- the UI and runtime should consume normalized internal events, not raw SSE
  chunks

### 7. Tool Calls Run Inside The Same Loop

Examples:

- `goose` tool approval and execution path
- `opencode` session loop and tool execution
- `pi-mono` tool execution events inside the agent session
- `codex` tool runtime integrated with approval and sandboxing

Why it matters:

- a coding agent is a turn loop, not a single completion request

## Learning And Agreement Gate Pattern

Some assistants should not move directly from understanding into mutation.

This is especially useful for learning-first software engineering partners whose
job is to help the user understand the system, build judgment, and think through
tradeoffs before code changes begin.

The pattern is:

1. understand the problem
2. explain the relevant internals and constraints
3. discuss approaches and tradeoffs
4. recommend a path and explain why
5. align with the user on the intended outcome
6. for non-trivial work, produce a concrete apply plan
7. only then apply code

The base prompt can teach this pattern, but if the product depends on it
strongly, the runtime should eventually model the phases explicitly rather than
relying on prompt wording alone.

### 8. Assistant State Is Persisted And Rendered

Examples:

- `crush` persisted message parts
- `opencode` state-streaming over SSE
- `pi-mono` append-only session tree

Why it matters:

- the user experience depends on how state is persisted and replayed as much as
  on the raw prompt text

## Where Different Concerns Should Live

| Concern | Best home | Why |
| --- | --- | --- |
| Stable persona and tone | base system prompt or dedicated identity layer | stable across sessions and models |
| Stable work style such as read-before-edit and verify-before-claiming | base operating contract prompt | core behavioral rules should be predictable |
| Working directory and environment facts | environment section or developer instructions | factual runtime state, separate from persona |
| Available tools and exact tool usage constraints | tool schemas and tool descriptions | keeps behavior close to the capability surface |
| Repo-wide local rules | instruction-file loader | should change with the project, not with the binary |
| Subdirectory-local rules | dynamic reminder or read-time injection | local and path-specific, not globally stable |
| User agreement before mutation | operating contract now, runtime phase model later | learning-first assistants need a clear explain/options/tradeoff/agreement gate |
| Approval posture and sandbox | runtime gate plus optional prompt-visible policy | must be enforced by code, not only requested by prompt |
| Plan mode versus build mode | mode system plus mode-specific overlays | behavior changes are too large for one generic prompt |
| Active editor state or visible files | per-turn context, often in the user message | highly volatile and bad for static prompt caching |
| Tool history and session summaries | persistence and compaction layer | prompt size and storage are different concerns |

## Repository Profiles

## Codex

Core sources:

- `examples/codex/codex-rs/models-manager/prompt.md`
- `examples/codex/codex-rs/core/src/session/mod.rs`
- `examples/codex/codex-rs/protocol/src/models.rs`
- `examples/codex/codex-rs/core/src/client.rs`

What dominates behavior:

- a substantial base prompt
- layered developer instructions
- explicit sandbox and approval policy injection
- strong model-specific OpenAI Responses request construction

What it feels like:

- highly disciplined
- policy-aware
- operator-like rather than conversationally soft

Main lesson:

- if policy and permissions matter, the runtime should surface them clearly to
  the model rather than hiding them in UI-only state

## Crush

Core sources:

- `examples/crush/internal/agent/templates/coder.md.tpl`
- `examples/crush/internal/agent/prompt/prompt.go`
- `examples/crush/internal/config/config.go`

What dominates behavior:

- one very strong coding persona prompt
- direct prompt assembly with environment facts and context files
- tool descriptions that reinforce the same style

What it feels like:

- terse
- autonomous
- highly opinionated
- low on conversational softness

Main lesson:

- a strong operating contract can absolutely define a product identity, but the
  runtime still needs enough structure to keep that identity reliable

## Goose

Core sources:

- `examples/goose/crates/goose/src/prompts/system.md`
- `examples/goose/crates/goose/src/agents/prompt_manager.rs`
- `examples/goose/crates/goose/src/agents/platform_extensions/developer/mod.rs`
- `examples/goose/crates/goose/src/hints/load_hints.rs`
- `examples/goose/crates/goose/src/permission/permission_inspector.rs`

What dominates behavior:

- extension instructions
- hint loading
- dynamic subdirectory context growth
- permission inspection and approval posture

What it feels like:

- context-sensitive
- stateful
- shaped by active tools and current mode more than by a huge base prompt

Main lesson:

- a thin base prompt is viable only when the runtime layers are strong enough to
  carry real behavior

## OpenCode

Core sources:

- `examples/opencode/packages/opencode/src/session/system.ts`
- `examples/opencode/packages/opencode/src/session/llm.ts`
- `examples/opencode/packages/opencode/src/session/prompt.ts`
- `examples/opencode/packages/opencode/src/session/instruction.ts`
- `examples/opencode/packages/opencode/src/tool/read.ts`
- `examples/opencode/packages/opencode/src/agent/agent.ts`

What dominates behavior:

- model-family prompts
- instruction-file loading
- mode-specific agent definitions
- dynamic reminders and read-time local instruction injection
- dynamic tool registry and permissions

What it feels like:

- layered
- local to the repo
- strongly shaped by mode and tooling

Main lesson:

- if you want a serious TypeScript reference, this is the clearest example of a
  layered behavior stack that is not over-centralized in one system prompt file

## KiloCode

Core sources:

- `examples/kilocode/packages/opencode/src/kilocode/soul.txt`
- `examples/kilocode/packages/opencode/src/session/system.ts`
- `examples/kilocode/packages/opencode/src/session/llm.ts`
- `examples/kilocode/packages/opencode/src/kilocode/editor-context.ts`

What dominates behavior:

- OpenCode's layered runtime
- a separate branded identity layer
- deliberate IDE and editor context shaping

What it feels like:

- more productized and branded than upstream OpenCode
- more embedded in an editor workflow

Main lesson:

- split stable identity from provider instructions and split stable environment
  facts from volatile editor state

## Pi Mono

Core sources:

- `examples/pi-mono/packages/coding-agent/src/core/system-prompt.ts`
- `examples/pi-mono/packages/coding-agent/src/core/resource-loader.ts`
- `examples/pi-mono/packages/coding-agent/src/core/agent-session.ts`
- `examples/pi-mono/packages/coding-agent/src/core/extensions/runner.ts`
- `examples/pi-mono/packages/coding-agent/src/core/prompt-templates.ts`

What dominates behavior:

- resource loading
- prompt construction from tools, skills, and local files
- extension-driven per-turn prompt mutation
- prompt templates as workflow packs

What it feels like:

- highly extensible
- deeply customizable without rewriting the core

Main lesson:

- treat the prompt as a constructed artifact assembled from resources and active
  capabilities, not as a fixed string constant

## Architecture Families And Tradeoffs

### Prompt-Dominant

Best example:

- `crush`

Strengths:

- easiest way to create a visible personality fast
- low architectural complexity

Risks:

- the prompt grows into a catch-all document
- dynamic constraints get mixed with stable identity
- harder to explain where behavior really comes from

### Runtime-Dominant

Best example:

- `goose`

Strengths:

- behavior can adapt to local context and active tools
- prompt can stay relatively small

Risks:

- harder to reason about if layers are implicit
- easier to build a system that feels inconsistent if precedence is not explicit

### Layered Hybrid

Best examples:

- `codex`
- `opencode`
- `kilocode`
- `pi-mono`

Strengths:

- stable identity and work style stay clear
- runtime can still adapt by mode, repo, and tool set
- easiest architecture to scale into a product

Risks:

- needs discipline to keep layer boundaries clear
- more moving parts to document and test

## Common Anti-Patterns

1. Putting dynamic state into the base system prompt.
2. Using prompt text instead of runtime gates for permissions.
3. Hiding very different workflows behind one generic mode.
4. Treating tool descriptions as pure API metadata rather than behavior levers.
5. Loading repository instructions without an explicit precedence model.
6. Letting persistence shape prompt size by accident rather than via compaction
   design.
7. Skipping explanation, options, tradeoffs, or alignment and moving into
   mutation too early for a learning-first product.
8. Trying to make the agent distinctive only by tone while leaving the runtime
   generic.

## Questions To Answer Before Designing Your Own Agent

1. What should the agent feel like when it is doing its best work?
2. Which rules are stable enough to live in a base prompt?
3. Which constraints belong in runtime code instead?
4. How should repo-local instructions override built-in behavior?
5. Which tools should change the prompt when they are available?
6. Which modes need distinct behavior rather than prompt wording tweaks?
7. Which context is stable, and which context is volatile enough to inject only
   per turn?
8. Does the assistant need an explicit explain/options/tradeoff/agreement gate before implementation?
9. How much of the product identity should come from voice versus from the
   workflow itself?

For the `buli`-specific answer to those questions, see
`docs/buli-agent-behavior-blueprint.md`.
