import { render, type Instance } from "ink";
import React from "react";
import { type AssistantResponseRunner } from "@buli/engine";
import { ChatScreen, type ChatScreenProps } from "./ChatScreen.tsx";

export { ChatScreen } from "./ChatScreen.tsx";
export type { ChatScreenProps } from "./ChatScreen.tsx";
export { ConversationTranscriptPane } from "./components/ConversationTranscriptPane.tsx";
export { InputPanel } from "./components/InputPanel.tsx";
export { ModelAndReasoningSelectionPane } from "./components/ModelAndReasoningSelectionPane.tsx";
export { ReasoningCollapsedChip } from "./components/ReasoningCollapsedChip.tsx";
export { ReasoningStreamBlock } from "./components/ReasoningStreamBlock.tsx";
export { TopBar } from "./components/TopBar.tsx";
export { UserPromptBlock } from "./components/UserPromptBlock.tsx";
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
  hideShortcutsHelpModal,
  hideModelAndReasoningSelection,
  moveHighlightedModelSelectionDown,
  moveHighlightedModelSelectionUp,
  moveHighlightedReasoningEffortChoiceDown,
  moveHighlightedReasoningEffortChoiceUp,
  removeLastCharacterFromPromptDraft,
  showAvailableAssistantModelsForSelection,
  showModelSelectionLoadingError,
  showModelSelectionLoadingState,
  showShortcutsHelpModal,
  submitPromptDraft,
} from "./chatScreenState.ts";
export type {
  AssistantResponseStatus,
  ChatScreenState,
  ConversationTranscriptEntry,
  ModelAndReasoningSelectionState,
  ReasoningEffortChoice,
} from "./chatScreenState.ts";
export type { ConversationTranscriptViewportMeasurements, ConversationTranscriptViewportState } from "./conversationTranscriptViewportState.ts";

export function renderChatScreenInTerminalWithInk(input: {
  selectedModelId: string;
  selectedReasoningEffort?: ChatScreenProps["selectedReasoningEffort"];
  loadAvailableAssistantModels: ChatScreenProps["loadAvailableAssistantModels"];
  assistantResponseRunner: AssistantResponseRunner;
}): Instance {
  return render(
    React.createElement(ChatScreen, {
      assistantResponseRunner: input.assistantResponseRunner,
      loadAvailableAssistantModels: input.loadAvailableAssistantModels,
      selectedModelId: input.selectedModelId,
      ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
    }),
    { alternateScreen: true },
  );
}
