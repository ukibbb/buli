import type { ChatSessionState } from "./chatSessionState.ts";
import type { ChatSlashCommandValue } from "./chatSlashCommands.ts";
import { selectAssistantOperatingMode } from "./assistantOperatingModeReducer.ts";
import { showCommandHelpModal } from "./commandHelpModalReducer.ts";
import { toggleReasoningSummaryVisibility } from "./reasoningSummaryVisibilityReducer.ts";

export type ChatSlashCommandApplicationEffect =
  | { effectType: "clear_current_conversation_session" }
  | { effectType: "export_current_conversation_session" }
  | { effectType: "load_available_assistant_models" }
  | { effectType: "load_conversation_sessions" }
  | { effectType: "reasoning_summary_visibility_changed"; isReasoningSummaryVisible: boolean };

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

  if (slashCommandValue === "plan") {
    return createChatSlashCommandApplication({
      nextChatSessionState: selectAssistantOperatingMode(chatSessionState, "plan"),
    });
  }

  if (slashCommandValue === "implementation") {
    return createChatSlashCommandApplication({
      nextChatSessionState: selectAssistantOperatingMode(chatSessionState, "implementation"),
    });
  }

  if (slashCommandValue === "model") {
    return createChatSlashCommandApplication({
      nextChatSessionState: chatSessionState,
      chatSlashCommandApplicationEffect: { effectType: "load_available_assistant_models" },
    });
  }

  if (slashCommandValue === "thinking") {
    const nextChatSessionState = toggleReasoningSummaryVisibility(chatSessionState);
    return createChatSlashCommandApplication({
      nextChatSessionState,
      chatSlashCommandApplicationEffect: {
        effectType: "reasoning_summary_visibility_changed",
        isReasoningSummaryVisible: nextChatSessionState.isReasoningSummaryVisible,
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
