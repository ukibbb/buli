import {
  DEFAULT_ASSISTANT_PRIMARY_AGENT_DISPLAY_METADATA,
  DEFAULT_ASSISTANT_PRIMARY_AGENT_NAME,
  type AssistantPrimaryAgentDisplayMetadata,
  type AssistantPrimaryAgentName,
} from "@buli/contracts";

export type PrimaryAgentCycleMetadata = readonly AssistantPrimaryAgentDisplayMetadata[];

export function resolveNextPrimaryAgentName(
  currentPrimaryAgentName: AssistantPrimaryAgentName,
  primaryAgentCycleMetadata: PrimaryAgentCycleMetadata = DEFAULT_ASSISTANT_PRIMARY_AGENT_DISPLAY_METADATA,
): AssistantPrimaryAgentName {
  const primaryAgentCycle = listPrimaryAgentCycle(primaryAgentCycleMetadata);
  const currentIndex = primaryAgentCycle.indexOf(currentPrimaryAgentName);
  const nextIndex = currentIndex === primaryAgentCycle.length - 1 ? 0 : currentIndex + 1;
  return primaryAgentCycle[nextIndex] ?? DEFAULT_ASSISTANT_PRIMARY_AGENT_NAME;
}

function listPrimaryAgentCycle(
  primaryAgentCycleMetadata: PrimaryAgentCycleMetadata,
): readonly AssistantPrimaryAgentName[] {
  if (primaryAgentCycleMetadata.length === 0) {
    return DEFAULT_ASSISTANT_PRIMARY_AGENT_DISPLAY_METADATA.map((agentMetadata) => agentMetadata.agentName);
  }

  return primaryAgentCycleMetadata.map((agentMetadata) => agentMetadata.agentName);
}

/** @deprecated Use PrimaryAgentCycleMetadata. */
export type AssistantOperatingModeCycleMetadata = PrimaryAgentCycleMetadata;

/** @deprecated Use resolveNextPrimaryAgentName. */
export const resolveNextAssistantOperatingMode = resolveNextPrimaryAgentName;
