import type { AssistantPrimaryAgentName } from "@buli/contracts";
import type { ChatSessionState } from "./chatSessionState.ts";
import {
  resolveNextPrimaryAgentName,
  type PrimaryAgentCycleMetadata,
} from "./resolveNextPrimaryAgentName.ts";

export function selectPrimaryAgentName(
  chatSessionState: ChatSessionState,
  selectedPrimaryAgentName: AssistantPrimaryAgentName,
): ChatSessionState {
  if (chatSessionState.selectedPrimaryAgentName === selectedPrimaryAgentName) {
    return chatSessionState;
  }

  return {
    ...chatSessionState,
    selectedPrimaryAgentName,
  };
}

export function cycleSelectedPrimaryAgentName(
  chatSessionState: ChatSessionState,
  primaryAgentCycleMetadata?: PrimaryAgentCycleMetadata | undefined,
): ChatSessionState {
  return selectPrimaryAgentName(
    chatSessionState,
    resolveNextPrimaryAgentName(chatSessionState.selectedPrimaryAgentName, primaryAgentCycleMetadata),
  );
}

/** @deprecated Use selectPrimaryAgentName. */
export const selectAssistantOperatingMode = selectPrimaryAgentName;

/** @deprecated Use cycleSelectedPrimaryAgentName. */
export const cycleAssistantOperatingMode = cycleSelectedPrimaryAgentName;
