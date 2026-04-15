import { expect, test } from "bun:test";
import {
  appendTypedTextToPromptDraft,
  applyAssistantResponseEventToChatScreenState,
  confirmHighlightedModelSelection,
  confirmHighlightedReasoningEffortChoice,
  createInitialChatScreenState,
  hideShortcutsHelpModal,
  hideModelAndReasoningSelection,
  moveHighlightedModelSelectionDown,
  moveHighlightedReasoningEffortChoiceDown,
  removeLastCharacterFromPromptDraft,
  showAvailableAssistantModelsForSelection,
  showModelSelectionLoadingError,
  showModelSelectionLoadingState,
  showShortcutsHelpModal,
  submitPromptDraft,
} from "../src/index.ts";

test("submitPromptDraft starts streaming and appends the user message", () => {
  const initial = appendTypedTextToPromptDraft(
    createInitialChatScreenState({
      selectedModelId: "gpt-5.4",
      selectedReasoningEffort: "high",
    }),
    "Hello",
  );
  const submitted = submitPromptDraft(initial);

  expect(submitted.submittedPromptText).toBe("Hello");
  expect(submitted.nextChatScreenState.assistantResponseStatus).toBe("streaming_assistant_response");
  expect(submitted.nextChatScreenState.promptDraft).toBe("");
  expect(submitted.nextChatScreenState.selectedReasoningEffort).toBe("high");
  expect(submitted.nextChatScreenState.conversationTranscript).toEqual([
    {
      kind: "message",
      message: {
        id: "user-1",
        role: "user",
        text: "Hello",
      },
    },
  ]);
});

test("removeLastCharacterFromPromptDraft removes one character", () => {
  const state = appendTypedTextToPromptDraft(
    createInitialChatScreenState({ selectedModelId: "gpt-5.4" }),
    "Hello",
  );

  expect(removeLastCharacterFromPromptDraft(state).promptDraft).toBe("Hell");
});

test("applyAssistantResponseEventToChatScreenState appends text chunks and stores final token usage", () => {
  let state = appendTypedTextToPromptDraft(
    createInitialChatScreenState({ selectedModelId: "gpt-5.4" }),
    "Hello",
  );
  state = submitPromptDraft(state).nextChatScreenState;
  state = applyAssistantResponseEventToChatScreenState(state, { type: "assistant_response_started", model: "gpt-5.4" });
  state = applyAssistantResponseEventToChatScreenState(state, { type: "assistant_response_text_chunk", text: "Hi" });
  state = applyAssistantResponseEventToChatScreenState(state, { type: "assistant_response_text_chunk", text: " there" });
  state = applyAssistantResponseEventToChatScreenState(state, {
    type: "assistant_response_completed",
    message: {
      id: "assistant-1",
      role: "assistant",
      text: "Hi there",
    },
    usage: {
      total: 90,
      input: 50,
      output: 30,
      reasoning: 10,
      cache: { read: 0, write: 0 },
    },
  });

  expect(state.assistantResponseStatus).toBe("waiting_for_user_input");
  expect(state.latestTokenUsage?.reasoning).toBe(10);
  expect(state.conversationTranscript.at(-1)).toEqual({
    kind: "message",
    message: {
      id: "assistant-1",
      role: "assistant",
      text: "Hi there",
    },
  });
});

test("applyAssistantResponseEventToChatScreenState backfills the current turn footer when the response completes", () => {
  const streaming = createStreamingTurnState();
  const afterTurnFooter = applyAssistantResponseEventToChatScreenState(streaming, {
    type: "assistant_turn_completed",
    turnDurationMs: 1800,
    modelDisplayName: "GPT-5.4",
  });
  const afterCompletion = applyAssistantResponseEventToChatScreenState(afterTurnFooter, {
    type: "assistant_response_completed",
    message: {
      id: "assistant-1",
      role: "assistant",
      text: "done",
    },
    usage: {
      total: 90,
      input: 50,
      output: 30,
      reasoning: 10,
      cache: { read: 0, write: 0 },
    },
  });

  const turnFooterEntry = afterCompletion.conversationTranscript.find((entry) => entry.kind === "turn_footer");
  if (turnFooterEntry?.kind !== "turn_footer") {
    throw new Error("expected a turn_footer entry");
  }

  expect(turnFooterEntry.usage).toEqual({
    total: 90,
    input: 50,
    output: 30,
    reasoning: 10,
    cache: { read: 0, write: 0 },
  });
});

test("showModelSelectionLoadingState marks the model selection as loading", () => {
  const state = showModelSelectionLoadingState(createInitialChatScreenState({ selectedModelId: "gpt-5.4" }));

  expect(state.modelAndReasoningSelectionState).toEqual({ step: "loading_available_models" });
});

test("createInitialChatScreenState starts with the shortcuts modal hidden", () => {
  const state = createInitialChatScreenState({ selectedModelId: "gpt-5.4" });

  expect(state.isShortcutsHelpModalVisible).toBe(false);
});

test("showShortcutsHelpModal and hideShortcutsHelpModal toggle shortcuts visibility", () => {
  const hiddenState = createInitialChatScreenState({ selectedModelId: "gpt-5.4" });
  const visibleState = showShortcutsHelpModal(hiddenState);

  expect(visibleState.isShortcutsHelpModalVisible).toBe(true);
  expect(hideShortcutsHelpModal(visibleState).isShortcutsHelpModalVisible).toBe(false);
});

test("showAvailableAssistantModelsForSelection highlights the current model", () => {
  const state = showAvailableAssistantModelsForSelection(
    showModelSelectionLoadingState(
      createInitialChatScreenState({ selectedModelId: "gpt-4.1-mini" }),
    ),
    [
    {
      id: "gpt-5.4",
      displayName: "GPT-5.4",
      supportedReasoningEfforts: ["low", "high"],
    },
    {
      id: "gpt-4.1-mini",
      displayName: "gpt-4.1-mini",
      supportedReasoningEfforts: [],
    },
    ],
  );

  expect(state.modelAndReasoningSelectionState).toEqual({
    step: "showing_available_models",
    availableModels: [
      {
        id: "gpt-5.4",
        displayName: "GPT-5.4",
        supportedReasoningEfforts: ["low", "high"],
      },
      {
        id: "gpt-4.1-mini",
        displayName: "gpt-4.1-mini",
        supportedReasoningEfforts: [],
      },
    ],
    highlightedModelIndex: 1,
  });
});

test("moveHighlightedModelSelectionDown keeps the highlight inside the model list", () => {
  const state = showAvailableAssistantModelsForSelection(
    showModelSelectionLoadingState(
      createInitialChatScreenState({ selectedModelId: "gpt-5.4" }),
    ),
    [
    {
      id: "gpt-5.4",
      displayName: "GPT-5.4",
      supportedReasoningEfforts: [],
    },
    {
      id: "gpt-4.1-mini",
      displayName: "gpt-4.1-mini",
      supportedReasoningEfforts: [],
    },
    ],
  );

  expect(moveHighlightedModelSelectionDown(moveHighlightedModelSelectionDown(state)).modelAndReasoningSelectionState).toEqual({
    step: "showing_available_models",
    availableModels: [
      {
        id: "gpt-5.4",
        displayName: "GPT-5.4",
        supportedReasoningEfforts: [],
      },
      {
        id: "gpt-4.1-mini",
        displayName: "gpt-4.1-mini",
        supportedReasoningEfforts: [],
      },
    ],
    highlightedModelIndex: 1,
  });
});

test("confirmHighlightedModelSelection opens reasoning effort choices for models that support them", () => {
  const state = showAvailableAssistantModelsForSelection(
    showModelSelectionLoadingState(
      createInitialChatScreenState({ selectedModelId: "gpt-5.4" }),
    ),
    [
    {
      id: "gpt-5.4",
      displayName: "GPT-5.4",
      defaultReasoningEffort: "medium",
      supportedReasoningEfforts: ["low", "medium", "high"],
    },
    ],
  );

  expect(confirmHighlightedModelSelection(state).modelAndReasoningSelectionState).toEqual({
    step: "showing_reasoning_effort_choices",
    selectedModel: {
      id: "gpt-5.4",
      displayName: "GPT-5.4",
      defaultReasoningEffort: "medium",
      supportedReasoningEfforts: ["low", "medium", "high"],
    },
    availableReasoningEffortChoices: [
      { displayLabel: "Use model default (medium)", reasoningEffort: undefined },
      { displayLabel: "low", reasoningEffort: "low" },
      { displayLabel: "medium", reasoningEffort: "medium" },
      { displayLabel: "high", reasoningEffort: "high" },
    ],
    highlightedReasoningEffortChoiceIndex: 0,
  });
});

test("confirmHighlightedReasoningEffortChoice stores the chosen reasoning effort and hides the selection", () => {
  let state = showAvailableAssistantModelsForSelection(
    showModelSelectionLoadingState(
      createInitialChatScreenState({ selectedModelId: "gpt-5.4" }),
    ),
    [
    {
      id: "gpt-5.4",
      displayName: "GPT-5.4",
      supportedReasoningEfforts: ["low", "high"],
    },
    ],
  );
  state = confirmHighlightedModelSelection(state);
  state = moveHighlightedReasoningEffortChoiceDown(moveHighlightedReasoningEffortChoiceDown(state));
  state = confirmHighlightedReasoningEffortChoice(state);

  expect(state.selectedModelId).toBe("gpt-5.4");
  expect(state.selectedReasoningEffort).toBe("high");
  expect(state.modelAndReasoningSelectionState).toEqual({ step: "hidden" });
});

test("confirmHighlightedModelSelection switches model immediately when it has no reasoning choices", () => {
  let state = createInitialChatScreenState({ selectedModelId: "gpt-5.4", selectedReasoningEffort: "high" });
  state = showAvailableAssistantModelsForSelection(showModelSelectionLoadingState(state), [
    {
      id: "gpt-5.4",
      displayName: "GPT-5.4",
      supportedReasoningEfforts: ["low", "high"],
    },
    {
      id: "gpt-4.1-mini",
      displayName: "gpt-4.1-mini",
      supportedReasoningEfforts: [],
    },
  ]);
  state = moveHighlightedModelSelectionDown(state);
  state = confirmHighlightedModelSelection(state);

  expect(state.selectedModelId).toBe("gpt-4.1-mini");
  expect(state.selectedReasoningEffort).toBeUndefined();
  expect(state.modelAndReasoningSelectionState).toEqual({ step: "hidden" });
});

test("showModelSelectionLoadingError and hideModelAndReasoningSelection manage loading failures", () => {
  const state = hideModelAndReasoningSelection(
    showModelSelectionLoadingError(
        showModelSelectionLoadingState(
        createInitialChatScreenState({ selectedModelId: "gpt-5.4" }),
      ),
      "network failed",
    ),
  );

  expect(state.modelAndReasoningSelectionState).toEqual({ step: "hidden" });
});

test("submitPromptDraft does nothing while an assistant response is already streaming", () => {
  let state = appendTypedTextToPromptDraft(
    createInitialChatScreenState({ selectedModelId: "gpt-5.4" }),
    "Hello",
  );
  state = submitPromptDraft(state).nextChatScreenState;

  const result = submitPromptDraft(state);

  expect(result.submittedPromptText).toBeUndefined();
  expect(result.nextChatScreenState).toEqual(state);
});

test("applyAssistantResponseEventToChatScreenState adds an error entry when the response fails", () => {
  let state = createInitialChatScreenState({ selectedModelId: "gpt-5.4" });
  state = applyAssistantResponseEventToChatScreenState(state, {
    type: "assistant_response_failed",
    error: "provider failed",
  });

  expect(state.assistantResponseStatus).toBe("assistant_response_failed");
  expect(state.conversationTranscript).toEqual([
    {
      kind: "error",
      text: "provider failed",
    },
  ]);
});

// Helper — builds a state that already has a user prompt in flight and the
// assistant turn marked as streaming, mimicking what happens right after
// submitPromptDraft + assistant_response_started.
function createStreamingTurnState() {
  const initial = appendTypedTextToPromptDraft(
    createInitialChatScreenState({
      selectedModelId: "gpt-5.4",
    }),
    "why is the sky blue",
  );
  const submitted = submitPromptDraft(initial);
  return applyAssistantResponseEventToChatScreenState(submitted.nextChatScreenState, {
    type: "assistant_response_started",
    model: "gpt-5.4",
  });
}

test("applyAssistantResponseEventToChatScreenState appends a streaming reasoning summary when reasoning starts", () => {
  const next = applyAssistantResponseEventToChatScreenState(createStreamingTurnState(), {
    type: "assistant_reasoning_summary_started",
  });
  const lastEntry = next.conversationTranscript.at(-1);
  expect(lastEntry?.kind).toBe("streaming_reasoning_summary");
  expect(next.currentStreamingReasoningSummaryId).toBeDefined();
});

test("applyAssistantResponseEventToChatScreenState grows the streaming reasoning summary as text chunks arrive", () => {
  const started = applyAssistantResponseEventToChatScreenState(createStreamingTurnState(), {
    type: "assistant_reasoning_summary_started",
  });
  const afterFirstChunk = applyAssistantResponseEventToChatScreenState(started, {
    type: "assistant_reasoning_summary_text_chunk",
    text: "Thinking",
  });
  const afterSecondChunk = applyAssistantResponseEventToChatScreenState(afterFirstChunk, {
    type: "assistant_reasoning_summary_text_chunk",
    text: " more.",
  });
  const lastEntry = afterSecondChunk.conversationTranscript.at(-1);
  if (lastEntry?.kind !== "streaming_reasoning_summary") {
    throw new Error("expected streaming_reasoning_summary");
  }
  expect(lastEntry.reasoningSummaryText).toBe("Thinking more.");
});

test("applyAssistantResponseEventToChatScreenState replaces streaming reasoning summary with completed reasoning summary on reasoning end", () => {
  const started = applyAssistantResponseEventToChatScreenState(createStreamingTurnState(), {
    type: "assistant_reasoning_summary_started",
  });
  const afterChunk = applyAssistantResponseEventToChatScreenState(started, {
    type: "assistant_reasoning_summary_text_chunk",
    text: "done thinking",
  });
  const afterCompletion = applyAssistantResponseEventToChatScreenState(afterChunk, {
    type: "assistant_reasoning_summary_completed",
    reasoningDurationMs: 2500,
  });
  const lastEntry = afterCompletion.conversationTranscript.at(-1);
  if (lastEntry?.kind !== "completed_reasoning_summary") {
    throw new Error("expected completed_reasoning_summary");
  }
  expect(lastEntry.reasoningDurationMs).toBe(2500);
  expect(lastEntry.reasoningSummaryText).toBe("done thinking");
  expect(lastEntry.reasoningTokenCount).toBeUndefined();
  expect(afterCompletion.currentStreamingReasoningSummaryId).toBeUndefined();
});

test("applyAssistantResponseEventToChatScreenState ignores reasoning text chunks without a matching streaming id", () => {
  const streaming = createStreamingTurnState();
  const next = applyAssistantResponseEventToChatScreenState(streaming, {
    type: "assistant_reasoning_summary_text_chunk",
    text: "orphan",
  });
  expect(next).toBe(streaming);
});

test("applyAssistantResponseEventToChatScreenState pins a streaming_tool_call entry when a tool call starts", () => {
  const streaming = createStreamingTurnState();
  const afterStart = applyAssistantResponseEventToChatScreenState(streaming, {
    type: "assistant_tool_call_started",
    toolCallId: "tc_read_1",
    toolCallDetail: { toolName: "read", readFilePath: "apps/api/indexer.py" },
  });
  const lastEntry = afterStart.conversationTranscript.at(-1);
  if (lastEntry?.kind !== "streaming_tool_call") {
    throw new Error("expected streaming_tool_call entry");
  }
  expect(lastEntry.toolCallId).toBe("tc_read_1");
  expect(lastEntry.toolCallDetail.toolName).toBe("read");
});

test("applyAssistantResponseEventToChatScreenState swaps the streaming tool call for a completed_tool_call when it finishes", () => {
  const streaming = createStreamingTurnState();
  const afterStart = applyAssistantResponseEventToChatScreenState(streaming, {
    type: "assistant_tool_call_started",
    toolCallId: "tc_read_1",
    toolCallDetail: { toolName: "read", readFilePath: "apps/api/indexer.py" },
  });
  const afterCompletion = applyAssistantResponseEventToChatScreenState(afterStart, {
    type: "assistant_tool_call_completed",
    toolCallId: "tc_read_1",
    toolCallDetail: {
      toolName: "read",
      readFilePath: "apps/api/indexer.py",
      readLineCount: 46,
    },
    durationMs: 120,
  });
  const replacedEntry = afterCompletion.conversationTranscript.find(
    (conversationTranscriptEntry) =>
      conversationTranscriptEntry.kind === "completed_tool_call" &&
      conversationTranscriptEntry.toolCallId === "tc_read_1",
  );
  if (replacedEntry?.kind !== "completed_tool_call") {
    throw new Error("expected completed_tool_call entry");
  }
  expect(replacedEntry.durationMs).toBe(120);
  const hasStreamingStillInTranscript = afterCompletion.conversationTranscript.some(
    (conversationTranscriptEntry) =>
      conversationTranscriptEntry.kind === "streaming_tool_call" &&
      conversationTranscriptEntry.toolCallId === "tc_read_1",
  );
  expect(hasStreamingStillInTranscript).toBe(false);
});

test("applyAssistantResponseEventToChatScreenState swaps the streaming tool call for a failed_tool_call on failure", () => {
  const streaming = createStreamingTurnState();
  const afterStart = applyAssistantResponseEventToChatScreenState(streaming, {
    type: "assistant_tool_call_started",
    toolCallId: "tc_edit_1",
    toolCallDetail: { toolName: "edit", editedFilePath: "missing/path.py" },
  });
  const afterFailure = applyAssistantResponseEventToChatScreenState(afterStart, {
    type: "assistant_tool_call_failed",
    toolCallId: "tc_edit_1",
    toolCallDetail: { toolName: "edit", editedFilePath: "missing/path.py" },
    errorText: "file not found",
    durationMs: 5,
  });
  const replacedEntry = afterFailure.conversationTranscript.find(
    (conversationTranscriptEntry) =>
      conversationTranscriptEntry.kind === "failed_tool_call" &&
      conversationTranscriptEntry.toolCallId === "tc_edit_1",
  );
  if (replacedEntry?.kind !== "failed_tool_call") {
    throw new Error("expected failed_tool_call entry");
  }
  expect(replacedEntry.errorText).toBe("file not found");
});

test("applyAssistantResponseEventToChatScreenState appends an orphan tool completion when no matching streaming entry exists", () => {
  const streaming = createStreamingTurnState();
  const afterOrphanCompletion = applyAssistantResponseEventToChatScreenState(streaming, {
    type: "assistant_tool_call_completed",
    toolCallId: "tc_grep_orphan",
    toolCallDetail: { toolName: "grep", searchPattern: "foo" },
    durationMs: 20,
  });
  const lastEntry = afterOrphanCompletion.conversationTranscript.at(-1);
  if (lastEntry?.kind !== "completed_tool_call") {
    throw new Error("expected completed_tool_call entry at the tail");
  }
  expect(lastEntry.toolCallId).toBe("tc_grep_orphan");
});

test("applyAssistantResponseEventToChatScreenState pins plan_proposal, rate_limit_notice, tool_approval_request, and a metadata-only turn_footer entry", () => {
  const streaming = createStreamingTurnState();
  const afterPlan = applyAssistantResponseEventToChatScreenState(streaming, {
    type: "assistant_plan_proposed",
    planId: "plan_1",
    planTitle: "Wire atlas stream export",
    planSteps: [
      { stepIndex: 0, stepTitle: "Expose endpoint", stepStatus: "pending" },
      { stepIndex: 1, stepTitle: "Cover integration tests", stepStatus: "pending" },
    ],
  });
  const afterRateLimit = applyAssistantResponseEventToChatScreenState(afterPlan, {
    type: "assistant_rate_limit_pending",
    retryAfterSeconds: 30,
    limitExplanation: "hourly cap",
  });
  const afterApproval = applyAssistantResponseEventToChatScreenState(afterRateLimit, {
    type: "assistant_tool_approval_requested",
    approvalId: "apv_1",
    pendingToolCallId: "tc_bash_1",
    pendingToolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
    riskExplanation: "destructive",
  });
  const afterTurnFooter = applyAssistantResponseEventToChatScreenState(afterApproval, {
    type: "assistant_turn_completed",
    turnDurationMs: 1800,
    modelDisplayName: "GPT-5.4",
  });

  const pinnedKinds = afterTurnFooter.conversationTranscript.map((conversationTranscriptEntry) => conversationTranscriptEntry.kind);
  expect(pinnedKinds.slice(-4)).toEqual([
    "plan_proposal",
    "rate_limit_notice",
    "tool_approval_request",
    "turn_footer",
  ]);

  const turnFooterEntry = afterTurnFooter.conversationTranscript.at(-1);
  if (turnFooterEntry?.kind !== "turn_footer") {
    throw new Error("expected a turn_footer entry");
  }
  expect(turnFooterEntry.usage).toBeUndefined();
});

test("applyAssistantResponseEventToChatScreenState appends an incomplete notice and backfills footer usage when the response is incomplete", () => {
  let state = createStreamingTurnState();
  state = applyAssistantResponseEventToChatScreenState(state, {
    type: "assistant_turn_completed",
    turnDurationMs: 900,
    modelDisplayName: "GPT-5.4",
  });
  state = applyAssistantResponseEventToChatScreenState(state, {
    type: "assistant_response_text_chunk",
    text: "Partial answer",
  });
  state = applyAssistantResponseEventToChatScreenState(state, {
    type: "assistant_response_incomplete",
    incompleteReason: "max_output_tokens",
    usage: {
      total: 24,
      input: 20,
      output: 3,
      reasoning: 1,
      cache: { read: 0, write: 0 },
    },
  });

  expect(state.assistantResponseStatus).toBe("waiting_for_user_input");
  expect(state.latestTokenUsage).toEqual({
    total: 24,
    input: 20,
    output: 3,
    reasoning: 1,
    cache: { read: 0, write: 0 },
  });

  const lastEntry = state.conversationTranscript.at(-1);
  expect(lastEntry).toEqual({
    kind: "incomplete_response_notice",
    incompleteReason: "max_output_tokens",
  });

  const turnFooterEntry = state.conversationTranscript.find((entry) => entry.kind === "turn_footer");
  if (turnFooterEntry?.kind !== "turn_footer") {
    throw new Error("expected a turn_footer entry");
  }
  expect(turnFooterEntry.usage).toEqual({
    total: 24,
    input: 20,
    output: 3,
    reasoning: 1,
    cache: { read: 0, write: 0 },
  });

  const partialAssistantMessage = state.conversationTranscript.find(
    (entry) => entry.kind === "message" && entry.message.role === "assistant",
  );
  expect(partialAssistantMessage).toEqual({
    kind: "message",
    message: {
      id: "assistant-streaming",
      role: "assistant",
      text: "Partial answer",
    },
  });
});

test("applyAssistantResponseEventToChatScreenState back-fills reasoning token count when assistant response completes", () => {
  const streaming = createStreamingTurnState();
  const afterReasoningStart = applyAssistantResponseEventToChatScreenState(streaming, {
    type: "assistant_reasoning_summary_started",
  });
  const afterReasoningChunk = applyAssistantResponseEventToChatScreenState(afterReasoningStart, {
    type: "assistant_reasoning_summary_text_chunk",
    text: "hmm",
  });
  const afterReasoningCompleted = applyAssistantResponseEventToChatScreenState(afterReasoningChunk, {
    type: "assistant_reasoning_summary_completed",
    reasoningDurationMs: 1000,
  });
  const afterResponseCompleted = applyAssistantResponseEventToChatScreenState(afterReasoningCompleted, {
    type: "assistant_response_completed",
    message: {
      id: "msg_final",
      role: "assistant",
      text: "because Rayleigh scattering",
    },
    usage: {
      total: 100,
      input: 40,
      output: 20,
      reasoning: 37,
      cache: { read: 0, write: 0 },
    },
  });

  const backfilledEntry = afterResponseCompleted.conversationTranscript.find(
    (entry) => entry.kind === "completed_reasoning_summary",
  );
  if (backfilledEntry?.kind !== "completed_reasoning_summary") {
    throw new Error("expected a completed_reasoning_summary");
  }
  expect(backfilledEntry.reasoningTokenCount).toBe(37);
});
