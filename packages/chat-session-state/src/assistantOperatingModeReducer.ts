import type { AssistantOperatingMode } from "@buli/contracts";
import type { ChatSessionState } from "./chatSessionState.ts";
import { resolveNextAssistantOperatingMode } from "./resolveNextAssistantOperatingMode.ts";

export function selectAssistantOperatingMode(
  chatSessionState: ChatSessionState,
  selectedAssistantOperatingMode: AssistantOperatingMode,
): ChatSessionState {
  if (chatSessionState.selectedAssistantOperatingMode === selectedAssistantOperatingMode) {
    return chatSessionState;
  }

  return {
    ...chatSessionState,
    selectedAssistantOperatingMode,
  };
}

export function cycleAssistantOperatingMode(chatSessionState: ChatSessionState): ChatSessionState {
  return selectAssistantOperatingMode(
    chatSessionState,
    resolveNextAssistantOperatingMode(chatSessionState.selectedAssistantOperatingMode),
  );
}
