import {
  type AssistantOperatingMode,
  type ProviderAvailableToolName,
} from "@buli/contracts";
import { resolveBuiltInPrimaryAssistantAgent } from "./assistantAgentCatalog.ts";

export const READ_ONLY_ASSISTANT_MODE_AVAILABLE_TOOL_NAMES = resolveBuiltInPrimaryAssistantAgent("understand").availableToolNames;

export function resolveAvailableToolNamesForAssistantOperatingMode(input: {
  assistantOperatingMode: AssistantOperatingMode;
  requestedAvailableToolNames: readonly ProviderAvailableToolName[] | undefined;
}): { availableToolNames?: readonly ProviderAvailableToolName[] } {
  const primaryAssistantAgent = resolveBuiltInPrimaryAssistantAgent(input.assistantOperatingMode);
  if (!input.requestedAvailableToolNames) {
    return { availableToolNames: primaryAssistantAgent.availableToolNames };
  }

  const allowedToolNameSet = new Set<ProviderAvailableToolName>(primaryAssistantAgent.availableToolNames);
  return {
    availableToolNames: input.requestedAvailableToolNames.filter((availableToolName) => allowedToolNameSet.has(availableToolName)),
  };
}

export function isReadOnlyAssistantOperatingMode(assistantOperatingMode: AssistantOperatingMode): boolean {
  return resolveBuiltInPrimaryAssistantAgent(assistantOperatingMode).isReadOnly;
}

export function formatAssistantOperatingModeName(assistantOperatingMode: AssistantOperatingMode): string {
  return resolveBuiltInPrimaryAssistantAgent(assistantOperatingMode).displayName;
}
