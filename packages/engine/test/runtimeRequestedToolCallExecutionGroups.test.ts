import { expect, test } from "bun:test";
import type { ProviderRequestedToolCall } from "@buli/contracts";
import { groupRequestedToolCallsForExecution } from "../src/runtimeRequestedToolCallExecutionGroups.ts";

const readRequestedToolCall = {
  toolCallId: "call_read_1",
  toolCallRequest: { toolName: "read", readTargetPath: "README.md" },
} as const satisfies ProviderRequestedToolCall;

const grepRequestedToolCall = {
  toolCallId: "call_grep_1",
  toolCallRequest: { toolName: "grep", regexPattern: "ToolCallRequest" },
} as const satisfies ProviderRequestedToolCall;

const readManyRequestedToolCall = {
  toolCallId: "call_read_many_1",
  toolCallRequest: {
    toolName: "read_many",
    readTargets: [
      { readTargetPath: "README.md" },
      { readTargetPath: "package.json" },
    ],
  },
} as const satisfies ProviderRequestedToolCall;

const searchManyRequestedToolCall = {
  toolCallId: "call_search_many_1",
  toolCallRequest: {
    toolName: "search_many",
    searches: [
      { searchKind: "glob", globPattern: "**/*.ts" },
      { searchKind: "grep", regexPattern: "ToolCallRequest" },
    ],
  },
} as const satisfies ProviderRequestedToolCall;

const bashRequestedToolCall = {
  toolCallId: "call_bash_1",
  toolCallRequest: {
    toolName: "bash",
    shellCommand: "pwd",
    commandDescription: "Print working directory",
  },
} as const satisfies ProviderRequestedToolCall;

const editRequestedToolCall = {
  toolCallId: "call_edit_1",
  toolCallRequest: {
    toolName: "edit",
    editTargetPath: "README.md",
    oldString: "old",
    newString: "new",
  },
} as const satisfies ProviderRequestedToolCall;

const taskRequestedToolCall = {
  toolCallId: "call_task_1",
  toolCallRequest: {
    toolName: "task",
    subagentName: "explore",
    subagentDescription: "Map docs",
    subagentPrompt: "Inspect documentation flow.",
  },
} as const satisfies ProviderRequestedToolCall;

const secondTaskRequestedToolCall = {
  toolCallId: "call_task_2",
  toolCallRequest: {
    toolName: "task",
    subagentName: "explore",
    subagentDescription: "Map TUI",
    subagentPrompt: "Inspect TUI rendering flow.",
  },
} as const satisfies ProviderRequestedToolCall;

test("groupRequestedToolCallsForExecution groups adjacent read-only calls", () => {
  expect(groupRequestedToolCallsForExecution([readRequestedToolCall, readManyRequestedToolCall, searchManyRequestedToolCall, grepRequestedToolCall, taskRequestedToolCall])).toEqual([
    {
      groupKind: "auto_concurrent",
      requestedToolCalls: [readRequestedToolCall, readManyRequestedToolCall, searchManyRequestedToolCall, grepRequestedToolCall, taskRequestedToolCall],
    },
  ]);
});

test("groupRequestedToolCallsForExecution preserves serial barriers around bash calls", () => {
  expect(groupRequestedToolCallsForExecution([readRequestedToolCall, bashRequestedToolCall, grepRequestedToolCall])).toEqual([
    {
      groupKind: "serial",
      requestedToolCall: readRequestedToolCall,
    },
    {
      groupKind: "serial",
      requestedToolCall: bashRequestedToolCall,
    },
    {
      groupKind: "serial",
      requestedToolCall: grepRequestedToolCall,
    },
  ]);
});

test("groupRequestedToolCallsForExecution preserves mutation barriers between task groups", () => {
  expect(groupRequestedToolCallsForExecution([
    taskRequestedToolCall,
    readRequestedToolCall,
    editRequestedToolCall,
    secondTaskRequestedToolCall,
  ])).toEqual([
    {
      groupKind: "auto_concurrent",
      requestedToolCalls: [taskRequestedToolCall, readRequestedToolCall],
    },
    {
      groupKind: "serial",
      requestedToolCall: editRequestedToolCall,
    },
    {
      groupKind: "serial",
      requestedToolCall: secondTaskRequestedToolCall,
    },
  ]);
});

test("groupRequestedToolCallsForExecution keeps single auto-concurrent calls serial", () => {
  expect(groupRequestedToolCallsForExecution([readRequestedToolCall])).toEqual([
    { groupKind: "serial", requestedToolCall: readRequestedToolCall },
  ]);
  expect(groupRequestedToolCallsForExecution([taskRequestedToolCall])).toEqual([
    { groupKind: "serial", requestedToolCall: taskRequestedToolCall },
  ]);
});

test("groupRequestedToolCallsForExecution returns no groups for an empty batch", () => {
  expect(groupRequestedToolCallsForExecution([])).toEqual([]);
});
