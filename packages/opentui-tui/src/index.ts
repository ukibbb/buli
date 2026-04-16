import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import React from "react";
import type { AssistantResponseRunner } from "@buli/engine";
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
  assistantResponseRunner: AssistantResponseRunner;
}): Promise<OpentuiChatScreenInstance> {
  const originalConsole = globalThis.console;
  const cliRenderer = await createCliRenderer({ screenMode: "alternate-screen" });
  restoreConsoleTimeStampAfterOpentuiActivation({ originalConsole });
  const root = createRoot(cliRenderer);
  root.render(
    React.createElement(ChatScreen, {
      assistantResponseRunner: input.assistantResponseRunner,
      loadAvailableAssistantModels: input.loadAvailableAssistantModels,
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
export type { ConversationTranscriptViewportMeasurements, ConversationTranscriptViewportState } from "./conversationTranscriptViewportState.ts";
export { RenderAssistantResponseTree } from "./richText/renderAssistantResponseTree.tsx";
export type { RenderAssistantResponseTreeProps } from "./richText/renderAssistantResponseTree.tsx";
export { ConversationTranscriptPane } from "./components/ConversationTranscriptPane.tsx";
export { InputPanel } from "./components/InputPanel.tsx";
export { ModelAndReasoningSelectionPane } from "./components/ModelAndReasoningSelectionPane.tsx";
export { ReasoningCollapsedChip } from "./components/ReasoningCollapsedChip.tsx";
export { ReasoningStreamBlock } from "./components/ReasoningStreamBlock.tsx";
export { TopBar } from "./components/TopBar.tsx";
export { UserPromptBlock } from "./components/UserPromptBlock.tsx";
