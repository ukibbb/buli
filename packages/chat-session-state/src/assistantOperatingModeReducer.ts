import type { AssistantOperatingMode } from "@buli/contracts";
import type { ChatSessionState } from "./chatSessionState.ts";

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
    chatSessionState.selectedAssistantOperatingMode === "implementation" ? "plan" : "implementation",
  );
}
