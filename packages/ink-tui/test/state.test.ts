import { expect, test } from "bun:test";
import {
  appendTypedTextToPromptDraft,
  applyAssistantResponseEventToChatScreenState,
  confirmHighlightedModelSelection,
  confirmHighlightedReasoningEffortChoice,
  createInitialChatScreenState,
  hideModelAndReasoningSelection,
  moveHighlightedModelSelectionDown,
  moveHighlightedReasoningEffortChoiceDown,
  removeLastCharacterFromPromptDraft,
  showAvailableAssistantModelsForSelection,
  showModelSelectionLoadingError,
  showModelSelectionLoadingState,
  submitPromptDraft,
} from "../src/index.ts";

test("submitPromptDraft starts streaming and appends the user message", () => {
  const initial = appendTypedTextToPromptDraft(
    createInitialChatScreenState({
      authenticationState: "ready",
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
    createInitialChatScreenState({ authenticationState: "ready", selectedModelId: "gpt-5.4" }),
    "Hello",
  );

  expect(removeLastCharacterFromPromptDraft(state).promptDraft).toBe("Hell");
});

test("applyAssistantResponseEventToChatScreenState appends text chunks and stores final token usage", () => {
  let state = appendTypedTextToPromptDraft(
    createInitialChatScreenState({ authenticationState: "ready", selectedModelId: "gpt-5.4" }),
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

test("showModelSelectionLoadingState marks the model selection as loading", () => {
  const state = showModelSelectionLoadingState(
    createInitialChatScreenState({ authenticationState: "ready", selectedModelId: "gpt-5.4" }),
  );

  expect(state.modelAndReasoningSelectionState).toEqual({ step: "loading_available_models" });
});

test("showAvailableAssistantModelsForSelection highlights the current model", () => {
  const state = showAvailableAssistantModelsForSelection(
    showModelSelectionLoadingState(
      createInitialChatScreenState({ authenticationState: "ready", selectedModelId: "gpt-4.1-mini" }),
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
      createInitialChatScreenState({ authenticationState: "ready", selectedModelId: "gpt-5.4" }),
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
      createInitialChatScreenState({ authenticationState: "ready", selectedModelId: "gpt-5.4" }),
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
      createInitialChatScreenState({ authenticationState: "ready", selectedModelId: "gpt-5.4" }),
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
  let state = createInitialChatScreenState({
    authenticationState: "ready",
    selectedModelId: "gpt-5.4",
    selectedReasoningEffort: "high",
  });
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
        createInitialChatScreenState({ authenticationState: "ready", selectedModelId: "gpt-5.4" }),
      ),
      "network failed",
    ),
  );

  expect(state.modelAndReasoningSelectionState).toEqual({ step: "hidden" });
});

test("submitPromptDraft does nothing while an assistant response is already streaming", () => {
  let state = appendTypedTextToPromptDraft(
    createInitialChatScreenState({ authenticationState: "ready", selectedModelId: "gpt-5.4" }),
    "Hello",
  );
  state = submitPromptDraft(state).nextChatScreenState;

  const result = submitPromptDraft(state);

  expect(result.submittedPromptText).toBeUndefined();
  expect(result.nextChatScreenState).toEqual(state);
});

test("applyAssistantResponseEventToChatScreenState adds an error entry when the response fails", () => {
  let state = createInitialChatScreenState({ authenticationState: "ready", selectedModelId: "gpt-5.4" });
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
      authenticationState: "ready",
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
