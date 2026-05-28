import { expect, test } from "bun:test";
import {
  createReadOnlyToolCallExecutionKey,
  createSameStepDuplicateReadOnlyToolResultText,
  isDuplicateReadOnlyToolResultText,
} from "../src/readOnlyToolCallCoalescing.ts";

test("createReadOnlyToolCallExecutionKey groups identical read requests", () => {
  const firstReadExecutionKey = createReadOnlyToolCallExecutionKey({
    toolName: "read",
    readTargetPath: "src/app.ts",
    offsetLineNumber: 1,
    maximumLineCount: 20,
    inspectionQuestion: "Where is app startup configured?",
  });

  const secondReadExecutionKey = createReadOnlyToolCallExecutionKey({
    toolName: "read",
    readTargetPath: "src/app.ts",
    offsetLineNumber: 1,
    maximumLineCount: 20,
    inspectionQuestion: "Why does app startup fail?",
  });

  expect(secondReadExecutionKey).toBe(firstReadExecutionKey);
});

test("createReadOnlyToolCallExecutionKey keeps different read ranges separate", () => {
  const firstReadExecutionKey = createReadOnlyToolCallExecutionKey({
    toolName: "read",
    readTargetPath: "src/app.ts",
    offsetLineNumber: 1,
    maximumLineCount: 20,
  });

  const secondReadExecutionKey = createReadOnlyToolCallExecutionKey({
    toolName: "read",
    readTargetPath: "src/app.ts",
    offsetLineNumber: 21,
    maximumLineCount: 20,
  });

  expect(secondReadExecutionKey).not.toBe(firstReadExecutionKey);
});

test("createReadOnlyToolCallExecutionKey normalizes codebase knowledge query text and hints", () => {
  const firstQueryExecutionKey = createReadOnlyToolCallExecutionKey({
    toolName: "locate_codebase_symbols",
    filePaths: ["src/runtime.ts", "src/provider.ts", "src/runtime.ts"],
    symbolNames: ["dispatchRuntime", "ProviderTurn", "dispatchRuntime"],
    maximumResultCount: 5,
  });

  const secondQueryExecutionKey = createReadOnlyToolCallExecutionKey({
    toolName: "locate_codebase_symbols",
    filePaths: ["src/provider.ts", "src/runtime.ts"],
    symbolNames: ["ProviderTurn", "dispatchRuntime"],
    maximumResultCount: 5,
  });

  expect(secondQueryExecutionKey).toBe(firstQueryExecutionKey);
});

test("createSameStepDuplicateReadOnlyToolResultText identifies same-step duplicate results", () => {
  const duplicateResultText = createSameStepDuplicateReadOnlyToolResultText({
    toolName: "read",
    previousToolCallId: "call_read_1",
  });

  expect(duplicateResultText).toContain("<duplicate_read_only_tool_result>");
  expect(duplicateResultText).toContain("<previousToolCallId>call_read_1</previousToolCallId>");
  expect(duplicateResultText).toContain("same response step duplicate");
  expect(isDuplicateReadOnlyToolResultText(duplicateResultText)).toBe(true);
  expect(isDuplicateReadOnlyToolResultText("ordinary read result")).toBe(false);
});
