import { expect, test } from "bun:test";
import {
  HISTORICAL_TOOL_RESULT_TEXT_PER_OUTPUT_MAX_CHARACTER_COUNT,
  type ConversationSessionEntry,
  type ModelContextItem,
} from "@buli/contracts";
import {
  projectConversationSessionEntriesToModelContextItems,
  projectConversationSessionEntryToModelContextItems,
} from "../src/index.ts";

test("projectConversationSessionEntryToModelContextItems maps each session entry kind explicitly", () => {
  const imageAttachment = {
    attachmentId: "image-1",
    mimeType: "image/png" as const,
    dataUrl: "data:image/png;base64,aGVsbG8=",
  };
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "user_prompt",
      promptText: "Inspect @notes.txt",
      modelFacingPromptText: "Inspect @notes.txt\n\nAttached prompt context...",
      imageAttachments: [imageAttachment],
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Stored the context.",
    },
    {
      entryKind: "assistant_text_segment",
      assistantTextSegmentText: "Stored ",
    },
    {
      entryKind: "buli_sticky_notes",
      buliStickyNotesContextText: "BuliStickyNotes:\nPurpose-aware evidence notes from prior turns.",
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
      entryKind: "conversation_compaction_summary",
      summaryText: "Goal: continue from compacted context.",
      compactedEntryCount: 10,
      retainedRecentConversationSessionEntryCount: 0,
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
      imageAttachments: [imageAttachment],
    },
    {
      itemKind: "assistant_message",
      messageText: "Stored the context.",
    },
    {
      itemKind: "assistant_message",
      messageText: "Partial answer",
    },
    {
      itemKind: "compaction_summary",
      summaryText: "Goal: continue from compacted context.",
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
    { itemKind: "assistant_message", messageText: "Second partial answer" },
  ]);
});

test("projectConversationSessionEntryToModelContextItems preserves workflow mode metadata", () => {
  const imageAttachment = {
    attachmentId: "image-1",
    mimeType: "image/png" as const,
    dataUrl: "data:image/png;base64,aGVsbG8=",
  };

  expect(projectConversationSessionEntryToModelContextItems({
    entryKind: "user_prompt",
    promptText: "Inspect compaction",
    modelFacingPromptText: "Inspect compaction",
    assistantOperatingMode: "understand",
    imageAttachments: [imageAttachment],
  })).toEqual<ModelContextItem[]>([
    {
      itemKind: "user_message",
      messageText: "Inspect compaction",
      assistantOperatingMode: "understand",
      imageAttachments: [imageAttachment],
    },
  ]);

  expect(projectConversationSessionEntryToModelContextItems({
    entryKind: "assistant_message",
    assistantMessageStatus: "completed",
    assistantMessageText: "Compaction starts at the latest summary.",
    assistantOperatingMode: "understand",
  })).toEqual<ModelContextItem[]>([
    {
      itemKind: "assistant_message",
      messageText: "Compaction starts at the latest summary.",
      assistantOperatingMode: "understand",
    },
  ]);

  expect(projectConversationSessionEntryToModelContextItems({
    entryKind: "conversation_compaction_summary",
    summaryText: "Goal: execute the plan.",
    compactedEntryCount: 8,
    retainedRecentConversationSessionEntryCount: 0,
    latestCompletedAssistantOperatingMode: "plan",
  })).toEqual<ModelContextItem[]>([
    {
      itemKind: "compaction_summary",
      summaryText: "Goal: execute the plan.",
      latestCompletedAssistantOperatingMode: "plan",
    },
  ]);
});

test("projectConversationSessionEntriesToModelContextItems keeps completed tool outputs out of future active context", () => {
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
    { itemKind: "assistant_message", messageText: "Inspection complete." },
  ]);
});

test("projectConversationSessionEntriesToModelContextItems keeps BuliStickyNotes audit entries out of future active context", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "user_prompt",
      promptText: "Continue from context",
      modelFacingPromptText: "Continue from context",
    },
    {
      entryKind: "buli_sticky_notes",
      buliStickyNotesContextText: [
        "BuliStickyNotes:",
        "Purpose-aware evidence notes from prior turns:",
        "- Prior task: \"Inspect request projection\"; question: \"Where is replay built?\"; source: read request.ts via call_read; observed: found projection; freshness: fresh.",
      ].join("\n"),
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Continued without replaying sticky notes.",
    },
  ];

  expect(projectConversationSessionEntriesToModelContextItems(conversationSessionEntries)).toEqual<ModelContextItem[]>([
    { itemKind: "user_message", messageText: "Continue from context" },
    { itemKind: "assistant_message", messageText: "Continued without replaying sticky notes." },
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

test("projectConversationSessionEntriesToModelContextItems keeps completed tool side effects from failed turns", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "user_prompt",
      promptText: "Write generated file",
      modelFacingPromptText: "Write generated file",
    },
    {
      entryKind: "tool_call",
      toolCallId: "call_write",
      toolCallRequest: {
        toolName: "write",
        writeTargetPath: "generated.txt",
        fileContent: "created\n",
      },
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_write",
      toolCallDetail: {
        toolName: "write",
        writtenFilePath: "generated.txt",
        addedLineCount: 1,
        removedLineCount: 0,
      },
      toolResultText: "Wrote generated.txt",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "failed",
      assistantMessageText: "",
      failureExplanation: "Provider failed mid-turn",
    },
  ];

  expect(projectConversationSessionEntriesToModelContextItems(conversationSessionEntries)).toEqual<ModelContextItem[]>([
    { itemKind: "user_message", messageText: "Write generated file" },
    {
      itemKind: "tool_call",
      toolCallId: "call_write",
      toolCallRequest: {
        toolName: "write",
        writeTargetPath: "generated.txt",
        fileContent: "created\n",
      },
    },
    { itemKind: "tool_result", toolCallId: "call_write", toolResultText: "Wrote generated.txt" },
  ]);
});

test("projectConversationSessionEntriesToModelContextItems truncates large failed-turn tool side effects", () => {
  const largeHistoricalToolResultText = `start-${"x".repeat(HISTORICAL_TOOL_RESULT_TEXT_PER_OUTPUT_MAX_CHARACTER_COUNT)}-tail`;
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "user_prompt",
      promptText: "Read a large file",
      modelFacingPromptText: "Read a large file",
    },
    {
      entryKind: "tool_call",
      toolCallId: "call_read",
      toolCallRequest: {
        toolName: "read",
        readTargetPath: "large.txt",
      },
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_read",
      toolCallDetail: {
        toolName: "read",
        readFilePath: "large.txt",
        readLineCount: 1,
      },
      toolResultText: largeHistoricalToolResultText,
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "failed",
      assistantMessageText: "",
      failureExplanation: "Provider failed mid-turn",
    },
  ];

  const projectedModelContextItems = projectConversationSessionEntriesToModelContextItems(conversationSessionEntries);
  const toolResultModelContextItem = projectedModelContextItems.find(
    (modelContextItem) => modelContextItem.itemKind === "tool_result",
  );
  if (!toolResultModelContextItem || toolResultModelContextItem.itemKind !== "tool_result") {
    throw new Error("Expected failed turn to project its paired tool result.");
  }

  expect(toolResultModelContextItem.toolResultText.length).toBeLessThanOrEqual(
    HISTORICAL_TOOL_RESULT_TEXT_PER_OUTPUT_MAX_CHARACTER_COUNT,
  );
  expect(toolResultModelContextItem.toolResultText).toContain("start-");
  expect(toolResultModelContextItem.toolResultText).not.toContain("-tail");
  expect(toolResultModelContextItem.toolResultText).toContain(
    "[Historical tool result truncated for model context: omitted",
  );
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

test("projectConversationSessionEntriesToModelContextItems starts at the latest compaction summary", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "user_prompt",
      promptText: "Old prompt",
      modelFacingPromptText: "Old prompt",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Old answer",
    },
    {
      entryKind: "conversation_compaction_summary",
      summaryText: "Goal: continue the compaction implementation.",
      compactedEntryCount: 2,
      retainedRecentConversationSessionEntryCount: 0,
    },
    {
      entryKind: "user_prompt",
      promptText: "Next prompt",
      modelFacingPromptText: "Next prompt",
    },
  ];

  expect(projectConversationSessionEntriesToModelContextItems(conversationSessionEntries)).toEqual<ModelContextItem[]>([
    {
      itemKind: "compaction_summary",
      summaryText: "Goal: continue the compaction implementation.",
    },
    { itemKind: "user_message", messageText: "Next prompt" },
  ]);
});

test("projectConversationSessionEntriesToModelContextItems ignores retained recent entries after compaction summary", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "user_prompt",
      promptText: "Old prompt",
      modelFacingPromptText: "Old prompt",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Old answer",
    },
    {
      entryKind: "user_prompt",
      promptText: "Retained prompt",
      modelFacingPromptText: "Retained prompt",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Retained answer",
    },
    {
      entryKind: "conversation_compaction_summary",
      summaryText: "Goal: continue the compaction implementation.",
      compactedEntryCount: 2,
      retainedRecentConversationSessionEntryCount: 2,
    },
    {
      entryKind: "user_prompt",
      promptText: "Next prompt",
      modelFacingPromptText: "Next prompt",
    },
  ];

  expect(projectConversationSessionEntriesToModelContextItems(conversationSessionEntries)).toEqual<ModelContextItem[]>([
    {
      itemKind: "compaction_summary",
      summaryText: "Goal: continue the compaction implementation.",
    },
    { itemKind: "user_message", messageText: "Next prompt" },
  ]);
});
