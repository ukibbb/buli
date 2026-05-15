import type { AssistantOperatingMode, ProviderAvailableToolName } from "@buli/contracts";

export const READ_ONLY_ASSISTANT_MODE_AVAILABLE_TOOL_NAMES = ["read", "glob", "grep", "explore"] as const satisfies readonly ProviderAvailableToolName[];

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
