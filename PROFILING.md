# Buli Profiling

This is the command-oriented guide for profiling Buli, comparing performance-sensitive rewrites, and interpreting reports. `PROFILE.md` explains what to measure and which workloads matter.

## Measurement State

Fresh baseline targets:

```text
profile-runs/measurements/manual-working-set-baseline/profile.jsonl
profile-runs/measurements/manual-working-set-baseline/profile-report.md
profile-runs/current/
```

Current deterministic summaries after a fresh run:

```text
profile-runs/current/prompt-context/summary.md
profile-runs/current/transcript/summary.md
profile-runs/current/openai-stream/summary.md
profile-runs/current/reducer/summary.md
profile-runs/current/task-subagent/summary.md
profile-runs/current/sqlite/summary.md
profile-runs/current/tool-output/summary.md
profile-runs/current/codebase-knowledge/summary.md
profile-runs/current/assistant-markdown-render-sections/summary.md
```

`profile-runs/` is local ignored output. Keep only current runs unless an older run is needed for an active before/after comparison. If these files are missing, rerun the commands below before making optimization claims.

## Real-Usage Profiling

Run from the repository root in a real terminal TTY:

```bash
bun run profile:manual -- --output-dir profile-runs/measurements/manual-working-set-baseline --sample-ms 250
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

### Task Subagent Routing Overrides

Task subagent completed reports stay complete and uncapped. Use routing overrides to compare speed/cost tradeoffs without hiding parent-visible evidence:

```bash
BULI_TASK_SUBAGENT_MODEL=gpt-5.4 BULI_TASK_SUBAGENT_MAX_REASONING_EFFORT=medium bun run profile:manual -- --output-dir profile-runs/measurements/manual-subagent-routing --sample-ms 250
BULI_TASK_SUBAGENT_MODEL=gpt-5.4 BULI_TASK_SUBAGENT_MAX_REASONING_EFFORT=high bun run profile:manual -- --output-dir profile-runs/measurements/manual-subagent-routing-high --sample-ms 250
```

- `BULI_TASK_SUBAGENT_MODEL` forces the model used for task-subagent provider turns.
- `BULI_TASK_SUBAGENT_MAX_REASONING_EFFORT` clamps explicit parent reasoning effort for task subagents. Valid values are `none`, `minimal`, `low`, `medium`, `high`, and `xhigh`.
- Provider/account model availability is not checked at startup; use the model override as the rollback/tuning path.
- Compare reports by checking task-subagent `Model`/`Effort` columns, `Executor` versus `Parent Result`, checkpoint/failure details, largest task-result sizes, wall-clock task attribution, and report quality. A higher effort/model A/B is useful only after the report shows whether parent-visible checkpoint failures remain.

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
bun run profile -- --scenario assistant-markdown-render-sections --output-dir profile-runs/current/assistant-markdown-render-sections --implementation-label current --repeat 8 --warmups 1
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
| `codebase-knowledge-startup-index` | full startup indexing, unchanged restart reuse, runtime changed-file refresh, JSON records read/parse/stringify/write attribution, single-file reindexing, mtime-only hash reuse, snapshot write skipping, index size, and heap delta | `packages/engine/src/codebaseKnowledge/*`, `packages/codebase-knowledge/src/*` |
| `assistant-markdown-render-sections` | cold markdown section builds, append-only streaming updates, completion promotion, stable section reuse, streaming tail count, and heap delta | `packages/tui/src/components/primitives/assistantMarkdownRenderSectionBuilder.ts` |

## Task-Completion Evals

Mocked task-completion evals gate working-set projection changes (the moderate tier in `2026-05-26-performance-optimization-design.md`). They drive the real engine, real tools, and the real OpenAI request building through a scripted model that only uses evidence visible in the post-projection request body:

```bash
bun run eval -- --output-dir profile-runs/evals/baseline --implementation-label baseline
BULI_OPENAI_CROSS_STEP_TOOL_RESULT_REFERENCES=1 bun run eval -- --output-dir profile-runs/evals/cross-step-on --implementation-label cross-step-on
```

Run a single eval with `--eval <name>`. Available evals: `eval-file-exploration`, `eval-multi-file-edit`, `eval-debugging`, `eval-long-tool-chain`, `eval-subagent-delegation`.

Gate metrics per eval:

- `eval.<name>.task_completion_failure_count` fails above 0.
- `eval.<name>.recovery_tool_call_count` warns above 0 and fails above 4; recovery calls are explicit re-reads the scripted model issued because exact evidence was compacted out of the request.
- `eval.<name>.total_function_output_bytes_sent` and `eval.<name>.max_request_body_bytes` measure the byte side of the trade.

A projection change passes the gate when every eval completes with the change enabled and the byte metrics improve enough to justify any added recovery calls. Eval summaries are `summary.json`/`summary.md` like deterministic profiles, so `bun run profile:compare` works on them.

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
- `task_subagent_runtime.parent_task_result_text_bytes` (observed size only; no warn/fail budget because completed task reports are intentionally uncapped)
- `task_subagent_runtime.checkpoint_elapsed_ms`
- `task_subagent_runtime.parent_visible_failed_task_result_count` (fails above `0`)
- `task_subagent_runtime.requested_tools_after_checkpoint_failure_count` (fails above `0`)
- `task_subagent_runtime.checkpoint_completed_task_result_count`
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
- `codebase_knowledge_startup_index.changed_file_refresh.duration_ms`
- `codebase_knowledge_startup_index.changed_file_refresh.engine_refresh.duration_ms`
- `codebase_knowledge_startup_index.changed_file_refresh.repository.records_read.duration_ms`
- `codebase_knowledge_startup_index.changed_file_refresh.repository.records_json_parse.duration_ms`
- `codebase_knowledge_startup_index.changed_file_refresh.repository.records_schema_parse.duration_ms`
- `codebase_knowledge_startup_index.changed_file_refresh.repository.records_json_stringify.duration_ms`
- `codebase_knowledge_startup_index.changed_file_refresh.repository.records_write_temporary_file.duration_ms`
- `codebase_knowledge_startup_index.changed_file_refresh.memory_delta_*_bytes`
- `codebase_knowledge_startup_index.*.parsed_file_count`
- `codebase_knowledge_startup_index.*.snapshot_read.duration_ms`
- `codebase_knowledge_startup_index.*.records_load.duration_ms`
- `codebase_knowledge_startup_index.*.records_loaded_count`
- `codebase_knowledge_startup_index.*.workspace_scan.duration_ms`
- `codebase_knowledge_startup_index.*.snapshot_write.duration_ms`
- `codebase_knowledge_startup_index.*.snapshot_write_skipped_count`
- `assistant_markdown_render_sections.cold_build.duration_ms`
- `assistant_markdown_render_sections.initial_streaming_build.duration_ms`
- `assistant_markdown_render_sections.streaming_updates.p95_duration_ms`
- `assistant_markdown_render_sections.streaming_updates.max_duration_ms`
- `assistant_markdown_render_sections.completion_promotion.duration_ms`
- `assistant_markdown_render_sections.stable_section_reference_reuse_count`
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
- OpenAI request size contributors
- OpenAI working-set visibility reasons, evidence IDs, exact/duplicate-reference projection counts, saved bytes, and largest provider-visible input items
- tool attribution by payload, wait, execution, and bash approval wait
- task subagent attribution by per-call executor duration, parent-visible result kind, checkpoint/failure details, parent wait, concurrent-group wall time, selected model/effort, largest task results, and subagent slot wait
- request/context growth summaries
- compaction impact summaries
- TUI render summaries
- SQLite storage summaries
- Codebase Knowledge changed-file refresh and JSON repository operation-step attribution
- top diagnostic event durations and counts

## Interpreting Reports

Use report sections as a decision tree:

| Symptom | Evidence To Check | Likely Boundary |
| --- | --- | --- |
| High elapsed turn time with low CPU deltas | `OpenAI Response Steps`, retry/rate-limit events, `provider_turn.summary` | OpenAI/model/network waiting |
| Many `TimeoutError` transport retries | `OpenAI Retries And Timeouts`, `response_step.transport_retry_scheduled`, `response_step.summary.requestAttemptCount` | OpenAI first-byte wait or network stall |
| High `task` execution total, failed parent-visible task results, or checkpoint failures | `Task Subagent Attribution`, `Tool Attribution`, task-only `tool_call.concurrent_group_finished` | subagent runtime, routing quality, or checkpoint compliance |
| Many response steps and huge request bodies | `response_step.summary.requestBodyTextLength`, `provider_turn.summary.maxRequestBodyTextLength`, `OpenAI Request Size Contributors`, `OpenAI Working-Set Visibility` | context growth, large tool schemas, tool-result replay growth, or current-turn evidence volume |
| Need to know why model-visible items are present | `OpenAI Working-Set Visibility` reason rows, evidence IDs, exact/duplicate-reference counts, saved bytes, and projection-kind table | provider-visible working-set diagnostics; same-request duplicates of at least 8,192 characters become references while an earlier exact copy stays visible, and cross-step replay aggregation is not implemented |
| Large `toolResultTextLength` or `maxToolResultTextLength` | `response_step.summary`, `conversation_turn.summary`, `OpenAI Request Size Contributors`, `OpenAI Working-Set Visibility` | tool output volume |
| Individual tool results are capped but totals keep growing | `conversation_turn.summary.totalToolResultTextLength`, `Request And Context Growth` | aggregate tool-output accumulation |
| Context usage reaches the soft budget | `OpenAI Context Guard`, `response_step.continuation_context_guard_triggered`, `conversation_compaction.completed` | guard-triggered continuation and compaction |
| High event-loop delay with moderate CPU | `process_sample.eventLoopDelayMaxMs`, top diagnostic durations | synchronous local work or heavy rendering/storage |
| High render commit count or duration | `TUI Render` | React/OpenTUI render churn |
| Slow appends, loads, or switches | `SQLite Storage` | session persistence |
| RSS or heap spike after edit/write/patch/patch_many | `Codebase Knowledge`, `codebase_knowledge.file_mutation_refresh_completed`, repository step rows | changed-file refresh, records JSON load/parse/stringify/write, or workspace patch capture |
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
- Heap attribution requires a Bun heap artifact; JSONL records process-level memory samples only. Codebase Knowledge memory deltas are boundary samples, not proof of retained live objects.
- Per-call task execution and wait totals can overcount elapsed time when task calls run in parallel.
- Aggregate tool-result and provider replay growth can still accumulate across many calls.
- Request size contributor diagnostics are emitted only when response-step diagnostics are enabled; they intentionally report sizes and item kinds, not raw content.

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
