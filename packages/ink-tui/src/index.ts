import { render, type Instance } from "ink";
import React from "react";
import { type AssistantResponseRunner } from "@buli/engine";
import { ChatScreen, type ChatScreenProps } from "./ChatScreen.tsx";

export { ChatScreen } from "./ChatScreen.tsx";
export type { ChatScreenProps } from "./ChatScreen.tsx";
export { ChatSessionStatusBar } from "./components/ChatSessionStatusBar.tsx";
export { ConversationTranscriptPane } from "./components/ConversationTranscriptPane.tsx";
export { ModelAndReasoningSelectionPane } from "./components/ModelAndReasoningSelectionPane.tsx";
export { PromptDraftPane } from "./components/PromptDraftPane.tsx";
export {
  createInitialConversationTranscriptViewportState,
  jumpConversationTranscriptViewportToNewestRows,
  jumpConversationTranscriptViewportToOldestRows,
  reconcileConversationTranscriptViewportAfterMeasurement,
  scrollConversationTranscriptViewportDownByPage,
  scrollConversationTranscriptViewportDownByRows,
  scrollConversationTranscriptViewportUpByPage,
  scrollConversationTranscriptViewportUpByRows,
} from "./conversationTranscriptViewportState.ts";
export {
  appendTypedTextToPromptDraft,
  applyAssistantResponseEventToChatScreenState,
  confirmHighlightedModelSelection,
  confirmHighlightedReasoningEffortChoice,
  createInitialChatScreenState,
  hideModelAndReasoningSelection,
  moveHighlightedModelSelectionDown,
  moveHighlightedModelSelectionUp,
  moveHighlightedReasoningEffortChoiceDown,
  moveHighlightedReasoningEffortChoiceUp,
  removeLastCharacterFromPromptDraft,
  showAvailableAssistantModelsForSelection,
  showModelSelectionLoadingError,
  showModelSelectionLoadingState,
  submitPromptDraft,
} from "./chatScreenState.ts";
export type {
  AssistantResponseStatus,
  AuthenticationState,
  ChatScreenState,
  ConversationTranscriptEntry,
  ModelAndReasoningSelectionState,
  ReasoningEffortChoice,
} from "./chatScreenState.ts";
export type { ConversationTranscriptViewportMeasurements, ConversationTranscriptViewportState } from "./conversationTranscriptViewportState.ts";

export function renderChatScreenInTerminal(input: {
  authenticationState: ChatScreenProps["authenticationState"];
  selectedModelId: string;
  selectedReasoningEffort?: ChatScreenProps["selectedReasoningEffort"];
  loadAvailableAssistantModels: ChatScreenProps["loadAvailableAssistantModels"];
  assistantResponseRunner: AssistantResponseRunner;
}): Instance {
  return render(
    React.createElement(ChatScreen, {
      assistantResponseRunner: input.assistantResponseRunner,
      authenticationState: input.authenticationState,
      loadAvailableAssistantModels: input.loadAvailableAssistantModels,
      selectedModelId: input.selectedModelId,
      ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
    }),
    { alternateScreen: true },
  );
}
