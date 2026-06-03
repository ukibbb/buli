import {
  type AssistantOperatingMode,
  type AssistantToolRequestName,
  type ProviderAvailableToolName,
} from "@buli/contracts";
import { resolveBuiltInPrimaryAssistantAgent } from "./assistantAgentCatalog.ts";

export const READ_ONLY_ASSISTANT_MODE_AVAILABLE_TOOL_NAMES = resolveBuiltInPrimaryAssistantAgent("understand").availableToolNames;

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

export function resolveAssistantOperatingModeToolAccess(input: {
  assistantOperatingMode: AssistantOperatingMode;
  requestedAvailableToolNames: readonly ProviderAvailableToolName[] | undefined;
  requestedToolName: AssistantToolRequestName;
}): AssistantOperatingModeToolAccessDecision {
  const effectiveAvailableToolNames = resolveAvailableToolNamesForAssistantOperatingMode({
    assistantOperatingMode: input.assistantOperatingMode,
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
      assistantOperatingMode: input.assistantOperatingMode,
      requestedToolName: input.requestedToolName,
      effectiveAvailableToolNames,
    }),
  };
}

export function formatAssistantOperatingModeName(assistantOperatingMode: AssistantOperatingMode): string {
  return resolveBuiltInPrimaryAssistantAgent(assistantOperatingMode).displayName;
}

function formatUnavailableToolDenialText(input: {
  assistantOperatingMode: AssistantOperatingMode;
  requestedToolName: AssistantToolRequestName;
  effectiveAvailableToolNames: readonly ProviderAvailableToolName[];
}): string {
  const assistantOperatingModeDisplayName = formatAssistantOperatingModeName(input.assistantOperatingMode);
  if (isReadOnlyAssistantOperatingMode(input.assistantOperatingMode)) {
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
