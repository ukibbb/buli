import { expect, test } from "bun:test";
import type { PendingToolApprovalRequest } from "@buli/contracts";
import {
  appendSubmittedUserPromptToConversation,
  applyAssistantResponseEventsToChatSessionStateWithChangeSet,
  createInitialChatSessionState,
  showCommandHelpModal,
} from "@buli/chat-session-state";
import {
  buildChatAppRenderStoreChangeSetFromChatSessionStateChange,
  createChatAppRenderStore,
} from "../src/index.ts";

const pendingToolApprovalRequest = {
  approvalId: "approval-1",
  pendingToolCallId: "call_bash_1",
  pendingToolCallDetail: {
    toolName: "bash",
    commandLine: "npm test",
  },
  riskExplanation: "Runs tests.",
} as const satisfies PendingToolApprovalRequest;

function createTwoMessageChatSessionState() {
  return applyAssistantResponseEventsToChatSessionStateWithChangeSet(
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
          rawMarkdownText: "First",
        },
      },
      { type: "assistant_turn_started", messageId: "assistant-2", startedAtMs: 2 },
      {
        type: "assistant_message_part_added",
        messageId: "assistant-2",
        part: {
          id: "text-part-2",
          partKind: "assistant_text",
          partStatus: "streaming",
          rawMarkdownText: "Second",
        },
      },
    ],
  ).nextChatSessionState;
}

test("ChatAppRenderStore notifies only the changed conversation message row", () => {
  const initialChatSessionState = createTwoMessageChatSessionState();
  const chatAppRenderStore = createChatAppRenderStore({ initialChatSessionState });
  let firstRowNotificationCount = 0;
  let secondRowNotificationCount = 0;
  let transcriptNotificationCount = 0;

  chatAppRenderStore.subscribeConversationMessageRow("assistant-1", () => {
    firstRowNotificationCount += 1;
  });
  chatAppRenderStore.subscribeConversationMessageRow("assistant-2", () => {
    secondRowNotificationCount += 1;
  });
  chatAppRenderStore.subscribeTranscript(() => {
    transcriptNotificationCount += 1;
  });

  const application = applyAssistantResponseEventsToChatSessionStateWithChangeSet(
    initialChatSessionState,
    [
      {
        type: "assistant_message_part_updated",
        messageId: "assistant-1",
        part: {
          id: "text-part-1",
          partKind: "assistant_text",
          partStatus: "streaming",
          rawMarkdownText: "First updated",
        },
      },
    ],
  );
  chatAppRenderStore.replaceChatSessionState(application);

  expect(firstRowNotificationCount).toBe(1);
  expect(secondRowNotificationCount).toBe(0);
  expect(transcriptNotificationCount).toBe(1);
});

test("ChatAppRenderStore keeps row subscribers isolated from pending approval status changes", () => {
  const initialChatSessionState = createTwoMessageChatSessionState();
  const chatAppRenderStore = createChatAppRenderStore({ initialChatSessionState });
  let rowNotificationCount = 0;
  let transcriptNotificationCount = 0;
  let promptNotificationCount = 0;
  let interactionStatusNotificationCount = 0;

  chatAppRenderStore.subscribeConversationMessageRow("assistant-1", () => {
    rowNotificationCount += 1;
  });
  chatAppRenderStore.subscribeTranscript(() => {
    transcriptNotificationCount += 1;
  });
  chatAppRenderStore.subscribePromptComposer(() => {
    promptNotificationCount += 1;
  });
  chatAppRenderStore.subscribeInteractionStatus(() => {
    interactionStatusNotificationCount += 1;
  });

  const application = applyAssistantResponseEventsToChatSessionStateWithChangeSet(
    initialChatSessionState,
    [{ type: "assistant_pending_tool_approval_requested", approvalRequest: pendingToolApprovalRequest }],
  );
  chatAppRenderStore.replaceChatSessionState(application);

  expect(rowNotificationCount).toBe(0);
  expect(transcriptNotificationCount).toBe(0);
  expect(promptNotificationCount).toBe(1);
  expect(interactionStatusNotificationCount).toBe(1);
});

test("ChatAppRenderStore notifies transcript subscribers when message order changes", () => {
  const initialChatSessionState = createTwoMessageChatSessionState();
  const chatAppRenderStore = createChatAppRenderStore({ initialChatSessionState });
  let firstRowNotificationCount = 0;
  let transcriptNotificationCount = 0;

  chatAppRenderStore.subscribeConversationMessageRow("assistant-1", () => {
    firstRowNotificationCount += 1;
  });
  chatAppRenderStore.subscribeTranscript(() => {
    transcriptNotificationCount += 1;
  });

  const application = applyAssistantResponseEventsToChatSessionStateWithChangeSet(
    initialChatSessionState,
    [{ type: "assistant_turn_started", messageId: "assistant-3", startedAtMs: 3 }],
  );
  chatAppRenderStore.replaceChatSessionState(application);

  expect(firstRowNotificationCount).toBe(0);
  expect(transcriptNotificationCount).toBe(1);
});

test("ChatAppRenderStore generic change set notifies a newly appended user prompt row", () => {
  const initialChatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });
  const chatAppRenderStore = createChatAppRenderStore({ initialChatSessionState });
  const nextChatSessionState = appendSubmittedUserPromptToConversation({
    chatSessionState: initialChatSessionState,
    submittedPromptText: "Explain the test failure",
    submittedPromptImageAttachments: [],
  });
  const appendedUserPromptMessageId = nextChatSessionState.orderedConversationMessageIds.at(-1);
  if (!appendedUserPromptMessageId) {
    throw new Error("Expected an appended user prompt message.");
  }
  let rowNotificationCount = 0;
  let transcriptNotificationCount = 0;

  chatAppRenderStore.subscribeConversationMessageRow(appendedUserPromptMessageId, () => {
    rowNotificationCount += 1;
  });
  chatAppRenderStore.subscribeTranscript(() => {
    transcriptNotificationCount += 1;
  });

  chatAppRenderStore.replaceChatSessionState({
    nextChatSessionState,
    changeSet: buildChatAppRenderStoreChangeSetFromChatSessionStateChange({
      previousChatSessionState: initialChatSessionState,
      nextChatSessionState,
    }),
  });

  expect(rowNotificationCount).toBe(1);
  expect(transcriptNotificationCount).toBe(1);
});

test("ChatAppRenderStore preserves row snapshot identity until that row changes", () => {
  const initialChatSessionState = createTwoMessageChatSessionState();
  const chatAppRenderStore = createChatAppRenderStore({ initialChatSessionState });
  const firstSnapshot = chatAppRenderStore.readConversationMessageRowSnapshot("assistant-1");
  const secondSnapshot = chatAppRenderStore.readConversationMessageRowSnapshot("assistant-1");

  expect(secondSnapshot).toBe(firstSnapshot);

  const statusOnlyApplication = applyAssistantResponseEventsToChatSessionStateWithChangeSet(
    initialChatSessionState,
    [{ type: "assistant_pending_tool_approval_requested", approvalRequest: pendingToolApprovalRequest }],
  );
  chatAppRenderStore.replaceChatSessionState(statusOnlyApplication);
  expect(chatAppRenderStore.readConversationMessageRowSnapshot("assistant-1")).toBe(firstSnapshot);

  const changedRowApplication = applyAssistantResponseEventsToChatSessionStateWithChangeSet(
    statusOnlyApplication.nextChatSessionState,
    [
      {
        type: "assistant_message_part_updated",
        messageId: "assistant-1",
        part: {
          id: "text-part-1",
          partKind: "assistant_text",
          partStatus: "streaming",
          rawMarkdownText: "First changed after approval",
        },
      },
    ],
  );
  chatAppRenderStore.replaceChatSessionState(changedRowApplication);

  expect(chatAppRenderStore.readConversationMessageRowSnapshot("assistant-1")).not.toBe(firstSnapshot);
});

test("ChatAppRenderStore routes controller chrome changes to chrome subscribers without notifying rows", () => {
  const initialChatSessionState = createTwoMessageChatSessionState();
  const chatAppRenderStore = createChatAppRenderStore({ initialChatSessionState });
  let rowNotificationCount = 0;
  let promptNotificationCount = 0;
  let interactionStatusNotificationCount = 0;
  let transcriptAuxiliaryNotificationCount = 0;

  chatAppRenderStore.subscribeConversationMessageRow("assistant-1", () => {
    rowNotificationCount += 1;
  });
  chatAppRenderStore.subscribePromptComposer(() => {
    promptNotificationCount += 1;
  });
  chatAppRenderStore.subscribeInteractionStatus(() => {
    interactionStatusNotificationCount += 1;
  });
  chatAppRenderStore.subscribeTranscriptAuxiliary(() => {
    transcriptAuxiliaryNotificationCount += 1;
  });

  chatAppRenderStore.replaceControllerChromeRenderState({
    nextControllerChromeRenderState: {
      ...chatAppRenderStore.readControllerChromeRenderState(),
      conversationSessionCompactionStatus: { step: "compacting", source: "auto" },
      queuedPromptCount: 1,
      queuedPromptPreviews: [
        {
          queuedPromptId: "queued-prompt-1",
          submittedPromptText: "Follow up",
          submittedPromptImageAttachmentCount: 0,
        },
      ],
    },
  });

  expect(rowNotificationCount).toBe(0);
  expect(promptNotificationCount).toBe(1);
  expect(interactionStatusNotificationCount).toBe(1);
  expect(transcriptAuxiliaryNotificationCount).toBe(1);
  expect(chatAppRenderStore.readPromptComposerSnapshot().queuedPromptCount).toBe(1);
  expect(chatAppRenderStore.readInteractionStatusSnapshot().queuedPromptPreviews).toHaveLength(1);
  expect(chatAppRenderStore.readTranscriptAuxiliarySnapshot().conversationSessionCompactionStatus).toEqual({
    step: "compacting",
    source: "auto",
  });
});

test("ChatAppRenderStore does not notify prompt composer subscribers for interaction changes that keep prompt editing enabled", () => {
  const initialChatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });
  const chatAppRenderStore = createChatAppRenderStore({ initialChatSessionState });
  let promptNotificationCount = 0;
  let interactionStatusNotificationCount = 0;

  chatAppRenderStore.subscribePromptComposer(() => {
    promptNotificationCount += 1;
  });
  chatAppRenderStore.subscribeInteractionStatus(() => {
    interactionStatusNotificationCount += 1;
  });

  const nextChatSessionState: typeof initialChatSessionState = {
    ...initialChatSessionState,
    slashCommandSelectionState: {
      step: "showing_slash_commands",
      slashCommandQueryText: "he",
      availableSlashCommands: [{ name: "help", value: "/help", description: "Show help" }],
      highlightedSlashCommandIndex: 0,
    },
  };
  chatAppRenderStore.replaceChatSessionState({
    nextChatSessionState,
    changeSet: buildChatAppRenderStoreChangeSetFromChatSessionStateChange({
      previousChatSessionState: initialChatSessionState,
      nextChatSessionState,
    }),
  });

  expect(promptNotificationCount).toBe(0);
  expect(interactionStatusNotificationCount).toBe(1);
  expect(chatAppRenderStore.readPromptComposerSnapshot().isPromptInputDisabled).toBe(false);
});

test("ChatAppRenderStore notifies prompt composer subscribers when interaction changes disable prompt editing", () => {
  const initialChatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });
  const chatAppRenderStore = createChatAppRenderStore({ initialChatSessionState });
  let promptNotificationCount = 0;
  let interactionStatusNotificationCount = 0;

  chatAppRenderStore.subscribePromptComposer(() => {
    promptNotificationCount += 1;
  });
  chatAppRenderStore.subscribeInteractionStatus(() => {
    interactionStatusNotificationCount += 1;
  });

  const nextChatSessionState = showCommandHelpModal(initialChatSessionState);
  chatAppRenderStore.replaceChatSessionState({
    nextChatSessionState,
    changeSet: buildChatAppRenderStoreChangeSetFromChatSessionStateChange({
      previousChatSessionState: initialChatSessionState,
      nextChatSessionState,
    }),
  });

  expect(promptNotificationCount).toBe(1);
  expect(interactionStatusNotificationCount).toBe(1);
  expect(chatAppRenderStore.readPromptComposerSnapshot().isPromptInputDisabled).toBe(true);
});
