# Buli Performance Optimization Design

Make Buli faster by optimizing only the boundaries that fresh profiles prove are expensive, while preserving correctness and auditability.

## Purpose

This document is the optimization decision record. `PROFILE.md` defines what must be measured. `PROFILING.md` defines how to generate fresh evidence.

Do not treat old local numbers as current truth. `profile-runs/` is ignored local output and can be deleted at any time. Before choosing a performance change, regenerate the deterministic profiles and run a real interactive profile for the relevant workload.

## Evidence Status

Current fresh baseline targets:

- Deterministic profiles: `profile-runs/current/`
- Real interactive profile: `profile-runs/measurements/manual-working-set-baseline/`

Required deterministic summaries:

- `profile-runs/current/prompt-context/summary.md`
- `profile-runs/current/transcript/summary.md`
- `profile-runs/current/openai-stream/summary.md`
- `profile-runs/current/reducer/summary.md`
- `profile-runs/current/task-subagent/summary.md`
- `profile-runs/current/sqlite/summary.md`
- `profile-runs/current/tool-output/summary.md`
- `profile-runs/current/codebase-knowledge/summary.md`

The previous hardcoded bottleneck numbers are intentionally removed from this document. Reintroduce numeric claims only by pointing to a current profile report or deterministic summary.

## Core Working-Set Principle

Buli stores raw conversation and tool evidence as canonical audit history, but provider requests are built from the smallest model-visible working set that preserves correctness.

That means:

- Raw session history remains the source of truth for transcript, recovery, export, diagnostics, and future audited projection.
- Provider requests should contain current user intent, active instructions, recent relevant evidence, failure-recovery context, and compact summaries.
- Historical large or repeated tool outputs should become evidence cards with stable IDs, metadata, hashes when available, visible excerpts, and explicit omission notices.
- Full raw evidence remains stored even when the model-visible projection is compact.
- Current-turn evidence stays exact throughout one assistant/tool-calling loop; compact evidence notes are for later user turns, not for hiding evidence the model just read while it is still answering.

The target shape is:

```text
tool / subagent / assistant event
  -> store raw session entry
  -> derive evidence metadata
  -> choose model-visible projection for this provider step
  -> send compact working set to model
```

## Optimization Criteria

Rank optimization candidates by these criteria:

1. Correctness preservation.
2. Measured wall-clock impact.
3. Measured request/context byte reduction.
4. Interactive responsiveness impact.
5. Memory and GC pressure reduction.
6. Implementation simplicity and reversibility.
7. Validation quality.

Provider round-trip count and model-visible request size usually dominate micro-optimizations. Local hot-path work still matters when it blocks typing, rendering, scrolling, interruption, or startup.

## Measurement Plan

Use deterministic profiles for repeatable boundaries and manual profiles for product reality.

Fresh deterministic baseline:

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

Fresh manual baseline:

```bash
bun run profile:manual -- --output-dir profile-runs/measurements/manual-working-set-baseline --sample-ms 250
```

Suggested manual workload:

1. Long markdown-heavy answer.
2. Tool-heavy repository inspection.
3. Task subagents.
4. Prompt-context search.
5. Scrolling during streaming.

## Current Diagnostics To Use First

Before changing context projection, check these report sections:

- `OpenAI Response Steps`: provider step count, HTTP wait, stream time, request construction time.
- `OpenAI Request Size Contributors`: largest stable request parts and input items by serialized byte length.
- `Request And Context Growth`: request and context growth across the turn.
- `Tool Attribution`: tool-result payload and wait time by tool.
- `Task Subagent Attribution`: subagent execution time, parent wait, concurrent-group wall time, and result size.
- `TUI Render`: render duration and churn.
- `SQLite Storage`: append/load/switch/compaction persistence cost.
- `Process Peaks`: RSS, heap, CPU, and event-loop delay.

The `OpenAI Request Size Contributors` section is the first filter for working-set optimization. It answers whether the largest visible contributor is stable request scaffolding, tool definitions, current-turn function outputs, historical/failure evidence, reasoning, or assistant/user messages.

## Model-Visible Working-Set Rules

### 1. Raw session history is canonical

Do not use the provider request as the source of truth. Store raw evidence first, then derive model-visible projections.

### 2. Every visible item needs a visibility reason

Each provider-request item should fit one of these reasons:

- `active_user_intent`
- `active_instructions`
- `current_turn_evidence`
- `recent_decision_context`
- `failure_recovery_context`
- `compaction_summary`
- `explicit_user_referenced_context`

If an item has no reason, it should not be sent.

### 3. Completed historical turns are conclusion-first

Completed older turns should usually project to:

```text
user prompt
final assistant answer
```

Do not replay old raw tool output by default. Include capped evidence only for recovery, explicit user reference, or unresolved work.

### 4. Fresh evidence stays exact during the current assistant turn

For current-turn tool results:

```text
first submission -> exact result visible
next continuation -> same exact result remains visible
later same-turn continuations -> exact result remains visible until the assistant answer completes
```

After a later user message, Buli should rely on bounded evidence memory such as BuliStickyNotes by default: what was read, why it was read, what was found, and when fresh source should be reread. Raw historical evidence remains stored for audit/recovery, but it is not replayed forever as full text unless the next task needs fresh exact evidence.

### 5. Historical tool output should become evidence cards

A model-visible evidence card should include:

```ts
type ModelVisibleEvidenceCard = {
  evidenceId: string
  toolName: string
  status: "completed" | "failed" | "denied"
  subject: string
  byteCount: number
  contentHash?: string
  visibleExcerpt: string
  omittedReason?: string
  omittedCharacterCount?: number
}
```

The raw result remains stored separately.

### 6. Metadata survives truncation

Even when content is omitted, preserve metadata such as path, line range, query, match count, command, exit code, byte count, omission count, and raw-storage status.

### 7. Duplicate evidence becomes a reference when valid

Across later turns, if the model already saw equivalent evidence and the source is unchanged, return a compact reference instead of repeating content.

Allowed candidates:

- exact same read range,
- same glob query,
- same grep query,
- same locate query,
- same safe read-only bash command when workspace state is unchanged.

Do not reference mutating, non-deterministic, stale, denied, failed, or already-reference results as reusable evidence.

### 8. Recency and relevance beat age alone

Keep fully visible longer:

- current user prompt,
- latest results from the active response step,
- current-turn evidence the assistant may still need to reason from exactly,
- failed tool results that explain a blocked path,
- user-selected or explicitly mentioned files/symbols.

Compact sooner:

- large grep listings,
- historical repeated file reads,
- old successful bash output,
- subagent details after the parent receives a summary,
- provider reasoning/replay older than the active decision point.

### 9. Failed and interrupted turns need capped recovery evidence

Failed/interrupted work may need old tool evidence to recover safely, but not unlimited raw logs. Prefer capped evidence cards over raw transcript blocks.

### 10. Task subagent results are parent-visible summaries

Child transcript and raw tool evidence stay stored. The parent-visible task result should be bounded and structured:

```text
<task_result>
  <subagent>...</subagent>
  <description>...</description>
  <summary>bounded summary</summary>
  <inspected_evidence>...</inspected_evidence>
  <open_questions>...</open_questions>
</task_result>
```

### 11. Compaction is not the first line of defense

Working-set projection should keep requests small before the context guard triggers. Compaction remains the long-session/recovery mechanism.

## Invalidation Rules

Working-set projection is only safe with conservative invalidation.

File evidence invalidates when:

- Buli edits that file.
- A mutating bash command may have touched it.
- A git checkout/reset/clean-like command runs.
- File mtime/hash changes.

Grep/glob evidence invalidates when:

- Any workspace mutation happens.
- Search root changes.
- Ignore rules change.
- Branch/checkout changes.

Bash result references invalidate when:

- The command is not proven read-only.
- Environment or working directory changed in a meaningful way.
- The command depends on time, network, randomness, or external mutable state.

Tool schema/system-prefix caches invalidate when:

- Model changes.
- Provider changes.
- Operating mode changes.
- Enabled tool set changes.
- Project instructions change.
- Skill catalog changes.

## Candidate Buckets

### Verified by fresh profile

Fill this section only after fresh `profile-runs/current/**/summary.md` and manual `profile-report.md` exist.

Template:

```text
- Candidate: ...
  Evidence: profile path + metric
  Expected effect: ...
  Validation: ...
```

### Implemented or no longer relevant

Keep ideas here when source verification shows they are already done or based on an outdated assumption.

Source-verified completed or mostly completed items:

- Request-size contributor diagnostics and OpenAI request-size report sections.
- Per-tool result-size diagnostics and conversation resource summaries.
- Deterministic `tool-output-context-growth` profile coverage and profile-report working-set sections.
- Bash output capping before provider submission.
- Read-only bash patch-capture skipping for auto-run read-only commands.
- SSE frame buffering and response text/function-call chunk accumulation without repeated string concatenation.
- SQLite prepared statement fields on the session gateway hot path.
- Historical completed-turn provider replay projection to user prompt plus final assistant answer.
- Dynamic tool-set filtering by operating mode.
- Workspace-stable prompt cache key behavior.
- Same-step duplicate read-only tool-call coalescing.
- Task subagent context scoping through fresh child conversation history.

Partial caveat: historical failed/interrupted turns and current-turn continuations can still need bounded recovery evidence or compact replay. Task subagent context is scoped, but the parent-visible task result still needs an explicit bounded contract.

### Needs source verification

Use this bucket when an idea sounds plausible but the current source has not been checked recently.

Examples:

- Startup phase parallelization.
- TUI streaming render isolation.
- Git diff batching after mutations.
- HTTP connection reuse or HTTP/2 behavior.
- Request body streaming.
- Input item interning.
- Worker-thread serialization.
- Tree-sitter parser bundling/warm pool.
- SQLite write batching.

### Needs measurement

Use this bucket when source behavior has been checked but the current product impact is unknown.

Examples:

- Current-turn provider replay growth from exact `function_call_output` continuation items.
- Aggregate tool-output accumulation across many read/grep/bash calls after individual caps apply.
- Skill catalog disk parsing and memoization impact.
- Existing subagent scoping, checkpointing, and remaining parent-visible task-result size.
- Prompt-context lookup, TUI render, SQLite hydration, and codebase-knowledge startup costs after fresh deterministic and manual profiles exist.

## Prioritized Working-Set Roadmap

### Conservative: measure and make visibility explainable

These should preserve model-visible meaning and usually do not require task-completion evals:

1. Visibility reasons for provider-request items.
2. Evidence IDs and metadata while preserving full visible text.
3. Cross-step duplicate references only for unchanged evidence already visible in the current working set.
4. Fresh profile annotations that tie each proposed optimization to a `profile-runs/` path and stable metric.

Completed diagnostics that support this tier: request-size contributor diagnostics, per-tool result-size diagnostics, and deterministic/report sections for working-set growth.

### Moderate: compact repeated or stale evidence

These need task-completion evals because they alter model-visible content:

1. Evidence-card projection for large read/grep/bash outputs.
2. Fresh tool result visible once, compact replay later.
3. Adaptive per-tool budgets based on remaining context.
4. Structured, bounded subagent result contract.
5. Failed/interrupted-turn evidence cards instead of raw transcript blocks.

Subagent context scoping itself is already implemented; the remaining risk is the bounded shape and size of the parent-visible result.

### Aggressive: semantic compression and prediction

These need real-model evals:

1. Model-based summarization of large tool results.
2. Sliding-window current-turn replay.
3. Semantic evidence selection.
4. Predictive tool prefetch for safe read-only patterns.
5. Subagent model routing/downgrade.
6. Incremental or two-stage compaction.

## Evaluation Gates

| Tier | Gate | Passes When |
| --- | --- | --- |
| Conservative | Deterministic profiles and focused tests | No behavior regression; request/report diagnostics explain largest contributors. |
| Moderate | Deterministic profiles + mocked task-completion evals | Correctness remains at least 95% of baseline and token/request bytes improve meaningfully. |
| Aggressive | Deterministic profiles + mocked evals + real-model evals | Correctness remains at least 90% of baseline and wall-clock/token cost improves materially. |

Eval categories:

| Category | Task Shape | Risk Covered |
| --- | --- | --- |
| File exploration | Find usages and explain pattern | Evidence-card fidelity and duplicate references. |
| Multi-file edit | Refactor across files | Context continuity after compact replay. |
| Debugging | Find and fix failing test | Failure evidence and recovery context. |
| Long tool chain | Set up module with tests/build | Adaptive budgets and continuation behavior. |
| Subagent delegation | Research with task tools then summarize | Parent-visible subagent result quality. |

## Decision Checklist

Before implementing an optimization, answer:

1. Which current profile proves this boundary is expensive?
2. Is the cost wall-clock wait, local CPU, memory, request bytes, or render responsiveness?
3. Which model-visible content changes, if any?
4. Is raw evidence still stored and auditable?
5. What invalidates cached/referenced evidence?
6. Which deterministic profile or eval will catch a regression?
7. How reversible is the change?

## Stale Idea Appendix

The previous version of this document mixed measured facts, source-specific guesses, and broad optimization ideas. Preserve only ideas that survive source verification and fresh measurement.

Examples of stale-risk statements that must not be repeated as current fact without verification:

- Fixed percentages like "90% of turn time is OpenAI wait".
- Fixed task subagent milliseconds as the current bottleneck.
- Claims that all historical provider replay is included in every future request.
- Claims that bash output is uncapped.
- Claims that SSE streaming still uses quadratic buffer concatenation.
- Claims that SQLite hot paths lack prepared statement caching.

When an old idea is still useful, move it into one of the candidate buckets above with fresh evidence.
