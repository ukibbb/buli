import { expect, test } from "bun:test";
import type { AvailableAssistantModel } from "@buli/contracts";
import {
  appendPromptImageAttachmentToDraft,
  applyAssistantResponseEventToChatSessionState,
  applyChatSessionKeyboardInputToChatSessionState,
  clearConversationTranscript,
  confirmHighlightedModelSelection,
  confirmHighlightedReasoningEffortChoice,
  createInitialChatSessionState,
  cycleAssistantOperatingMode,
  hydrateConversationTranscriptFromSessionEntries,
  insertTextIntoPromptDraftAtCursor,
  listOrderedConversationMessageParts,
  listOrderedConversationMessages,
  replacePromptDraftFromEditor,
  selectAssistantOperatingMode,
  showAvailableAssistantModelsForSelection,
  showModelSelectionLoadingState,
  submitPromptDraft,
  toggleReasoningSummaryVisibility,
} from "../src/index.ts";

test("createInitialChatSessionState starts in understand mode", () => {
  const chatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });

  expect(chatSessionState.selectedAssistantOperatingMode).toBe("understand");
});

test("createInitialChatSessionState keeps the selected model default reasoning effort", () => {
  const chatSessionState = createInitialChatSessionState({
    selectedModelId: "gpt-5.5",
    selectedModelDefaultReasoningEffort: "xhigh",
  });

  expect(chatSessionState.selectedModelDefaultReasoningEffort).toBe("xhigh");
});

test("model selection keeps the selected model default when the model default choice is used", () => {
  const availableAssistantModels = [
    {
      id: "gpt-5.5",
      displayName: "GPT-5.5",
      defaultReasoningEffort: "xhigh",
      supportedReasoningEfforts: ["high", "xhigh"],
    },
  ] satisfies AvailableAssistantModel[];
  let chatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.5" });

  chatSessionState = showModelSelectionLoadingState(chatSessionState);
  chatSessionState = showAvailableAssistantModelsForSelection(chatSessionState, availableAssistantModels);
  expect(chatSessionState.selectedModelDefaultReasoningEffort).toBe("xhigh");

  chatSessionState = confirmHighlightedModelSelection(chatSessionState);
  chatSessionState = confirmHighlightedReasoningEffortChoice(chatSessionState);

  expect(chatSessionState.selectedModelId).toBe("gpt-5.5");
  expect(chatSessionState.selectedReasoningEffort).toBeUndefined();
  expect(chatSessionState.selectedModelDefaultReasoningEffort).toBe("xhigh");
});

test("cycleAssistantOperatingMode switches from understand to plan to implementation", () => {
  const understandChatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });
  const planChatSessionState = cycleAssistantOperatingMode(understandChatSessionState);
  const implementationAgainChatSessionState = cycleAssistantOperatingMode(planChatSessionState);
  const understandAgainChatSessionState = cycleAssistantOperatingMode(implementationAgainChatSessionState);

  expect(planChatSessionState.selectedAssistantOperatingMode).toBe("plan");
  expect(implementationAgainChatSessionState.selectedAssistantOperatingMode).toBe("implementation");
  expect(understandAgainChatSessionState.selectedAssistantOperatingMode).toBe("understand");
});

test("selectAssistantOperatingMode sets a specific mode", () => {
  const chatSessionState = selectAssistantOperatingMode(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    "plan",
  );

  expect(chatSessionState.selectedAssistantOperatingMode).toBe("plan");
});

test("createInitialChatSessionState shows reasoning summaries by default", () => {
  const chatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });

  expect(chatSessionState.isReasoningSummaryVisible).toBe(true);
});

test("toggleReasoningSummaryVisibility flips reasoning summary display", () => {
  const visibleChatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });
  const hiddenChatSessionState = toggleReasoningSummaryVisibility(visibleChatSessionState);
  const visibleAgainChatSessionState = toggleReasoningSummaryVisibility(hiddenChatSessionState);

  expect(hiddenChatSessionState.isReasoningSummaryVisible).toBe(false);
  expect(visibleAgainChatSessionState.isReasoningSummaryVisible).toBe(true);
});

test("submitPromptDraft appends a completed user message and enters streaming state", () => {
  const promptDraftSubmission = submitPromptDraft(
    insertTextIntoPromptDraftAtCursor(createInitialChatSessionState({ selectedModelId: "gpt-5.4" }), "Hello"),
  );
  if (!promptDraftSubmission.submittedPromptText) {
    throw new Error("expected a submitted prompt");
  }

  expect(promptDraftSubmission.submittedPromptText).toBe("Hello");
  expect(promptDraftSubmission.nextChatSessionState.conversationTurnStatus).toBe("streaming_assistant_response");

  const orderedConversationMessages = listOrderedConversationMessages(promptDraftSubmission.nextChatSessionState);
  expect(orderedConversationMessages).toHaveLength(1);
  const submittedUserConversationMessage = orderedConversationMessages[0];
  if (!submittedUserConversationMessage) {
    throw new Error("expected a submitted user message");
  }

  expect(submittedUserConversationMessage.role).toBe("user");
  expect(listOrderedConversationMessageParts(promptDraftSubmission.nextChatSessionState, submittedUserConversationMessage.id)).toEqual([
    {
      id: submittedUserConversationMessage.partIds[0]!,
      partKind: "user_text",
      text: "Hello",
    },
  ]);
});

test("replacePromptDraftFromEditor replaces text and clamps cursor offset", () => {
  const chatSessionState = replacePromptDraftFromEditor({
    chatSessionState: createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    promptDraft: "line one\nline two",
    promptDraftCursorOffset: 999,
  });

  expect(chatSessionState.promptDraft).toBe("line one\nline two");
  expect(chatSessionState.promptDraftCursorOffset).toBe("line one\nline two".length);
});

test("replacePromptDraftFromEditor reconciles selected prompt-context references", () => {
  const chatSessionState = replacePromptDraftFromEditor({
    chatSessionState: {
      ...createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
      promptDraft: "Read @README.md and @packages/tui/src/ChatScreen.tsx",
      promptDraftCursorOffset: "Read @README.md and @packages/tui/src/ChatScreen.tsx".length,
      selectedPromptContextReferenceTexts: ["@README.md", "@packages/tui/src/ChatScreen.tsx"],
    },
    promptDraft: "Read @README.md",
    promptDraftCursorOffset: "Read @README.md".length,
  });

  expect(chatSessionState.selectedPromptContextReferenceTexts).toEqual(["@README.md"]);
});

test("applyChatSessionKeyboardInputToChatSessionState inserts pasted text at the prompt cursor", () => {
  const chatSessionState = insertTextIntoPromptDraftAtCursor(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    "Hello ",
  );

  const keyboardInteraction = applyChatSessionKeyboardInputToChatSessionState({
    chatSessionState,
    chatSessionKeyboardInput: {
      keyName: undefined,
      textInput: "pasted text",
      isCtrlPressed: false,
      isMetaPressed: false,
    },
    isPromptSubmissionInFlight: false,
  });

  expect(keyboardInteraction.shouldConsumeKeyboardInput).toBe(true);
  expect(keyboardInteraction.nextChatSessionState.promptDraft).toBe("Hello pasted text");
  expect(keyboardInteraction.nextChatSessionState.promptDraftCursorOffset).toBe("Hello pasted text".length);
});

test("submitPromptDraft submits image attachments with the user message", () => {
  const promptImageAttachment = {
    attachmentId: "image-1",
    mimeType: "image/png" as const,
    dataUrl: "data:image/png;base64,aGVsbG8=",
    fileName: "clipboard.png",
  };
  const chatSessionState = appendPromptImageAttachmentToDraft(
    insertTextIntoPromptDraftAtCursor(
      createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
      "Describe this",
    ),
    promptImageAttachment,
  );

  const promptDraftSubmission = submitPromptDraft(chatSessionState);

  expect(promptDraftSubmission.submittedPromptText).toBe("Describe this");
  expect(promptDraftSubmission.submittedPromptImageAttachments).toEqual([promptImageAttachment]);
  expect(promptDraftSubmission.nextChatSessionState.pendingPromptImageAttachments).toEqual([]);
  const userMessage = listOrderedConversationMessages(promptDraftSubmission.nextChatSessionState)[0];
  expect(userMessage?.partIds).toHaveLength(2);
  expect(Object.values(promptDraftSubmission.nextChatSessionState.conversationMessagePartsById)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ partKind: "user_text", text: "Describe this" }),
      expect.objectContaining({ partKind: "user_image_attachment", attachment: promptImageAttachment }),
    ]),
  );
});

test("submitPromptDraft allows image-only prompts", () => {
  const promptImageAttachment = {
    attachmentId: "image-1",
    mimeType: "image/png" as const,
    dataUrl: "data:image/png;base64,aGVsbG8=",
  };
  const promptDraftSubmission = submitPromptDraft(
    appendPromptImageAttachmentToDraft(
      createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
      promptImageAttachment,
    ),
  );

  expect(promptDraftSubmission.submittedPromptText).toBe("");
  expect(promptDraftSubmission.submittedPromptImageAttachments).toEqual([promptImageAttachment]);
});

test("hydrateConversationTranscriptFromSessionEntries restores user image attachments", () => {
  const promptImageAttachment = {
    attachmentId: "image-1",
    mimeType: "image/png" as const,
    dataUrl: "data:image/png;base64,aGVsbG8=",
  };
  const chatSessionState = hydrateConversationTranscriptFromSessionEntries(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    [
      {
        entryKind: "user_prompt",
        promptText: "Look at this",
        modelFacingPromptText: "Look at this",
        imageAttachments: [promptImageAttachment],
      },
    ],
  );

  expect(Object.values(chatSessionState.conversationMessagePartsById)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ partKind: "user_text", text: "Look at this" }),
      expect.objectContaining({ partKind: "user_image_attachment", attachment: promptImageAttachment }),
    ]),
  );
});

test("applyChatSessionKeyboardInputToChatSessionState moves the prompt cursor with Home and End", () => {
  let chatSessionState = insertTextIntoPromptDraftAtCursor(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    "Hello",
  );

  chatSessionState = applyChatSessionKeyboardInputToChatSessionState({
    chatSessionState,
    chatSessionKeyboardInput: { keyName: "home", textInput: undefined, isCtrlPressed: false, isMetaPressed: false },
    isPromptSubmissionInFlight: false,
  }).nextChatSessionState;
  expect(chatSessionState.promptDraftCursorOffset).toBe(0);

  chatSessionState = applyChatSessionKeyboardInputToChatSessionState({
    chatSessionState,
    chatSessionKeyboardInput: { keyName: "end", textInput: undefined, isCtrlPressed: false, isMetaPressed: false },
    isPromptSubmissionInFlight: false,
  }).nextChatSessionState;
  expect(chatSessionState.promptDraftCursorOffset).toBe(5);
});

test("clearConversationTranscript clears visible conversation while preserving selections", () => {
  let chatSessionState = createInitialChatSessionState({
    selectedModelId: "gpt-5.5",
    selectedModelDefaultReasoningEffort: "xhigh",
    selectedReasoningEffort: "high",
  });
  chatSessionState = selectAssistantOperatingMode(chatSessionState, "plan");
  chatSessionState = toggleReasoningSummaryVisibility(chatSessionState);
  const promptDraftSubmission = submitPromptDraft(insertTextIntoPromptDraftAtCursor(chatSessionState, "Hello"));
  if (!promptDraftSubmission.submittedPromptText) {
    throw new Error("expected submitted prompt");
  }

  const clearedChatSessionState = clearConversationTranscript(promptDraftSubmission.nextChatSessionState);

  expect(clearedChatSessionState.selectedModelId).toBe("gpt-5.5");
  expect(clearedChatSessionState.selectedModelDefaultReasoningEffort).toBe("xhigh");
  expect(clearedChatSessionState.selectedReasoningEffort).toBe("high");
  expect(clearedChatSessionState.selectedAssistantOperatingMode).toBe("plan");
  expect(clearedChatSessionState.isReasoningSummaryVisible).toBe(false);
  expect(clearedChatSessionState.conversationTurnStatus).toBe("waiting_for_user_input");
  expect(listOrderedConversationMessages(clearedChatSessionState)).toEqual([]);
  expect(clearedChatSessionState.latestTokenUsage).toBeUndefined();
});

test("hydrateConversationTranscriptFromSessionEntries rebuilds visible persisted messages", () => {
  const chatSessionState = hydrateConversationTranscriptFromSessionEntries(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    [
      {
        entryKind: "user_prompt",
        promptText: "Run pwd",
        modelFacingPromptText: "Run pwd",
      },
      {
        entryKind: "tool_call",
        toolCallId: "call-1",
        toolCallRequest: {
          toolName: "bash",
          shellCommand: "pwd",
          commandDescription: "Print working directory",
        },
      },
      {
        entryKind: "completed_tool_result",
        toolCallId: "call-1",
        toolCallDetail: {
          toolName: "bash",
          commandLine: "pwd",
          commandDescription: "Print working directory",
        },
        toolResultText: "/tmp/demo",
      },
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: "Done.",
      },
    ],
  );

  const conversationMessages = listOrderedConversationMessages(chatSessionState);
  expect(conversationMessages.map((conversationMessage) => conversationMessage.role)).toEqual(["user", "assistant"]);
  expect(listOrderedConversationMessageParts(chatSessionState, conversationMessages[0]!.id)).toEqual([
    {
      id: "persisted-entry-0-user-text",
      partKind: "user_text",
      text: "Run pwd",
    },
  ]);
  expect(listOrderedConversationMessageParts(chatSessionState, conversationMessages[1]!.id).map((conversationMessagePart) => conversationMessagePart.partKind)).toEqual([
    "assistant_tool_call",
    "assistant_text",
  ]);
  expect(chatSessionState.conversationTurnStatus).toBe("waiting_for_user_input");
});

test("hydrateConversationTranscriptFromSessionEntries creates tool details from requests", () => {
  const chatSessionState = hydrateConversationTranscriptFromSessionEntries(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    [
      {
        entryKind: "user_prompt",
        promptText: "Inspect files",
        modelFacingPromptText: "Inspect files",
      },
      {
        entryKind: "tool_call",
        toolCallId: "call-read",
        toolCallRequest: {
          toolName: "read",
          readTargetPath: "README.md",
        },
      },
      {
        entryKind: "tool_call",
        toolCallId: "call-glob",
        toolCallRequest: {
          toolName: "glob",
          globPattern: "**/*.ts",
          searchDirectoryPath: "packages",
        },
      },
      {
        entryKind: "tool_call",
        toolCallId: "call-grep",
        toolCallRequest: {
          toolName: "grep",
          regexPattern: "ToolCallRequest",
        },
      },
      {
        entryKind: "tool_call",
        toolCallId: "call-edit",
        toolCallRequest: {
          toolName: "edit",
          editTargetPath: "README.md",
          oldString: "old",
          newString: "new",
        },
      },
      {
        entryKind: "tool_call",
        toolCallId: "call-write",
        toolCallRequest: {
          toolName: "write",
          writeTargetPath: "generated.txt",
          fileContent: "generated\n",
        },
      },
      {
        entryKind: "tool_call",
        toolCallId: "call-explore",
        toolCallRequest: {
          toolName: "explore",
          explorationDescription: "map runtime",
          explorationPrompt: "Inspect runtime dispatch.",
        },
      },
    ],
  );

  const assistantConversationMessage = listOrderedConversationMessages(chatSessionState).find(
    (conversationMessage) => conversationMessage.role === "assistant",
  );
  if (!assistantConversationMessage) {
    throw new Error("expected assistant message");
  }

  expect(listOrderedConversationMessageParts(chatSessionState, assistantConversationMessage.id)).toMatchObject([
    {
      partKind: "assistant_tool_call",
      toolCallDetail: { toolName: "read", readFilePath: "README.md" },
    },
    {
      partKind: "assistant_tool_call",
      toolCallDetail: { toolName: "glob", globPattern: "**/*.ts", searchDirectoryPath: "packages" },
    },
    {
      partKind: "assistant_tool_call",
      toolCallDetail: { toolName: "grep", searchPattern: "ToolCallRequest" },
    },
    {
      partKind: "assistant_tool_call",
      toolCallDetail: { toolName: "edit", editedFilePath: "README.md" },
    },
    {
      partKind: "assistant_tool_call",
      toolCallDetail: { toolName: "write", writtenFilePath: "generated.txt" },
    },
    {
      partKind: "assistant_tool_call",
      toolCallDetail: {
        toolName: "explore",
        explorationDescription: "map runtime",
        explorationPrompt: "Inspect runtime dispatch.",
      },
    },
    {
      partKind: "assistant_interrupted_notice",
    },
  ]);
});

test("assistant_message_completed backfills turn summary usage and reasoning token count", () => {
  let chatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_turn_started",
    messageId: "assistant-1",
    startedAtMs: 1,
  });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_message_part_added",
    messageId: "assistant-1",
    part: {
      id: "reasoning-1",
      partKind: "assistant_reasoning",
      partStatus: "completed",
      reasoningSummaryText: "Thinking",
      reasoningStartedAtMs: 1,
      reasoningDurationMs: 500,
    },
  });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_message_part_added",
    messageId: "assistant-1",
    part: {
      id: "turn-summary-1",
      partKind: "assistant_turn_summary",
      turnDurationMs: 1200,
      modelDisplayName: "gpt-5.4",
    },
  });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_message_completed",
    messageId: "assistant-1",
    usage: {
      total: 12,
      input: 5,
      output: 5,
      reasoning: 2,
      cache: { read: 0, write: 0 },
    },
  });

  const assistantConversationMessage = listOrderedConversationMessages(chatSessionState)[0];
  if (!assistantConversationMessage) {
    throw new Error("expected assistant message");
  }

  expect(assistantConversationMessage.messageStatus).toBe("completed");
  expect(chatSessionState.latestTokenUsage?.reasoning).toBe(2);
  expect(listOrderedConversationMessageParts(chatSessionState, assistantConversationMessage.id)).toEqual([
    {
      id: "reasoning-1",
      partKind: "assistant_reasoning",
      partStatus: "completed",
      reasoningSummaryText: "Thinking",
      reasoningStartedAtMs: 1,
      reasoningDurationMs: 500,
      reasoningTokenCount: 2,
    },
    {
      id: "turn-summary-1",
      partKind: "assistant_turn_summary",
      turnDurationMs: 1200,
      modelDisplayName: "gpt-5.4",
      usage: {
        total: 12,
        input: 5,
        output: 5,
        reasoning: 2,
        cache: { read: 0, write: 0 },
      },
    },
  ]);
});

test("assistant_pending_tool_approval_requested stores dedicated approval state outside message parts", () => {
  let chatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_turn_started",
    messageId: "assistant-1",
    startedAtMs: 1,
  });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_message_part_added",
    messageId: "assistant-1",
    part: {
      id: "tool-1",
      partKind: "assistant_tool_call",
      toolCallId: "call-1",
      toolCallStatus: "pending_approval",
      toolCallStartedAtMs: 1,
      toolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
    },
  });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_pending_tool_approval_requested",
    approvalRequest: {
      approvalId: "approval-1",
      pendingToolCallId: "call-1",
      pendingToolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
      riskExplanation: "This command is destructive.",
    },
  });

  expect(chatSessionState.conversationTurnStatus).toBe("waiting_for_tool_approval");
  expect(chatSessionState.pendingToolApprovalRequest).toEqual({
    approvalId: "approval-1",
    pendingToolCallId: "call-1",
    pendingToolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
    riskExplanation: "This command is destructive.",
  });
});

test("assistant_pending_tool_approval_cleared clears matching approval state and returns to streaming", () => {
  let chatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_turn_started",
    messageId: "assistant-1",
    startedAtMs: 1,
  });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_pending_tool_approval_requested",
    approvalRequest: {
      approvalId: "approval-1",
      pendingToolCallId: "call-1",
      pendingToolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
      riskExplanation: "This command is destructive.",
    },
  });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_pending_tool_approval_cleared",
    approvalId: "approval-1",
  });

  expect(chatSessionState.conversationTurnStatus).toBe("streaming_assistant_response");
  expect(chatSessionState.pendingToolApprovalRequest).toBeUndefined();
});

test("assistant_message_failed clears pending approval, records a failed assistant message, and returns to user input", () => {
  let chatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_turn_started",
    messageId: "assistant-1",
    startedAtMs: 1,
  });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_pending_tool_approval_requested",
    approvalRequest: {
      approvalId: "approval-1",
      pendingToolCallId: "call-1",
      pendingToolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
      riskExplanation: "This command is destructive.",
    },
  });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_message_failed",
    messageId: "assistant-1",
    errorText: "provider failed",
  });

  const assistantConversationMessage = listOrderedConversationMessages(chatSessionState)[0];
  expect(chatSessionState.conversationTurnStatus).toBe("waiting_for_user_input");
  expect(chatSessionState.pendingToolApprovalRequest).toBeUndefined();
  expect(assistantConversationMessage?.messageStatus).toBe("failed");
  expect(
    listOrderedConversationMessageParts(chatSessionState, "assistant-1").some(
      (conversationMessagePart) =>
        conversationMessagePart.partKind === "assistant_error_notice" &&
        conversationMessagePart.errorText === "provider failed",
    ),
  ).toBe(true);
});

test("assistant_message_interrupted clears pending approval, marks open parts interrupted, and returns to user input", () => {
  let chatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_turn_started",
    messageId: "assistant-1",
    startedAtMs: 1,
  });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_message_part_added",
    messageId: "assistant-1",
    part: {
      id: "assistant-text-1",
      partKind: "assistant_text",
      partStatus: "streaming",
      rawMarkdownText: "Partial",
    },
  });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_message_part_added",
    messageId: "assistant-1",
    part: {
      id: "tool-1",
      partKind: "assistant_tool_call",
      toolCallId: "call-1",
      toolCallStatus: "running",
      toolCallStartedAtMs: 1,
      toolCallDetail: { toolName: "bash", commandLine: "sleep 10" },
    },
  });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_pending_tool_approval_requested",
    approvalRequest: {
      approvalId: "approval-1",
      pendingToolCallId: "call-1",
      pendingToolCallDetail: { toolName: "bash", commandLine: "sleep 10" },
      riskExplanation: "This command waits.",
    },
  });

  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_message_interrupted",
    messageId: "assistant-1",
    interruptionReason: "Interrupted by user.",
  });

  const assistantConversationMessage = listOrderedConversationMessages(chatSessionState)[0];
  const interruptedParts = listOrderedConversationMessageParts(chatSessionState, "assistant-1");
  const interruptedTextPart = interruptedParts.find((conversationMessagePart) => conversationMessagePart.partKind === "assistant_text");
  const interruptedToolPart = interruptedParts.find((conversationMessagePart) => conversationMessagePart.partKind === "assistant_tool_call");
  expect(chatSessionState.conversationTurnStatus).toBe("waiting_for_user_input");
  expect(chatSessionState.pendingToolApprovalRequest).toBeUndefined();
  expect(assistantConversationMessage?.messageStatus).toBe("interrupted");
  expect(interruptedTextPart).toMatchObject({ partStatus: "interrupted" });
  expect(interruptedToolPart).toMatchObject({ toolCallStatus: "interrupted", errorText: "Interrupted by user." });
  expect(interruptedParts.some(
    (conversationMessagePart) =>
      conversationMessagePart.partKind === "assistant_interrupted_notice" &&
      conversationMessagePart.interruptionReason === "Interrupted by user.",
  )).toBe(true);
});

test("hydrateConversationTranscriptFromSessionEntries marks dangling persisted tool calls as interrupted", () => {
  const chatSessionState = hydrateConversationTranscriptFromSessionEntries(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    [
      {
        entryKind: "user_prompt",
        promptText: "Run pwd",
        modelFacingPromptText: "Run pwd",
      },
      {
        entryKind: "tool_call",
        toolCallId: "call-1",
        toolCallRequest: {
          toolName: "bash",
          shellCommand: "pwd",
          commandDescription: "Print working directory",
        },
      },
      {
        entryKind: "user_prompt",
        promptText: "Next prompt",
        modelFacingPromptText: "Next prompt",
      },
    ],
  );

  const conversationMessages = listOrderedConversationMessages(chatSessionState);
  const interruptedAssistantConversationMessage = conversationMessages.find(
    (conversationMessage) => conversationMessage.role === "assistant",
  );
  if (!interruptedAssistantConversationMessage) {
    throw new Error("expected interrupted assistant message");
  }

  const interruptedAssistantMessageParts = listOrderedConversationMessageParts(
    chatSessionState,
    interruptedAssistantConversationMessage.id,
  );
  const interruptedToolCallPart = interruptedAssistantMessageParts.find(
    (conversationMessagePart) => conversationMessagePart.partKind === "assistant_tool_call",
  );

  if (!interruptedToolCallPart || interruptedToolCallPart.partKind !== "assistant_tool_call") {
    throw new Error("expected interrupted tool call part");
  }

  expect(interruptedAssistantConversationMessage.messageStatus).toBe("interrupted");
  expect(interruptedToolCallPart.toolCallStatus).toBe("interrupted");
  expect(interruptedToolCallPart.errorText).toBe("Tool call was interrupted before a result was recorded.");
  expect(interruptedAssistantMessageParts.some(
    (conversationMessagePart) =>
      conversationMessagePart.partKind === "assistant_interrupted_notice" &&
      conversationMessagePart.interruptionReason === "Tool call was interrupted before a result was recorded.",
  )).toBe(true);
});

test("assistant_message_incomplete clears pending approval and returns to user input", () => {
  let chatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_turn_started",
    messageId: "assistant-1",
    startedAtMs: 1,
  });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_pending_tool_approval_requested",
    approvalRequest: {
      approvalId: "approval-1",
      pendingToolCallId: "call-1",
      pendingToolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
      riskExplanation: "This command is destructive.",
    },
  });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_message_incomplete",
    messageId: "assistant-1",
    incompleteReason: "max_output_tokens",
    usage: { total: 10, input: 5, output: 4, reasoning: 1, cache: { read: 0, write: 0 } },
  });

  const assistantConversationMessage = listOrderedConversationMessages(chatSessionState)[0];
  expect(chatSessionState.conversationTurnStatus).toBe("waiting_for_user_input");
  expect(chatSessionState.pendingToolApprovalRequest).toBeUndefined();
  expect(assistantConversationMessage?.messageStatus).toBe("incomplete");
});
