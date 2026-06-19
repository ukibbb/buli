import {
  DEFAULT_ASSISTANT_OPERATING_MODE,
  DEFAULT_ASSISTANT_PRIMARY_AGENT_DISPLAY_METADATA,
  type AssistantOperatingMode,
  type AssistantPrimaryAgentDisplayMetadata,
} from "@buli/contracts";

export type AssistantOperatingModeCycleMetadata = readonly AssistantPrimaryAgentDisplayMetadata[];

export function resolveNextAssistantOperatingMode(
  currentAssistantOperatingMode: AssistantOperatingMode,
  assistantOperatingModeCycleMetadata: AssistantOperatingModeCycleMetadata = DEFAULT_ASSISTANT_PRIMARY_AGENT_DISPLAY_METADATA,
): AssistantOperatingMode {
  const assistantOperatingModeCycle = listAssistantOperatingModeCycle(assistantOperatingModeCycleMetadata);
  const currentIndex = assistantOperatingModeCycle.indexOf(currentAssistantOperatingMode);
  const nextIndex = currentIndex === assistantOperatingModeCycle.length - 1 ? 0 : currentIndex + 1;
  return assistantOperatingModeCycle[nextIndex] ?? DEFAULT_ASSISTANT_OPERATING_MODE;
}

function listAssistantOperatingModeCycle(
  assistantOperatingModeCycleMetadata: AssistantOperatingModeCycleMetadata,
): readonly AssistantOperatingMode[] {
  if (assistantOperatingModeCycleMetadata.length === 0) {
    return DEFAULT_ASSISTANT_PRIMARY_AGENT_DISPLAY_METADATA.map((agentMetadata) => agentMetadata.agentName);
  }

  return assistantOperatingModeCycleMetadata.map((agentMetadata) => agentMetadata.agentName);
}
