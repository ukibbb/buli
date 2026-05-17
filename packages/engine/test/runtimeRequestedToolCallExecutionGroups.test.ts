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

const exploreRequestedToolCall = {
  toolCallId: "call_explore_1",
  toolCallRequest: {
    toolName: "explore",
    explorationDescription: "Map runtime",
    explorationPrompt: "Inspect engine runtime flow.",
  },
} as const satisfies ProviderRequestedToolCall;

const secondExploreRequestedToolCall = {
  toolCallId: "call_explore_2",
  toolCallRequest: {
    toolName: "explore",
    explorationDescription: "Map TUI",
    explorationPrompt: "Inspect TUI rendering flow.",
  },
} as const satisfies ProviderRequestedToolCall;

test("groupRequestedToolCallsForExecution groups adjacent read-only calls", () => {
  expect(groupRequestedToolCallsForExecution([readRequestedToolCall, grepRequestedToolCall])).toEqual([
    {
      groupKind: "auto_concurrent",
      requestedToolCalls: [readRequestedToolCall, grepRequestedToolCall],
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

test("groupRequestedToolCallsForExecution preserves mutation barriers between Explorer groups", () => {
  expect(groupRequestedToolCallsForExecution([
    exploreRequestedToolCall,
    readRequestedToolCall,
    editRequestedToolCall,
    secondExploreRequestedToolCall,
  ])).toEqual([
    {
      groupKind: "auto_concurrent",
      requestedToolCalls: [exploreRequestedToolCall, readRequestedToolCall],
    },
    {
      groupKind: "serial",
      requestedToolCall: editRequestedToolCall,
    },
    {
      groupKind: "serial",
      requestedToolCall: secondExploreRequestedToolCall,
    },
  ]);
});

test("groupRequestedToolCallsForExecution keeps single auto-concurrent calls serial", () => {
  expect(groupRequestedToolCallsForExecution([readRequestedToolCall])).toEqual([
    { groupKind: "serial", requestedToolCall: readRequestedToolCall },
  ]);
  expect(groupRequestedToolCallsForExecution([exploreRequestedToolCall])).toEqual([
    { groupKind: "serial", requestedToolCall: exploreRequestedToolCall },
  ]);
});

test("groupRequestedToolCallsForExecution returns no groups for an empty batch", () => {
  expect(groupRequestedToolCallsForExecution([])).toEqual([]);
});
