import {
  type AssistantOperatingMode,
  type ProviderAvailableToolName,
} from "@buli/contracts";
import {
  createDefaultAssistantAgentRegistry,
  type AssistantAgentRegistry,
  type PrimaryAssistantAgentDefinition,
} from "./assistantAgentRegistry.ts";

const defaultAssistantAgentRegistry = createDefaultAssistantAgentRegistry();

export const READ_ONLY_ASSISTANT_MODE_AVAILABLE_TOOL_NAMES = defaultAssistantAgentRegistry
  .resolvePrimaryAgentDefinition("understand").availableToolNames;

export type AssistantOperatingModeToolAccessDecision =
  | {
    accessKind: "allowed";
    effectiveAvailableToolNames: readonly ProviderAvailableToolName[];
  }
  | {
    accessKind: "denied";
    effectiveAvailableToolNames: readonly ProviderAvailableToolName[];
    denialText: string;
  };

export function resolveAvailableToolNamesForAssistantOperatingMode(input: {
  assistantOperatingMode: AssistantOperatingMode;
  requestedAvailableToolNames: readonly ProviderAvailableToolName[] | undefined;
  assistantAgentRegistry?: AssistantAgentRegistry | undefined;
}): { availableToolNames?: readonly ProviderAvailableToolName[] } {
  return resolveAvailableToolNamesForPrimaryAssistantAgent({
    primaryAssistantAgent: (input.assistantAgentRegistry ?? defaultAssistantAgentRegistry).resolvePrimaryAgentDefinition(
      input.assistantOperatingMode,
    ),
    requestedAvailableToolNames: input.requestedAvailableToolNames,
  });
}

export function resolveAvailableToolNamesForPrimaryAssistantAgent(input: {
  primaryAssistantAgent: PrimaryAssistantAgentDefinition;
  requestedAvailableToolNames: readonly ProviderAvailableToolName[] | undefined;
}): { availableToolNames?: readonly ProviderAvailableToolName[] } {
  if (!input.requestedAvailableToolNames) {
    return { availableToolNames: input.primaryAssistantAgent.availableToolNames };
  }

  const allowedToolNameSet = new Set<ProviderAvailableToolName>(input.primaryAssistantAgent.availableToolNames);
  return {
    availableToolNames: input.requestedAvailableToolNames.filter((availableToolName) => allowedToolNameSet.has(availableToolName)),
  };
}

export function isReadOnlyAssistantOperatingMode(
  assistantOperatingMode: AssistantOperatingMode,
  assistantAgentRegistry: AssistantAgentRegistry = defaultAssistantAgentRegistry,
): boolean {
  return assistantAgentRegistry.resolvePrimaryAgentDefinition(assistantOperatingMode).isReadOnly;
}

export function resolveAssistantOperatingModeToolAccess(input: {
  assistantOperatingMode: AssistantOperatingMode;
  requestedAvailableToolNames: readonly ProviderAvailableToolName[] | undefined;
  requestedToolName: ProviderAvailableToolName;
  assistantAgentRegistry?: AssistantAgentRegistry | undefined;
}): AssistantOperatingModeToolAccessDecision {
  const primaryAssistantAgent = (input.assistantAgentRegistry ?? defaultAssistantAgentRegistry).resolvePrimaryAgentDefinition(
    input.assistantOperatingMode,
  );
  return resolvePrimaryAssistantAgentToolAccess({
    primaryAssistantAgent,
    requestedAvailableToolNames: input.requestedAvailableToolNames,
    requestedToolName: input.requestedToolName,
  });
}

export function resolvePrimaryAssistantAgentToolAccess(input: {
  primaryAssistantAgent: PrimaryAssistantAgentDefinition;
  requestedAvailableToolNames: readonly ProviderAvailableToolName[] | undefined;
  requestedToolName: ProviderAvailableToolName;
}): AssistantOperatingModeToolAccessDecision {
  const effectiveAvailableToolNames = resolveAvailableToolNamesForPrimaryAssistantAgent({
    primaryAssistantAgent: input.primaryAssistantAgent,
    requestedAvailableToolNames: input.requestedAvailableToolNames,
  }).availableToolNames ?? [];

  if (effectiveAvailableToolNames.includes(input.requestedToolName)) {
    return {
      accessKind: "allowed",
      effectiveAvailableToolNames,
    };
  }

  return {
    accessKind: "denied",
    effectiveAvailableToolNames,
    denialText: formatUnavailableToolDenialText({
      primaryAssistantAgent: input.primaryAssistantAgent,
      requestedToolName: input.requestedToolName,
      effectiveAvailableToolNames,
    }),
  };
}

export function formatAssistantOperatingModeName(
  assistantOperatingMode: AssistantOperatingMode,
  assistantAgentRegistry: AssistantAgentRegistry = defaultAssistantAgentRegistry,
): string {
  return assistantAgentRegistry.resolvePrimaryAgentDefinition(assistantOperatingMode).displayName;
}

function formatUnavailableToolDenialText(input: {
  primaryAssistantAgent: PrimaryAssistantAgentDefinition;
  requestedToolName: ProviderAvailableToolName;
  effectiveAvailableToolNames: readonly ProviderAvailableToolName[];
}): string {
  const assistantOperatingModeDisplayName = input.primaryAssistantAgent.displayName;
  if (input.primaryAssistantAgent.isReadOnly) {
    if (input.requestedToolName === "bash") {
      return `${assistantOperatingModeDisplayName} can use bash only for explicitly approved read/inspect commands, and bash is not available in this turn.`;
    }

    if (
      input.requestedToolName === "edit" ||
      input.requestedToolName === "edit_many" ||
      input.requestedToolName === "patch" ||
      input.requestedToolName === "patch_many" ||
      input.requestedToolName === "write"
    ) {
      return `${assistantOperatingModeDisplayName} is read-only, so this ${input.requestedToolName} tool call was not applied.`;
    }

    return `${assistantOperatingModeDisplayName} is read-only, so the ${input.requestedToolName} tool is not available in this mode.`;
  }

  if (input.effectiveAvailableToolNames.length === 0) {
    return `${assistantOperatingModeDisplayName} cannot use ${input.requestedToolName} in this turn because no tools are available.`;
  }

  return `${assistantOperatingModeDisplayName} cannot use ${input.requestedToolName} in this turn. Available tools: ${input.effectiveAvailableToolNames.join(", ")}.`;
}
