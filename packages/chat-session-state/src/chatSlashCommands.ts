import type { AssistantOperatingMode } from "@buli/contracts";
import type { SlashCommand } from "./chatSessionState.ts";

export type ChatSlashCommandValue =
  | "clear"
  | "compact"
  | "export-session"
  | "help"
  | "implementation"
  | "model"
  | "plan"
  | "sessions"
  | "understand"
  | "thinking";

export type ChatSlashCommand = SlashCommand & {
  value: ChatSlashCommandValue;
};

export function buildChatSlashCommands(input: {
  isReasoningSummaryVisible: boolean;
  selectedAssistantOperatingMode: AssistantOperatingMode;
}): readonly ChatSlashCommand[] {
  return [
    { name: "help", value: "help", description: "Show available commands" },
    { name: "model", value: "model", description: "Choose OpenAI model and reasoning effort" },
    { name: "clear", value: "clear", description: "Clear conversation history" },
    { name: "compact", value: "compact", description: "Summarize old context for this session" },
    { name: "sessions", value: "sessions", description: "Switch saved conversation session" },
    { name: "export-session", value: "export-session", description: "Export current session as HTML" },
    {
      name: "understand",
      value: "understand",
      description: input.selectedAssistantOperatingMode === "understand"
        ? "Understand mode is active"
        : "Switch to read-only understand mode",
    },
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
  ] as const satisfies readonly ChatSlashCommand[];
}
