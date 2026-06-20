import {
  type AssistantOperatingMode,
  type AssistantPrimaryAgentName,
  type ProviderAvailableToolName,
} from "@buli/contracts";
import {
  createDefaultAssistantAgentRegistry,
  type AssistantAgentRegistry,
  type PrimaryAssistantAgentDefinition,
} from "./assistantAgentRegistry.ts";

const defaultAssistantAgentRegistry = createDefaultAssistantAgentRegistry();

export const READ_ONLY_PRIMARY_ASSISTANT_AGENT_AVAILABLE_TOOL_NAMES = defaultAssistantAgentRegistry
  .resolvePrimaryAgentDefinition("understand").availableToolNames;

export type PrimaryAssistantAgentToolAccessDecision =
  | {
    accessKind: "allowed";
    effectiveAvailableToolNames: readonly ProviderAvailableToolName[];
  }
  | {
    accessKind: "denied";
    effectiveAvailableToolNames: readonly ProviderAvailableToolName[];
    denialText: string;
  };

export function resolveAvailableToolNamesForPrimaryAgentName(input: {
  selectedPrimaryAgentName: AssistantPrimaryAgentName;
  requestedAvailableToolNames: readonly ProviderAvailableToolName[] | undefined;
  assistantAgentRegistry?: AssistantAgentRegistry | undefined;
}): { availableToolNames?: readonly ProviderAvailableToolName[] } {
  return resolveAvailableToolNamesForPrimaryAssistantAgent({
    primaryAssistantAgent: (input.assistantAgentRegistry ?? defaultAssistantAgentRegistry).resolvePrimaryAgentDefinition(
      input.selectedPrimaryAgentName,
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

export function isReadOnlyPrimaryAgentName(
  selectedPrimaryAgentName: AssistantPrimaryAgentName,
  assistantAgentRegistry: AssistantAgentRegistry = defaultAssistantAgentRegistry,
): boolean {
  return assistantAgentRegistry.resolvePrimaryAgentDefinition(selectedPrimaryAgentName).isReadOnly;
}

export function resolvePrimaryAgentNameToolAccess(input: {
  selectedPrimaryAgentName: AssistantPrimaryAgentName;
  requestedAvailableToolNames: readonly ProviderAvailableToolName[] | undefined;
  requestedToolName: ProviderAvailableToolName;
  assistantAgentRegistry?: AssistantAgentRegistry | undefined;
}): PrimaryAssistantAgentToolAccessDecision {
  const primaryAssistantAgent = (input.assistantAgentRegistry ?? defaultAssistantAgentRegistry).resolvePrimaryAgentDefinition(
    input.selectedPrimaryAgentName,
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
}): PrimaryAssistantAgentToolAccessDecision {
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

export function formatPrimaryAgentName(
  selectedPrimaryAgentName: AssistantPrimaryAgentName,
  assistantAgentRegistry: AssistantAgentRegistry = defaultAssistantAgentRegistry,
): string {
  return assistantAgentRegistry.resolvePrimaryAgentDefinition(selectedPrimaryAgentName).displayName;
}

function formatUnavailableToolDenialText(input: {
  primaryAssistantAgent: PrimaryAssistantAgentDefinition;
  requestedToolName: ProviderAvailableToolName;
  effectiveAvailableToolNames: readonly ProviderAvailableToolName[];
}): string {
  const primaryAssistantAgentDisplayName = input.primaryAssistantAgent.displayName;
  if (input.primaryAssistantAgent.isReadOnly) {
    if (input.requestedToolName === "bash") {
      return `${primaryAssistantAgentDisplayName} can use bash only for explicitly approved read/inspect commands, and bash is not available in this turn.`;
    }

    if (
      input.requestedToolName === "edit" ||
      input.requestedToolName === "edit_many" ||
      input.requestedToolName === "patch" ||
      input.requestedToolName === "patch_many" ||
      input.requestedToolName === "write"
    ) {
      return `${primaryAssistantAgentDisplayName} is read-only, so this ${input.requestedToolName} tool call was not applied.`;
    }

    return `${primaryAssistantAgentDisplayName} is read-only, so the ${input.requestedToolName} tool is not available in this mode.`;
  }

  if (input.effectiveAvailableToolNames.length === 0) {
    return `${primaryAssistantAgentDisplayName} cannot use ${input.requestedToolName} in this turn because no tools are available.`;
  }

  return `${primaryAssistantAgentDisplayName} cannot use ${input.requestedToolName} in this turn. Available tools: ${input.effectiveAvailableToolNames.join(", ")}.`;
}

/** @deprecated Use READ_ONLY_PRIMARY_ASSISTANT_AGENT_AVAILABLE_TOOL_NAMES. */
export const READ_ONLY_ASSISTANT_MODE_AVAILABLE_TOOL_NAMES = READ_ONLY_PRIMARY_ASSISTANT_AGENT_AVAILABLE_TOOL_NAMES;

/** @deprecated Use PrimaryAssistantAgentToolAccessDecision. */
export type AssistantOperatingModeToolAccessDecision = PrimaryAssistantAgentToolAccessDecision;

/** @deprecated Use resolveAvailableToolNamesForPrimaryAgentName. */
export function resolveAvailableToolNamesForAssistantOperatingMode(input: {
  assistantOperatingMode: AssistantOperatingMode;
  requestedAvailableToolNames: readonly ProviderAvailableToolName[] | undefined;
  assistantAgentRegistry?: AssistantAgentRegistry | undefined;
}): { availableToolNames?: readonly ProviderAvailableToolName[] } {
  return resolveAvailableToolNamesForPrimaryAgentName({
    selectedPrimaryAgentName: input.assistantOperatingMode,
    requestedAvailableToolNames: input.requestedAvailableToolNames,
    ...(input.assistantAgentRegistry !== undefined ? { assistantAgentRegistry: input.assistantAgentRegistry } : {}),
  });
}

/** @deprecated Use isReadOnlyPrimaryAgentName. */
export function isReadOnlyAssistantOperatingMode(
  assistantOperatingMode: AssistantOperatingMode,
  assistantAgentRegistry?: AssistantAgentRegistry | undefined,
): boolean {
  return isReadOnlyPrimaryAgentName(assistantOperatingMode, assistantAgentRegistry ?? defaultAssistantAgentRegistry);
}

/** @deprecated Use resolvePrimaryAgentNameToolAccess. */
export function resolveAssistantOperatingModeToolAccess(input: {
  assistantOperatingMode: AssistantOperatingMode;
  requestedAvailableToolNames: readonly ProviderAvailableToolName[] | undefined;
  requestedToolName: ProviderAvailableToolName;
  assistantAgentRegistry?: AssistantAgentRegistry | undefined;
}): PrimaryAssistantAgentToolAccessDecision {
  return resolvePrimaryAgentNameToolAccess({
    selectedPrimaryAgentName: input.assistantOperatingMode,
    requestedAvailableToolNames: input.requestedAvailableToolNames,
    requestedToolName: input.requestedToolName,
    ...(input.assistantAgentRegistry !== undefined ? { assistantAgentRegistry: input.assistantAgentRegistry } : {}),
  });
}

/** @deprecated Use formatPrimaryAgentName. */
export function formatAssistantOperatingModeName(
  assistantOperatingMode: AssistantOperatingMode,
  assistantAgentRegistry?: AssistantAgentRegistry | undefined,
): string {
  return formatPrimaryAgentName(assistantOperatingMode, assistantAgentRegistry ?? defaultAssistantAgentRegistry);
}
