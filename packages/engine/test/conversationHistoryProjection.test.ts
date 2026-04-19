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
      assistantMessageText: "Stored the context.",
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
      itemKind: "tool_call",
      toolCallId: "call_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "pwd",
        commandDescription: "Print working directory",
      },
    },
    {
      itemKind: "tool_result",
      toolCallId: "call_1",
      toolResultText: "Working directory: /tmp",
    },
    {
      itemKind: "tool_result",
      toolCallId: "call_2",
      toolResultText: "The user denied this bash command, so it was not executed.",
    },
  ]);
});

test("projectConversationSessionEntriesToModelContextItems matches repeated single-entry projection", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "user_prompt",
      promptText: "First prompt",
      modelFacingPromptText: "First prompt",
    },
    {
      entryKind: "assistant_message",
      assistantMessageText: "First answer",
    },
    {
      entryKind: "user_prompt",
      promptText: "Second prompt",
      modelFacingPromptText: "Second prompt",
    },
  ];

  expect(projectConversationSessionEntriesToModelContextItems(conversationSessionEntries)).toEqual(
    conversationSessionEntries.flatMap(projectConversationSessionEntryToModelContextItems),
  );
});
