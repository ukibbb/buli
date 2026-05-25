import { chatScreenTheme } from "@buli/assistant-design-tokens";

// The effort color scale matches the turn-summary reasoning token color, so
// heavier selected effort and heavier spent reasoning read consistently.
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
