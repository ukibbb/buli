import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import React from "react";
import type { AssistantConversationRunner } from "@buli/engine";
import { ChatScreen, type ChatScreenProps } from "./ChatScreen.tsx";
import { restoreConsoleTimeStampAfterOpentuiActivation } from "./restoreConsoleTimeStampAfterOpentuiActivation.ts";
export { ChatScreen } from "./ChatScreen.tsx";
export type { ChatScreenProps } from "./ChatScreen.tsx";

export type OpentuiChatScreenInstance = {
  waitUntilExit(): Promise<void>;
};

export async function renderChatScreenInTerminalWithOpentui(input: {
  selectedModelId: string;
  selectedReasoningEffort?: ChatScreenProps["selectedReasoningEffort"];
  loadAvailableAssistantModels: ChatScreenProps["loadAvailableAssistantModels"];
  loadPromptContextCandidates: ChatScreenProps["loadPromptContextCandidates"];
  assistantConversationRunner: AssistantConversationRunner;
}): Promise<OpentuiChatScreenInstance> {
  const originalConsole = globalThis.console;
  const cliRenderer = await createCliRenderer({
    screenMode: "alternate-screen",
    useMouse: true,
    enableMouseMovement: true,
  });
  restoreConsoleTimeStampAfterOpentuiActivation({ originalConsole });
  const root = createRoot(cliRenderer);
  root.render(
    React.createElement(ChatScreen, {
      assistantConversationRunner: input.assistantConversationRunner,
      loadAvailableAssistantModels: input.loadAvailableAssistantModels,
      loadPromptContextCandidates: input.loadPromptContextCandidates,
      selectedModelId: input.selectedModelId,
      ...(input.selectedReasoningEffort !== undefined
        ? { selectedReasoningEffort: input.selectedReasoningEffort }
        : {}),
    }),
  );

  return {
    waitUntilExit(): Promise<void> {
      return new Promise<void>((resolve) => {
        cliRenderer.once("destroy", () => resolve());
      });
    },
  };
}
export { relayAssistantResponseRunnerEvents } from "./relayAssistantResponseRunnerEvents.ts";
export {
  applyAssistantResponseEventToChatScreenState,
  confirmHighlightedModelSelection,
  confirmHighlightedReasoningEffortChoice,
  createInitialChatScreenState,
  hidePromptContextSelection,
  hideShortcutsHelpModal,
  hideModelAndReasoningSelection,
  moveHighlightedPromptContextCandidateDown,
  moveHighlightedPromptContextCandidateUp,
  moveHighlightedModelSelectionDown,
  moveHighlightedModelSelectionUp,
  moveHighlightedReasoningEffortChoiceDown,
  moveHighlightedReasoningEffortChoiceUp,
  insertTextIntoPromptDraftAtCursor,
  movePromptDraftCursorLeft,
  movePromptDraftCursorRight,
  removePromptDraftCharacterAtCursor,
  removePromptDraftCharacterBeforeCursor,
  selectHighlightedPromptContextCandidate,
  showAvailableAssistantModelsForSelection,
  showModelSelectionLoadingError,
  showModelSelectionLoadingState,
  showPromptContextCandidatesForSelection,
  showShortcutsHelpModal,
  submitPromptDraft,
} from "./chatScreenState.ts";
export type {
  AssistantResponseStatus,
  ChatScreenState,
  ConversationTranscriptEntry,
  ModelAndReasoningSelectionState,
  PromptContextSelectionState,
  ReasoningEffortChoice,
} from "./chatScreenState.ts";
export {
  createInitialConversationTranscriptViewportState,
  jumpConversationTranscriptViewportToNewestRows,
  jumpConversationTranscriptViewportToOldestRows,
  reconcileConversationTranscriptViewportAfterObservedScrollPosition,
  reconcileConversationTranscriptViewportAfterMeasurement,
  scrollConversationTranscriptViewportDownByPage,
  scrollConversationTranscriptViewportDownByRows,
  scrollConversationTranscriptViewportUpByPage,
  scrollConversationTranscriptViewportUpByRows,
} from "./conversationTranscriptViewportState.ts";
export type { ConversationTranscriptViewportMeasurements, ConversationTranscriptViewportState } from "./conversationTranscriptViewportState.ts";
export { RenderAssistantResponseTree } from "./richText/renderAssistantResponseTree.tsx";
export type { RenderAssistantResponseTreeProps } from "./richText/renderAssistantResponseTree.tsx";
export { ConversationTranscriptPane } from "./components/ConversationTranscriptPane.tsx";
export { InputPanel } from "./components/InputPanel.tsx";
export { ModelAndReasoningSelectionPane } from "./components/ModelAndReasoningSelectionPane.tsx";
export { PromptContextSelectionPane } from "./components/PromptContextSelectionPane.tsx";
export { PromptDraftText } from "./components/PromptDraftText.tsx";
export { ReasoningCollapsedChip } from "./components/ReasoningCollapsedChip.tsx";
export { ReasoningStreamBlock } from "./components/ReasoningStreamBlock.tsx";
export { StreamingAssistantMessageBlock } from "./components/StreamingAssistantMessageBlock.tsx";
export { TopBar } from "./components/TopBar.tsx";
export { UserPromptBlock } from "./components/UserPromptBlock.tsx";
