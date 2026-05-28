# Codebase Symbol Locator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broad `query_codebase_knowledge` tool with a sharp, name-driven `locate_codebase_symbols` tool that resolves a grepped symbol name or file path to its exact definition and line span.

**Architecture:** Keep the tree-sitter indexer and JSON storage. Rebuild the query/scoring/result-text layers around deterministic name/path matching (no prose query, no token-overlap, no freshness). Collapse record kinds to `file | symbol`. Rename the tool everywhere and rewrite its prompt guidance. Bump the structure-map version so the `.buli/index` cache rebuilds once instead of migrating.

**Tech Stack:** TypeScript, Bun (`bun test`), Zod (contracts), tree-sitter, OpenAI provider tool definitions.

Spec: `2026-05-28-codebase-symbol-locator-design.md`

---

## File Structure

- `packages/codebase-knowledge/src/codebaseKnowledgeTypes.ts` — slim record/query/result types (file+symbol only, no freshness).
- `packages/codebase-knowledge/src/queryCodebaseKnowledge.ts` — name/path scoring, no token overlap.
- `packages/codebase-knowledge/src/codebaseKnowledgeToolResultText.ts` — symbol-extent output.
- `packages/codebase-knowledge/src/codebaseStructureMapVersion.ts` — bump to 3.
- `packages/codebase-knowledge/src/jsonFileCodebaseKnowledgeRepository.ts` — drop migration, `markFilePathStale` → `removeFileRecords`.
- `packages/codebase-knowledge/src/inMemoryCodebaseKnowledgeRepository.ts` — mirror interface change.
- `packages/codebase-knowledge/src/treeSitter/treeSitterCodebaseStructureIndexer.ts` — drop freshness/sourceKind from built records.
- `packages/engine/src/codebaseKnowledge/treeSitterWorkspaceCodebaseKnowledgeIndex.ts` — stale-mark → remove.
- `packages/contracts/src/toolCallRequest.ts`, `toolCallDetail.ts`, `toolCatalog.ts` — rename + reshape.
- `packages/contracts/schemas/*.json` — regenerate tool-call schemas.
- `packages/openai/src/provider/toolDefinitions.ts`, `request.ts`, `turnSession.ts` — rename tool def + parser.
- `packages/engine/src/tools/queryCodebaseKnowledgeTool.ts` → `locateCodebaseSymbolsTool.ts` + dispatch sites.
- `packages/engine/src/systemPrompt.ts` — rewrite usage guidance.
- `apps/cli/src/conversationSession/export/toolBlocks.ts` — rename render branch.

**Naming convention used throughout:** the new tool name is `locate_codebase_symbols`; the request type is `LocateCodebaseSymbolsToolCallRequest`; the query type stays `CodebaseKnowledgeQuery` but its fields become `symbolNames` / `filePaths` / `maximumResultCount`.

---

## Task 1: Slim the core types

**Files:**
- Modify: `packages/codebase-knowledge/src/codebaseKnowledgeTypes.ts`

- [ ] **Step 1: Remove freshness, flow/concept, and the evidence source-kind union**

Delete these declarations entirely:
- `CodebaseKnowledgeFreshness` (line 1)
- `CodebaseEvidenceSourceKind` (line 3) — replace its use in `CodebaseEvidenceSourceRange` by deleting the `sourceKind` field.
- `CodebaseFlowKnowledgeRecord` (lines 70-75) and `CodebaseConceptKnowledgeRecord` (lines 77-82)

Edit `CodebaseKnowledgeRecordKind` (line 33) to:

```ts
export type CodebaseKnowledgeRecordKind = "file" | "symbol";
```

Edit `CodebaseKnowledgeRecordBase` (lines 37-46) to drop `freshness`:

```ts
type CodebaseKnowledgeRecordBase = {
  recordId: string;
  recordKind: CodebaseKnowledgeRecordKind;
  title: string;
  summary: string;
  tags: readonly string[];
  evidenceRanges: readonly CodebaseEvidenceSourceRange[];
  updatedAtMs: number;
};
```

Edit the union (lines 84-88) to:

```ts
export type CodebaseKnowledgeRecord =
  | CodebaseFileKnowledgeRecord
  | CodebaseSymbolKnowledgeRecord;
```

- [ ] **Step 2: Reshape the query type**

Replace `CodebaseKnowledgeQuery` (lines 90-95) with name/path inputs:

```ts
export type CodebaseKnowledgeQuery = {
  symbolNames?: readonly string[] | undefined;
  filePaths?: readonly string[] | undefined;
  maximumResultCount?: number | undefined;
};
```

- [ ] **Step 3: Update the repository interface**

In `CodebaseKnowledgeRepository` (lines 136-151) rename `markFilePathStale` to `removeFileRecords`:

```ts
  removeFileRecords(filePath: string): Promise<void>;
```

- [ ] **Step 4: Verify it compiles in isolation**

Run: `cd packages/codebase-knowledge && bun run typecheck`
Expected: errors only in the *other* files in this package (query, result-text, repositories, indexer) — those are fixed in later tasks. No errors inside `codebaseKnowledgeTypes.ts` itself.

- [ ] **Step 5: Commit**

```bash
git add packages/codebase-knowledge/src/codebaseKnowledgeTypes.ts
git commit -m "Slim codebase knowledge types to file and symbol records"
```

---

## Task 2: Rewrite query scoring (name/path matching)

**Files:**
- Modify: `packages/codebase-knowledge/src/queryCodebaseKnowledge.ts`
- Test: `packages/codebase-knowledge/test/queryCodebaseKnowledge.test.ts`

- [ ] **Step 1: Write failing tests for the new ranking**

Replace the prose-query tests with these. Use the test record factory in `test/testCodebaseKnowledgeRecords.ts` (adjust factory in Task 8 of that file if it still sets `freshness`).

```ts
import { describe, expect, test } from "bun:test";
import { queryCodebaseKnowledgeRecords } from "../src/queryCodebaseKnowledge.ts";
import type { CodebaseSymbolKnowledgeRecord } from "../src/codebaseKnowledgeTypes.ts";

function symbolRecord(overrides: Partial<CodebaseSymbolKnowledgeRecord>): CodebaseSymbolKnowledgeRecord {
  return {
    recordId: "r1",
    recordKind: "symbol",
    title: "someSymbol",
    summary: "",
    tags: [],
    evidenceRanges: [],
    updatedAtMs: 0,
    filePath: "packages/x/src/a.ts",
    symbolName: "someSymbol",
    symbolKind: "function",
    startLineNumber: 142,
    endLineNumber: 187,
    isExported: true,
    ...overrides,
  };
}

test("exact symbol-name match ranks above substring match", () => {
  const exact = symbolRecord({ recordId: "exact", symbolName: "handleRequest" });
  const substring = symbolRecord({ recordId: "sub", symbolName: "handleRequestRetry" });
  const result = queryCodebaseKnowledgeRecords({
    query: { symbolNames: ["handleRequest"] },
    records: [substring, exact],
  });
  expect(result.matches[0]?.record.recordId).toBe("exact");
});

test("file path match returns the file record", () => {
  const symbol = symbolRecord({ recordId: "s", filePath: "packages/x/src/a.ts" });
  const result = queryCodebaseKnowledgeRecords({
    query: { filePaths: ["packages/x/src/a.ts"] },
    records: [symbol],
  });
  expect(result.matches.map((m) => m.record.recordId)).toContain("s");
});

test("no inputs returns no matches", () => {
  const result = queryCodebaseKnowledgeRecords({ query: {}, records: [symbolRecord({})] });
  expect(result.matches).toHaveLength(0);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/codebase-knowledge && bun test test/queryCodebaseKnowledge.test.ts`
Expected: FAIL (compile errors / wrong ranking — old token scoring still present).

- [ ] **Step 3: Rewrite the scorer**

Replace the whole body of `queryCodebaseKnowledge.ts` with deterministic name/path scoring. Delete `tokenizeSearchText`, `countTokenOverlap`, `buildRecordSearchText`, `formatImport/ExportDeclarationsForSearch`, and all freshness logic. Keep `buildRecommendedReads`, `deduplicateEvidenceRanges`, `listRecordReferencedFilePaths`, `listRecordReferencedSymbolNames`, `normalizePathForMatching`, `normalizeToken` (trim the last two of flow/concept branches).

```ts
const DEFAULT_MAXIMUM_RESULT_COUNT = 8;

export function queryCodebaseKnowledgeRecords(input: {
  query: CodebaseKnowledgeQuery;
  records: readonly CodebaseKnowledgeRecord[];
}): CodebaseKnowledgeQueryResult {
  const hasInputs =
    (input.query.symbolNames?.length ?? 0) > 0 || (input.query.filePaths?.length ?? 0) > 0;
  const scoredMatches = hasInputs
    ? input.records
        .map((record) => scoreCodebaseKnowledgeRecord({ query: input.query, record }))
        .filter((match) => match.score > 0)
        .sort((leftMatch, rightMatch) =>
          rightMatch.score !== leftMatch.score
            ? rightMatch.score - leftMatch.score
            : leftMatch.record.title.localeCompare(rightMatch.record.title),
        )
    : [];

  return {
    query: input.query,
    matches: scoredMatches.slice(0, input.query.maximumResultCount ?? DEFAULT_MAXIMUM_RESULT_COUNT),
  };
}
```

Rewrite `scoreCodebaseKnowledgeRecord` to sum only name/path scores (exact symbol 100, substring symbol 35, exact path 90, partial path 40):

```ts
function scoreCodebaseKnowledgeRecord(input: {
  query: CodebaseKnowledgeQuery;
  record: CodebaseKnowledgeRecord;
}): CodebaseKnowledgeQueryMatch {
  const matchReasons: string[] = [];
  let score = 0;

  for (const symbolName of input.query.symbolNames ?? []) {
    const symbolScore = scoreKnownRelevantSymbolName({ knownRelevantSymbolName: symbolName, record: input.record });
    if (symbolScore > 0) {
      score += symbolScore;
      matchReasons.push(`matched symbol ${symbolName}`);
    }
  }
  for (const filePath of input.query.filePaths ?? []) {
    const pathScore = scoreKnownRelevantFilePath({ knownRelevantFilePath: filePath, record: input.record });
    if (pathScore > 0) {
      score += pathScore;
      matchReasons.push(`matched file path ${filePath}`);
    }
  }

  return { record: input.record, score, matchReasons, recommendedReads: buildRecommendedReads(input.record) };
}
```

Update `scoreKnownRelevantSymbolName` so exact match returns `100` (was 90) to stay above any combined partial-path score; keep substring at `35`. Leave `scoreKnownRelevantFilePath` at 100/40 but renumber exact to `90` so an exact symbol match wins ties against an exact path match. Delete the flow/concept branches in `listRecordReferenced*`.

- [ ] **Step 4: Run tests to verify pass**

Run: `cd packages/codebase-knowledge && bun test test/queryCodebaseKnowledge.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/codebase-knowledge/src/queryCodebaseKnowledge.ts packages/codebase-knowledge/test/queryCodebaseKnowledge.test.ts
git commit -m "Rewrite knowledge query as name and path locator"
```

---

## Task 3: Emit exact symbol extent in tool result

**Files:**
- Modify: `packages/codebase-knowledge/src/codebaseKnowledgeToolResultText.ts`
- Test: `packages/codebase-knowledge/test/codebaseKnowledgeToolResultText.test.ts`

- [ ] **Step 1: Write a failing test for the symbol extent line**

```ts
test("symbol match emits exact extent and precise read", () => {
  const text = buildCodebaseKnowledgeToolResultText({
    query: { symbolNames: ["someSymbol"] },
    matches: [
      {
        score: 100,
        matchReasons: [],
        recommendedReads: [{ filePath: "a.ts", startLineNumber: 142, maximumLineCount: 46, reason: "someSymbol definition" }],
        record: {
          recordId: "r", recordKind: "symbol", title: "someSymbol", summary: "", tags: [],
          evidenceRanges: [], updatedAtMs: 0, filePath: "a.ts", symbolName: "someSymbol",
          symbolKind: "function", startLineNumber: 142, endLineNumber: 187, isExported: true,
        },
      },
    ],
  });
  expect(text).toContain('<symbol name="someSymbol" kind="function" exported="true" file="a.ts" lines="142-187" />');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/codebase-knowledge && bun test test/codebaseKnowledgeToolResultText.test.ts`
Expected: FAIL — current output has no `<symbol .../>` extent line.

- [ ] **Step 3: Update the symbol formatter**

Replace `formatSymbolKnowledgeRecordMapDetailLines` (lines 150-163) so it always emits the extent line, then the preview:

```ts
function formatSymbolKnowledgeRecordMapDetailLines(record: CodebaseKnowledgeRecord & { recordKind: "symbol" }): string[] {
  return [
    "<map_details>",
    `<symbol name="${escapeXmlAttribute(record.symbolName)}" kind="${record.symbolKind}" exported="${record.isExported}" file="${escapeXmlAttribute(record.filePath)}" lines="${record.startLineNumber}-${record.endLineNumber}" />`,
    ...(record.declarationPreview
      ? [`<declaration_preview>${escapeXmlText(record.declarationPreview.declarationPreviewText)}</declaration_preview>`]
      : []),
    ...(record.declarationPreview?.documentationCommentText
      ? [`<documentation_comment>${escapeXmlText(record.declarationPreview.documentationCommentText)}</documentation_comment>`]
      : []),
    "</map_details>",
  ];
}
```

Also remove the `<freshness>` line from `formatCodebaseKnowledgeMatchLines` (line 79) since the field no longer exists, and delete the `"flow"`/`"concept"` cases in `formatCodebaseKnowledgeRecordMapDetailLines` (lines 107-109).

- [ ] **Step 4: Run tests to verify pass**

Run: `cd packages/codebase-knowledge && bun test test/codebaseKnowledgeToolResultText.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/codebase-knowledge/src/codebaseKnowledgeToolResultText.ts packages/codebase-knowledge/test/codebaseKnowledgeToolResultText.test.ts
git commit -m "Emit exact symbol extent in locator tool result"
```

---

## Task 4: Drop freshness/sourceKind from indexer-built records

**Files:**
- Modify: `packages/codebase-knowledge/src/treeSitter/treeSitterCodebaseStructureIndexer.ts`
- Test: `packages/codebase-knowledge/test/treeSitterCodebaseStructureIndexer.test.ts`

- [ ] **Step 1: Find where records are constructed**

Run: `grep -n "freshness\|sourceKind\|recordKind:" packages/codebase-knowledge/src/treeSitter/treeSitterCodebaseStructureIndexer.ts`
Expected: lines that set `freshness: "fresh"` on file/symbol records and `sourceKind: "tree_sitter_structure"` on evidence ranges.

- [ ] **Step 2: Update the failing test expectations first**

In `treeSitterCodebaseStructureIndexer.test.ts`, remove any assertions referencing `freshness` or `evidenceRange.sourceKind`. Run it to confirm those are the only knowledge-shape references:
Run: `grep -n "freshness\|sourceKind" packages/codebase-knowledge/test/treeSitterCodebaseStructureIndexer.test.ts`

- [ ] **Step 3: Remove the fields from built records**

Delete every `freshness: "fresh",` line in the record builders and every `sourceKind: "tree_sitter_structure",` line in evidence-range construction.

- [ ] **Step 4: Run package tests**

Run: `cd packages/codebase-knowledge && bun test test/treeSitterCodebaseStructureIndexer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/codebase-knowledge/src/treeSitter/treeSitterCodebaseStructureIndexer.ts packages/codebase-knowledge/test/treeSitterCodebaseStructureIndexer.test.ts
git commit -m "Drop freshness and evidence source kind from indexed records"
```

---

## Task 5: Repository — remove migration, rename stale removal, bump version

**Files:**
- Modify: `packages/codebase-knowledge/src/codebaseStructureMapVersion.ts`
- Modify: `packages/codebase-knowledge/src/jsonFileCodebaseKnowledgeRepository.ts`
- Modify: `packages/codebase-knowledge/src/inMemoryCodebaseKnowledgeRepository.ts`
- Test: `packages/codebase-knowledge/test/jsonFileCodebaseKnowledgeRepository.test.ts`, `test/inMemoryCodebaseKnowledgeRepository.test.ts`

- [ ] **Step 1: Bump the structure map version**

```ts
export const CURRENT_CODEBASE_STRUCTURE_MAP_VERSION = 3;
```

This forces the workspace index (`treeSitterWorkspaceCodebaseKnowledgeIndex.ts:357`) to rebuild from scratch — no migration needed.

- [ ] **Step 2: Remove v1/v2 schema-compat parsing**

In `jsonFileCodebaseKnowledgeRepository.ts`, delete any Zod schema variants / branching that read older on-disk shapes (search for version checks and legacy record parsing). Keep a single current snapshot schema. Remove the `freshness` and `sourceKind` fields from the persisted record schema and the `CodebaseKnowledgeFreshness` import.

Run first to locate: `grep -n "freshness\|sourceKind\|version\|v1\|v2\|legacy\|migrat" packages/codebase-knowledge/src/jsonFileCodebaseKnowledgeRepository.ts`

- [ ] **Step 3: Rename `markFilePathStale` → `removeFileRecords`**

Both repositories. In-memory: delete the matching records from the map. JSON: remove the file's records and its `indexedFiles` entry from the snapshot, then persist. Neither keeps a stale marker.

- [ ] **Step 4: Update repository tests**

Replace `markFilePathStale` calls with `removeFileRecords` and assert the records are gone (not present-but-stale). Remove freshness assertions.

- [ ] **Step 5: Run the package test suite**

Run: `cd packages/codebase-knowledge && bun test`
Expected: PASS (whole package).

- [ ] **Step 6: Commit**

```bash
git add packages/codebase-knowledge/src
git add packages/codebase-knowledge/test
git commit -m "Remove index migration and stale markers; rebuild on version bump"
```

---

## Task 6: Workspace index — remove stale handling

**Files:**
- Modify: `packages/engine/src/codebaseKnowledge/treeSitterWorkspaceCodebaseKnowledgeIndex.ts`

- [ ] **Step 1: Locate stale logic**

Run: `grep -n "markFilePathStale\|stale\|freshness" packages/engine/src/codebaseKnowledge/treeSitterWorkspaceCodebaseKnowledgeIndex.ts`

- [ ] **Step 2: Replace mark-stale with remove**

For deleted files, call `removeFileRecords(filePath)` instead of `markFilePathStale`. Delete metrics that count stale records/files (`staleIndexedFileCount`, `staleRecordCount`) and any "preserve stale records" branch. The diagnostic log key stays `codebase_knowledge.workspace_index_completed`; just drop the stale fields from its payload.

- [ ] **Step 3: Build the engine package**

Run: `cd packages/engine && bun run typecheck`
Expected: errors remain only in tool-rename sites (Tasks 7-9) — none about freshness/stale.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/codebaseKnowledge/treeSitterWorkspaceCodebaseKnowledgeIndex.ts
git commit -m "Remove stale record handling from workspace index"
```

---

## Task 7: Contracts — rename and reshape the tool

**Files:**
- Modify: `packages/contracts/src/toolCallRequest.ts`
- Modify: `packages/contracts/src/toolCallDetail.ts`
- Modify: `packages/contracts/src/toolCatalog.ts`
- Modify: `packages/contracts/src/toolCallDetail.ts` exports / `index.ts` if names are re-exported
- Test: `packages/contracts/test/contracts.test.ts`

- [ ] **Step 1: Replace the request schema**

In `toolCallRequest.ts` (lines 203-214) replace with:

```ts
export const LocateCodebaseSymbolsToolCallRequestSchema = z
  .object({
    toolName: z.literal("locate_codebase_symbols"),
    symbolNames: z
      .array(z.string().min(1).max(MAX_CODEBASE_KNOWLEDGE_SYMBOL_NAME_LENGTH))
      .max(MAX_CODEBASE_KNOWLEDGE_REFERENCE_COUNT)
      .optional(),
    filePaths: z.array(WorkspacePathSchema).max(MAX_CODEBASE_KNOWLEDGE_REFERENCE_COUNT).optional(),
    maximumResultCount: z.number().int().positive().max(MAX_CODEBASE_KNOWLEDGE_RESULT_COUNT).optional(),
  })
  .strict()
  .refine((value) => (value.symbolNames?.length ?? 0) > 0 || (value.filePaths?.length ?? 0) > 0, {
    message: "Provide at least one symbolNames or filePaths entry.",
  });
```

Drop the now-unused `MAX_CODEBASE_KNOWLEDGE_PROBLEM_DESCRIPTION_LENGTH` constant if nothing else references it (grep first). Update the `ToolCallRequestSchema` discriminated union member name and the exported `QueryCodebaseKnowledgeToolCallRequest` type → `LocateCodebaseSymbolsToolCallRequest`.

- [ ] **Step 2: Replace the detail schema**

In `toolCallDetail.ts` (lines 264-274):

```ts
export const ToolCallLocateCodebaseSymbolsDetailSchema = z
  .object({
    toolName: z.literal("locate_codebase_symbols"),
    symbolNames: z.array(z.string().min(1)).optional(),
    filePaths: z.array(z.string().min(1)).optional(),
    matchedKnowledgeCount: z.number().int().nonnegative().optional(),
    recommendedReadCount: z.number().int().nonnegative().optional(),
  })
  .strict();
export type ToolCallLocateCodebaseSymbolsDetail = z.infer<typeof ToolCallLocateCodebaseSymbolsDetailSchema>;
```

Update the detail discriminated union and `createStartedToolCallDetailFromRequest` mapping for the new field names.

- [ ] **Step 3: Update the catalog**

In `toolCatalog.ts` replace the literal `"query_codebase_knowledge"` in all six sites (lines 37, 46, 48, 108-109, 137, 205, 208) with `"locate_codebase_symbols"`, and rename the guard function `is...QueryCodebaseKnowledge...` accordingly.

- [ ] **Step 4: Regenerate / hand-edit the JSON schemas**

Update `packages/contracts/schemas/tool-call-request-v1.schema.json` and `tool-call-detail-v1.schema.json` to match the new tool name and fields. If the repo has a schema-gen script, run it; otherwise edit by hand to mirror the Zod shapes above.
Run: `grep -rln "query_codebase_knowledge\|codebaseProblemDescription" packages/contracts/schemas` — expected empty after the edit.

- [ ] **Step 5: Update and run contract tests**

Run: `cd packages/contracts && bun test`
Expected: PASS after renaming references in `contracts.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src packages/contracts/schemas packages/contracts/test
git commit -m "Rename knowledge tool to locate_codebase_symbols in contracts"
```

---

## Task 8: OpenAI provider — tool definition and parser

**Files:**
- Modify: `packages/openai/src/provider/toolDefinitions.ts`
- Modify: `packages/openai/src/provider/request.ts`, `turnSession.ts` (rename references)

- [ ] **Step 1: Replace the tool definition** (lines 281-322)

```ts
export function createLocateCodebaseSymbolsToolDefinition(): OpenAiToolDefinition<"locate_codebase_symbols"> {
  return {
    type: "function",
    name: "locate_codebase_symbols",
    description:
      "Resolve a known symbol name or file path to its exact definition: file, kind, exported flag, and start-end line span, plus a precise read target. Use after grep surfaces a name, before reading. Verify current source with read.",
    parameters: {
      type: "object",
      properties: {
        symbolNames: {
          type: ["array", "null"],
          maxItems: MAX_CODEBASE_KNOWLEDGE_REFERENCE_COUNT,
          description: "Symbol names to locate (function/class/type/interface/enum/variable); null when none.",
          items: { type: "string", description: "Exact or partial symbol name." },
        },
        filePaths: {
          type: ["array", "null"],
          maxItems: MAX_CODEBASE_KNOWLEDGE_REFERENCE_COUNT,
          description: "File paths to fetch the structural map for; null when none.",
          items: { type: "string", description: "Workspace-relative or absolute path." },
        },
        maximumResultCount: {
          type: ["integer", "null"],
          minimum: 1,
          maximum: MAX_CODEBASE_KNOWLEDGE_RESULT_COUNT,
          description: "Maximum matches to return, or null for the default.",
        },
      },
      required: ["symbolNames", "filePaths", "maximumResultCount"],
      additionalProperties: false,
    },
    strict: true,
  };
}
```

- [ ] **Step 2: Replace the parser** (lines 769-799)

```ts
function parseLocateCodebaseSymbolsOpenAiToolCallRequest(
  parsedArguments: JsonObjectRecord,
): ToolCallRequestByName<"locate_codebase_symbols"> {
  const symbolNames = readOptionalStringArrayToolArgument(parsedArguments, "symbolNames", "locate_codebase_symbols");
  const filePaths = readOptionalStringArrayToolArgument(parsedArguments, "filePaths", "locate_codebase_symbols");
  const maximumResultCount = readOptionalPositiveIntegerToolArgument(parsedArguments, "maximumResultCount", "locate_codebase_symbols");
  return {
    toolName: "locate_codebase_symbols",
    ...(symbolNames !== undefined ? { symbolNames } : {}),
    ...(filePaths !== undefined ? { filePaths } : {}),
    ...(maximumResultCount !== undefined ? { maximumResultCount } : {}),
  };
}
```

- [ ] **Step 3: Update the registry map** (lines 541-544) and any references in `request.ts` / `turnSession.ts`

Run: `grep -rn "query_codebase_knowledge\|QueryCodebaseKnowledge\|maximumKnowledgeResultCount\|codebaseProblemDescription" packages/openai/src`
Replace each with the locate-symbols equivalent.

- [ ] **Step 4: Typecheck the provider**

Run: `cd packages/openai && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/openai/src
git commit -m "Rename OpenAI tool definition to locate_codebase_symbols"
```

---

## Task 9: Engine tool runner and dispatch

**Files:**
- Rename: `packages/engine/src/tools/queryCodebaseKnowledgeTool.ts` → `locateCodebaseSymbolsTool.ts`
- Modify: `packages/engine/src/runtimeReadOnlyToolCallExecution.ts`, `runtimeToolCallExecution.ts`, `readOnlyToolCallCoalescing.ts`, `readOnlyToolEvidenceNotebook.ts`, `runtimeReadOnlyToolCallConcurrencyLimiter.ts`, `runtimeTaskToolCallExecution.ts`

- [ ] **Step 1: Rename the tool module and its exports**

```bash
git mv packages/engine/src/tools/queryCodebaseKnowledgeTool.ts packages/engine/src/tools/locateCodebaseSymbolsTool.ts
```

Rename the functions: `runQueryCodebaseKnowledgeToolCall` → `runLocateCodebaseSymbolsToolCall`, `createStartedQueryCodebaseKnowledgeToolCallDetail` → `createStartedLocateCodebaseSymbolsToolCallDetail`. Update `createCodebaseKnowledgeQuery` to map the new request fields:

```ts
function createCodebaseKnowledgeQuery(
  request: LocateCodebaseSymbolsToolCallRequest,
): CodebaseKnowledgeQuery {
  return {
    ...(request.symbolNames !== undefined ? { symbolNames: request.symbolNames } : {}),
    ...(request.filePaths !== undefined ? { filePaths: request.filePaths } : {}),
    ...(request.maximumResultCount !== undefined ? { maximumResultCount: request.maximumResultCount } : {}),
  };
}
```

- [ ] **Step 2: Update all dispatch sites**

Run: `grep -rn "query_codebase_knowledge\|QueryCodebaseKnowledge\|queryCodebaseKnowledgeTool" packages/engine/src`
Replace each literal/identifier with the locate-symbols equivalent, including the concurrency category key (keep the `"knowledge"` category string — it is an internal bucket, not the tool name, unless tests assert otherwise).

- [ ] **Step 3: Typecheck the engine**

Run: `cd packages/engine && bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src
git commit -m "Rename engine knowledge tool runner to locate_codebase_symbols"
```

---

## Task 10: CLI export rendering

**Files:**
- Modify: `apps/cli/src/conversationSession/export/toolBlocks.ts`
- Test: `apps/cli/test/conversationSessionHtmlExport.test.ts`

- [ ] **Step 1: Locate the render branch**

Run: `grep -n "query_codebase_knowledge\|codebaseProblemDescription\|QueryCodebaseKnowledge" apps/cli/src/conversationSession/export/toolBlocks.ts`

- [ ] **Step 2: Update the branch**

Rename the tool-name match to `"locate_codebase_symbols"` and render `symbolNames` / `filePaths` instead of `codebaseProblemDescription`.

- [ ] **Step 3: Update the export test**

Adjust any fixture in `conversationSessionHtmlExport.test.ts` that builds a `query_codebase_knowledge` detail.
Run: `cd apps/cli && bun test test/conversationSessionHtmlExport.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/cli/src/conversationSession/export/toolBlocks.ts apps/cli/test/conversationSessionHtmlExport.test.ts
git commit -m "Render locate_codebase_symbols tool calls in CLI export"
```

---

## Task 11: Rewrite system-prompt guidance

**Files:**
- Modify: `packages/engine/src/systemPrompt.ts`

- [ ] **Step 1: Replace each guidance line**

Lines 235, 237, 238, 432, 434, 435, 446, 448. Replace the orientation/flows/concepts framing with the locator workflow. Suggested replacements:

- "- After grep surfaces a symbol name, call locate_codebase_symbols with that name to get its exact file and start-end line span, then read that exact range."
- "- For file structure, call locate_codebase_symbols with filePaths to get a file's imports, exports, and symbol list before reading."
- "- Always verify locate_codebase_symbols results with read before relying on implementation details."
- For the concurrency line (446): "- Run locate_codebase_symbols concurrently with independent read or grep or glob calls when those inspections do not depend on its result."

Remove every mention of "flows or concepts" and "broad orientation."

- [ ] **Step 2: Confirm no stale references remain**

Run: `grep -n "query_codebase_knowledge\|flows, or concepts\|broad orientation" packages/engine/src/systemPrompt.ts`
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/systemPrompt.ts
git commit -m "Rewrite system prompt guidance for locate_codebase_symbols"
```

---

## Task 12: Full sweep — build, test, residual references

- [ ] **Step 1: Search the whole repo for stragglers**

Run: `grep -rn "query_codebase_knowledge\|codebaseProblemDescription\|maximumKnowledgeResultCount\|markFilePathStale\|freshness" packages apps --include='*.ts' --include='*.json'`
Expected: empty (or only inside this plan/spec markdown, which the glob excludes).

- [ ] **Step 2: Typecheck every touched package**

Run: `bun run -r typecheck` (or per-package `bun run typecheck` in codebase-knowledge, contracts, engine, openai, apps/cli)
Expected: PASS everywhere.

- [ ] **Step 3: Run the full test suite**

Run: `bun test` from the repo root (or per package).
Expected: PASS.

- [ ] **Step 4: Manual smoke check of the index rebuild**

Delete the local cache and run the app once so the v3 index regenerates:
```bash
rm -rf .buli/index
```
Then start the CLI normally and confirm no migration errors and that a `locate_codebase_symbols` call returns a symbol extent.

- [ ] **Step 5: Final commit (if any residual fixes)**

```bash
git add -A
git commit -m "Finalize locate_codebase_symbols rename and cleanup"
```

---

## Notes for the implementer

- Comment style: only WHY/constraint/lifecycle comments; never restate what the code does.
- Commit messages: plain, no co-author trailer.
- Work directly on `main`.
- The `"knowledge"` concurrency-category string is an internal bucket name, not the tool name — leave it unless a test asserts otherwise.
