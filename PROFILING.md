# Buli Profiling

This is the command-oriented guide for profiling Buli, comparing performance-sensitive rewrites, and interpreting reports. `PROFILE.md` explains what to measure and which workloads matter.

## Latest Measurements

Latest real profile:

```text
profile-runs/measurements/manual-after-task-elapsed-checkpoint/profile.jsonl
profile-runs/measurements/manual-after-task-elapsed-checkpoint/profile-report.md
```

Latest deterministic profile root:

```text
profile-runs/current/
```

Current deterministic summaries:

```text
profile-runs/current/prompt-context/summary.md
profile-runs/current/transcript/summary.md
profile-runs/current/openai-stream/summary.md
profile-runs/current/reducer/summary.md
profile-runs/current/task-subagent/summary.md
profile-runs/current/sqlite/summary.md
profile-runs/current/tool-output/summary.md
```

`profile-runs/` is local ignored output. Keep only current runs unless an older run is needed for an active before/after comparison.

## Real-Usage Profiling

Run from the repository root in a real terminal TTY:

```bash
bun run profile:manual -- --output-dir profile-runs/manual --sample-ms 250
```

Use a run-specific output directory under `profile-runs/measurements/` when comparing changes:

```bash
bun run profile:manual -- --output-dir profile-runs/measurements/manual-current --sample-ms 250
```

Add Bun CPU and heap artifacts when local CPU work or retained heap is suspected:

```bash
bun run profile:manual -- --output-dir profile-runs/measurements/manual-current --sample-ms 250 --with-bun-profiles
```

Manual profiling starts the interactive CLI with `BULI_PROFILE_FILE` and `BULI_PROFILE_SAMPLE_MS`, then writes `profile-report.md` next to `profile.jsonl` when the session exits cleanly.

If a manual run produces `profile.jsonl` but no report, generate it directly:

```bash
bun run profile:report -- --profile profile-runs/measurements/manual-current/profile.jsonl --output profile-runs/measurements/manual-current/profile-report.md
```

Print a report without writing a file:

```bash
bun run profile:report -- --profile profile-runs/measurements/manual-current/profile.jsonl
```

Optional low-volume lifecycle log:

```bash
BULI_CONSOLE_LOG_FILE=/tmp/buli-profile/diagnostics.log BULI_CONSOLE_LOG_RESET=1 bun run start:cli
```

Do not treat synchronous diagnostic file logging as a neutral streaming benchmark.

## Deterministic Profiles

Run deterministic profiles for touched boundaries:

```bash
bun run profile -- --scenario prompt-context-large-tree --output-dir profile-runs/current/prompt-context --implementation-label current --repeat 5 --warmups 1
bun run profile -- --scenario transcript-view-model --output-dir profile-runs/current/transcript --implementation-label current --repeat 5 --warmups 1
bun run profile -- --scenario openai-stream-replay --output-dir profile-runs/current/openai-stream --implementation-label current --repeat 5 --warmups 1
bun run profile -- --scenario assistant-reducer-replay --output-dir profile-runs/current/reducer --implementation-label current --repeat 5 --warmups 1
bun run profile -- --scenario task-subagent-runtime --output-dir profile-runs/current/task-subagent --implementation-label current --repeat 5 --warmups 1
bun run profile -- --scenario sqlite-session-large-history --output-dir profile-runs/current/sqlite --implementation-label current --repeat 3 --warmups 1
bun run profile -- --scenario tool-output-context-growth --output-dir profile-runs/current/tool-output --implementation-label current --repeat 5 --warmups 1
bun run profile -- --scenario codebase-knowledge-startup-index --output-dir profile-runs/current/codebase-knowledge --implementation-label current --repeat 3 --warmups 1
```

Every deterministic run writes:

- `summary.json` for machine-readable comparison.
- `summary.md` for a human-readable table.

Available deterministic scenarios:

| Scenario | Measures | Main Code |
| --- | --- | --- |
| `prompt-context-large-tree` | fuzzy miss, fuzzy cache hit, path query, scanned entries, heap delta | `packages/engine/src/prompt-context/*` |
| `transcript-view-model` | cold transcript view-model build, cache reuse, changed visible part | `packages/tui/src/behavior/chatScreenViewModel.ts` |
| `openai-stream-replay` | deterministic SSE parse and provider event projection | `packages/openai/src/provider/stream.ts` |
| `assistant-reducer-replay` | streamed assistant event reducer batches | `packages/chat-session-state/src/assistantTurnEventReducer.ts` |
| `task-subagent-runtime` | deterministic task subagent execution, elapsed checkpointing, parent wait, group wall time, and result payload shape | `packages/engine/src/runtimeTaskToolCallExecution.ts`, `packages/engine/src/runtimeToolCallExecution.ts` |
| `sqlite-session-large-history` | append, load, list, and switch costs for a large persisted SQLite session | `apps/cli/src/conversationSession/sqlite/*` |
| `tool-output-context-growth` | model-context projection, compaction projection, provider replay pressure, and budgeted batch-tool output size | `packages/engine/src/conversationHistoryProjection.ts`, `packages/engine/src/conversationCompaction/*`, `packages/engine/src/tools/*` |
| `codebase-knowledge-startup-index` | full startup indexing, unchanged restart reuse, single-file reindexing, mtime-only hash reuse, snapshot write skipping, index size, and heap delta | `packages/engine/src/codebaseKnowledge/*`, `packages/codebase-knowledge/src/*` |

## Before/After Comparisons

Run the same scenario before and after a rewrite:

```bash
bun run profile -- --scenario prompt-context-large-tree --output-dir profile-runs/baseline/prompt-context --implementation-label baseline --repeat 5 --warmups 1
```

```bash
bun run profile -- --scenario prompt-context-large-tree --output-dir profile-runs/rewrite/prompt-context --implementation-label rewrite --repeat 5 --warmups 1
```

Compare summaries:

```bash
bun run profile:compare -- --before profile-runs/baseline/prompt-context/summary.json --after profile-runs/rewrite/prompt-context/summary.json --output profile-runs/prompt-context-comparison.md
```

Compare stable boundary metrics, not implementation-specific helper names.

## Stable Metrics

Use these metrics when judging rewrites:

- `prompt_context.fuzzy_miss.duration_ms`
- `prompt_context.fuzzy_cache_hit.duration_ms`
- `prompt_context.fuzzy_miss.scanned_entry_count`
- `transcript_view_model.cold_build.duration_ms`
- `transcript_view_model.cached_build.duration_ms`
- `openai_stream_replay.parse.duration_ms`
- `assistant_reducer_replay.batch.p95_duration_ms`
- `task_subagent_runtime.turn.duration_ms`
- `task_subagent_runtime.task_execution.duration_ms`
- `task_subagent_runtime.task_group_wall_time.duration_ms`
- `task_subagent_runtime.parent_task_result_wait.duration_ms`
- `task_subagent_runtime.checkpoint_elapsed_ms`
- `sqlite_session_large_history.load_entries.duration_ms`
- `sqlite_session_large_history.switch_session.duration_ms`
- `tool_output_context_growth.model_context_projection.duration_ms`
- `tool_output_context_growth.compaction_projection.duration_ms`
- `tool_output_context_growth.read_tool_result_text_bytes`
- `tool_output_context_growth.grep_tool_result_text_bytes`
- `codebase_knowledge_startup_index.full.duration_ms`
- `codebase_knowledge_startup_index.unchanged_restart.duration_ms`
- `codebase_knowledge_startup_index.modified_file_restart.duration_ms`
- `codebase_knowledge_startup_index.mtime_only_restart.duration_ms`
- `codebase_knowledge_startup_index.*.parsed_file_count`
- `codebase_knowledge_startup_index.*.snapshot_read.duration_ms`
- `codebase_knowledge_startup_index.*.records_load.duration_ms`
- `codebase_knowledge_startup_index.*.records_loaded_count`
- `codebase_knowledge_startup_index.*.workspace_scan.duration_ms`
- `codebase_knowledge_startup_index.*.snapshot_write.duration_ms`
- `codebase_knowledge_startup_index.*.snapshot_write_skipped_count`
- `*.heap_used_delta_bytes`

## Report Contents

`bun run profile:report` reports:

- process peaks
- suspected bottleneck ranking
- process sample attribution to active conversation turns
- profiler self-overhead
- conversation turn summaries
- OpenAI provider-turn and response-step summaries
- OpenAI retry, timeout, and rate-limit summaries
- OpenAI context-guard summaries
- tool attribution by payload, wait, execution, and bash approval wait
- task subagent attribution by per-call duration, parent wait, concurrent-group wall time, and subagent slot wait
- request/context growth summaries
- compaction impact summaries
- TUI render summaries
- SQLite storage summaries
- top diagnostic event durations and counts

## Interpreting Reports

Use report sections as a decision tree:

| Symptom | Evidence To Check | Likely Boundary |
| --- | --- | --- |
| High elapsed turn time with low CPU deltas | `OpenAI Response Steps`, retry/rate-limit events, `provider_turn.summary` | OpenAI/model/network waiting |
| Many `TimeoutError` transport retries | `OpenAI Retries And Timeouts`, `response_step.transport_retry_scheduled`, `response_step.summary.requestAttemptCount` | OpenAI first-byte wait or network stall |
| High `task` execution total with high `task` wait | `Task Subagent Attribution`, `Tool Attribution`, task-only `tool_call.concurrent_group_finished` | subagent runtime |
| Many response steps and huge request bodies | `response_step.summary.requestBodyTextLength`, `provider_turn.summary.maxRequestBodyTextLength` | context growth or tool-result replay growth |
| Large `toolResultTextLength` or `maxToolResultTextLength` | `response_step.summary`, `conversation_turn.summary` | tool output volume |
| Individual tool results are capped but totals keep growing | `conversation_turn.summary.totalToolResultTextLength`, `Request And Context Growth` | aggregate tool-output accumulation |
| Context usage reaches the soft budget | `OpenAI Context Guard`, `response_step.continuation_context_guard_triggered`, `conversation_compaction.completed` | guard-triggered continuation and compaction |
| High event-loop delay with moderate CPU | `process_sample.eventLoopDelayMaxMs`, top diagnostic durations | synchronous local work or heavy rendering/storage |
| High render commit count or duration | `TUI Render` | React/OpenTUI render churn |
| Slow appends, loads, or switches | `SQLite Storage` | session persistence |
| High profiler overhead | `Profiler Logger` | profiling distortion from event volume |
| Memory growth across a run | `Process Peaks`, request/context growth summaries | retained transcript, tool output, replay, or render data |

## Manual Run Metadata

For meaningful comparisons, record:

- Git commit or working tree description.
- Bun version.
- OS and hardware.
- Command used.
- Environment variables used.
- Workload description.
- Session size before the run.

Compare manual profiles only when workloads are similar. Longer tool-heavy runs naturally increase aggregate request and replay totals.

## Useful Shell Checks

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

## Known Blind Spots

- SQLite diagnostics measure store-level operations, not each individual query.
- CPU and memory samples are attributed to an active turn only when exactly one turn is running.
- Bun CPU and heap artifacts are opt-in because they can distort runtime cost.
- Heap attribution requires a Bun heap artifact; JSONL records process-level memory samples only.
- Per-call task execution and wait totals can overcount elapsed time when task calls run in parallel.
- Aggregate tool-result and provider replay growth can still accumulate across many calls.

## Profiling Rules

- Run scenarios with warmups and repeats.
- Keep generated output under `profile-runs/`.
- Use real interactive profiles for product bottlenecks.
- Use deterministic profiles for rewrite comparisons.
- Do not optimize shutdown or setup noise unless it affects real interactive use.
- Treat a bottleneck as proven only when wall-clock spans, CPU profiles, or memory samples point to the same boundary.

## Verification

After changing profiling code or performance-sensitive runtime code, run:

```bash
bun --filter @buli/performance test
bun --filter @buli/performance typecheck
bun --filter @buli/cli typecheck
bun --filter @buli/tui typecheck
bun run typecheck
bun run test
bun run build:cli
```

Regenerate and verify schemas if contracts changed:

```bash
bun --filter @buli/contracts schema:contracts
bun --filter @buli/contracts test
```
