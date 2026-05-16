import {
  READ_ONLY_ASSISTANT_MODE_TOOL_REQUEST_NAMES,
  isReadOnlyAssistantModeToolRequestName,
  type AssistantOperatingMode,
  type ProviderAvailableToolName,
} from "@buli/contracts";

export const READ_ONLY_ASSISTANT_MODE_AVAILABLE_TOOL_NAMES = READ_ONLY_ASSISTANT_MODE_TOOL_REQUEST_NAMES;

export function resolveAvailableToolNamesForAssistantOperatingMode(input: {
  assistantOperatingMode: AssistantOperatingMode;
  requestedAvailableToolNames: readonly ProviderAvailableToolName[] | undefined;
}): { availableToolNames?: readonly ProviderAvailableToolName[] } {
  if (isReadOnlyAssistantOperatingMode(input.assistantOperatingMode)) {
    return {
      availableToolNames: listReadOnlyAssistantModeAvailableToolNames(input.requestedAvailableToolNames),
    };
  }

  if (input.requestedAvailableToolNames) {
    return { availableToolNames: input.requestedAvailableToolNames };
  }

  return {};
}

export function isReadOnlyAssistantOperatingMode(assistantOperatingMode: AssistantOperatingMode): boolean {
  return assistantOperatingMode === "understand" || assistantOperatingMode === "plan";
}

export function formatAssistantOperatingModeName(assistantOperatingMode: AssistantOperatingMode): string {
  return assistantOperatingMode === "understand"
    ? "Understand mode"
    : assistantOperatingMode === "plan"
    ? "Plan mode"
    : "Implementation mode";
}

function listReadOnlyAssistantModeAvailableToolNames(
  requestedAvailableToolNames: readonly ProviderAvailableToolName[] | undefined,
): readonly ProviderAvailableToolName[] {
  if (!requestedAvailableToolNames) {
    return READ_ONLY_ASSISTANT_MODE_AVAILABLE_TOOL_NAMES;
  }

  return requestedAvailableToolNames.filter((availableToolName) =>
    isReadOnlyAssistantModeToolRequestName(availableToolName),
  );
}
