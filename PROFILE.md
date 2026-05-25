# Buli Profiling Plan

See `PROFILING.md` for the current command-oriented profiling workflow and deterministic rewrite benchmark setup. This file keeps the broader investigation plan and profiling checklist.

## Goal

Build an evidence-based answer to one question:

Where does Buli spend time and memory during real use, and what should be improved first?

The profile must separate three different costs:

- Wall-clock waiting, such as network, model generation, rate-limit cooldowns, tool approval, subprocesses, filesystem calls, and SQLite writes.
- CPU work, such as stream parsing, reducer updates, markdown/render-section building, React/OpenTUI rendering, diff rendering, and JSON/schema parsing.
- Memory pressure, such as growing conversation state, transcript render data, OpenAI request/replay items, markdown render caches, tool results, and retained session data.

CPU profiles alone cannot answer where the app waits. We need CPU samples, heap/RSS snapshots, event-loop stall data, and timed spans around async boundaries.

## Questions To Answer

- Which part of an assistant turn dominates elapsed time?
- How much time is spent waiting for OpenAI versus local work?
- How much time is spent waiting for tool execution, tool-result continuation, bash approval, retries, rate limits, or concurrency slots?
- Which packages and functions consume the most CPU during streaming?
- Which UI components drive render churn during long transcripts?
- How does memory grow with transcript size, tool output size, and session hydration?
- Does SQLite session persistence add visible latency during streaming or tool-heavy turns?
- Does prompt-context lookup stay bounded while typing in large workspaces?
- Are there event-loop stalls that explain frozen input or delayed rendering?

## Current State

Buli is a Bun 1.3.12 TypeScript monorepo. The current interactive runtime path is:

```text
CLI entry
  -> interactive chat composition
  -> OpenTUI React screen
  -> chat app controller
  -> chat-session reducer state
  -> assistant runtime
  -> OpenAI provider
  -> streamed provider events
  -> assistant response events
  -> reducer updates
  -> React/OpenTUI transcript render
```

Important package boundaries:

- `apps/cli` owns command dispatch, startup wiring, auth/session setup, SQLite session persistence, provider resolution, diagnostic file logging, and HTML export.
- `packages/tui` owns OpenTUI React rendering, transcript rendering, keyboard/paste handling, prompt UI, selection panes, and render snapshot diagnostics.
- `packages/chat-app-controller` owns renderer-neutral app effects, assistant turn relay, prompt submission, session operations, model selection, prompt-context refresh, compaction, export, and interruption.
- `packages/chat-session-state` owns reducer state for prompt, transcript, model selection, slash commands, prompt context, sessions, reasoning display, and approvals.
- `packages/engine` owns provider-independent assistant runtime, conversation history, tool execution, approvals, prompt-context expansion, subagents, compaction, workspace snapshots, and shell execution.
- `packages/openai` owns auth, model list loading, Responses API requests, streaming SSE parsing, retry/rate-limit coordination, tool-call continuation, and provider protocol support.

Existing diagnostics already cover useful lifecycle points:

- `apps/cli/src/commands/chat.ts` logs startup phases such as auth, session load, renderer load, and initial render.
- `packages/tui/src/behavior/useChatScreenController.ts` logs transcript, prompt, and status render snapshots.
- `packages/engine/src/runtime.ts` and related runtime files log conversation turn lifecycle, provider events, assistant events, and tool-call events.
- `packages/openai/src/provider/*` logs stream, retry, rate-limit, request, response, and provider-turn events.
- `apps/cli/src/diagnostics/diagnosticFileLogger.ts` writes diagnostics when `BULI_CONSOLE_LOG_FILE` is set.

Existing performance docs identify prior hotspot classes:

- `docs/performance-and-stability-summary.md` records previous fixes around streaming markdown rendering, reducer scans, prompt-context search, transcript measurement, engine conversation projection, and OpenAI stream dispatch.
- `docs/transcript-layout-profiling.md` documents manual transcript soak scenarios and basic macOS process sampling commands.

Current uncertainty:

- There is not yet one end-to-end profile that explains full elapsed time, CPU, RAM, event-loop delay, and component-level cost across realistic Buli workflows.
- Current diagnostic file logging is synchronous. It is useful for correctness and lifecycle traces, but it can distort high-volume streaming profiles if used as the only measurement channel.

## Main Wait Boundaries

Measure these as explicit timed spans because CPU sampling will mostly show the process idle while they wait:

- OpenAI auth load and refresh.
- OpenAI model-list requests.
- OpenAI response-step slot acquisition in `OpenAiRateLimitCoordinator`.
- OpenAI HTTP retries and retry delays in `openAiHttpRetry.ts`.
- OpenAI fetch and first-byte wait in `OpenAiProviderConversationTurn`.
- OpenAI SSE read waits in `stream.ts`.
- Tool-result waits after provider tool-call requests in `turnSession.ts`.
- Bash approval waits in `runtimeBashToolCallExecution.ts`.
- Bash child process execution in `workspaceShellCommandExecutor.ts`.
- Read-only tool concurrency waits in `RuntimeReadOnlyToolCallConcurrencyLimiter`.
- Subagent concurrency waits in `RuntimeSubagentConversationConcurrencyLimiter`.
- Filesystem reads, recursive directory walks, and large-file line windows.
- Ripgrep subprocess execution and fallback JavaScript search.
- SQLite transactions during session entry append, session switching, compaction, and session hydration.
- Prompt-context candidate catalog scans and cache reuse.
- TUI frame/render work after assistant response batches flush.

## Main CPU Boundaries

Measure these with Bun CPU profiles and focused spans:

- OpenAI SSE frame parsing and event dispatch.
- Provider stream translation into assistant response events.
- Chat-session reducer batches in `applyAssistantResponseEventsToChatSessionState`.
- Conversation transcript view-model construction in `chatScreenViewModel.ts`.
- Conversation message preparation in `ConversationMessageList.tsx`.
- Markdown render-section building in `assistantMarkdownRenderSectionBuilder.ts`.
- OpenTUI markdown, code fence, diff, table, and list rendering.
- Tool output summarization and result text construction.
- JSON stringify/parse for OpenAI request bodies, provider replay, diagnostics, and SQLite entries.
- SQLite schema/query work during startup and session switching.

## Main Memory Boundaries

Measure both process RSS and heap snapshots:

- Conversation session entries in `InMemoryConversationHistory`.
- Provider-facing OpenAI input items and replay items in `OpenAiProviderConversationTurn`.
- Chat-session transcript maps and ordered ID arrays.
- TUI visible row caches and markdown render-section caches.
- Tool results, grep/glob matches, read outputs, bash output, and workspace patch summaries.
- SQLite-loaded persisted sessions and hydrated transcript data.
- Prompt-context recursive snapshots.

## Baseline Commands

Run from the repository root.

```bash
bun --cpu-prof --cpu-prof-md --heap-prof --heap-prof-md apps/cli/src/cli.ts
```

Use Bun's generated CPU and heap profile files to identify obvious CPU and memory hotspots.

Find the active process during a manual run:

```bash
ps -axo pid,ppid,%cpu,%mem,etime,stat,command | rg "bun|buli|cli.ts"
```

Inspect top CPU users:

```bash
top -l 1 -o cpu -n 15
```

Sample a hot process on macOS:

```bash
sample <pid> 1 1
```

Optional diagnostic log for lifecycle traces:

```bash
BULI_CONSOLE_LOG_FILE=/tmp/buli-profile/diagnostics.log BULI_CONSOLE_LOG_RESET=1 bun run start:cli
```

Use diagnostic logging for lower-volume lifecycle correlation. Do not treat it as a neutral streaming benchmark because every diagnostic event writes synchronously to disk.

## Recommended Instrumentation

If baseline profiles do not explain waits clearly, add an opt-in profiler behind environment variables.

Suggested environment variables:

- `BULI_PROFILE_FILE=/tmp/buli-profile/profile.jsonl` enables profile event output.
- `BULI_PROFILE_SAMPLE_MS=250` controls process sampling frequency.
- `BULI_PROFILE_RENDER=1` enables TUI render and markdown-render-section spans.
- `BULI_PROFILE_PROVIDER=1` enables OpenAI provider spans.
- `BULI_PROFILE_TOOLS=1` enables tool execution spans.

Suggested event model:

```ts
type BuliProfileEvent =
  | { type: "span_started"; spanId: string; name: string; subsystem: string; atMs: number }
  | { type: "span_finished"; spanId: string; name: string; subsystem: string; atMs: number; durationMs: number; fields?: Record<string, string | number | boolean | null> }
  | { type: "process_sample"; atMs: number; rssBytes: number; heapUsedBytes: number; heapTotalBytes: number; externalBytes: number; cpuUserMicros: number; cpuSystemMicros: number }
  | { type: "event_loop_delay"; atMs: number; delayMs: number };
```

Implementation constraints:

- Keep profiling opt-in and off by default.
- Buffer writes and flush periodically so profiling does not become the hotspot.
- Use explicit typed models instead of `any`.
- Redact or omit prompt text, tool output text, auth tokens, and raw response bodies.
- Prefer sizes, counts, IDs, statuses, and durations over raw content.
- Use monotonic timing for spans where practical.
- Avoid adding dependencies unless a built-in Bun or Node API cannot provide the signal.

## Workloads

Run every workload at least twice. Treat the first run as warm-up when caches, auth, SQLite WAL, and module loading may change results.

### Startup And Hydration

Purpose:

Measure CLI startup, auth load, SQLite active-session lookup, persisted session entry load, renderer load, and first render.

Steps:

- Start `buli` with an empty active session.
- Start `buli` with a small active session.
- Start `buli` with a large persisted session.
- Compare startup timing diagnostics and heap/RSS after first render.

### Long Streaming Answer

Purpose:

Measure OpenAI wait time, SSE parsing, reducer batch cost, markdown render-section building, and TUI render churn.

Prompt shape:

```text
Give a long markdown-heavy explanation with headings, lists, tables, shell snippets, TypeScript code fences, and a unified diff example.
```

Signals:

- Time to first assistant event.
- Time to first visible text.
- SSE frame count and text delta count.
- Assistant response event batch count and batch duration.
- Markdown render-section build duration.
- Event-loop stalls while streaming.
- RSS and heap growth after completion.

### Tool-Heavy Turn

Purpose:

Measure read/search/bash/tool-result waits and continuation overhead.

Prompt shape:

```text
Inspect this repository using read, glob, grep, and bash. Summarize architecture and run a safe command that prints version information.
```

Signals:

- Time spent waiting for each tool.
- Read-only concurrency queue wait duration.
- Ripgrep duration and fallback usage.
- Bash child process duration.
- Provider tool-result wait duration.
- OpenAI continuation step count.

### Prompt Context Lookup

Purpose:

Measure `@` search responsiveness and prompt-context candidate catalog behavior.

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

Purpose:

Measure transcript view-model, row preparation, markdown rendering, scroll behavior, and memory growth.

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

Purpose:

Detect runaway CPU, memory leaks, and gradually increasing render cost.

Steps:

- Run Buli for 20 to 30 minutes.
- Alternate between long answers, tool-heavy turns, prompt-context search, and scrolling.
- Sample RSS, heap, CPU, and event-loop delay throughout.

Signals:

- Memory slope over time.
- CPU after work settles.
- Event-loop stalls after long sessions.
- Responsiveness of typing and scrolling.

## Report Format

Every profiling run should produce a short report with these sections.

### Run Metadata

- Git commit or working tree description.
- Bun version.
- OS and hardware.
- Command used.
- Environment variables used.
- Workload description.
- Session size before the run.

### Wall-Clock Breakdown

Use a table like this:

| Rank | Boundary | Duration Ms | Percent Of Turn | Evidence |
| --- | ---: | ---: | ---: | --- |
| 1 | OpenAI model/stream wait | TBD | TBD | Provider spans |
| 2 | Tool execution | TBD | TBD | Tool spans |
| 3 | TUI render/update | TBD | TBD | Render spans and CPU profile |

### CPU Hotspots

Use a table like this:

| Rank | Package | Function Or Stack | CPU Share | Evidence |
| --- | --- | --- | ---: | --- |
| 1 | `packages/tui` | TBD | TBD | Bun CPU profile |

### Memory Summary

Use a table like this:

| Component | Before | Peak | After Settled | Notes |
| --- | ---: | ---: | ---: | --- |
| Process RSS | TBD | TBD | TBD | `process.memoryUsage()` and `ps` |
| Heap used | TBD | TBD | TBD | Heap profile |

### Event-Loop Health

- Worst observed stall.
- P95 stall if sampled.
- Whether stalls correlate with streaming, markdown, session hydration, search, or SQLite writes.

### Findings

Rank findings by user-visible impact and confidence.

For each finding include:

- What is slow or memory-heavy.
- Why it matters.
- Evidence from profile output.
- Likely root cause.
- Smallest correct improvement.
- Verification command or scenario.

## Success Criteria

The profiling work is complete when we can answer:

- Which boundaries account for most wall-clock turn time.
- Which code paths account for most CPU time while the app is active.
- Which objects or components account for meaningful memory growth.
- Whether the TUI is blocked by local CPU work or mostly waiting on external systems.
- Which improvement should be implemented first and why.

The final answer should be based on measured evidence, not assumptions.
