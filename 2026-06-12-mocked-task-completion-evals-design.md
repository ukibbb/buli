# Mocked Task-Completion Evals And Cross-Step Replay References

Design record for the moderate-tier eval gate from `2026-05-26-performance-optimization-design.md` and the first optimization it gates.

## Goals

1. Build the mocked task-completion eval harness required by the moderate evaluation gate.
2. Implement cross-response-step current-turn tool-result replay references behind a default-off flag, gated by those evals.
3. Record the measured explanation of the 2.7 GiB RSS peak from the June 5 manual baseline.

## RSS Peak Attribution (measured)

From `profile-runs/measurements/manual-working-set-baseline/profile.jsonl`:

- At t+576.5s a `patch_many` completion triggered the post-mutation pipeline. Between t+575.9s and t+577.5s RSS rose 711 MiB -> 2,709 MiB, heap 87 MiB -> 865 MiB, external 59 MiB -> 711 MiB, with the run-maximum 302 ms event-loop stall at the same timestamps.
- Workspace snapshot capture shells out to git; subprocess memory does not appear in these process samples. The in-process allocator is the codebase-knowledge changed-file refresh: `refreshChangedFilePaths` rewrites `.buli/index/codebase-knowledge.records.json`, which is 121 MB in this workspace. A 121 MB read + `JSON.parse` + schema parse + `JSON.stringify` + rewrite cycle explains the transient heap/external growth and the stalls.
- `codebase_knowledge.file_mutation_refresh_completed` diagnostics are absent from the baseline because they landed in commit `a745eb2` (June 9), after the baseline was recorded (June 5).
- Heap returned to ~330 MiB by t+582s; RSS stayed at ~2.3 GiB because the allocator does not return freed pages. The persistent RSS is not a live-object leak.
- The deterministic `codebase-knowledge-startup-index` scenario uses a 2.6 MB records fixture (refresh 16.7 ms). The real workspace file is ~46x larger; the scenario fixture understates the production boundary.

Verified candidate recorded for a future change (not implemented here): make the changed-file refresh avoid rewriting the whole monolithic records JSON (sharding, append-log, or SQLite), and raise the deterministic fixture size so the scenario reflects production scale.

## Eval Harness

### Why the mock sits at the OpenAI transport

Working-set projection happens inside `packages/openai` request building (`turnSession.ts`, `openAiCurrentTurnToolResultReplayProjection.ts`). A fake `ConversationTurnProvider` at the engine seam would bypass the code under test. The harness therefore runs:

```text
AssistantConversationRuntime (real engine, real tools, temp workspace)
  -> OpenAiProvider (real request building + projection)
  -> scripted fetchImpl (no network)
  -> scripted model reads the POST body (post-projection input items)
  -> returns SSE built like the cassette fixtures
```

Auth uses `OpenAiAuthStore({ filePath })` pointing at a fixture auth file with a far-future expiry inside the eval temp directory. No real auth or network is touched.

### Scripted model contract

Each eval defines a deterministic scripted model: a function from (request body JSON, prior scripted state) to the next SSE response. The scripted model may only use evidence visible in the current request body — it models a stateless Responses API call. When it needs exact tool-result text, it must extract it from a visible `function_call_output` input item. If the text is not visible exactly, the scripted model behaves like a well-instructed agent: it re-requests the evidence with a fresh tool call (recovery path) instead of hallucinating. Task completion is then asserted on real artifacts: workspace file contents and final assistant answer text.

This makes the gate honest in both directions:

- If projection removes evidence the model still needs, the eval either fails task completion or pays visible recovery tool calls.
- If projection is safe, task completion stays at baseline and recovery counts stay at zero.

### Eval categories (from the design doc gate table)

| Eval | Shape | Risk covered |
| --- | --- | --- |
| `eval-file-exploration` | read a fixture file, answer with a planted fact extracted from the visible tool result | evidence-card fidelity, duplicate references |
| `eval-multi-file-edit` | read two files, edit both in later separate steps using old text extracted from visible read results | context continuity across response steps |
| `eval-debugging` | read failing-test evidence, fix the source file using evidence from two earlier steps | failure evidence and recovery context |
| `eval-long-tool-chain` | many reads across steps; final answer needs facts from the earliest and the largest results | adaptive budgets, continuation behavior |
| `eval-subagent-delegation` | parent task tool; subagent turn gathers a fact; parent answer must use the parent-visible task result | parent-visible subagent result quality |

### Metrics and gate

Each eval emits metrics through the existing `@buli/performance` scenario/budget machinery:

- `eval.<name>.task_completion_failure_count` — budget fails above 0.
- `eval.<name>.recovery_tool_call_count` — extra tool calls the scripted model issued because exact evidence was not visible; warn above 0 by default.
- `eval.<name>.max_request_body_bytes` and `eval.<name>.total_function_output_bytes_sent` — the byte side of the moderate gate ("correctness >= 95% of baseline and bytes improve meaningfully").

Evals are registered in a separate eval registry and run with `bun run eval -- --eval <name> | --all --output-dir profile-runs/evals/<label>`. They reuse the summary.json/summary.md writers so `bun run profile:compare` works on eval outputs.

### Placement

`packages/performance/src/evals/` with a new `eval` script in `packages/performance/package.json` and root `package.json`. The harness reuses `PerformanceScenario` types; evals are scenarios whose budgets encode pass/fail.

## Cross-Step Current-Turn Replay References

### Behavior

Today every current-turn `function_call_output` replays exactly in every same-turn continuation request (1.008 MiB sent across 38 steps in the June 5 baseline against ~311 KiB of unique tool-result text). The new projection, off by default:

- Flag: `BULI_OPENAI_CROSS_STEP_TOOL_RESULT_REFERENCES=1`.
- When building the request for response step N, a current-turn `function_call_output` may be projected to a compact reference only when all hold:
  1. The exact output text was already visible in at least one earlier request of the same provider turn.
  2. The output is at least `OPENAI_CURRENT_TURN_DUPLICATE_TOOL_RESULT_REFERENCE_MIN_CHARACTER_COUNT` (8,192) characters.
  3. The output was first sent in a request at least two steps before N (results from the immediately preceding request stay exact).
  4. The reference text is shorter than the original.
- The reference format extends the existing same-request reference: evidence id, tool call id, content sha256, original character count, a short head excerpt, and an explicit instruction that the exact content was shown in an earlier step of this same turn and must be re-fetched with a fresh tool call if exact text is needed again.
- Raw session history, stored provider-turn replay, and same-request first exact copies are unchanged. Historical-turn projection is unchanged.

### Diagnostics

Projection metadata records `projectionKind: "cross_step_reference"` so the working-set visibility sidecar reports real saved bytes instead of saved-bytes-0.

### Gate

1. All evals pass with the flag off (baseline).
2. All evals pass with the flag on; `task_completion_failure_count` 0; recovery tool calls bounded and byte savings positive (`total_function_output_bytes_sent` falls).
3. Existing openai package unit tests plus new projection unit tests pass.
4. `openai-stream-replay` and `tool-output-context-growth` deterministic profiles show no regression.

Real-model A/B (does encrypted reasoning replay actually carry enough memory) remains required before default-on; the flag default stays off in this change.

### Measured gate results (2026-06-12)

- Flag off: all five evals pass, zero recovery tool calls.
- Flag on: all five evals pass. `eval-multi-file-edit` function-output bytes 93,914 -> 74,282 (-21%); `eval-long-tool-chain` 54,546 -> 44,577 (-18%) with one bounded recovery re-read; the remaining evals are byte-identical because their evidence stays inside the two-request exactness window.
- `bun --filter @buli/openai test` (253 tests), `bun --filter @buli/performance test`, `bun run typecheck`, and `bun run test` pass; `openai-stream-replay` deterministic profile stays within budgets.

## Decision Checklist Answers

1. Evidence: `manual-working-set-baseline/profile-report.md` — OpenAI Replay Input Age: current-turn function output 1.008 MiB sent vs 311 KiB unique; OpenAI wait dominates turn time, so request bytes are the lever.
2. Cost kind: request bytes (and provider processing time proportional to input size).
3. Model-visible change: same-turn later-step replay of large, already-shown tool results becomes a reference card; gated by flag.
4. Raw evidence: unchanged, stored exactly.
5. Invalidation: references only ever point within the same provider turn; a new user turn or compaction rebuilds projection state from scratch.
6. Regression net: eval harness (this change), openai unit tests, deterministic profiles.
7. Reversibility: env flag, default off; removal is deleting one projection branch.
