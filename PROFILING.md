# Buli Profiling

This file is the working guide for profiling Buli and comparing performance-sensitive rewrites.

## Goals

- Identify where real usage spends wall-clock time, CPU, memory, and event-loop budget.
- Separate external waits from local CPU work.
- Keep profiling opt-in and safe for normal product behavior.
- Make rewrites measurable with deterministic before/after scenarios.

## Real-Usage Profiling

Use the runtime profiler when exercising the actual CLI, TUI, OpenAI provider, and tools:

```bash
BULI_PROFILE_FILE=profile-runs/real/profile.jsonl BULI_PROFILE_SAMPLE_MS=250 bun --cpu-prof --cpu-prof-md --heap-prof-md apps/cli/src/cli.ts
```

The profile data comes from three sources:

- `profile.jsonl` records Buli diagnostic events, process memory samples, event-loop utilization, and event-loop delay.
- Bun CPU profile markdown identifies sampled CPU stacks.
- Bun heap profile markdown identifies retained object groups and heap size.

Use this for real end-to-end scenarios:

- startup and persisted session hydration
- long markdown-heavy streaming answer
- tool-heavy turn using read, glob, grep, bash, and task
- prompt-context lookup while typing `@` references
- large transcript rendering and scroll behavior
- long manual soak

## Deterministic Rewrite Benchmarks

Use the performance package when comparing baseline code to a rewrite. These scenarios avoid network and terminal variability.

```bash
bun run profile -- --scenario prompt-context-large-tree --output-dir profile-runs/baseline/prompt-context --implementation-label baseline --repeat 5 --warmups 1
```

```bash
bun run profile -- --scenario prompt-context-large-tree --output-dir profile-runs/rewrite/prompt-context --implementation-label rewrite --repeat 5 --warmups 1
```

```bash
bun run profile:compare -- --before profile-runs/baseline/prompt-context/summary.json --after profile-runs/rewrite/prompt-context/summary.json --output profile-runs/prompt-context-comparison.md
```

Available deterministic scenarios:

| Scenario | Measures | Main Code |
| --- | --- | --- |
| `prompt-context-large-tree` | fuzzy miss, fuzzy cache hit, path query, scanned entries, heap delta | `packages/engine/src/prompt-context/*` |
| `transcript-view-model` | cold transcript view-model build, cache reuse, changed visible part | `packages/tui/src/behavior/chatScreenViewModel.ts` |
| `openai-stream-replay` | deterministic SSE parse and provider event projection | `packages/openai/src/provider/stream.ts` |
| `assistant-reducer-replay` | streamed assistant event reducer batches | `packages/chat-session-state/src/assistantTurnEventReducer.ts` |

Every deterministic run writes:

- `summary.json` for machine-readable comparison
- `summary.md` for a human-readable table

## Stable Rewrite Metrics

Compare rewrites by boundary metrics, not by implementation-specific helper names:

- `prompt_context.fuzzy_miss.duration_ms`
- `prompt_context.fuzzy_cache_hit.duration_ms`
- `prompt_context.fuzzy_miss.scanned_entry_count`
- `transcript_view_model.cold_build.duration_ms`
- `transcript_view_model.cached_build.duration_ms`
- `openai_stream_replay.parse.duration_ms`
- `assistant_reducer_replay.batch.p95_duration_ms`
- `*.heap_used_delta_bytes`

If a rewrite changes internal structure but improves these stable metrics without failing behavior tests, it is a measurable improvement.

## Profiling Rules

- Run each scenario with warmups and repeats.
- Keep generated output under `profile-runs/`.
- Use real interactive profiles for product bottlenecks.
- Use deterministic profiles for rewrite comparisons.
- Do not optimize shutdown or setup noise unless it affects real interactive usage.
- Treat a bottleneck as proven only when wall-clock spans, CPU profile, or memory samples point to the same boundary.

## Verification

After changing profiling code or a performance-sensitive rewrite, run:

```bash
bun --filter @buli/performance test
bun --filter @buli/performance typecheck
bun run typecheck
```
