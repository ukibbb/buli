import { expect, test } from "bun:test";
import type { ConversationSessionEntry } from "@buli/contracts";
import {
  buildReadOnlyToolCallEvidenceIndex,
  buildReadOnlyToolEvidenceLedgerText,
  createDuplicateReadOnlyToolResultText,
} from "../src/readOnlyToolCallEvidenceIndex.ts";

test("buildReadOnlyToolCallEvidenceIndex reuses a visible completed read result", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "tool_call",
      toolCallId: "call_read_1",
      toolCallRequest: {
        toolName: "read",
        readTargetPath: "src/app.ts",
        offsetLineNumber: 1,
        maximumLineCount: 2,
      },
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_read_1",
      toolCallDetail: {
        toolName: "read",
        readFilePath: "src/app.ts",
        readLineCount: 20,
        returnedLineCount: 2,
        previewLines: [
          { lineNumber: 1, lineText: "alpha" },
          { lineNumber: 2, lineText: "beta" },
        ],
      },
      toolResultText: "1: alpha\n2: beta",
    },
  ];

  const evidenceIndex = buildReadOnlyToolCallEvidenceIndex({ conversationSessionEntries });
  const reusableEvidence = evidenceIndex.findReusableReadToolCallEvidence({
    toolName: "read",
    readTargetPath: "src/app.ts",
    offsetLineNumber: 1,
    maximumLineCount: 2,
  });

  expect(reusableEvidence?.priorToolCallId).toBe("call_read_1");
  expect(reusableEvidence?.toolCallDetail).toMatchObject({
    toolName: "read",
    readFilePath: "src/app.ts",
  });
  expect(reusableEvidence ? createDuplicateReadOnlyToolResultText(reusableEvidence) : "").toContain(
    "<duplicate_read_only_tool_result>",
  );
  expect(buildReadOnlyToolEvidenceLedgerText({ conversationSessionEntries })).toContain(
    "read src/app.ts lines 1-2 via call_read_1",
  );
});

test("buildReadOnlyToolCallEvidenceIndex indexes completed read_many and search_many children", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "tool_call",
      toolCallId: "call_read_many_1",
      toolCallRequest: {
        toolName: "read_many",
        readTargets: [
          { readTargetPath: "src/app.ts", offsetLineNumber: 3, maximumLineCount: 1 },
          { readTargetPath: "missing.ts" },
        ],
      },
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_read_many_1",
      toolCallDetail: {
        toolName: "read_many",
        requestedReadTargetPaths: ["src/app.ts", "missing.ts"],
        completedReadCount: 1,
        failedReadCount: 1,
        readResults: [
          {
            readStatus: "completed",
            readDetail: {
              toolName: "read",
              readFilePath: "src/app.ts",
              returnedLineCount: 1,
              previewLines: [{ lineNumber: 3, lineText: "gamma" }],
            },
          },
          {
            readStatus: "failed",
            readDetail: { toolName: "read", readFilePath: "missing.ts" },
            failureExplanation: "File not found: missing.ts",
          },
        ],
      },
      toolResultText: "<read_many>...</read_many>",
    },
    {
      entryKind: "tool_call",
      toolCallId: "call_search_many_1",
      toolCallRequest: {
        toolName: "search_many",
        searches: [
          { searchKind: "glob", globPattern: "src/**/*.ts" },
          { searchKind: "grep", regexPattern: "TODO", searchPath: "src", includeGlobPattern: "*.ts" },
        ],
      },
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_search_many_1",
      toolCallDetail: {
        toolName: "search_many",
        requestedSearches: [
          { searchKind: "glob", globPattern: "src/**/*.ts" },
          { searchKind: "grep", regexPattern: "TODO", searchPath: "src", includeGlobPattern: "*.ts" },
        ],
        completedSearchCount: 2,
        failedSearchCount: 0,
        searchResults: [
          {
            searchStatus: "completed",
            searchDetail: {
              toolName: "glob",
              globPattern: "src/**/*.ts",
              matchedPaths: ["src/app.ts"],
            },
          },
          {
            searchStatus: "completed",
            searchDetail: {
              toolName: "grep",
              searchPattern: "TODO",
              matchHits: [{ matchFilePath: "src/app.ts", matchLineNumber: 3, matchSnippet: "// TODO" }],
            },
          },
        ],
      },
      toolResultText: "<search_many>...</search_many>",
    },
  ];

  const evidenceIndex = buildReadOnlyToolCallEvidenceIndex({ conversationSessionEntries });

  expect(evidenceIndex.findReusableReadManyTargetEvidence({
    readTargetPath: "src/app.ts",
    offsetLineNumber: 3,
    maximumLineCount: 1,
  })?.priorToolCallId).toBe("call_read_many_1");
  expect(evidenceIndex.findReusableReadManyTargetEvidence({ readTargetPath: "missing.ts" })).toBeUndefined();
  expect(evidenceIndex.findReusableSearchManySearchEvidence({ searchKind: "glob", globPattern: "src/**/*.ts" })?.priorToolCallId)
    .toBe("call_search_many_1");
  expect(evidenceIndex.findReusableSearchManySearchEvidence({
    searchKind: "grep",
    regexPattern: "TODO",
    searchPath: "src",
    includeGlobPattern: "*.ts",
  })?.priorToolCallId).toBe("call_search_many_1");
});

test("buildReadOnlyToolCallEvidenceIndex invalidates stale read and search evidence after workspace patches", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "tool_call",
      toolCallId: "call_read_app",
      toolCallRequest: { toolName: "read", readTargetPath: "src/app.ts" },
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_read_app",
      toolCallDetail: { toolName: "read", readFilePath: "src/app.ts", returnedLineCount: 1 },
      toolResultText: "1: old",
    },
    {
      entryKind: "tool_call",
      toolCallId: "call_read_other",
      toolCallRequest: { toolName: "read", readTargetPath: "src/other.ts" },
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_read_other",
      toolCallDetail: { toolName: "read", readFilePath: "src/other.ts", returnedLineCount: 1 },
      toolResultText: "1: stable",
    },
    {
      entryKind: "tool_call",
      toolCallId: "call_grep_1",
      toolCallRequest: { toolName: "grep", regexPattern: "old", searchPath: "src" },
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_grep_1",
      toolCallDetail: { toolName: "grep", searchPattern: "old", totalMatchCount: 1 },
      toolResultText: "src/app.ts:1:old",
    },
    {
      entryKind: "workspace_patch",
      workspacePatch: {
        workspacePatchId: "patch-1",
        toolCallId: "call_edit_1",
        capturedAtMs: 1,
        baselineSnapshotHash: "before",
        resultingSnapshotHash: "after",
        changedFileCount: 1,
        addedLineCount: 1,
        removedLineCount: 1,
        changedFiles: [
          {
            filePath: "src/app.ts",
            changeKind: "modified",
            addedLineCount: 1,
            removedLineCount: 1,
          },
        ],
      },
    },
  ];

  const evidenceIndex = buildReadOnlyToolCallEvidenceIndex({ conversationSessionEntries });

  expect(evidenceIndex.findReusableReadToolCallEvidence({ toolName: "read", readTargetPath: "src/app.ts" })).toBeUndefined();
  expect(evidenceIndex.findReusableReadToolCallEvidence({ toolName: "read", readTargetPath: "src/other.ts" })?.priorToolCallId)
    .toBe("call_read_other");
  expect(evidenceIndex.findReusableGrepToolCallEvidence({ toolName: "grep", regexPattern: "old", searchPath: "src" })).toBeUndefined();
});

test("buildReadOnlyToolCallEvidenceIndex invalidates stale evidence from mutation tool details without workspace patches", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "tool_call",
      toolCallId: "call_read_app",
      toolCallRequest: { toolName: "read", readTargetPath: "src/app.ts" },
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_read_app",
      toolCallDetail: { toolName: "read", readFilePath: "src/app.ts", returnedLineCount: 1 },
      toolResultText: "1: old",
    },
    {
      entryKind: "tool_call",
      toolCallId: "call_grep_1",
      toolCallRequest: { toolName: "grep", regexPattern: "old", searchPath: "src" },
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_grep_1",
      toolCallDetail: { toolName: "grep", searchPattern: "old", totalMatchCount: 1 },
      toolResultText: "src/app.ts:1:old",
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_edit_1",
      toolCallDetail: {
        toolName: "edit",
        editedFilePath: "src/app.ts",
        addedLineCount: 1,
        removedLineCount: 1,
      },
      toolResultText: "Edited src/app.ts",
    },
  ];

  const evidenceIndex = buildReadOnlyToolCallEvidenceIndex({ conversationSessionEntries });

  expect(evidenceIndex.findReusableReadToolCallEvidence({ toolName: "read", readTargetPath: "src/app.ts" })).toBeUndefined();
  expect(evidenceIndex.findReusableGrepToolCallEvidence({ toolName: "grep", regexPattern: "old", searchPath: "src" })).toBeUndefined();
});
