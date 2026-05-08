import { expect, test } from "bun:test";
import type { ConversationSessionEntry, ModelContextItem } from "@buli/contracts";
import {
  projectConversationSessionEntriesToModelContextItems,
  projectConversationSessionEntryToModelContextItems,
} from "../src/index.ts";

test("projectConversationSessionEntryToModelContextItems maps each session entry kind explicitly", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "user_prompt",
      promptText: "Inspect @notes.txt",
      modelFacingPromptText: "Inspect @notes.txt\n\nAttached prompt context...",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Stored the context.",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "incomplete",
      assistantMessageText: "Partial answer",
      incompleteReason: "max_output_tokens",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "failed",
      assistantMessageText: "Unsafe partial answer",
      failureExplanation: "Provider failed mid-turn",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "interrupted",
      assistantMessageText: "Interrupted partial answer",
      interruptionReason: "Interrupted by user.",
    },
    {
      entryKind: "tool_call",
      toolCallId: "call_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "pwd",
        commandDescription: "Print working directory",
      },
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_1",
      toolCallDetail: {
        toolName: "bash",
        commandLine: "pwd",
        commandDescription: "Print working directory",
      },
      toolResultText: "Working directory: /tmp",
    },
    {
      entryKind: "denied_tool_result",
      toolCallId: "call_2",
      toolCallDetail: {
        toolName: "bash",
        commandLine: "rm -rf /tmp/demo",
        commandDescription: "Dangerous demo",
      },
      toolResultText: "The user denied this bash command, so it was not executed.",
      denialExplanation: "The user denied this bash command, so it was not executed.",
    },
  ];

  expect(conversationSessionEntries.flatMap(projectConversationSessionEntryToModelContextItems)).toEqual<ModelContextItem[]>([
    {
      itemKind: "user_message",
      messageText: "Inspect @notes.txt\n\nAttached prompt context...",
    },
    {
      itemKind: "assistant_message",
      messageText: "Stored the context.",
    },
    {
      itemKind: "assistant_message",
      messageText: "Partial answer",
    },
  ]);
});

test("projectConversationSessionEntriesToModelContextItems projects completed and incomplete turns", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "user_prompt",
      promptText: "First prompt",
      modelFacingPromptText: "First prompt",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "First answer",
    },
    {
      entryKind: "user_prompt",
      promptText: "Second prompt",
      modelFacingPromptText: "Second prompt",
    },
    {
      entryKind: "tool_call",
      toolCallId: "call_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "pwd",
        commandDescription: "Print working directory",
      },
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_1",
      toolCallDetail: {
        toolName: "bash",
        commandLine: "pwd",
        commandDescription: "Print working directory",
      },
      toolResultText: "Working directory: /tmp",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "incomplete",
      assistantMessageText: "Second partial answer",
      incompleteReason: "max_output_tokens",
    },
  ];

  expect(projectConversationSessionEntriesToModelContextItems(conversationSessionEntries)).toEqual<ModelContextItem[]>([
    { itemKind: "user_message", messageText: "First prompt" },
    { itemKind: "assistant_message", messageText: "First answer" },
    { itemKind: "user_message", messageText: "Second prompt" },
    {
      itemKind: "tool_call",
      toolCallId: "call_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "pwd",
        commandDescription: "Print working directory",
      },
    },
    { itemKind: "tool_result", toolCallId: "call_1", toolResultText: "Working directory: /tmp" },
    { itemKind: "assistant_message", messageText: "Second partial answer" },
  ]);
});

test("projectConversationSessionEntriesToModelContextItems includes paired typed tool calls and results", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "user_prompt",
      promptText: "Inspect files",
      modelFacingPromptText: "Inspect files",
    },
    {
      entryKind: "tool_call",
      toolCallId: "call_read",
      toolCallRequest: {
        toolName: "read",
        readTargetPath: "README.md",
      },
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_read",
      toolCallDetail: {
        toolName: "read",
        readFilePath: "README.md",
        readLineCount: 10,
      },
      toolResultText: "1: # buli",
    },
    {
      entryKind: "tool_call",
      toolCallId: "call_glob",
      toolCallRequest: {
        toolName: "glob",
        globPattern: "**/*.ts",
      },
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_glob",
      toolCallDetail: {
        toolName: "glob",
        globPattern: "**/*.ts",
        matchedPathCount: 2,
        returnedPathCount: 2,
      },
      toolResultText: "src/index.ts",
    },
    {
      entryKind: "tool_call",
      toolCallId: "call_grep",
      toolCallRequest: {
        toolName: "grep",
        regexPattern: "ToolCallRequest",
      },
    },
    {
      entryKind: "failed_tool_result",
      toolCallId: "call_grep",
      toolCallDetail: {
        toolName: "grep",
        searchPattern: "ToolCallRequest",
      },
      toolResultText: "Grep failed: invalid regex",
      failureExplanation: "invalid regex",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Inspection complete.",
    },
  ];

  expect(projectConversationSessionEntriesToModelContextItems(conversationSessionEntries)).toEqual<ModelContextItem[]>([
    { itemKind: "user_message", messageText: "Inspect files" },
    { itemKind: "tool_call", toolCallId: "call_read", toolCallRequest: { toolName: "read", readTargetPath: "README.md" } },
    { itemKind: "tool_result", toolCallId: "call_read", toolResultText: "1: # buli" },
    { itemKind: "tool_call", toolCallId: "call_glob", toolCallRequest: { toolName: "glob", globPattern: "**/*.ts" } },
    { itemKind: "tool_result", toolCallId: "call_glob", toolResultText: "src/index.ts" },
    { itemKind: "tool_call", toolCallId: "call_grep", toolCallRequest: { toolName: "grep", regexPattern: "ToolCallRequest" } },
    { itemKind: "tool_result", toolCallId: "call_grep", toolResultText: "Grep failed: invalid regex" },
    { itemKind: "assistant_message", messageText: "Inspection complete." },
  ]);
});

test("projectConversationSessionEntriesToModelContextItems skips failed turns", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "user_prompt",
      promptText: "Failed prompt",
      modelFacingPromptText: "Failed prompt",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "failed",
      assistantMessageText: "Partial unsafe answer",
      failureExplanation: "Provider failed mid-turn",
    },
    {
      entryKind: "user_prompt",
      promptText: "Next prompt",
      modelFacingPromptText: "Next prompt",
    },
  ];

  expect(projectConversationSessionEntriesToModelContextItems(conversationSessionEntries)).toEqual<ModelContextItem[]>([
    { itemKind: "user_message", messageText: "Next prompt" },
  ]);
});

test("projectConversationSessionEntriesToModelContextItems skips interrupted turns", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "user_prompt",
      promptText: "Interrupted prompt",
      modelFacingPromptText: "Interrupted prompt",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "interrupted",
      assistantMessageText: "Partial answer",
      interruptionReason: "Interrupted by user.",
    },
    {
      entryKind: "user_prompt",
      promptText: "Next prompt",
      modelFacingPromptText: "Next prompt",
    },
  ];

  expect(projectConversationSessionEntriesToModelContextItems(conversationSessionEntries)).toEqual<ModelContextItem[]>([
    { itemKind: "user_message", messageText: "Next prompt" },
  ]);
});

test("projectConversationSessionEntriesToModelContextItems skips open tool turns with no result", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "user_prompt",
      promptText: "Run pwd",
      modelFacingPromptText: "Run pwd",
    },
    {
      entryKind: "tool_call",
      toolCallId: "call_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "pwd",
        commandDescription: "Print working directory",
      },
    },
  ];

  expect(projectConversationSessionEntriesToModelContextItems(conversationSessionEntries)).toEqual<ModelContextItem[]>([]);
});
