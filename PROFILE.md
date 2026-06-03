# Buli Profiling Plan

`PROFILING.md` is the command-oriented guide. This file defines what to measure, which workloads matter, and what evidence is required before choosing a performance change.

## Goal

Answer one question with evidence:

Where does Buli spend time and memory during real use, and what should be improved first?

Every profile should separate:

- Wall-clock waiting: OpenAI/model generation, network, retries, rate limits, tool execution, approval waits, subprocesses, filesystem calls, and SQLite writes.
- CPU work: SSE parsing, event translation, reducer batches, markdown/render-section work, React/OpenTUI rendering, diff rendering, JSON parsing/stringifying, and SQLite query work.
- Memory pressure: conversation history, transcript state, OpenAI request/replay items, tool outputs, render caches, prompt-context snapshots, and hydrated persisted sessions.

CPU profiles alone are not enough. Use timed spans, process samples, event-loop delay, RSS/heap snapshots, and optional Bun CPU/heap artifacts.

## Measurement State

Fresh baseline targets:

- Real interactive profile: `profile-runs/measurements/manual-working-set-baseline/`
- Deterministic profile root: `profile-runs/current/`

Important deterministic summaries after a fresh run:

- `profile-runs/current/prompt-context/summary.md`
- `profile-runs/current/transcript/summary.md`
- `profile-runs/current/openai-stream/summary.md`
- `profile-runs/current/reducer/summary.md`
- `profile-runs/current/task-subagent/summary.md`
- `profile-runs/current/sqlite/summary.md`
- `profile-runs/current/tool-output/summary.md`
- `profile-runs/current/codebase-knowledge/summary.md`

`profile-runs/` is ignored by git. Treat these paths as local measurement state, not durable project history. If the files are missing, rerun the commands in `PROFILING.md` before making optimization claims.

## Runtime Path

The interactive path to profile is:

```text
CLI entry
  -> interactive chat composition
  -> OpenTUI React screen
  -> chat app controller
  -> chat-session reducer state
  -> assistant runtime
  -> provider implementation
  -> streamed provider events
  -> assistant response events
  -> reducer updates
  -> React/OpenTUI transcript render
```

Main package boundaries:

- `apps/cli`: command dispatch, startup wiring, auth/session setup, SQLite persistence, provider resolution, profiling/logging, and export.
- `packages/tui`: OpenTUI rendering, transcript rendering, prompt UI, keyboard/paste handling, selection panes, and render diagnostics.
- `packages/chat-app-controller`: renderer-neutral app effects, assistant turn relay, prompt submission, sessions, model selection, prompt context, compaction, export, and interruption.
- `packages/chat-session-state`: reducer state for prompt, transcript, model selection, slash commands, prompt context, sessions, reasoning display, and approvals.
- `packages/engine`: assistant runtime, conversation history, tool execution, approvals, prompt-context expansion, subagents, compaction, workspace snapshots, and shell execution.
- `packages/openai`: auth, model list loading, Responses API requests, streaming SSE parsing, retry/rate-limit coordination, tool-call continuation, and provider protocol support.
- `packages/performance`: deterministic profiles, manual profile wrapper, report generation, and profile comparison.

## Wait Boundaries

Measure these as timed spans because CPU sampling usually shows the process idle while they wait:

- OpenAI auth load and refresh.
- OpenAI model-list requests.
- OpenAI response-step slot acquisition.
- OpenAI HTTP retries, retry delays, and retry budget exhaustion.
- OpenAI response-step fetch and first-byte wait.
- OpenAI SSE read waits.
- Provider tool-result waits after tool-call requests.
- Bash approval waits.
- Bash subprocess execution.
- Read-only tool concurrency waits.
- Subagent concurrency waits.
- Task subagent execution and task-only concurrent-group wall time.
- Filesystem reads, recursive directory walks, and large-file windows.
- Ripgrep subprocess execution and fallback JavaScript search.
- SQLite transactions for appends, loads, switches, compaction, and hydration.
- Codebase knowledge startup indexing, unchanged restart reuse, and changed-file refresh.
- Prompt-context candidate scans and cache reuse.
- TUI frame/render work after assistant response batches flush.

## CPU Boundaries

Use Bun CPU profiles and deterministic scenarios for:

- OpenAI SSE frame parsing and event dispatch.
- Provider stream translation into assistant response events.
- Chat-session reducer batches.
- Transcript view-model construction.
- Conversation message preparation.
- Markdown render-section building.
- OpenTUI markdown, code fence, diff, table, and list rendering.
- Tool output formatting and summarization.
- JSON stringify/parse for OpenAI requests, provider replay, diagnostics, and SQLite entries.
- SQLite schema/query work.
- Tree-sitter parsing and codebase knowledge index JSON merge/write work.

## Memory Boundaries

Use RSS samples and heap snapshots for:

- Conversation session entries.
- OpenAI input items and provider replay items.
- Chat-session transcript maps and ordered IDs.
- TUI visible row caches and markdown render-section caches.
- Tool results and workspace patch summaries.
- SQLite-loaded sessions and hydrated transcript data.
- Prompt-context recursive snapshots.
- Codebase knowledge records, indexed-file metadata, and workspace-local index JSON.

## Workloads

Run each workload at least twice. Treat the first run as warm-up when caches, auth, SQLite WAL, module loading, and prompt-context snapshots may change results.

### Startup And Hydration

Purpose: measure CLI startup, auth load, SQLite active-session lookup, persisted session load, renderer load, and first render.

Steps:

- Start with an empty active session.
- Start with a small active session.
- Start with a large persisted session.
- Compare startup timings, RSS, and heap after first render.
- Include a larger indexed workspace and compare full codebase knowledge indexing with unchanged restart reuse.

Signals:

- Full codebase knowledge startup index duration.
- Unchanged restart duration and parsed-file count.
- Single modified-file restart duration and parsed-file count.
- Mtime-only restart duration and parsed-file count.
- Snapshot read and workspace scan duration.
- Records-load duration and records-loaded count.
- Snapshot write duration and skipped-write count.
- Codebase knowledge index size and heap delta.

### Long Streaming Answer

Purpose: measure OpenAI wait, SSE parsing, reducer batch cost, markdown rendering, and TUI render churn.

Prompt shape:

```text
Give a long markdown-heavy explanation with headings, lists, tables, shell snippets, TypeScript code fences, and a unified diff example.
```

Signals:

- Time to first assistant event.
- Time to first visible text.
- SSE frame count and text delta count.
- Assistant response batch count and duration.
- Render commit count and duration.
- Event-loop stalls while streaming.
- RSS and heap growth after completion.

### Tool-Heavy Turn

Purpose: measure read/search/bash/tool-result waits, provider continuation overhead, and request-size contributor diagnostics.

Prompt shape:

```text
Inspect this repository using read, glob, grep, and bash. Summarize architecture and run a safe command that prints version information.
```

Signals:

- Time spent waiting for each tool.
- Read-only concurrency queue wait duration.
- Ripgrep duration and fallback usage.
- Bash approval and child process duration.
- Provider tool-result wait duration.
- OpenAI continuation step count.
- Tool-result and request body growth.
- Largest OpenAI request size contributors by serialized byte length.
- Provider-visible working-set visibility reasons, evidence IDs, exact projection counts, and shadow saved bytes.

### Task Subagents

Purpose: measure subagent runtime, parent tool-result wait, concurrent group wall time, checkpoint behavior, and subagent result size.

Signals:

- Per-call task execution duration.
- Task-only concurrent group wall time.
- Parent tool-result wait duration.
- Subagent slot wait duration.
- Checkpoint count, reason, elapsed time, and post-checkpoint behavior.
- Task result text length.

### Prompt Context Lookup

Purpose: measure `@` search responsiveness and candidate catalog behavior.

Steps:

- Type a path-like `@packages/tui/...` query.
- Type a fuzzy query that scans many entries.
- Repeat the same fuzzy query within the snapshot TTL.
- Repeat after the snapshot TTL expires.

Signals:

- Candidate load duration.
- Recursive scan count and entry count.
- Cache hit versus miss.
- UI responsiveness while candidates load.

### Large Transcript Rendering

Purpose: measure transcript view-model, row preparation, markdown rendering, scroll behavior, and memory growth.

Steps:

- Hydrate a long persisted transcript.
- Stream a new long assistant response at the bottom.
- Scroll away from newest while the response continues.
- Reveal older messages.

Signals:

- Visible message count and visible part count.
- Hidden message count.
- Render snapshot frequency.
- Frame duration and event-loop delay.
- RSS and heap growth per additional transcript size.

### Manual Soak

Purpose: detect runaway CPU, memory leaks, and gradually increasing render cost.

Steps:

- Run Buli for 20 to 30 minutes.
- Alternate between long answers, tool-heavy turns, task subagents, prompt-context search, and scrolling.
- Sample RSS, heap, CPU, and event-loop delay throughout.

Signals:

- Memory slope over time.
- CPU after work settles.
- Event-loop stalls after long sessions.
- Responsiveness of typing, interruption, and scrolling.

## Profiling Rules

- Keep profiling opt-in and off by default.
- Use buffered JSONL profiling for high-volume runs.
- Use synchronous diagnostic file logging only for low-volume lifecycle correlation.
- Redact or omit prompt text, tool output text, auth tokens, and raw response bodies.
- Prefer IDs, statuses, counts, sizes, and durations over raw content.
- Prefer monotonic timing for new spans where practical.
- Avoid dependencies unless Bun or Node cannot provide the signal.
- Treat a bottleneck as proven only when wall-clock spans, CPU profiles, or memory samples point to the same boundary.

## Success Criteria

Profiling is useful when it can answer:

- Which boundaries account for most wall-clock turn time.
- Which code paths account for most CPU time while active.
- Which objects or components account for meaningful memory growth.
- Whether the TUI is blocked by local CPU work or mostly waiting on external systems.
- Which request parts and model-visible items dominate OpenAI request size.
- Why provider-visible items are included, which raw evidence IDs they relate to when available, and whether diagnostics show replay pressure without implying evidence was dropped.
- Which improvement should be implemented first and why.

The final answer must be based on measured evidence, not assumptions.
