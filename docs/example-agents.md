# Example Agent Research

This document summarizes the agent examples in `examples/` with two goals:

- explain the full user-to-agent lifecycle for each example
- compare what makes each agent behave the way it does

The examples reviewed here are:

- `examples/codex`
- `examples/crush`
- `examples/goose`
- `examples/hermes-agent`
- `examples/kilocode`
- `examples/opencode`
- `examples/opencode-arch`
- `examples/pi-mono`

For detailed research on interactive `@file` mentions, file attachments, and
file-to-context behavior, see `docs/example-agent-file-context.md`.

For detailed research on `examples/hermes-agent`, including its full runtime
sequence, self-improvement loop, and a concrete `buli` implementation
blueprint, see `docs/example-hermes-agent-research.md` and the condensed
diagram view in `docs/example-hermes-agent-sequence-diagram.md`.

For detailed research on slash commands and why `buli` does not implement slash
autocomplete, see `docs/example-agent-slash-commands.md`.

For detailed research on session persistence, prompt assembly, compaction, and
context-window management, see `docs/example-agent-context-management.md`.

For a detailed explanation of how prompt layers, tool descriptions, permission
policy, dynamic context, and runtime loops combine into agent behavior, see
`docs/agent-behavior-architecture.md`.

For the `buli`-specific behavior design and prompt-stack blueprint to complete
before editing `packages/engine/src/systemPrompt.ts`, see
`docs/buli-agent-behavior-blueprint.md`.

For the final `buli` decision on Desktop-scoped `@` prompt context, see
`docs/prompt-context-design.md`.

## Executive Summary

If the goal is to implement a strong GPT-5.5 lifecycle for a learning-first
engineering partner, the best references are:

- `codex` for the deepest OpenAI Responses transport and event handling
- `goose` for multi-surface CLI/API/desktop integration around one agent core
- `opencode` for persisted streaming state and SSE fan-out
- `kilocode` for a productized `opencode` fork with stronger GPT-5 defaults and IDE context
- `pi-mono` for the cleanest provider-agnostic event model and extension architecture

`opencode-arch` is useful mostly as a contrast. It shows an older chat-completions-era design rather than a modern GPT-5.5 Responses-first design.

Across the modern examples, the common pattern is:

1. user input enters as a typed message or turn request
2. session history is rebuilt in a model-facing format
3. model request construction adds instructions, tools, and reasoning settings
4. SSE or WebSocket chunks are normalized into internal stream events
5. the runtime updates assistant state incrementally from those events
6. tool calls are executed inside the same loop and appended back into history
7. the final assistant answer is the finalized assistant message state, not a separate object

The important GPT-5.5-specific lesson is that streamed reasoning is usually exposed as a summary or provider-approved thinking channel. Most modern examples do not treat hidden chain-of-thought as plain UI text. They preserve opaque reasoning continuity data separately when the provider supports it.

The important `buli`-specific lesson is different from copying autonomous coding
agents directly: use the same runtime primitives to help Lukasz understand how
systems work, compare options, reason through tradeoffs, and apply code only
after agreement.

## How To Use This Research

This document is the top-level map of the example-agent research set.

Use it in this order:

1. Read this file first for the repo-by-repo comparison and the main behavior
   differences.
2. Read `docs/agent-behavior-architecture.md` next for the cross-cutting model
   of how agent behavior is actually built.
3. Read `docs/buli-agent-behavior-blueprint.md` before editing
   `packages/engine/src/systemPrompt.ts`, so `buli` gets a deliberate behavior
   stack rather than a longer but still under-specified prompt.
4. Use the subsystem docs for implementation details:
   - `docs/example-agent-context-management.md`
   - `docs/example-agent-tools.md`
   - `docs/example-agent-file-context.md`
   - `docs/example-agent-slash-commands.md`

## Fast Comparison

| Repo | Best reference for | Runtime shape | Reasoning surfacing | Tool loop | Persistence |
| --- | --- | --- | --- | --- | --- |
| `codex` | OpenAI Responses native behavior | core runtime + TUI/exec adapters | reasoning summary and raw reasoning channels | strong, policy-aware | rollout/history persisted |
| `crush` | prompt-heavy coding-agent behavior | TUI + persisted message parts | reasoning part on assistant message | yes | SQLite messages/sessions |
| `goose` | multi-client agent framework | one core loop, many front doors | thinking blocks in core message model | yes | SQLite sessions/threads |
| `opencode` | stateful streaming over SSE | local server + sync/event projectors | reasoning parts | yes | SQLite sessions/messages/parts |
| `kilocode` | productized opencode with IDE context | same as opencode + VS Code orchestration | reasoning parts + GPT-5 defaults | yes | SQLite sessions/messages/parts |
| `pi-mono` | clean provider abstraction | app layer + agent loop + AI provider layer | `thinking_*` stream events | yes | JSONL session tree |
| `opencode-arch` | historical comparison | Go TUI + provider loop | limited/partial | yes | SQLite messages/sessions |

## Behavior Lever Comparison

The lifecycle table above explains how turns flow. The table below explains what
mostly determines each agent's personality and working style.

| Repo | Dominant behavior levers | What the user feels most | Most useful `buli` lesson |
| --- | --- | --- | --- |
| `codex` | layered developer instructions, policy engine, sandbox and approval model, model-specific Responses request construction | a disciplined operator that is very aware of permissions and execution policy | separate stable persona from runtime policy and make permissions visible to the model |
| `crush` | strong coding persona prompt, tool markdown, direct context-file inlining | a terse, forceful, highly autonomous coding assistant | a strong operating contract can create product identity quickly, but `buli` should invert the autonomy default toward learning and agreed apply |
| `goose` | extension instructions, `.goosehints`, dynamic subdirectory hints, permission inspection, mode-specific approval posture | a stateful agent whose behavior changes as tools, hints, and permissions change | a small base prompt can work if runtime layers inject the right context at the right time |
| `opencode` | provider-family prompts, repo/global instruction loading, agent modes, tool registry, read-time local reminders, SSE-backed state | a layered, local, tool-aware coding product rather than a single chatbot | repo instructions, mode overlays, and per-turn reminders are as important as prompt wording |
| `kilocode` | OpenCode runtime plus explicit personality layer and editor-aware environment context | a more opinionated, branded, IDE-embedded OpenCode | keep identity separate from operating policy and separate stable context from volatile context |
| `pi-mono` | resource loader, tool-derived prompt snippets, extensions, prompt templates, per-turn prompt mutation | an extensible agent whose behavior is highly file-driven and customizable | construct the prompt from resources and active tools rather than hardcoding everything in one file |
| `opencode-arch` | simpler prompt registry and older dialog-heavy orchestration | an earlier-generation coding agent whose behavior is more directly tied to prompt text and manual flows | useful contrast, but not a strong model for a GPT-5.5-first architecture |

## Architecture Families

Across the examples, behavior design falls into three broad families.

### Prompt-Dominant

`crush` is the clearest example.

- the main coding persona carries much of the product identity
- tool descriptions reinforce the same tone and work style
- the runtime still matters, but the visible personality is mostly prompt-led

### Runtime-Dominant

`goose` is the clearest example.

- the base prompt is relatively small
- extensions, hints, permission inspection, and mode selection do much of the
  real behavior shaping
- the agent changes as the runtime discovers more local context

### Layered Hybrid

`codex`, `opencode`, `kilocode`, and `pi-mono` fit here.

- they have real base prompts or persona layers
- they also have strong non-prompt levers such as modes, tool registries,
  instruction-file loading, and provider-specific request transforms
- this is the strongest long-term family for `buli` because it avoids
  overloading one prompt with every responsibility and leaves room for real
  learning/agreement/apply phases

## Shared Lifecycle Pattern

The modern examples converge on the same lifecycle, even though the transports and state layers differ.

### 1. User Prompt Enters The System

- CLI and TUI examples collect text in-process and create a user turn or message object.
- Server-centered examples accept an HTTP request that persists the user message first.
- Desktop or API clients usually do not stream directly from the request that started the turn. They subscribe to a second event channel.

### 2. Session Context Is Rebuilt

- The runtime reconstructs prior user messages, assistant messages, tool calls, and tool results.
- Some examples also merge context files such as `AGENTS.md`, `CLAUDE.md`, `.goosehints`, or project-local config.
- Modern examples use typed message parts instead of plain transcript strings.

### 3. Model Request Is Built

- The request builder adds a system prompt or `instructions` field.
- Tools are registered with descriptions and schemas.
- GPT-5-class models often receive explicit reasoning controls such as effort and summary mode.
- Some examples switch automatically between chat-completions and Responses based on the model.

### 4. Provider Stream Is Normalized

- Raw SSE or WebSocket frames are parsed into internal event types.
- Typical normalized event families are:
  - text start/delta/end
  - reasoning start/delta/end
  - tool input start/delta/end
  - tool call and tool result
  - completed or failed

### 5. Assistant State Is Updated Incrementally

- Some examples mutate one in-memory streaming assistant message.
- Some persist each delta into structured message parts.
- Some publish bus events or SSE updates after each state change.

### 6. Tool Calls Happen Inside The Same Turn Loop

- Tool calls are captured from the assistant stream.
- Local tool execution happens immediately or after approval.
- Tool results are appended to the conversation and another model step begins if needed.

### 7. Final Answer Is The Finalized Assistant Message

- The final answer is usually the same assistant object that was being updated during streaming.
- Final completion also attaches usage, finish reason, and sometimes response metadata.

## Lifecycle Deep Dives

## Codex

### Summary

`codex` is the most OpenAI Responses-native example. It has the richest wire-level handling for GPT-5-style models, the deepest instruction layering, and the strongest explicit sandbox and approval model.

### Most Relevant Files

- `examples/codex/codex-rs/core/src/codex.rs`
- `examples/codex/codex-rs/core/src/client.rs`
- `examples/codex/codex-rs/core/src/client_common.rs`
- `examples/codex/codex-rs/core/src/stream_events_utils.rs`
- `examples/codex/codex-rs/protocol/src/models.rs`
- `examples/codex/codex-rs/protocol/src/protocol.rs`
- `examples/codex/codex-rs/tui/src/chatwidget.rs`
- `examples/codex/codex-rs/exec/src/event_processor_with_jsonl_output.rs`

### Lifecycle Notes

1. User input becomes a typed turn request such as `Op::UserTurn`.
2. Session/core runtime builds `Prompt` and provider-facing `ResponseItem` input.
3. `ModelClientSession.build_responses_request()` builds an OpenAI Responses request in `examples/codex/codex-rs/core/src/client.rs`.
4. The runtime prefers Responses WebSocket transport and falls back to HTTP streaming.
5. `previous_response_id` is reused for incremental continuation.
6. Stream events are mapped into internal response events, including reasoning summary deltas and raw reasoning deltas.
7. Tool calls are routed through the tool runtime and injected back as function/custom tool outputs.
8. TUI and `exec` mode are separate renderers over the same core loop.

### GPT-5.5 Relevance

- Strongest direct reference for OpenAI Responses request construction
- Strongest example of reasoning summary vs raw reasoning channels
- Strongest example of preserving `commentary` vs `final_answer` message phases

## Crush

### Summary

`crush` is the clearest example of how a strong system prompt and tool descriptions alone can make an agent feel distinct. It persists assistant reasoning, assistant text, tool calls, and tool results as structured message parts, but its visible personality is mostly prompt-driven.

### Most Relevant Files

- `examples/crush/internal/agent/agent.go`
- `examples/crush/internal/agent/coordinator.go`
- `examples/crush/internal/agent/prompts.go`
- `examples/crush/internal/agent/templates/coder.md.tpl`
- `examples/crush/internal/agent/templates/task.md.tpl`
- `examples/crush/internal/message/content.go`
- `examples/crush/internal/message/message.go`
- `examples/crush/internal/ui/model/ui.go`

### Lifecycle Notes

1. TUI submit path calls `Workspace.AgentRun(...)`.
2. `SessionAgent.Run` loads prior persisted messages and builds `fantasy.Message[]` history.
3. Provider/model options are resolved in `coordinator.go`.
4. `fantasy.Agent.Stream(...)` drives the loop.
5. Stream callbacks such as `OnReasoningDelta`, `OnTextDelta`, `OnToolCall`, and `OnToolResult` mutate persisted messages immediately.
6. The UI redraws from pubsub events rather than raw provider bytes.
7. Final answer is the finalized assistant message row plus finish metadata.

### GPT-5.5 Relevance

- Good example of OpenAI Responses reasoning options through a provider abstraction
- Good example of a persisted message-part model without forcing a server architecture

## Goose

### Summary

`goose` is the best example of one agent core serving many front doors. CLI, desktop, and ACP/API all converge on the same Rust agent loop.

### Most Relevant Files

- `examples/goose/crates/goose/src/agents/agent.rs`
- `examples/goose/crates/goose/src/providers/openai.rs`
- `examples/goose/crates/goose/src/providers/formats/openai_responses.rs`
- `examples/goose/crates/goose/src/conversation/message.rs`
- `examples/goose/crates/goose-server/src/routes/agent.rs`
- `examples/goose/crates/goose-server/src/routes/session_events.rs`
- `examples/goose/crates/goose-acp/src/server.rs`
- `examples/goose/ui/desktop/src/hooks/useChatStream.ts`

### Lifecycle Notes

1. CLI, desktop, and ACP each create a user message in their own ingress layer.
2. Session/conversation state is loaded from SQLite.
3. `Agent::reply()` prepares tools, prompt context, and provider request.
4. OpenAI provider auto-switches GPT-5.5-class models to Responses when appropriate.
5. Provider stream is parsed into Goose message content blocks, including thinking blocks.
6. Tool calls are approved, executed, and appended back into context.
7. Desktop UI receives updates from server SSE; ACP maps them into session notifications.

### GPT-5.5 Relevance

- Direct example of auto-routing `gpt-5.5` to Responses
- Good example of how the same reasoning/tool events can be rendered very differently across clients

## OpenCode

### Summary

`opencode` is the best example of state-streaming rather than token-streaming. The prompt request starts the turn, but clients render from persisted sync events over SSE.

### Most Relevant Files

- `examples/opencode/packages/opencode/src/session/prompt.ts`
- `examples/opencode/packages/opencode/src/session/llm.ts`
- `examples/opencode/packages/opencode/src/session/processor.ts`
- `examples/opencode/packages/opencode/src/session/message-v2.ts`
- `examples/opencode/packages/opencode/src/session/projectors.ts`
- `examples/opencode/packages/opencode/src/server/instance/session.ts`
- `examples/opencode/packages/opencode/src/server/instance/event.ts`
- `examples/opencode/packages/opencode/src/cli/cmd/tui/context/sync.tsx`

### Lifecycle Notes

1. TUI or SDK sends a prompt-starting HTTP request.
2. Server persists the user message immediately.
3. `SessionPrompt.prompt()` rebuilds session history, tools, reminders, and prompt stack.
4. `streamText(...)` in `session/llm.ts` starts the model stream.
5. `SessionProcessor` converts stream events into structured message parts such as `text`, `reasoning`, and `tool`.
6. Sync events are projected into SQLite and broadcast over SSE.
7. TUI renders from sync state, not from a transient stream buffer.

### GPT-5.5 Relevance

- Excellent example of separating provider streaming from UI streaming
- Excellent example of reasoning parts, tool parts, and session state becoming the source of truth

## KiloCode

### Summary

`kilocode` inherits the OpenCode runtime shape but makes the agent much more productized and IDE-aware. It adds stronger GPT-5 defaults, an explicit Kilo identity layer, and live editor context.

### Most Relevant Files

- `examples/kilocode/packages/opencode/src/session/prompt.ts`
- `examples/kilocode/packages/opencode/src/session/llm.ts`
- `examples/kilocode/packages/opencode/src/session/processor.ts`
- `examples/kilocode/packages/opencode/src/provider/transform.ts`
- `examples/kilocode/packages/opencode/src/kilocode/soul.txt`
- `examples/kilocode/packages/opencode/src/kilocode/editor-context.ts`
- `examples/kilocode/packages/kilo-vscode/src/services/cli-backend/server-manager.ts`

### Lifecycle Notes

1. CLI and VS Code both go through the same backend runtime.
2. User prompt is enriched with editor context such as active file and visible files.
3. GPT-5-class model options are normalized aggressively in `provider/transform.ts`.
4. Stream processing and persistence follow the same message-part pattern as OpenCode.
5. SSE fan-out drives the VS Code UI and other clients.
6. Tool loop continues until no more tool calls remain.

### GPT-5.5 Relevance

- Strong reference for practical GPT-5 defaults:
  - reasoning effort
  - reasoning summary
  - text verbosity
- Strong reference for shaping a coding agent around IDE context

## Pi Mono

### Summary

`pi-mono` has the cleanest internal abstraction. It separates the app layer, the agent loop, and the provider layer very clearly. It is also the most extensible through prompt templates, skills, and extensions.

### Most Relevant Files

- `examples/pi-mono/packages/coding-agent/src/core/system-prompt.ts`
- `examples/pi-mono/packages/coding-agent/src/core/agent-session.ts`
- `examples/pi-mono/packages/agent/src/agent-loop.ts`
- `examples/pi-mono/packages/ai/src/types.ts`
- `examples/pi-mono/packages/ai/src/stream.ts`
- `examples/pi-mono/packages/ai/src/providers/openai-responses.ts`
- `examples/pi-mono/packages/ai/src/providers/transform-messages.ts`

### Lifecycle Notes

1. App layer builds an `AgentMessage` prompt and session context.
2. Agent loop converts `AgentMessage[]` to provider-facing `Message[]` only at the model boundary.
3. Providers emit normalized `AssistantMessageEvent`s such as `text_delta`, `thinking_delta`, and `toolcall_start`.
4. Agent loop executes tool calls and appends `toolResult` messages.
5. Session manager persists the transcript as JSONL entries.
6. Interactive mode, print mode, and RPC mode render from the same agent/session events.

### GPT-5.5 Relevance

- Best reference for defining a stable internal event protocol
- Best reference for preserving provider-specific metadata like `responseId` and thinking signatures without coupling the entire runtime to one provider

## OpenCode-arch

### Summary

`opencode-arch` is the old generation. It is still useful as a clear Go TUI + provider loop example, but it predates the more structured Responses-native patterns used by the newer projects.

### Most Relevant Files

- `examples/opencode-arch/internal/llm/agent/agent.go`
- `examples/opencode-arch/internal/llm/provider/openai.go`
- `examples/opencode-arch/internal/llm/prompt/coder.go`
- `examples/opencode-arch/internal/message/message.go`
- `examples/opencode-arch/internal/session/session.go`
- `examples/opencode-arch/internal/tui/tui.go`

### Lifecycle Notes

1. TUI collects input and creates a user message.
2. Provider request is built using chat-completions style message history.
3. Streamed content mutates one persisted assistant message.
4. Tool calls are executed after the stream and appended as a tool message.
5. Another model step begins if finish reason indicates tool use.
6. TUI renders from pubsub updates.

### GPT-5.5 Relevance

- Useful only as a contrast with older chat-completions style design
- Not the right template for a modern GPT-5.5-first implementation

## What Makes These Agents Behave Differently

The lifecycle is only half of the story. The other half is behavior-shaping.

## 1. System Prompt Sources And Layering

This is the biggest driver of differences in response style, autonomy, verbosity, and tool usage.

### Codex

- Main GPT-5 prompt in `examples/codex/codex-rs/core/gpt_5_codex_prompt.md`
- Additional instruction layers in `examples/codex/codex-rs/core/prompt_with_apply_patch_instructions.md`
- Model-specific templates and realtime-specific prompts under `examples/codex/codex-rs/core/templates/`

Effect on behavior:

- very explicit editing constraints
- strong final-answer formatting discipline
- strong tool-use guidance
- clear separation between commentary and final answer

### Crush

- Main coding persona in `examples/crush/internal/agent/templates/coder.md.tpl`
- Short task persona in `examples/crush/internal/agent/templates/task.md.tpl`

Effect on behavior:

- extremely terse output
- aggressive autonomy
- mandatory read-before-edit
- frequent testing
- very little conversational softness

### Goose

- Base prompt in `examples/goose/crates/goose/src/prompts/system.md`
- Prompt assembly in `examples/goose/crates/goose/src/agents/prompt_manager.rs`
- extra templates for planning, compaction, permission judging, and subagents

Effect on behavior:

- extensions become part of the prompt surface
- mode-specific behavior can be injected cleanly
- dynamic hints can alter behavior as the session progresses

### OpenCode

- Provider/model-family prompt selection in `examples/opencode/packages/opencode/src/session/system.ts`
- final prompt stack in `examples/opencode/packages/opencode/src/session/prompt.ts`

Effect on behavior:

- different model families get different base prompt language
- plan mode can override normal execution behavior heavily
- skills and instruction files are treated as first-class prompt layers

### KiloCode

- inherits OpenCode prompt stack
- adds Kilo identity via `examples/kilocode/packages/opencode/src/kilocode/soul.txt`
- adds editor-aware environment and context in `examples/kilocode/packages/opencode/src/session/system.ts`

Effect on behavior:

- stronger branded identity
- more workflow-oriented and less generic
- stronger IDE-centric behavior

### Pi Mono

- default prompt builder in `examples/pi-mono/packages/coding-agent/src/core/system-prompt.ts`

Effect on behavior:

- tool-aware prompt content
- project docs awareness for pi itself
- prompt changes automatically when the selected tool set changes

### OpenCode-arch

- simple prompt registry in `examples/opencode-arch/internal/llm/prompt/`

Effect on behavior:

- behavior is still prompt-driven, but prompt layering is simpler and less dynamic

## 2. Project Instruction Files And Precedence

Instruction-file discovery changes the agent as much as the built-in system prompt.

### Codex

- hierarchical `AGENTS.md` handling in `examples/codex/codex-rs/core/src/agents_md.rs`
- docs in `examples/codex/docs/agents_md.md`

Distinctive behavior:

- strongest `AGENTS.md` hierarchy semantics
- explicit precedence and root markers
- user instructions and project docs are separate layers

### Crush

- context file defaults in `examples/crush/internal/config/config.go`
- prompt context loading in `examples/crush/internal/agent/prompt/prompt.go`

Distinctive behavior:

- broad support for many ecosystem files such as `AGENTS.md`, `CLAUDE.md`, `CRUSH.md`, `.cursorrules`, and GitHub Copilot instructions
- more direct file inlining into the prompt

### Goose

- `.goosehints` and `AGENTS.md` loading in `examples/goose/crates/goose/src/hints/load_hints.rs`
- `@file` imports in `examples/goose/crates/goose/src/hints/import_files.rs`

Distinctive behavior:

- dynamic hint loading after tool calls touch new subdirectories
- hints can grow during the session

### OpenCode / KiloCode

- system instruction loading in `examples/opencode/packages/opencode/src/session/instruction.ts`
- same mechanism in the Kilo fork

Distinctive behavior:

- only the first project-level ancestor match wins for system-level instruction files
- nearby nested instruction files can still be attached during `read` tool usage

### Pi Mono

- context/resource loading in `examples/pi-mono/packages/coding-agent/src/core/resource-loader.ts`

Distinctive behavior:

- combines system override files, append files, prompt templates, skills, and context files into one extensible resource model

## 3. Built-In Modes And Agent Roles

The available modes determine whether the agent plans first, edits directly, delegates, or stays read-only.

### Codex

- collaboration modes and planning behavior in the TUI and core prompt stack

Distinctive behavior:

- strong separation between planning and doing
- realtime mode is effectively its own persona

### Crush

- main `coder` and `task` agents

Distinctive behavior:

- coding mode is highly autonomous and terse
- task mode is optimized for short fact-finding answers

### Goose

- `Auto`, `Approve`, `SmartApprove`, and `Chat`

Distinctive behavior:

- the permission posture is part of the mode itself
- mode affects what the user experiences as "how willing the agent is to act"

### OpenCode

- `build`, `plan`, `general`, `explore`, plus hidden support agents

Distinctive behavior:

- plan mode is not just a UI label; it materially restricts tool behavior and prompt wording

### KiloCode

- `code`, `plan`, `debug`, `ask`, `orchestrator`, `general`, `explore`

Distinctive behavior:

- more workflow specialization than upstream
- much closer to a multi-role engineering product than a single generic agent

### Pi Mono

- less fixed around named modes and more around extension-driven behavior and queue semantics

Distinctive behavior:

- steering and follow-up delivery semantics feel like a mode system even though they are implemented as queue policy

## 4. Tool Registry, Descriptions, And Schemas

Tool descriptions matter a lot. The examples that feel the most distinct usually have the most intentional tool text.

### Codex

- tool descriptions and model-specific templates are extensive
- tool support also depends on parallel-call metadata and approval config

### Crush

- tool markdown and inline descriptions are a large part of the product personality
- tool docs are treated as part of the agent contract

### Goose

- extension registry and tool annotations shape not only model choices but permission logic

### OpenCode / KiloCode

- zod-defined tool schemas, verbose tool descriptions, and agent-gated tool availability
- `task`, `skill`, `plan`, and `todo` tools alter the agent’s working style

### Pi Mono

- TypeBox schemas plus validation hooks, pre-execution hooks, post-execution hooks, and extension-owned prompt snippets

### OpenCode-arch

- simpler tool registry, but because there is less orchestration, the tool descriptions influence the agent very directly

## 5. Permissions, Approval, And Sandbox Posture

This is another major reason the agents feel different.

### Codex

- strongest explicit policy engine
- sandbox, approval, and command analysis are central to the runtime

### Crush

- permission service plus bash-tool safety rules
- permission state is interactive and persisted enough to change the experience quickly

### Goose

- explicit rules plus tool annotations plus smart-approve plus an LLM permission judge

### OpenCode

- agent-level permission defaults merged with config and session approvals
- plan mode deliberately restricts mutation

### KiloCode

- same model, but with stronger product-level convenience features such as broader allow rules and autonomous flows

### Pi Mono

- less centered on a heavyweight sandbox engine and more on hooks, tool validation, and extension control

### OpenCode-arch

- simple interactive permission queue, typical of an earlier generation

## 6. Context, Memory, And Compaction

### Codex

- memories and compaction are distinct systems
- memory prompting and compacted summaries are explicit behavior layers

### Crush

- session summarization is important and strongly influences later context

### Goose

- compaction prompt is detailed and agent-facing
- subdirectory hint loading changes the prompt over time

### OpenCode / KiloCode

- part-based persistence and compaction keep the session recoverable and resumable

### Pi Mono

- tree-based session reconstruction, branch summaries, and replay-safe provider transforms are unusually deliberate

### OpenCode-arch

- auto-compaction exists, but the design is much simpler

## 7. Model-Specific Defaults

Modern coding agents increasingly specialize prompt shape and reasoning settings by model family.

### Codex

- capability-driven request construction for reasoning summary, verbosity, and parallel tool calls

### Crush

- provider/model options merged in the coordinator, including OpenAI reasoning summary settings

### Goose

- explicit Responses routing for GPT-5.5-class models

### OpenCode

- provider transform layer controls reasoning summary, tool choice, and OpenAI-specific `instructions`

### KiloCode

- strongest GPT-5 defaults of the group for a productized TypeScript agent

### Pi Mono

- most portable reasoning abstraction across providers and transports

### OpenCode-arch

- limited reasoning-effort handling, but no modern Responses-native behavior

## 8. UI And Client Architecture As Behavior Layers

The UI is not just a renderer. It changes how users perceive the agent.

### Codex

- commentary vs final answer handling in the TUI creates a very specific feel

### Crush

- terse CLI presentation amplifies the already terse system prompt

### Goose

- desktop, text UI, and ACP each surface the same core state differently

### OpenCode

- SSE-backed sync state makes the product feel persistent and collaborative

### KiloCode

- VS Code integration and editor context make the agent feel embedded in the IDE rather than in a terminal

### Pi Mono

- steering and follow-up queues visibly change the conversation experience

### OpenCode-arch

- older dialog-heavy TUI makes permissions and summarization feel more explicit and manual

## What Makes Each Agent Unique

### Codex

- best OpenAI Responses implementation detail
- strongest `AGENTS.md` hierarchy semantics
- strongest policy/sandbox engine

### Crush

- strongest prompt-defined persona
- most intentionally terse coding assistant voice
- strong coupling between tool docs and model behavior

### Goose

- most extension-centric
- strongest multi-surface architecture
- unusual permission-judge design combining rules and model inference

### OpenCode

- best event-sourced local-server design
- state-streaming over SSE instead of only token-streaming
- strong separation between provider stream, persisted state, and client rendering

### KiloCode

- strongest product identity layer on top of OpenCode
- explicit Kilo personality prompt
- strongest IDE-aware context shaping

### Pi Mono

- cleanest provider abstraction
- strongest extensibility through prompts, skills, and extensions
- most deliberate cross-provider replay safety

### OpenCode-arch

- useful historical baseline
- clear older-generation chat-completions coding-agent loop

## Practical Takeaways For `buli`

For `buli`, the most valuable patterns to copy now are:

0. Decide the behavior architecture before rewriting
   `packages/engine/src/systemPrompt.ts`.
   - The new companion docs are `docs/agent-behavior-architecture.md` and
     `docs/buli-agent-behavior-blueprint.md`.
   - The main lesson from the examples is that system-prompt text is only one
     layer of behavior.

1. Add a richer provider event model.
   - `buli` currently flattens provider output to `text_chunk` and `completed`.
   - The modern examples all normalize richer events before the UI sees them.

2. Parse OpenAI Responses reasoning summary events explicitly.
   - Good references: `codex`, `opencode`, `kilocode`, `pi-mono`.

3. Keep reasoning continuity metadata even if the UI only shows a summary.
   - Good references: `codex`, `crush`, `pi-mono`, `kilocode`.

4. Separate provider streaming from UI streaming.
   - Good references: `opencode`, `kilocode`, `goose`.

5. Introduce typed assistant parts or an equivalent internal structure before adding tools.
   - Good references: `opencode`, `kilocode`, `crush`, `pi-mono`.

6. Decide deliberately how much personality should come from prompts versus runtime policy.
   - `crush` is the clearest example of a prompt-dominant product.
   - `codex` is the clearest example of a policy-heavy runtime.

7. Treat instruction loading, tool descriptions, approval posture, and dynamic
   reminders as first-class behavior levers.
   - `opencode` and `kilocode` are the strongest TypeScript examples.
   - `goose` is the clearest runtime-dominant example.

8. Keep stable identity separate from volatile turn context.
   - `kilocode` is the clearest example of this split.
   - `pi-mono` is the clearest example of prompt construction from reusable
      resources.

9. Keep `buli` learning-first instead of copying autonomous coding-agent
   defaults.
   - The runtime loop, tools, and prompt layers should make internals,
     alternatives, and tradeoffs visible.
   - Code changes should remain an agreed apply step.

For the next implementation slice in `buli`, the simplest strong path is:

1. expand provider stream events to include reasoning start/delta/end
2. parse OpenAI Responses reasoning summary SSE chunks
3. render reasoning as transient TUI state above the assistant answer
4. keep the transcript simple for now
5. defer full tool-loop persistence until after the richer event model is stable
