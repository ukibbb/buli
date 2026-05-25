import type { ChatSessionState } from "./chatSessionState.ts";
import type { ChatSlashCommandValue } from "./chatSlashCommands.ts";
import { showCommandHelpModal } from "./commandHelpModalReducer.ts";
import { toggleReasoningSummaryDisplayMode } from "./reasoningSummaryVisibilityReducer.ts";

export type ChatSlashCommandApplicationEffect =
  | { effectType: "clear_current_conversation_session" }
  | { effectType: "compact_current_conversation_session" }
  | { effectType: "export_current_conversation_session" }
  | { effectType: "load_available_assistant_models" }
  | { effectType: "load_conversation_sessions" }
  | {
      effectType: "reasoning_summary_display_mode_changed";
      reasoningSummaryDisplayMode: ChatSessionState["reasoningSummaryDisplayMode"];
    };

export type ChatSlashCommandApplication = {
  nextChatSessionState: ChatSessionState;
  chatSlashCommandApplicationEffect: ChatSlashCommandApplicationEffect | undefined;
};

export function applyChatSlashCommandToChatSessionState(
  chatSessionState: ChatSessionState,
  slashCommandValue: ChatSlashCommandValue | string,
): ChatSlashCommandApplication {
  if (slashCommandValue === "help") {
    return createChatSlashCommandApplication({
      nextChatSessionState: showCommandHelpModal(chatSessionState),
    });
  }

  if (slashCommandValue === "clear") {
    return createChatSlashCommandApplication({
      nextChatSessionState: chatSessionState,
      chatSlashCommandApplicationEffect: { effectType: "clear_current_conversation_session" },
    });
  }

  if (slashCommandValue === "compact") {
    return createChatSlashCommandApplication({
      nextChatSessionState: chatSessionState,
      chatSlashCommandApplicationEffect: { effectType: "compact_current_conversation_session" },
    });
  }

  if (slashCommandValue === "sessions") {
    return createChatSlashCommandApplication({
      nextChatSessionState: chatSessionState,
      chatSlashCommandApplicationEffect: { effectType: "load_conversation_sessions" },
    });
  }

  if (slashCommandValue === "export-session") {
    return createChatSlashCommandApplication({
      nextChatSessionState: chatSessionState,
      chatSlashCommandApplicationEffect: { effectType: "export_current_conversation_session" },
    });
  }

  if (slashCommandValue === "model") {
    return createChatSlashCommandApplication({
      nextChatSessionState: chatSessionState,
      chatSlashCommandApplicationEffect: { effectType: "load_available_assistant_models" },
    });
  }

  if (slashCommandValue === "thinking") {
    const nextChatSessionState = toggleReasoningSummaryDisplayMode(chatSessionState);
    return createChatSlashCommandApplication({
      nextChatSessionState,
      chatSlashCommandApplicationEffect: {
        effectType: "reasoning_summary_display_mode_changed",
        reasoningSummaryDisplayMode: nextChatSessionState.reasoningSummaryDisplayMode,
      },
    });
  }

  return createChatSlashCommandApplication({ nextChatSessionState: chatSessionState });
}

function createChatSlashCommandApplication(input: {
  nextChatSessionState: ChatSessionState;
  chatSlashCommandApplicationEffect?: ChatSlashCommandApplicationEffect | undefined;
}): ChatSlashCommandApplication {
  return {
    nextChatSessionState: input.nextChatSessionState,
    chatSlashCommandApplicationEffect: input.chatSlashCommandApplicationEffect,
  };
}
