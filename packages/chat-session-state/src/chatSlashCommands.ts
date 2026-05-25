import type { ReasoningSummaryDisplayMode, SlashCommand } from "./chatSessionState.ts";

export type ChatSlashCommandValue =
  | "clear"
  | "compact"
  | "export-session"
  | "help"
  | "model"
  | "sessions"
  | "thinking";

export type ChatSlashCommand = SlashCommand & {
  value: ChatSlashCommandValue;
};

export function buildChatSlashCommands(input: {
  reasoningSummaryDisplayMode: ReasoningSummaryDisplayMode;
}): readonly ChatSlashCommand[] {
  return [
    { name: "help", value: "help", description: "Show available commands and shortcuts" },
    { name: "model", value: "model", description: "Choose OpenAI model and reasoning effort" },
    { name: "clear", value: "clear", description: "Clear conversation history" },
    { name: "compact", value: "compact", description: "Summarize old context for this session" },
    { name: "sessions", value: "sessions", description: "Switch or delete saved sessions" },
    { name: "export-session", value: "export-session", description: "Export current session as HTML" },
    {
      name: "thinking",
      value: "thinking",
      description: input.reasoningSummaryDisplayMode === "expanded" ? "Collapse thinking" : "Expand thinking",
    },
  ] as const satisfies readonly ChatSlashCommand[];
}
