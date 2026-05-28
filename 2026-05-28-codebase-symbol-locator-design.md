# Codebase Symbol Locator — Design

Date: 2026-05-28
Status: Approved for planning

## Purpose

Replace the broad `query_codebase_knowledge` tool with a sharp, name-driven
locator. The agent's real need: after `grep` surfaces a symbol name
or file path, resolve it to the **exact definition and line span** so the
follow-up `read` lands precisely on the symbol body — no whole-file reads, no
guessed offsets.

Scope chosen: **locator + lightweight discovery**. We keep precise symbol lookup
and the ability to find files/symbols by name or path, and we cut everything that
is not generated or used today.

The underlying tree-sitter indexer and JSON storage stay. The query, scoring,
result-formatting, and prompt layers are rebuilt from the ground up.

## New tool

Name: `locate_codebase_symbols` (replaces `query_codebase_knowledge`; the old name
is removed everywhere).

### Inputs

```ts
{
  toolName: "locate_codebase_symbols",
  symbolNames?: string[],        // exact match wins, substring as fallback
  filePaths?: string[],          // exact + partial path match
  maximumResultCount?: number,   // default 8
}
```

- At least one of `symbolNames` / `filePaths` must be provided.
- No prose `codebaseProblemDescription` field. This is a new tool; the prose
  search path is removed entirely.

### Output

Symbol match — exact extent plus a precise read target:

```xml
<symbol name="someSymbol" kind="function" exported="true" file="…" lines="142-187" />
<declaration_preview>…</declaration_preview>
<read file="…" offset_line="142" line_count="46" reason="someSymbol definition" />
```

File match — the file's structural map (imports / exports / symbol list), already
indexed today.

### Ranking

Scoring collapses to deterministic name/path matching (no token overlap, no
freshness):

1. Exact symbol-name match — dominant sort key (grepped name resolves to its
   definition at rank #1).
2. Substring symbol-name match.
3. Exact file-path match.
4. Partial file-path match.

Ties broken by title, as today.

## What gets deleted

- **`flow` and `concept` record kinds** — never generated. Remove
  `CodebaseFlowKnowledgeRecord`, `CodebaseConceptKnowledgeRecord`, and their
  branches in scoring, reference-listing, and result formatting.
- **Freshness** — the `freshness` field, `CodebaseKnowledgeFreshness`, and the
  `+3` / `-20` scoring. Deleted files have their records **removed** rather than
  kept-and-marked-stale. `markFilePathStale` → `removeFileRecords`.
- **`CodebaseEvidenceSourceKind` union** — only `"tree_sitter_structure"` is ever
  produced. Collapse to a plain range (drop `sourceKind`).
- **Token-overlap scoring** — `buildRecordSearchText`, `tokenizeSearchText`,
  `countTokenOverlap`, `normalizeToken`-based search, and the prose-query path.
- **v1/v2/v3 JSON migration** — start fresh. Bump the structure-map version; the
  `.buli/index` cache is regenerated once on next run. No migration code.

## What survives

- Record kinds: `file` and `symbol` only.
- The tree-sitter indexer keeps producing both file and symbol structure records.
- JSON storage (`JsonFileCodebaseKnowledgeRepository`) minus the migration path.
- Workspace indexing orchestration, minus stale handling (now: remove on delete).

## Prompt + tool-definition rewrite

The rename strands the tool unless the prompt is updated. Two files:

1. **Tool schema description** — `packages/openai/src/provider/toolDefinitions.ts`
   (`createQueryCodebaseKnowledgeToolDefinition`, ~line 281–318). Rename the
   definition and parser, replace the description with the name-driven locator
   purpose, swap required args to `symbolNames` / `filePaths` /
   `maximumResultCount`.
2. **System-prompt usage guidance** — `packages/engine/src/systemPrompt.ts`
   (~lines 235, 237, 238, 432, 434, 435, 446, 448, across both prompt variants).
   New guidance:
   - After `grep` surfaces a symbol name, call
     `locate_codebase_symbols` to get its exact file + line span, then `read`
     that span.
   - Remove "flows or concepts" framing.
   - Keep the "verify with `read` before relying on details" note.

## Blast radius

- **contracts** — `toolCallRequest.ts`, `toolCallDetail.ts`, and the JSON schemas
  under `packages/contracts/schemas/` (tool-call-detail, tool-call-request).
  Rename tool, change input shape, update `toolCatalog.ts` registration.
- **engine** — `treeSitterWorkspaceCodebaseKnowledgeIndex.ts` (stale → remove),
  `tools/queryCodebaseKnowledgeTool.ts` (rename + new query call),
  `runtimeReadOnlyToolCallExecution.ts` / `runtimeToolCallExecution.ts` dispatch,
  evidence-notebook / coalescing references.
- **openai provider** — `toolDefinitions.ts`, `turnSession.ts`, `request.ts`.
- **codebase-knowledge package** — types, query, result-text, repositories,
  indexer record building.
- **cli** — `conversationSession/export/toolBlocks.ts` rendering.
- **tests** — the package and contract tests get simpler; update fixtures.

## Decisions

- Tool name: `locate_codebase_symbols`.
- No index migration; rebuild on version bump.
- No prose-description input.
