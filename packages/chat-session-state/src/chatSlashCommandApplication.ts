import {
  findChatCommandDefinition,
  type ChatSlashCommandApplication,
  type ChatSlashCommandApplicationEffect,
  type ChatSlashCommandValue,
} from "./chatCommandCatalog.ts";
import type { ChatSessionState } from "./chatSessionState.ts";

export type { ChatSlashCommandApplication, ChatSlashCommandApplicationEffect };

export function applyChatSlashCommandToChatSessionState(
  chatSessionState: ChatSessionState,
  slashCommandValue: ChatSlashCommandValue | string,
): ChatSlashCommandApplication {
  return findChatCommandDefinition({
    slashCommandValue,
    reasoningSummaryDisplayMode: chatSessionState.reasoningSummaryDisplayMode,
  })?.apply(chatSessionState) ?? {
    nextChatSessionState: chatSessionState,
    chatSlashCommandApplicationEffect: undefined,
  };
}
