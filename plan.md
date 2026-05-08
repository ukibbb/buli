# Existing Behavior Hardening Plan for `buli`

## Direction

Make `buli` a boringly reliable local coding agent by improving what already exists.

Do not expand the feature set right now. Do not rewrite the architecture. The current boundaries are good enough to strengthen: typed tools, bash approval, session persistence, provider replay, TUI rendering, tests, and docs.

Core principle:

> Existing operations that inspect or affect the local machine should be typed, safe, persisted, visible, and tested.

That means each existing important operation should have:

- a typed contract
- a clear safety policy
- visible UI state
- a persisted record
- useful model-facing output
- tests around real behavior

## Scope

Improve these existing surfaces:

- typed read/search tools: `read`, `glob`, `grep`
- bash tool and current approval behavior
- OpenAI tool definitions and tool-call parsing
- runtime tool execution and result submission
- JSONL conversation session persistence
- conversation history projection
- TUI tool-call rendering
- README, architecture docs, and backlog docs

## Explicit Non-Goals

Do not add these now:

- new edit/write tools
- `/export-debug`
- replay harness
- `/context`
- `buli doctor`
- broad permission-capability redesign
- tool renames like `read_file`, `glob_files`, or `grep_files`

The current tool names `read`, `glob`, and `grep` are already wired through contracts, provider parsing, runtime execution, and TUI rendering. Keep them and make them excellent.

## Slice 1: Stabilize Existing Typed Read/Search Tools

Goal:

> The model should use `read`, `glob`, and `grep` for normal workspace inspection instead of using `bash` for `cat`, `ls`, `find`, `grep`, or `rg`.

### Desired Behavior

The assistant should prefer:

```txt
read
glob
grep
```

instead of:

```bash
cat package.json
find . -name "*.ts"
grep -R "foo" .
rg "foo"
```

`bash` remains available as an escape hatch for commands that typed tools do not cover.

### Contracts To Keep Tight

The current request contracts live in:

```txt
packages/contracts/src/toolCallRequest.ts
```

Keep one precise arm per tool:

```ts
type ReadToolCallRequest = {
  toolName: "read";
  readTargetPath: string;
  offsetLineNumber?: number;
  maximumLineCount?: number;
};

type GlobToolCallRequest = {
  toolName: "glob";
  globPattern: string;
  searchDirectoryPath?: string;
};

type GrepToolCallRequest = {
  toolName: "grep";
  regexPattern: string;
  searchPath?: string;
  includeGlobPattern?: string;
};
```

Avoid generic request shapes such as:

```ts
{
  toolName: string;
  args: object;
}
```

### OpenAI Tool Definition Consistency

The OpenAI-facing tool definitions live in:

```txt
packages/openai/src/provider/toolDefinitions.ts
packages/openai/src/provider/stream.ts
```

Verify that:

- OpenAI tool argument names map exactly into contract fields
- nullable OpenAI fields become omitted contract fields
- malformed arguments produce clear errors
- unsupported tool names fail loudly
- tool definitions actively instruct the model to prefer typed tools over bash for file inspection

### Workspace Path Safety

Existing path safety lives in:

```txt
packages/engine/src/tools/workspacePath.ts
packages/engine/src/tools/workspaceFileSearch.ts
```

Keep one centralized path-resolution boundary for workspace file tools.

The intended policy should be explicit and tested:

- reject paths outside the workspace
- return normalized display paths
- return clear errors for invalid paths
- do not accidentally follow symlink escapes

Current behavior rejects symlinks entirely in `resolveExistingWorkspacePath`. That is acceptable if intentional, but document and test it as the policy. If the intended policy is only "reject symlink escapes," adjust the implementation and tests together.

### Truncation And Result Shape

Existing UI detail contracts live in:

```txt
packages/contracts/src/toolCallDetail.ts
```

Existing execution result shape lives in:

```txt
packages/engine/src/tools/toolCallOutcome.ts
```

Make truncation explicit everywhere it matters:

- `read` should clearly expose when requested content was truncated by line count or long-line limits
- `glob` should distinguish returned path count from total match count when possible
- `grep` should expose when only the first match hits were returned
- model-facing result text should say exactly what was omitted and how to continue
- TUI cards should show truncation without requiring the user to inspect raw text

Avoid adding a parallel result system unless it becomes necessary. Prefer tightening the existing `ToolCallDetail` plus `toolResultText` path so persisted data, TUI state, and model-facing output stay consistent.

### Runtime Execution

Existing execution is centered in:

```txt
packages/engine/src/runtime.ts
packages/engine/src/tools/readTool.ts
packages/engine/src/tools/globTool.ts
packages/engine/src/tools/grepTool.ts
```

Verify that:

- `read`, `glob`, and `grep` are auto-approved read-only tools
- failed read/search calls still submit useful tool results back to the provider
- aborts and interrupts do not leave misleading completed states
- tool-call details are updated from started to final state correctly
- tool results are appended to conversation history exactly once

## Slice 2: Strengthen Current System Prompt And Tool Instructions

The system prompt lives in:

```txt
packages/engine/src/systemPrompt.ts
```

Add direct instructions for existing tools:

```txt
Use typed workspace tools for normal code inspection:
- use read for known files and directories
- use glob for finding files by path pattern
- use grep for searching file contents

Use bash only when no typed workspace tool is suitable.
Do not use bash for simple file reads, file discovery, or text search.
```

Also keep the safety rule explicit:

```txt
Do not read files outside the workspace unless the user explicitly asks and the tool policy allows it.
```

For plan mode, keep the existing read-only restriction, but make it point the model toward typed read/search tools rather than read-only bash.

## Slice 3: Harden Existing Bash Approval Behavior

Do not redesign permissions broadly yet.

Current bash approval logic lives in:

```txt
packages/engine/src/tools/bashToolApprovalPolicy.ts
packages/engine/src/tools/bashTool.ts
packages/engine/src/runtime.ts
packages/tui/src/components/behavior/ToolApprovalRequestBlock.tsx
```

Improve the current behavior by tightening classification and UI language.

Verify that:

- obviously read-only commands remain smooth in trusted/risk-based modes as intended
- filesystem mutations require approval in risk-based mode
- git and GitHub mutations require approval
- network write or indirect execution requires approval
- ambiguous shell syntax requires approval
- approval prompts explain the concrete risk, not just "approve bash command"
- denied commands produce clear model-facing tool results

Be conservative with network access. Even read-only network commands can leak private local context when command arguments include paths, tokens, or generated data.

## Slice 4: Harden Existing JSONL Session Persistence

This is the most important non-tool hardening work.

Current session persistence lives in:

```txt
apps/cli/src/conversationSessionStore.ts
packages/contracts/src/conversationSessionRecord.ts
packages/contracts/src/conversationSessionEntry.ts
packages/engine/src/conversationHistory.ts
packages/engine/src/conversationHistoryProjection.ts
packages/chat-session-state/src/conversationTranscriptReducer.ts
```

JSONL is a good append-only format, but loading must be defensive.

### Cases To Define And Test

1. Valid complete file

Load normally.

2. Partial final line

Load valid previous records. Quarantine or ignore the partial tail with a diagnostic.

Preferred behavior:

```txt
session-id.jsonl
session-id.corrupt-tail.2026-05-07T12-30-00.txt
```

3. Corrupt middle record

Stop at the first corrupt record and quarantine the corrupt suffix.

Continuing after a corrupt middle record can produce misleading state because session records are ordered.

4. Unfinished assistant turn

On reload, do not project it as a safe completed turn.

The current history projection already skips open tool turns. Keep that behavior and test it more directly against persisted JSONL loading.

5. Stale pending approval or running tool call

On reload, show it as interrupted or abandoned in the transcript. Do not resume stale approvals.

6. Concurrent writers

Do not attempt to merge concurrent writes. At minimum, make corruption unlikely and detectable. A lock can be added only if needed to protect existing session persistence; do not frame it as a new user-facing feature.

### Loader Requirements

The loader should:

- never discard valid records before the first corrupt record
- never silently accept malformed records
- provide a clear diagnostic for quarantined data
- avoid crashing the whole app when a recoverable corrupt tail exists
- preserve parent-link behavior for active entry reconstruction

## Slice 5: Verify Provider Replay And History Projection

Relevant files:

```txt
packages/openai/src/provider/request.ts
packages/openai/src/provider/turnSession.ts
packages/openai/src/provider/stream.ts
packages/engine/src/conversationHistoryProjection.ts
packages/engine/test/conversationHistoryProjection.test.ts
packages/openai/test/turnSession.test.ts
packages/openai/test/stream.test.ts
```

Verify that:

- typed tool calls are replayed to OpenAI with matching function-call output
- completed and incomplete turns project safely into future model context
- failed and interrupted turns are not projected as if they were safe completions
- paired tool call/result entries remain ordered and complete
- legacy fallback transcript projection still handles typed tools correctly

This is not a new replay harness. It is hardening the existing provider-turn replay and history projection path.

## Slice 6: Improve Existing TUI Tool Rendering

Relevant files:

```txt
packages/tui/src/components/messageParts/ToolCallPartView.tsx
packages/tui/src/components/toolCalls/ToolCallEntryView.tsx
packages/tui/src/components/toolCalls/ReadToolCallCard.tsx
packages/tui/src/components/toolCalls/GlobToolCallCard.tsx
packages/tui/src/components/toolCalls/GrepToolCallCard.tsx
packages/tui/src/components/toolCalls/BashToolCallCard.tsx
```

The current card structure is good. Improve clarity, not scope.

Verify that TUI cards show:

- tool name and target clearly
- running, completed, failed, denied, and interrupted states clearly
- line counts, byte counts, match counts, and path counts accurately
- truncation state when result output is incomplete
- concise errors without duplicate error text

Do not introduce a new UI model unless the current `ToolCallDetail` model cannot represent required state.

## Slice 7: Documentation Cleanup

Keep docs aligned with current reality.

Relevant files:

```txt
README.md
docs/current-chat-session-architecture.md
whatIsMissing.md
```

Update docs to describe:

- current tool names: `read`, `glob`, `grep`, `bash`
- current safety model
- current session persistence behavior
- current approval behavior
- known limitations that still exist

Remove completed or stale backlog items quickly.

Do not document planned new features as if they exist.

## Immediate Next Plan

Stabilize typed read/search and session persistence first.

### Files To Inspect First

```txt
packages/contracts/src/toolCallRequest.ts
packages/contracts/src/toolCallDetail.ts
packages/contracts/src/events.ts
packages/contracts/src/conversationSessionEntry.ts
packages/contracts/src/conversationSessionRecord.ts
packages/engine/src/systemPrompt.ts
packages/engine/src/runtime.ts
packages/engine/src/tools/toolCallOutcome.ts
packages/engine/src/tools/toolCatalog.ts
packages/engine/src/tools/readTool.ts
packages/engine/src/tools/globTool.ts
packages/engine/src/tools/grepTool.ts
packages/engine/src/tools/workspacePath.ts
packages/engine/src/tools/workspaceFileSearch.ts
packages/engine/src/tools/bashToolApprovalPolicy.ts
packages/engine/src/conversationHistory.ts
packages/engine/src/conversationHistoryProjection.ts
packages/openai/src/provider/toolDefinitions.ts
packages/openai/src/provider/request.ts
packages/openai/src/provider/stream.ts
packages/openai/src/provider/turnSession.ts
packages/chat-session-state/src/conversationTranscriptReducer.ts
packages/tui/src/components/messageParts/ToolCallPartView.tsx
packages/tui/src/components/toolCalls/ReadToolCallCard.tsx
packages/tui/src/components/toolCalls/GlobToolCallCard.tsx
packages/tui/src/components/toolCalls/GrepToolCallCard.tsx
apps/cli/src/conversationSessionStore.ts
apps/cli/src/commands/chat.ts
```

### Consistency Checks

Verify:

- contracts match OpenAI tool definitions and parser mapping
- engine tool implementations return useful final details and model-facing text
- workspace path rules are centralized and tested
- read-only typed tools are auto-approved
- bash remains available but is discouraged for simple inspection
- tool calls and results are persisted correctly
- conversation history projection includes typed tool calls/results safely
- provider replay includes typed tool calls/results correctly
- TUI renders each existing tool distinctly and accurately
- errors are visible to both user and model

### Tests To Add Or Confirm

```txt
read rejects path outside workspace
read rejects symlink according to the documented policy
read reports line and long-line truncation explicitly
glob ignores default excluded directories
glob reports returned count and truncation accurately
grep rejects invalid regex with a useful tool failure
grep limits output and marks truncation
OpenAI tool definitions match contract schemas
OpenAI parser rejects malformed typed tool args
runtime auto-approves read/glob/grep
runtime submits failed typed tool results back to provider
history projection includes paired typed tool calls/results
session loader recovers from partial final JSONL line
session loader quarantines corrupt suffix after middle corruption
TUI renders read/glob/grep running/completed/failed states
bash risk classifier requires approval for mutation and ambiguous syntax
```

### Verification Commands

```bash
bun run typecheck
bun run test
```

Manual check:

```bash
buli
```

Ask:

```txt
Inspect this repo and summarize the engine/tool architecture. Use typed tools, not bash, unless needed.
```

Expected result: the assistant calls `glob`, `read`, and `grep`, not `bash`, for normal code inspection.

## Strongest Recommendation

Focus on reliability of existing behavior, not feature expansion.

Highest-leverage next work:

> Make existing typed read/search tools and existing session persistence boringly correct.

Why:

- every coding task starts with inspection
- typed read/search tools reduce shell reliance
- approvals become less noisy and more meaningful
- persisted history becomes easier to trust
- TUI state becomes clearer
- future improvements become safer only after the current foundation is reliable
