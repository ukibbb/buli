import { expect, test } from "bun:test";
import type { ProviderRequestedToolCall } from "@buli/contracts";
import { createDefaultAssistantToolRegistry, type CustomAssistantToolDefinition } from "../src/assistantToolRegistry.ts";
import { groupRequestedToolCallsForExecution } from "../src/runtimeRequestedToolCallExecutionGroups.ts";

const readRequestedToolCall = {
  toolCallId: "call_read_1",
  toolCallRequest: { toolName: "read", readTargetPath: "README.md" },
} as const satisfies ProviderRequestedToolCall;

const grepRequestedToolCall = {
  toolCallId: "call_grep_1",
  toolCallRequest: { toolName: "grep", regexPattern: "ToolCallRequest" },
} as const satisfies ProviderRequestedToolCall;

const locateCodebaseSymbolsRequestedToolCall = {
  toolCallId: "call_locate_codebase_symbols_1",
  toolCallRequest: {
    toolName: "locate_codebase_symbols",
    symbolNames: ["streamAssistantResponseEventsForRequestedToolCalls"],
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

const customRequestedToolCall = {
  toolCallId: "call_workspace_summary_1",
  toolCallRequest: {
    toolName: "workspace_summary",
    toolArgumentsJson: { topic: "runtime" },
  },
} as const satisfies ProviderRequestedToolCall;

const customToolDefinition = {
  toolName: "workspace_summary",
  providerToolDefinition: {
    toolName: "workspace_summary",
    description: "Summarize a workspace topic.",
    parameters: {
      type: "object",
      properties: { topic: { type: "string" } },
      required: ["topic"],
      additionalProperties: false,
    },
  },
  executionPolicy: {
    workspaceEffectKind: "read_only",
    isAutoConcurrent: false,
    isAutoApprovedReadOnly: false,
    clearsSameTurnReadCoverageBeforeExecution: false,
  },
  executor: async () => ({ outcomeKind: "completed", toolResultText: "done" }),
} satisfies CustomAssistantToolDefinition;

const autoConcurrentCustomToolDefinition = {
  ...customToolDefinition,
  executionPolicy: {
    workspaceEffectKind: "read_only",
    isAutoConcurrent: true,
    isAutoApprovedReadOnly: true,
    clearsSameTurnReadCoverageBeforeExecution: false,
  },
} satisfies CustomAssistantToolDefinition;

test("groupRequestedToolCallsForExecution groups adjacent read-only calls", () => {
  expect(groupRequestedToolCallsForExecution([readRequestedToolCall, grepRequestedToolCall, taskRequestedToolCall])).toEqual([
    {
      groupKind: "auto_concurrent",
      requestedToolCalls: [readRequestedToolCall, grepRequestedToolCall, taskRequestedToolCall],
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

test("groupRequestedToolCallsForExecution groups exact symbol lookups with read-only calls", () => {
  expect(groupRequestedToolCallsForExecution([
    readRequestedToolCall,
    locateCodebaseSymbolsRequestedToolCall,
    grepRequestedToolCall,
  ])).toEqual([
    {
      groupKind: "auto_concurrent",
      requestedToolCalls: [readRequestedToolCall, locateCodebaseSymbolsRequestedToolCall, grepRequestedToolCall],
    },
  ]);
});

test("groupRequestedToolCallsForExecution returns no groups for an empty batch", () => {
  expect(groupRequestedToolCallsForExecution([])).toEqual([]);
});

test("groupRequestedToolCallsForExecution keeps registered custom tools serial", () => {
  const assistantToolRegistry = createDefaultAssistantToolRegistry({ additionalCustomTools: [customToolDefinition] });

  expect(groupRequestedToolCallsForExecution([
    readRequestedToolCall,
    customRequestedToolCall,
    grepRequestedToolCall,
  ], assistantToolRegistry)).toEqual([
    { groupKind: "serial", requestedToolCall: readRequestedToolCall },
    { groupKind: "serial", requestedToolCall: customRequestedToolCall },
    { groupKind: "serial", requestedToolCall: grepRequestedToolCall },
  ]);
});

test("groupRequestedToolCallsForExecution groups safe auto-concurrent custom tools with adjacent concurrent calls", () => {
  const assistantToolRegistry = createDefaultAssistantToolRegistry({
    additionalCustomTools: [autoConcurrentCustomToolDefinition],
  });

  expect(groupRequestedToolCallsForExecution([
    readRequestedToolCall,
    customRequestedToolCall,
    grepRequestedToolCall,
    taskRequestedToolCall,
  ], assistantToolRegistry)).toEqual([
    {
      groupKind: "auto_concurrent",
      requestedToolCalls: [readRequestedToolCall, customRequestedToolCall, grepRequestedToolCall, taskRequestedToolCall],
    },
  ]);
});

test("groupRequestedToolCallsForExecution keeps singleton auto-concurrent custom tool calls serial", () => {
  const assistantToolRegistry = createDefaultAssistantToolRegistry({
    additionalCustomTools: [autoConcurrentCustomToolDefinition],
  });

  expect(groupRequestedToolCallsForExecution([customRequestedToolCall], assistantToolRegistry)).toEqual([
    { groupKind: "serial", requestedToolCall: customRequestedToolCall },
  ]);
});
