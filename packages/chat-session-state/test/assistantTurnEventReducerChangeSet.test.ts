import { expect, test } from "bun:test";
import type { AssistantResponseEvent, PendingToolApprovalRequest } from "@buli/contracts";
import {
  applyAssistantResponseEventsToChatSessionStateWithChangeSet,
  createInitialChatSessionState,
} from "../src/index.ts";

const completedUsage = {
  total: 10,
  input: 4,
  output: 5,
  reasoning: 1,
  cache: { read: 0, write: 0 },
} as const;

const pendingToolApprovalRequest = {
  approvalId: "approval-1",
  pendingToolCallId: "call_bash_1",
  pendingToolCallDetail: {
    toolName: "bash",
    commandLine: "npm test",
  },
  riskExplanation: "Runs tests.",
} as const satisfies PendingToolApprovalRequest;

test("assistant response change set reports a new assistant message and transcript order change", () => {
  const application = applyAssistantResponseEventsToChatSessionStateWithChangeSet(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    [
      {
        type: "assistant_turn_started",
        messageId: "assistant-1",
        startedAtMs: 1,
      },
    ],
  );

  expect(application.changeSet).toEqual({
    changedConversationMessageIds: ["assistant-1"],
    didConversationMessageOrderChange: true,
    didTranscriptGlobalStateChange: true,
    didPromptComposerStateChange: true,
    didInteractionStatusStateChange: true,
  });
});

test("assistant response change set reports only the row touched by part updates", () => {
  const startedApplication = applyAssistantResponseEventsToChatSessionStateWithChangeSet(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    [{ type: "assistant_turn_started", messageId: "assistant-1", startedAtMs: 1 }],
  );

  const application = applyAssistantResponseEventsToChatSessionStateWithChangeSet(
    startedApplication.nextChatSessionState,
    [
      {
        type: "assistant_message_part_added",
        messageId: "assistant-1",
        part: {
          id: "text-part-1",
          partKind: "assistant_text",
          partStatus: "streaming",
          rawMarkdownText: "Hello",
        },
      },
      {
        type: "assistant_message_part_updated",
        messageId: "assistant-1",
        part: {
          id: "text-part-1",
          partKind: "assistant_text",
          partStatus: "streaming",
          rawMarkdownText: "Hello world",
        },
      },
    ],
  );

  expect(application.changeSet).toEqual({
    changedConversationMessageIds: ["assistant-1"],
    didConversationMessageOrderChange: false,
    didTranscriptGlobalStateChange: true,
    didPromptComposerStateChange: false,
    didInteractionStatusStateChange: false,
  });
});

test("assistant response reducer stores streamed BuliStickyNotes audit parts", () => {
  const buliStickyNotesContextText = [
    "BuliStickyNotes:",
    "Purpose-aware evidence notes from prior turns:",
    "Use these as source pointers, not active memory.",
  ].join("\n");
  const application = applyAssistantResponseEventsToChatSessionStateWithChangeSet(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    [
      { type: "assistant_turn_started", messageId: "assistant-1", startedAtMs: 1 },
      {
        type: "assistant_message_part_added",
        messageId: "assistant-1",
        part: {
          id: "sticky-part-1",
          partKind: "assistant_buli_sticky_notes",
          buliStickyNotesContextText,
        },
      },
    ] satisfies readonly AssistantResponseEvent[],
  );

  expect(application.nextChatSessionState.conversationMessagesById["assistant-1"]?.partIds).toEqual([
    "sticky-part-1",
  ]);
  expect(application.nextChatSessionState.conversationMessagePartsById["sticky-part-1"]).toEqual({
    id: "sticky-part-1",
    partKind: "assistant_buli_sticky_notes",
    buliStickyNotesContextText,
  });
  expect(application.changeSet).toEqual({
    changedConversationMessageIds: ["assistant-1"],
    didConversationMessageOrderChange: true,
    didTranscriptGlobalStateChange: true,
    didPromptComposerStateChange: true,
    didInteractionStatusStateChange: true,
  });
});

test("assistant response change set separates pending approval status from transcript rows", () => {
  const application = applyAssistantResponseEventsToChatSessionStateWithChangeSet(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    [
      {
        type: "assistant_pending_tool_approval_requested",
        approvalRequest: pendingToolApprovalRequest,
      },
    ],
  );

  expect(application.changeSet).toEqual({
    changedConversationMessageIds: [],
    didConversationMessageOrderChange: false,
    didTranscriptGlobalStateChange: false,
    didPromptComposerStateChange: true,
    didInteractionStatusStateChange: true,
  });
});

test("assistant response change set merges message ids once across a batch", () => {
  const application = applyAssistantResponseEventsToChatSessionStateWithChangeSet(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    [
      { type: "assistant_turn_started", messageId: "assistant-1", startedAtMs: 1 },
      {
        type: "assistant_message_part_added",
        messageId: "assistant-1",
        part: {
          id: "text-part-1",
          partKind: "assistant_text",
          partStatus: "streaming",
          rawMarkdownText: "Hello",
        },
      },
      {
        type: "assistant_message_completed",
        messageId: "assistant-1",
        usage: completedUsage,
      },
    ] satisfies readonly AssistantResponseEvent[],
  );

  expect(application.changeSet.changedConversationMessageIds).toEqual(["assistant-1"]);
  expect(application.changeSet.didConversationMessageOrderChange).toBe(true);
  expect(application.changeSet.didTranscriptGlobalStateChange).toBe(true);
  expect(application.changeSet.didPromptComposerStateChange).toBe(true);
  expect(application.changeSet.didInteractionStatusStateChange).toBe(true);
});
