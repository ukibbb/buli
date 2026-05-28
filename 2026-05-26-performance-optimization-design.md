# Buli Performance Optimization Design

Make buli the most performant AI agent by systematically optimizing every measured performance boundary, tiered by risk level, with per-model configuration.

## Context

Profiling evidence from `PROFILE.md` and `PROFILING.md` establishes the current bottleneck stack:

- ~90% of turn time is OpenAI network/model wait (7.7s response steps, 4.8s stream, 1.9s HTTP wait).
- Task subagents are the #2 bottleneck (897ms/call execution, 626ms/call parent wait).
- Tool-result and replay accumulation compound context growth, making each successive response step slower.
- Local pipeline (TUI, SQLite, reducer) accounts for <5% of turn time but directly affects interactive responsiveness.

The measurement infrastructure (6 deterministic benchmarks, manual JSONL profiler, report generator) is mature and ready to validate optimizations.

## Goals

- Lowest total turn time (wall clock from prompt to final response).
- Best interactive responsiveness (time-to-first-token, no UI freezes, smooth scrolling).
- Lowest token cost per turn (smaller contexts, fewer continuation steps).
- All dimensions prioritized by measured impact.

## Constraints

- Optimizations must be configurable per model via optimization profiles.
- Three risk tiers (conservative, moderate, aggressive) as separate implementation phases.
- Validation: deterministic benchmarks for conservative, task-completion evals for moderate/aggressive, manual profiles for all.
- Profiling must remain opt-in and off by default.
- No new package dependencies unless a built-in API cannot provide the signal.

## Architecture: Per-Boundary Targeted Optimizations

No new abstraction layer. Each performance boundary is optimized independently. Each boundary has conservative/moderate/aggressive variants selected by configuration per model.

### Optimization Boundaries

| # | Boundary | Profiled Signal | Impact |
|---|----------|----------------|--------|
| 1 | Context & replay growth | Request body grows monotonically across response steps | ~90% (indirect — larger requests = slower responses) |
| 2 | Response-step round-trips | Each continuation adds HTTP wait + stream + replay | ~90% (direct — fewer steps = less wall time) |
| 3 | Task subagent execution | 897ms/call execution, 626ms/call parent wait | 10-30% in tool-heavy turns |
| 4 | Tool-result accumulation | Uncapped bash, 32KB batch tools, aggregate growth | Compounds with #1 |
| 5 | Local pipeline | TUI rendering, SQLite, reducer, event-loop | <5% of turn time |

Bash approval wait is user-gated and not directly optimizable. Bash output capping is covered under boundary 4 (C11).

### Tier Definitions

| Tier | Principle | Context Fidelity | Requires Eval |
|------|-----------|-----------------|---------------|
| Conservative | Never change model-visible context | 100% preserved | No |
| Moderate | Allow lossy transformations that are measurably safe | ~90-95% preserved | Yes |
| Aggressive | Prioritize speed and cost | ~70-85% preserved | Yes |

### Per-Model Configuration

```ts
type OptimizationTier = "conservative" | "moderate" | "aggressive"

type ModelOptimizationProfile = {
  modelIdPattern: string | RegExp
  contextGrowth: OptimizationTier
  roundTrips: OptimizationTier
  taskSubagents: OptimizationTier
  toolResults: OptimizationTier
  localPipeline: OptimizationTier
}
```

Lives in the engine layer. Each provider maps its models to profiles. Default profile for unknown models is conservative across all boundaries. Users can override via configuration. The engine resolves the active profile at turn start and passes the relevant tier to each boundary's optimization logic.

## Boundary 1: Context & Replay Growth Reduction

### Conservative

**C1. Request template caching.** Stable request body parts (model, instructions, tools, reasoning config) are identical across response steps in a turn. Serialize once at turn start. Currently `createOpenAiResponsesHttpRequestBodyFromTemplate` rebuilds the full object on every step.

**C2. Incremental request body size tracking.** Replace `JSON.stringify(requestBody).length` on every step with incremental size accounting: track the size delta of newly appended items. Only full-serialize when diagnostics explicitly request it.

**C3. Input item interning.** Intern repeated input items by content hash so they share references. Reduces GC pressure and serialization cost.

**C4. Prompt cache key stability.** Ensure ordering of conversation input items, system prompt, and tool definitions stays deterministic and prefix-stable across response steps to maximize OpenAI prompt cache hits.

### Moderate

**M1. Mid-turn reasoning replay pruning.** After step N, strip reasoning summary items from steps older than N-2. Reasoning items are large and provide diminishing value as the turn progresses. Keep the last 2 steps' reasoning for continuity.

**M2. Tool-result replay truncation.** Truncate tool results replayed into subsequent response steps to a configurable budget (default 4KB). The model already saw the full result in the step it was produced. Include a truncation marker.

**M3. Proactive context guard.** Lower the soft budget trigger from 80% to a per-model threshold (e.g., 65%). Add a growth-rate heuristic: if the last 3 steps each grew context by >10%, trigger earlier.

**M4. Stale entry deprioritization.** Truncate tool-result text from turns older than a configurable window before including them in the request body. Not full compaction — just text truncation of old tool results.

### Aggressive

**A1. Mid-turn tool-result summarization.** Summarize tool results using a fast model before replaying into the next response step. A 32KB result becomes ~500 chars.

**A2. Sliding window replay.** Only keep replay items from the last N response steps (default 3). Evict all replay items from older steps.

**A3. Request body streaming.** Stream the JSON request body to the HTTP connection. Serialize the stable prefix once, then incrementally append new items. Reduces peak memory and time-to-first-byte.

**A4. Predictive context budgeting.** Use observed context growth pattern to predict remaining tool calls before budget. Expose as a system hint to the model ("you have ~N tool calls remaining").

## Boundary 2: Response-Step & Round-Trip Reduction

### Conservative

**C5. Tool result submission pipelining.** Submit each tool result to the provider immediately on completion rather than waiting for all concurrent tools to finish. The provider has results ready when the next step begins.

**C6. HTTP connection reuse.** Keep the HTTP connection alive across response steps within a turn. Eliminate TCP/TLS setup latency (~50-150ms per step).

**C7. Tool definition compaction.** Minimize tool schema serialized size. Strip redundant descriptions, cache the serialized tool block across steps.

### Moderate

**M5. Prompt-guided tool batching.** Add system prompt instructions encouraging the model to batch related tool calls into a single response rather than sequential calls. Model-specific guidance.

**M6. Tool-result ordering for cache stability.** Order tool results to match tool call order in the response, maximizing prompt cache prefix depth.

**M7. Speculative connection warmup.** When tool calls are dispatched, open an HTTP connection to OpenAI in the background (TCP + TLS only). Saves ~100-200ms per step.

### Aggressive

**A5. Predictive tool prefetch.** Analyze tool-call patterns and speculatively execute likely next read-only tool calls before the model requests them. Cache results, serve instantly on hit.

**A6. Multi-step planning injection.** Inject a planning prompt before tool-heavy tasks: model lists all needed tool calls upfront, execute in a single parallel batch, return all results in one continuation.

**A7. Streaming result overlap.** Start the next response step request while the last tool result is still streaming. Include a placeholder, amend when available. Provider-specific hook.

## Boundary 3: Task Subagent Optimization

### Conservative

**C8. Subagent startup fast path.** Cache and share immutable runtime context (tool definitions, project instructions, workspace state) from the parent instead of rebuilding per subagent.

**C9. Concurrent group wall-time attribution.** Surface parallelism utilization in the optimization profile to detect when subagent slots are underutilized.

**C10. Subagent result size cap.** Cap final result text submitted to parent's provider at a configurable budget (default 64KB). Full result stays in child session for diagnostics.

### Moderate

**M8. Soft elapsed-time checkpoints.** Each subagent gets a time budget (default 120s). At tool-call boundaries, check elapsed time. Over budget: emit summary and yield to parent.

**M9. Incremental result streaming.** Stream intermediate checkpoints to the parent's provider early. Parent model can begin its next step while the subagent continues. Provider-specific hook.

**M10. Subagent prompt sharpening.** Inject model-specific efficiency guidance into subagent task descriptions: token/time budget awareness, batched tool-call encouragement, relevant parent context.

### Aggressive

**A8. Subagent result summarization.** Summarize subagent results using a fast model before including in parent context. 50KB result becomes ~1KB summary.

**A9. Dynamic concurrency scaling.** Scale subagent concurrency based on system load (CPU, memory, event-loop delay). Light load: up to 16 slots. Pressure: reduce to 4.

**A10. Subagent priority scheduling.** Prioritize queued tasks by estimated value: shorter tasks first, explicitly critical tasks, tasks needed for parent's next decision. Optional `priority` field in task tool schema.

## Boundary 4: Tool-Result Accumulation

### Conservative

**C11. Bash output cap.** Add a configurable cap (default 32KB) matching grep. Truncate with head/tail retention, omission marker, and continuation guidance.

**C12. Per-tool result size diagnostics.** Emit per-tool-name size histogram in turn summary to surface which tool type dominates context growth.

**C13. Tool-result text pooling.** Detect when the same file content appears in multiple tool results within a turn by content hash. Store once, reference in subsequent results.

### Moderate

**M11. Adaptive per-tool budgets.** Compute per-tool budgets based on remaining context capacity. Early in turn: larger budgets (64KB). As context fills: smaller budgets (8KB).

**M12. Cross-call result deduplication.** Track file paths and content ranges already provided. On re-read, return a short reference instead of repeating content.

**M13. Structured tool-result format.** Separate metadata (path, range, count) from content. Metadata always included; content truncated under budget pressure.

### Aggressive

**A11. Tool-result eviction.** Replace tool results not referenced in the last 3 response steps with one-line summaries.

**A12. Streaming tool-result summarization.** For results above 8KB, summarize before including in context. Full result stored in session history.

**A13. Reference-based duplicate results.** Keep intentional tool results model-visible, but return compact references for repeated read-only requests whose prior result is still visible and still valid. Do not add an on-demand recall tool.

## Boundary 5: Local Pipeline

### Conservative

**C14. Lazy SQLite persistence.** Batch SQLite writes on a debounced interval (500ms) or at turn boundaries instead of synchronous per-entry appends. In-memory history is the source of truth during a turn.

**C15. Incremental view-model updates.** When a single assistant text delta arrives, recalculate only the affected message's view-model, not the entire transcript.

**C16. Render batching alignment.** Throttle assistant response event batch flushing to match the TUI's target frame rate. Prevent render churn when events arrive faster than the terminal can display.

### Moderate

**M14. Deferred markdown rendering.** During streaming, only render the visible portion of the markdown response. Content above the viewport gets a placeholder until the user scrolls back.

**M15. SQLite WAL checkpoint scheduling.** Schedule WAL checkpoints during idle periods. Increase auto-checkpoint threshold during active turns to avoid event-loop stalls.

**M16. Reducer batch coalescing.** Widen the coalescing window during high-frequency streaming to combine multiple events into a single reducer dispatch.

### Aggressive

**A14. Worker-thread serialization.** Move JSON serialization of objects >100KB to a worker thread via structured clone + postMessage. Keeps JSON.stringify off the event loop.

**A15. Virtual transcript rendering.** For transcripts >100 messages, only maintain React component instances within a viewport buffer. Messages outside are unmounted and replaced with height placeholders.

**A16. Speculative session hydration.** Overlap session hydration with renderer loading and first render on startup. Prompt is available immediately; hydration finishes in background.

## Evaluation Framework

### New Benchmark Scenarios

| Scenario | Measures | Validates |
|----------|----------|-----------|
| `replay-growth-multi-step` | Request body size across 5-10 simulated response steps with tool results | C1-C4, M1-M4, A1-A3 |
| `tool-result-accumulation` | Aggregate tool-result text across 20-40 mixed tool calls | C11-C13, M11-M13, A11-A13 |
| `subagent-startup-overhead` | Time from task dispatch to first subagent provider request | C8-C9 |
| `request-construction-step` | Request body construction time/memory at various context sizes | C1-C3, A3 |
| `connection-reuse-latency` | HTTP connection setup vs reuse across sequential response steps | C6, M7 |

### Task-Completion Eval Suite

| Category | Task Shape | Tests |
|----------|-----------|-------|
| File exploration | "Find all usages of X and explain the pattern" | Tool-result fidelity after truncation/summarization |
| Multi-file edit | "Refactor function X across 5 files" | Context continuity after replay pruning |
| Debugging | "This test fails — find and fix the bug" | Reasoning trace quality after eviction |
| Long tool chain | "Set up a new module with tests, lint, and build" | Turn completion after context guard changes |
| Subagent delegation | "Research X using task tools, then summarize" | Subagent result quality after capping/summarization |

Eval mechanics: scripted scenarios with known-correct outcomes. Score binary pass/fail plus token usage and wall-clock time. Tier passes eval if correctness ≥95% of baseline across suite and no individual eval drops below 80%.

Eval infrastructure lives in `packages/performance/src/evals/`. Supports deterministic (mocked provider) and real (live API) modes.

### Regression Gates

| Tier | Gate | Passes When |
|------|------|-------------|
| Conservative | Deterministic benchmarks | All scenarios pass P95 budgets. No regression >5% from baseline. |
| Moderate | Benchmarks + mocked evals | Benchmark gates pass. Eval correctness ≥95% of baseline. Token usage reduced ≥15%. |
| Aggressive | Benchmarks + mocked + real evals | Moderate gates pass. Real eval correctness ≥90% of baseline. Wall-clock time reduced ≥30%. |

### Profiling Integration

Each optimization emits diagnostic events using the existing `BuliProfileEvent` system. New `diagnostic_event` subtypes for: replay pruning decisions, tool-result budget adjustments, deduplication hits, subagent checkpoint triggers, connection reuse, render batch coalescing. The report generator gets new sections for optimization-specific diagnostics.

## Implementation Order

Phase 1 — Conservative tier across all boundaries. No eval needed. Benchmark-validated.

Phase 2 — Moderate tier. Requires task-completion eval suite first. Eval-validated before merge.

Phase 3 — Aggressive tier. Requires real-model evals. Extensive validation before merge.

Within each phase, implement in boundary order (1 → 2 → 3 → 4 → 5) since earlier boundaries have higher measured impact.

## Optimization Index

| ID | Boundary | Tier | Summary |
|----|----------|------|---------|
| C1 | Context growth | Conservative | Request template caching |
| C2 | Context growth | Conservative | Incremental request body size tracking |
| C3 | Context growth | Conservative | Input item interning |
| C4 | Context growth | Conservative | Prompt cache key stability |
| C5 | Round-trips | Conservative | Tool result submission pipelining |
| C6 | Round-trips | Conservative | HTTP connection reuse |
| C7 | Round-trips | Conservative | Tool definition compaction |
| C8 | Task subagents | Conservative | Subagent startup fast path |
| C9 | Task subagents | Conservative | Concurrent group wall-time attribution |
| C10 | Task subagents | Conservative | Subagent result size cap |
| C11 | Tool results | Conservative | Bash output cap |
| C12 | Tool results | Conservative | Per-tool result size diagnostics |
| C13 | Tool results | Conservative | Tool-result text pooling |
| C14 | Local pipeline | Conservative | Lazy SQLite persistence |
| C15 | Local pipeline | Conservative | Incremental view-model updates |
| C16 | Local pipeline | Conservative | Render batching alignment |
| M1 | Context growth | Moderate | Mid-turn reasoning replay pruning |
| M2 | Context growth | Moderate | Tool-result replay truncation |
| M3 | Context growth | Moderate | Proactive context guard |
| M4 | Context growth | Moderate | Stale entry deprioritization |
| M5 | Round-trips | Moderate | Prompt-guided tool batching |
| M6 | Round-trips | Moderate | Tool-result ordering for cache stability |
| M7 | Round-trips | Moderate | Speculative connection warmup |
| M8 | Task subagents | Moderate | Soft elapsed-time checkpoints |
| M9 | Task subagents | Moderate | Incremental result streaming |
| M10 | Task subagents | Moderate | Subagent prompt sharpening |
| M11 | Tool results | Moderate | Adaptive per-tool budgets |
| M12 | Tool results | Moderate | Cross-call result deduplication |
| M13 | Tool results | Moderate | Structured tool-result format |
| M14 | Local pipeline | Moderate | Deferred markdown rendering |
| M15 | Local pipeline | Moderate | SQLite WAL checkpoint scheduling |
| M16 | Local pipeline | Moderate | Reducer batch coalescing |
| A1 | Context growth | Aggressive | Mid-turn tool-result summarization |
| A2 | Context growth | Aggressive | Sliding window replay |
| A3 | Context growth | Aggressive | Request body streaming |
| A4 | Context growth | Aggressive | Predictive context budgeting |
| A5 | Round-trips | Aggressive | Predictive tool prefetch |
| A6 | Round-trips | Aggressive | Multi-step planning injection |
| A7 | Round-trips | Aggressive | Streaming result overlap |
| A8 | Task subagents | Aggressive | Subagent result summarization |
| A9 | Task subagents | Aggressive | Dynamic concurrency scaling |
| A10 | Task subagents | Aggressive | Subagent priority scheduling |
| A11 | Tool results | Aggressive | Tool-result eviction |
| A12 | Tool results | Aggressive | Streaming tool-result summarization |
| A13 | Tool results | Aggressive | Reference-based duplicate results |
| A14 | Local pipeline | Aggressive | Worker-thread serialization |
| A15 | Local pipeline | Aggressive | Virtual transcript rendering |
| A16 | Local pipeline | Aggressive | Speculative session hydration |

## Phase-Enforced Agent Workflow

Beyond per-boundary optimizations, enforce an **Understand -> Plan -> Implementation** workflow at the runtime level. The current UI already lets the user cycle these modes with Tab. The runtime should make that sequence real instead of relying on prompt wording alone.

### Chosen Runtime Shape

- Use the existing modes as separate provider turns: `understand`, `plan`, and `implementation`.
- Share context through the existing conversation session history. Plan sees Understanding, and Implementation sees Plan plus relevant Understanding evidence.
- Do not delete, hide, or externalize intentional code reads behind a recall mechanism. If the model intentionally read code, that code remains in model-visible history until normal compaction.
- Add a lightweight deterministic ledger to the system context so the model can see what has already been inspected before requesting more tools.
- Add duplicate read-only tool-call suppression at the tool layer so repeated requests return compact references instead of repeated content.

### Tool Availability Per Mode

**Understand mode:**
- Available tools: `read`, `grep`, `glob`, read-only `task`, and `skill`.
- Unavailable: `edit`, `edit_many`, `write`, `patch`, `patch_many`, and `bash`.
- Purpose: understand the system, inspect relevant files, explain mechanics, and align on the intended outcome.

**Plan mode:**
- Available tools: same read-only inspection tools as Understand.
- Unavailable: mutation tools and `bash`.
- Purpose: turn the Understanding context into an executable plan with exact files, intended changes, risks, and verification commands.

**Implementation mode:**
- Available tools: all assistant tools allowed by the current runtime policy.
- Purpose: execute the agreed plan, mutate files as needed, and verify behavior.
- Re-reads are allowed after relevant mutations because prior file-read evidence becomes stale.

### Sequence Enforcement

- `understand` can always start a new workflow slice.
- `plan` is allowed only after a completed `understand` turn or while continuing a `plan` turn.
- `implementation` is allowed only after a completed `plan` turn or while continuing an implementation/auto-compaction turn.
- If the user selects a later mode too early, the runtime fails the turn with a clear explanation rather than silently downgrading modes.

This keeps the user's mode selection explicit while preventing the model from jumping directly into mutation.

### Tool-Call Evidence Ledger

Before each provider turn, inject a compact inventory of visible read-only evidence:

```text
Already inspected:
- read: src/foo.ts lines 1-80 via call_read_1
- read: src/bar.ts full/default window via call_read_2
- grep: "handleSubmit" in packages/tui via call_grep_1
- glob: packages/**/*.ts via call_glob_1
```

The ledger is derived from existing visible session entries. It is not canonical history and does not change provider replay. Its job is to guide the model away from duplicate inspection while preserving the real tool results in normal context.

### Deterministic Duplicate Suppression

When a read-only tool call exactly repeats visible, still-valid evidence, the runtime returns a completed reference result instead of executing the tool again:

- `read("src/foo.ts", 1, 80)` already visible and unchanged -> return a reference to the previous `toolCallId`.
- Duplicate `read` calls can be reused when the same result is already visible in conversation context.
- `glob` and `grep` use exact request keys and are invalidated after any workspace mutation.
- Failed, denied, or already-reference results are not used as reusable evidence.

Mutation invalidation is conservative:

- Workspace patches invalidate read evidence for touched files.
- Any workspace mutation invalidates search evidence because global search results can change.
- Mutating `bash` is never deduplicated. Bash duplicate handling can be considered separately only for exact safe read-only commands.

The provider still receives a required result for every requested tool call. The difference is that duplicate results are short references rather than repeated file/search content.

### Context Strategy

- Useful code context stays model-visible when intentionally requested.
- Compaction remains the normal mechanism for reducing old history.
- Duplicate suppression reduces repeated content without requiring hidden stores, paging, or `recall_tool_result`.
- Phase summaries can be added later, but they should supplement visible evidence, not replace intentional reads by default.

## Codebase-Specific Optimization Opportunities (Open Design)

Additional ideas derived from specific architectural patterns observed in the codebase. These are cross-cutting — they don't fit neatly into one boundary or tier but address structural inefficiencies.

### Dynamic Tool-Set Reduction

`toolDefinitions.ts` is 38KB of source. Serialized tool schemas are included in every response step request. For a 10-step turn, that's ~380KB of identical tool JSON repeated.

Even without phase enforcement, the runtime could reduce the tool set per response step based on observed behavior. A step following 5 consecutive read-only tool calls doesn't need `edit_many`, `patch`, or `write` schemas. If the model requests a mutation tool that's not in the current set, the runtime can retry the step with the full tool set — one extra round-trip in the rare case, massive payload savings in the common case.

This interacts with phase enforcement (tool availability per phase) but is independently valuable. Phase enforcement is a behavioral constraint; dynamic tool-set reduction is a payload optimization that can apply even within a single phase.

### Selective Provider Turn Replay Inclusion

The assistant message stores `providerTurnReplay.inputItems`. The conversation history projection re-includes these replay items in every future turn's request — turn 1's replay appears in turn 2's, turn 3's, etc., until compaction strips them.

For a conversation with 5 uncompacted turns each with 10 response steps, the latest request carries replay from all 50 steps. But replay from older turns serves no continuation purpose — OpenAI only needs replay from the current turn for tool-call continuation.

Proposal: during conversation history projection, only include `providerTurnReplay` from the most recent assistant message. Older turns' replay is already represented by their assistant message text and tool result entries. This could cut request size by 30-60% in multi-turn conversations without any loss of model-visible information.

This is distinct from compaction (which removes replay entirely and summarizes). Selective inclusion retains the replay data in session storage for diagnostics and session hydration — it just doesn't project it into future requests.

### Incremental Conversation History Projection Cache

`projectConversationSessionEntriesToModelContextItems` in `conversationHistoryProjection.ts` iterates all visible session entries on every turn start, producing a fresh `ModelContextItem[]` array each time.

Session entries are append-only (except during compaction, which replaces the entire array). The projection could be cached incrementally:
- Cache the projected items from the previous turn start.
- On the next turn start, only project newly appended entries.
- Concatenate the cached prefix with the new suffix.
- Invalidate the cache on compaction (full re-projection).

For a conversation with 500 session entries, this avoids re-projecting 495 unchanged entries on every turn. The projection itself is cheap per-entry, but at scale it adds up — and the allocation of large arrays is GC pressure.

### Skip Workspace Patching for Read-Only Bash

Every bash command triggers before/after workspace snapshots via the workspace patch system in `runtimeBashToolCallExecution.ts`. But the majority of bash calls are read-only (`ls`, `cat`, `grep`, `jq`, test runners, `git log`, etc.).

The existing `bashToolApprovalPolicy.ts` already classifies commands by risk. Commands classified as safe/read-only can skip workspace patching entirely — no before snapshot, no after snapshot, no diff. This eliminates filesystem scanning overhead for the most common bash commands.

The patch summary is appended to tool result text, so skipping it also slightly reduces tool-result size.

### Prompt Context Catalog Prewarming

The `@` reference filesystem catalog scans the workspace when the user starts typing a reference. For large workspaces, this scan is noticeable.

The scan could start during idle time — when no turn is active and the user hasn't typed for a configurable period (e.g., 2 seconds). The session-scoped cache already exists, so prewarming just ensures the cache is populated before the user needs it. If the workspace changes during idle (detected via filesystem watcher or mtime check), invalidate and rescan.

### Parallel Turn Start

`runtimeConversationTurnStart.ts` runs sequentially at turn start:
1. Build model-facing prompt text
2. Load project instructions
3. Resolve available tools and skills
4. Project conversation history to model context items
5. Start provider turn

Steps 3 and 4 are independent of each other. Steps 1 and 2 are independent of 3 and 4. Running independent steps in parallel with `Promise.all` shaves time off every turn start. The dependencies are:
- Step 5 depends on all of 1-4
- Steps 1-2 are independent of 3-4
- Step 3 depends on step 2 (project instructions may affect available tools) — verify this in the actual code

Even a 2-way parallel split (prompt+instructions in parallel with tools+projection) saves the slower of the two.

### System Prompt Prefix Stability

OpenAI's prompt caching caches the prefix of the input. If the system prompt has a large stable portion (personality, rules, capabilities) followed by a small dynamic portion (session state, turn-specific context), and the stable portion comes first, every request gets a cache hit on the prefix.

If dynamic content is interleaved early in the system prompt — or if the system prompt changes order between requests — cache alignment breaks and every request is a full cache miss.

Audit the system prompt construction to ensure:
- The largest stable block (base instructions, tool usage rules, safety guidelines) is the absolute prefix.
- Dynamic content (session context, recent history references, workspace state) is appended after the stable prefix.
- No per-request randomness or timestamp injection early in the prompt.

This is free performance — no behavioral change, no fidelity loss, just reordering prompt content for cache friendliness.

### Usefulness-Ratio Compaction Trigger

Currently compaction triggers at 80% context capacity (soft budget guard) or on context window overflow (emergency recovery). Both triggers are based on absolute capacity.

An alternative trigger: the ratio of "recent useful content" to total context. Define useful content as entries from the last N turns (configurable, default 3). If useful content is <40% of total context, trigger compaction regardless of absolute capacity.

A 50-turn conversation at 60% capacity where only the last 3 turns matter is carrying 47 turns of dead weight. Compacting at 60% keeps request sizes small throughout, rather than waiting until 80% when the request is already large and slow.

This complements the existing triggers — it's a third condition that can fire independently:
- Overflow recovery: emergency, always fires
- Soft budget guard: capacity-based, fires at threshold
- Usefulness ratio: staleness-based, fires when context is bloated relative to active work

## Boundary 6: Provider Protocol Layer

The IPC protocol between host and provider process has its own performance characteristics not covered by the five boundaries above.

### Conservative

**P1. Zod validation bypass for trusted frames.** `streamDecodedProviderProtocolFramesFromJsonLines` runs `ProviderProtocolFrameSchema.parse()` on every IPC frame. During streaming, the host produces these frames — they're trusted. A fast-path that skips Zod validation for known frame types (just type-checks the discriminant) eliminates per-frame schema overhead during high-throughput streaming.

**P2. Provider protocol frame batching.** The IPC protocol uses `\n\n` delimiters with 1MB max per line. During streaming, many small frames arrive in quick succession. Batching multiple small frames into a single IPC write (and parsing multiple on the read side) reduces syscall overhead.

**P3. ProviderProtocolAsyncQueue bounded growth.** The async queue compacts at 64 items but has no upper bound. Under backpressure (slow consumer), this queue grows without limit. A bounded queue with backpressure signaling prevents memory bloat in long tool-heavy turns.

## Boundary 7: Startup & Session Resume

Cold start and session resume latency directly affect perceived responsiveness. The current startup path is mostly sequential.

### Conservative

**S1. Parallel startup phases.** The startup sequence in `chat.ts` runs sequentially: auth → logger → session → provider → workspace → TUI. Auth and TUI loading are independent. Session loading and workspace init are independent. A `Promise.all` split overlapping 2-3 independent phases saves 100-300ms on cold start.

**S2. Lazy project instruction loading.** Project instructions are loaded at turn start. For session resume, preload them during idle after TUI renders. First turn starts faster because instructions are already cached.

**S3. SQLite connection pooling.** Single SQLite connection shared across all operations. Under concurrent subagent writes (8 subagents × tool results), this serializes. A connection pool (or WAL mode with separate read connections) allows concurrent reads without blocking writes.

### Moderate

**S4. DNS prefetch at startup.** Resolve `api.openai.com` DNS at startup and cache the IP. First turn's HTTP request skips DNS resolution (~10-50ms). Trivial to implement with `dns.resolve()`.

**S5. Speculative auth refresh.** If stored auth token expires within a configurable window (e.g., 5 minutes), refresh it during idle before the next turn needs it. Eliminates auth-refresh latency from the turn critical path.

## Boundary 8: Capability Enhancements That Reduce Token Cost

Optimizations that make the agent smarter about what it puts in context — improving both performance and capability simultaneously.

### Conservative

**E1. Turn-scoped read cache.** Any `read(path, offset, limit)` call with identical arguments within the same turn returns cached results instantly. Zero model-visible change, zero risk. Catches the ~15-20% of redundant reads that happen when the model re-reads files it already saw.

**E2. Proactive context inventory injection.** Before each turn, inject a lightweight inventory of what's already in context: "You have file X (lines 1-80), grep results for Y, bash output from Z." Prevents the model from re-reading files it already has. Similar to the tool-call ledger in the phase-enforced workflow but applied across turns, not just within Understand phase.

### Moderate

**E3. Intelligent file chunking for read.** Currently `read` returns up to 2000 lines with a 1MB cap. For large files, the model often reads the whole thing then searches within it. Inject grep-like relevance hints: when the model reads a large file, automatically highlight the most likely relevant sections (based on the current task context) and offer to expand. Less context consumed, better signal.

**E4. Semantic tool-result compression.** Instead of raw text truncation (current `toolResultTextBudget.ts`), use structural awareness: for code files, keep function signatures + docstrings + the specific lines around search matches. For command output, keep error lines + summary stats. Same budget, much higher information density.

**E5. Cross-turn file content deduplication.** Track file mtimes of files read in previous turns. On re-read in a new turn, if mtime unchanged, return a compact reference ("file unchanged since turn 3") instead of full content. The model already has the content in its context from the earlier turn.

### Aggressive

**E6. Compaction quality scoring.** After compaction, measure how much of the compacted summary the model actually references in subsequent turns. Low reference rate = compaction is too aggressive or too lossy. Feed this signal back to tune the compaction prompt. Better compaction = fewer wasted tokens = faster turns.

**E7. Subagent model downgrade.** For simple subagent tasks (file reads, grep searches, straightforward edits), use a faster/cheaper model. The parent dispatches with a complexity hint; the subagent runtime selects model accordingly. A `grep` + `summarize` task doesn't need the same model as the parent.

**E8. Subagent context scoping.** Parent's full conversation history is currently projected into subagent context. Most subagent tasks only need: the task prompt, project instructions, and workspace state. Strip conversation history from subagent context to give them a much smaller starting context — faster first response, more room for tool results.

## Additional Conservative Optimizations (Cross-Boundary)

**X1. Conversation history copy elimination.** `listConversationSessionEntries()` does `[...this.conversationSessionEntries]` (spread copy) on every call. Since entries are append-only, return a read-only view or the array directly with a frozen flag. Called on hot paths.

**X2. Lazy replay projection with turn indexing.** Mark `providerTurnReplay.inputItems` with a `turnIndex` at creation time so the conversation history projection can skip old replay items in O(1) rather than filtering or checking timestamps.

**X3. Subagent tool definition sharing.** Each subagent currently gets its own copy of tool definitions. Since tool definitions are immutable within a session, share the serialized tool JSON across all subagents via a session-scoped cache. With 8 concurrent subagents, that's 8x less serialization.

**X4. SQLite transaction batching.** Each `appendConversationSessionEntry` is a separate transaction. During a turn with 20 tool results, that's 20 individual SQLite transactions. Batch all entries from a single response step into one transaction.

**X5. Transcript window slice caching.** `buildConversationTranscriptMessageIndexWindow` creates `Array.slice()` on every transcript ViewModel build, even when the window hasn't changed. Cache the slice result and only rebuild when message count or scroll position changes.

**X6. Adaptive streaming batch window.** The current 48ms batch window is fixed. During high-throughput streaming (many tokens/second), widen to 80-100ms. During low-throughput (reasoning, tool execution), narrow to 16ms for better responsiveness. Measure inter-event timing to auto-tune.

**X7. Early tool-result submission.** Currently all tool results in a concurrent batch are collected before submission. Submit each result to the provider as it completes — the provider can start building the next request body while other tools finish.

**X8. Workspace patch skip for read-only bash.** `bashToolApprovalPolicy.ts` classifies 59 commands as `safe_read_only_command_names`. For these, skip `beginRuntimeWorkspacePatchCapture()` entirely — no git tree hash, no diff computation. Eliminates 2 git operations per read-only bash call.

## Extended Optimization Index

| ID | Boundary | Tier | Summary |
|----|----------|------|---------|
| P1 | Protocol | Conservative | Zod validation bypass for trusted frames |
| P2 | Protocol | Conservative | Provider protocol frame batching |
| P3 | Protocol | Conservative | ProviderProtocolAsyncQueue bounded growth |
| S1 | Startup | Conservative | Parallel startup phases |
| S2 | Startup | Conservative | Lazy project instruction loading |
| S3 | Startup | Conservative | SQLite connection pooling |
| S4 | Startup | Moderate | DNS prefetch at startup |
| S5 | Startup | Moderate | Speculative auth refresh |
| E1 | Capability | Conservative | Turn-scoped read cache |
| E2 | Capability | Conservative | Proactive context inventory injection |
| E3 | Capability | Moderate | Intelligent file chunking for read |
| E4 | Capability | Moderate | Semantic tool-result compression |
| E5 | Capability | Moderate | Cross-turn file content deduplication |
| E6 | Capability | Aggressive | Compaction quality scoring |
| E7 | Capability | Aggressive | Subagent model downgrade |
| E8 | Capability | Aggressive | Subagent context scoping |
| X1 | Cross-boundary | Conservative | Conversation history copy elimination |
| X2 | Cross-boundary | Conservative | Lazy replay projection with turn indexing |
| X3 | Cross-boundary | Conservative | Subagent tool definition sharing |
| X4 | Cross-boundary | Conservative | SQLite transaction batching |
| X5 | Cross-boundary | Conservative | Transcript window slice caching |
| X6 | Cross-boundary | Conservative | Adaptive streaming batch window |
| X7 | Cross-boundary | Conservative | Early tool-result submission |
| X8 | Cross-boundary | Conservative | Workspace patch skip for read-only bash |

## Boundary 9: Stream & Serialization Hot Paths

Low-level parsing and serialization patterns on the critical streaming path.

### Conservative

**H1. SSE buffer array accumulation.** `stream.ts:96` does `buffer += chunk.value` in a loop — quadratic string copying. Switch to pushing chunks into an array and `join('')` at frame boundaries. This is the hottest path during every model response.

**H2. SSE frame boundary single-pass detection.** `nextFrameBoundary()` calls `indexOf('\n\n')` and `indexOf('\r\n\r\n')` separately, scanning the full buffer twice. Combine into a single scan or use a state machine that tracks the last few characters.

**H3. SSE extractData string reconstruction.** `extractData()` rebuilds data lines with `data = data.length === 0 ? dataLine : \`${data}\n${dataLine}\`` — string concat per line. Use array accumulation + join.

**H4. JSON re-serialization elimination in SQLite gateway.** `sqliteConversationSessionGateway.ts` calls `JSON.stringify(entry)` to store, then the store layer calls `JSON.stringify()` again to measure byte length for diagnostics. Pass the serialized string through instead of serializing twice.

**H5. SQLite prepared statement caching.** The gateway runs `database.run()` and `database.query()` calls without caching prepared statements. Cache the 5-6 hot-path statements (`insertConversationSessionEntry`, `loadConversationSessionEntries`, metadata lookups) to eliminate repeated SQL parsing.

**H6. Read tool line parser optimization.** `readTool.ts:355-383` loops character-by-character and calls `.slice()` to extract line segments, creating new string objects per line. Track start/end indices and use a single `substring()` at line boundaries instead.

### Moderate

**H7. System prompt section caching.** `buildBuliSystemPrompt()` (371 lines) rebuilds ~15-20 string arrays with nested `.join()` calls every turn. The operating mode section, workflow instructions, and safety guidelines don't change between turns. Cache stable sections; only rebuild dynamic portions (skills list, session context).

**H8. Binary/MessagePack session entries.** Conversation entries go through JSON.stringify for storage and JSON.parse on load — on every turn for the full history. A binary format (MessagePack or CBOR) would reduce serialization time and storage size, especially for conversations with hundreds of entries.

## Boundary 10: Asset & Resource Loading

First-use latency from loading parsers, scanning filesystems, and resolving skills.

### Conservative

**R1. TreeSitter parser pre-bundling.** `buliOpenTuiTreeSitterParsers.ts` defines 22+ language parsers as WASM URLs pointing to GitHub releases. First occurrence of each language triggers a blocking network download (100-500KB). Bundle the top 5-8 languages (TypeScript, Python, Bash, JSON, Markdown, Go, Rust, CSS) locally. Download the rest on demand.

**R2. TreeSitter parallel download.** When multiple languages appear in one response, parsers download sequentially. Download in parallel with `Promise.all`.

**R3. Skill catalog memoization.** `skillCatalog.ts` calls `discoverDiskSkills()` which scans the filesystem and parses every SKILL.md on every `listAvailableSkills()` call. Cache the result in memory; invalidate on file change (via mtime check or watcher).

**R4. Skill lazy parsing.** All skill markdown files are parsed when listing, not just when loading a specific skill. Parse only name/description for the listing; defer full content parsing until a skill is actually invoked.

**R5. Skill lookup Map.** `findLoadedSkill()` does linear array search. Use a Map keyed by skill name for O(1) lookup.

### Moderate

**R6. TreeSitter parser warm pool.** After first download, keep parsed WASM modules in memory across turns. Currently each code block re-initializes the parser. Share parser instances across the session.

**R7. @ reference parser fast-path.** `parsePromptContextReferencesFromPromptText()` iterates character-by-character through the entire prompt and tests `/\s/` regex per character. Add a fast-path: `indexOf('@')` first — if no `@` found, return empty immediately. When `@` exists, use regex-based extraction instead of character-by-character scan.

**R8. @ reference string builder.** Inside `parseQuotedPromptContextReference()`, decoded paths are built with `decodedDisplayPath += currentCharacter` — string concat per character. Use array accumulation + join.

## Boundary 11: React Rendering Efficiency

TUI component tree has 78 components; only 7 use memoization. Streaming updates trigger full tree reconciliation.

### Conservative

**V1. Memoize expensive message part computations.** `listRenderableConversationMessageParts()` creates a new array on every call. Wrap in `useMemo` keyed on message parts array reference and reasoning display mode.

**V2. Stable preparation cache in ConversationMessageList.** The preparation cache (`Map<string, ConversationMessageListPreparationCacheEntry>`) is recreated on every render (line 200 replaces the Map). Persist via `useRef` and mutate in-place instead of replacing.

**V3. Streaming message render isolation.** Currently, each streaming text chunk triggers React reconciliation of the entire message list component tree. Extract the actively-streaming message into a separate render boundary (its own `useMemo` or `React.memo` wrapper) so that streaming updates only reconcile the streaming message, not the full history.

### Moderate

**V4. Batch memoization audit.** 71 of 78 TUI components lack `React.memo()`. Audit the 10 most-rendered components (message parts, tool result blocks, markdown blocks) and add `memo()` with appropriate equality checks. Expected to cut unnecessary re-renders by 50%+ during streaming.

**V5. Event handler stabilization.** Add `useCallback()` to event handlers passed as props in the component tree. Unstable function references cause child re-renders even when data hasn't changed.

**V6. Grep match results optimization.** `GrepMatchResultsBlock.tsx` does `[...grepMatchFileLinesByPath.values()].flatMap()` — spreads Map values to array, then flatmaps. Iterate the Map directly instead of creating intermediate arrays.

## Boundary 12: Git & Filesystem Operations

Workspace snapshot system spawns many git subprocesses per tool call.

### Conservative

**G1. Batch git diff parsing.** After a tool call that changes N files, the workspace snapshot system runs N separate `git diff --cached <file>` commands (one spawn per file). Run `git diff --cached --` once and parse per-file output from the single result. For 10 changed files: 10 spawns → 1.

**G2. Git plumbing command reuse.** Reuse the private git repository object across the session instead of re-initializing. Cache the baseline tree hash and only recompute after mutations.

### Moderate

**G3. Grep tool streaming for large files.** `grepTool.ts` uses `readFile()` (full buffer) for each match file. For files >100KB, switch to streaming line reader to avoid buffering entire large files into memory.

**G4. HTTP/2 verification and enablement.** Bun's `fetch()` can negotiate HTTP/2. Verify that OpenAI's endpoint supports HTTP/2 multiplexing — if so, concurrent subagent API calls multiplex over a single TCP connection instead of each opening a new one. Free speedup if the server supports it.

## Boundary 13: Compaction Algorithm Efficiency

The compaction algorithm itself has optimization opportunities beyond when it triggers.

### Conservative

**K1. Selective entry transformation.** `prepareConversationEntriesForCompactionRequest()` runs `.map()` over all entries, creating new objects even for entries that don't need modification (no images, no large tool results). Only allocate new objects for entries that actually need stripping.

**K2. Compaction entry cache.** Between sequential compactions, most entries haven't changed. Cache the prepared-for-compaction form of entries; only re-prepare newly added entries.

### Moderate

**K3. Two-stage compaction.** Instead of one large LLM call to summarize everything, use two stages: (1) deterministic extraction of structured metadata (file list, tool call outcomes, key facts) without an LLM call, (2) LLM call to synthesize a narrative summary from just the metadata + recent entries. Stage 1 is free; stage 2 gets a much smaller input.

### Aggressive

**K4. Incremental compaction.** Instead of compacting the entire history at once, compact in windows: summarize turns 1-5 into a paragraph, then turns 6-10, etc. Each window's summary is small and cacheable. On full compaction, concatenate window summaries. Avoids reprocessing already-compacted windows.

## Extended Optimization Index (continued)

| ID | Boundary | Tier | Summary |
|----|----------|------|---------|
| H1 | Stream/serialization | Conservative | SSE buffer array accumulation |
| H2 | Stream/serialization | Conservative | SSE frame boundary single-pass detection |
| H3 | Stream/serialization | Conservative | SSE extractData string reconstruction |
| H4 | Stream/serialization | Conservative | JSON re-serialization elimination in SQLite |
| H5 | Stream/serialization | Conservative | SQLite prepared statement caching |
| H6 | Stream/serialization | Conservative | Read tool line parser optimization |
| H7 | Stream/serialization | Moderate | System prompt section caching |
| H8 | Stream/serialization | Moderate | Binary/MessagePack session entries |
| R1 | Asset/resource loading | Conservative | TreeSitter parser pre-bundling |
| R2 | Asset/resource loading | Conservative | TreeSitter parallel download |
| R3 | Asset/resource loading | Conservative | Skill catalog memoization |
| R4 | Asset/resource loading | Conservative | Skill lazy parsing |
| R5 | Asset/resource loading | Conservative | Skill lookup Map |
| R6 | Asset/resource loading | Moderate | TreeSitter parser warm pool |
| R7 | Asset/resource loading | Moderate | @ reference parser fast-path |
| R8 | Asset/resource loading | Moderate | @ reference string builder |
| V1 | React rendering | Conservative | Memoize message part computations |
| V2 | React rendering | Conservative | Stable preparation cache |
| V3 | React rendering | Conservative | Streaming message render isolation |
| V4 | React rendering | Moderate | Batch memoization audit |
| V5 | React rendering | Moderate | Event handler stabilization |
| V6 | React rendering | Moderate | Grep match results intermediate array elimination |
| G1 | Git/filesystem | Conservative | Batch git diff parsing |
| G2 | Git/filesystem | Conservative | Git plumbing command reuse |
| G3 | Git/filesystem | Moderate | Grep tool streaming for large files |
| G4 | Git/filesystem | Moderate | HTTP/2 verification and enablement |
| K1 | Compaction | Conservative | Selective entry transformation |
| K2 | Compaction | Conservative | Compaction entry cache |
| K3 | Compaction | Moderate | Two-stage compaction |
| K4 | Compaction | Aggressive | Incremental compaction |
