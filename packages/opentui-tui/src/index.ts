// packages/opentui-tui/src/index.ts
// Implementation lands in Task 27. This placeholder exists so the package
// typechecks and can be installed as a dependency before the full renderer
// is wired up.
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

export function renderChatScreenInTerminalWithOpentui(): never {
  throw new Error(
    "renderChatScreenInTerminalWithOpentui is not yet implemented — stub placeholder from Task 15 scaffolding.",
  );
}
