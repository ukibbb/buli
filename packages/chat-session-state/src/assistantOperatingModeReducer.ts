import type { AssistantOperatingMode } from "@buli/contracts";
import type { ChatSessionState } from "./chatSessionState.ts";

const ASSISTANT_OPERATING_MODE_CYCLE = ["understand", "plan", "implementation"] as const satisfies readonly AssistantOperatingMode[];

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
  const currentModeIndex = ASSISTANT_OPERATING_MODE_CYCLE.indexOf(chatSessionState.selectedAssistantOperatingMode);
  const nextModeIndex = currentModeIndex === ASSISTANT_OPERATING_MODE_CYCLE.length - 1 ? 0 : currentModeIndex + 1;
  return selectAssistantOperatingMode(chatSessionState, ASSISTANT_OPERATING_MODE_CYCLE[nextModeIndex] ?? "understand");
}
