import type { AssistantOperatingMode } from "@buli/contracts";
import type { SlashCommand } from "@buli/chat-session-state";

export type ChatSlashCommandValue =
  | "clear"
  | "export-session"
  | "help"
  | "implementation"
  | "model"
  | "plan"
  | "sessions"
  | "thinking";

export function buildChatSlashCommands(input: {
  isReasoningSummaryVisible: boolean;
  selectedAssistantOperatingMode: AssistantOperatingMode;
}): readonly SlashCommand[] {
  return [
    { name: "help", value: "help", description: "Show available commands" },
    { name: "model", value: "model", description: "Choose OpenAI model and reasoning effort" },
    { name: "clear", value: "clear", description: "Clear conversation history" },
    { name: "sessions", value: "sessions", description: "Switch saved conversation session" },
    { name: "export-session", value: "export-session", description: "Export current session as HTML" },
    {
      name: "plan",
      value: "plan",
      description: input.selectedAssistantOperatingMode === "plan" ? "Plan mode is active" : "Switch to read-only plan mode",
    },
    {
      name: "implementation",
      value: "implementation",
      description: input.selectedAssistantOperatingMode === "implementation"
        ? "Implementation mode is active"
        : "Switch to implementation mode",
    },
    {
      name: "thinking",
      value: "thinking",
      description: input.isReasoningSummaryVisible ? "Hide reasoning summaries" : "Show reasoning summaries",
    },
  ] as const satisfies readonly SlashCommand[];
}
