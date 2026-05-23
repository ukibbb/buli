import { chatScreenTheme } from "@buli/assistant-design-tokens";

// xhigh + reasoning-token total share accentPink intentionally: the intensity
// scale carries from "effort selected" (strip) to "reasoning tokens spent"
// (turn summary), so heavier work reads as a single coherent color.
export function resolveReasoningEffortColor(reasoningEffortLabel: string): string {
  switch (reasoningEffortLabel) {
    case "minimal":
      return chatScreenTheme.textDim;
    case "low":
      return chatScreenTheme.textMuted;
    case "medium":
      return chatScreenTheme.textPrimary;
    case "high":
      return chatScreenTheme.accentCyan;
    case "xhigh":
      return chatScreenTheme.accentPink;
    default:
      return chatScreenTheme.textMuted;
  }
}
