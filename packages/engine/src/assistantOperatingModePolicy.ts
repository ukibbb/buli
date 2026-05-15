import type { AssistantOperatingMode, ProviderAvailableToolName } from "@buli/contracts";

export const READ_ONLY_ASSISTANT_MODE_AVAILABLE_TOOL_NAMES = ["read", "glob", "grep", "explore"] as const satisfies readonly ProviderAvailableToolName[];
const READ_ONLY_ASSISTANT_MODE_AVAILABLE_TOOL_NAME_SET = new Set<ProviderAvailableToolName>(
  READ_ONLY_ASSISTANT_MODE_AVAILABLE_TOOL_NAMES,
);

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
    READ_ONLY_ASSISTANT_MODE_AVAILABLE_TOOL_NAME_SET.has(availableToolName),
  );
}
