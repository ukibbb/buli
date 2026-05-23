import type { AssistantOperatingMode } from "@buli/contracts";

const ASSISTANT_OPERATING_MODE_CYCLE = ["understand", "plan", "implementation"] as const satisfies readonly AssistantOperatingMode[];

export function resolveNextAssistantOperatingMode(
  currentAssistantOperatingMode: AssistantOperatingMode,
): AssistantOperatingMode {
  const currentIndex = ASSISTANT_OPERATING_MODE_CYCLE.indexOf(currentAssistantOperatingMode);
  const nextIndex = currentIndex === ASSISTANT_OPERATING_MODE_CYCLE.length - 1 ? 0 : currentIndex + 1;
  return ASSISTANT_OPERATING_MODE_CYCLE[nextIndex] ?? "understand";
}
