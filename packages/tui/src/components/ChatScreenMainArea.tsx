import type { ChatSessionState, ChatSlashCommand } from "@buli/chat-session-state";
import type { ChatScreenTheme, TerminalSizeTierForChatScreen } from "@buli/assistant-design-tokens";
import type { ConversationMessage, ConversationMessagePart } from "@buli/contracts";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { ReactNode, RefObject } from "react";
import { CommandHelpModal } from "./CommandHelpModal.tsx";
import { ConversationMessageList } from "./ConversationMessageList.tsx";

export type ChatScreenMainAreaProps = {
  chatSessionState: ChatSessionState;
  inputPanelAccentColor: ChatScreenTheme["accentAmber"] | ChatScreenTheme["accentGreen"] | ChatScreenTheme["accentPink"];
  availableCommandHelpModalRowCount: number;
  terminalSizeTierForChatScreen: TerminalSizeTierForChatScreen;
  availableChatSlashCommands: readonly ChatSlashCommand[];
  orderedConversationMessages: readonly ConversationMessage[];
  conversationMessageScrollBoxRef: RefObject<ScrollBoxRenderable | null>;
  resolveConversationMessageParts: (messageId: string) => readonly ConversationMessagePart[];
  onCommandHelpCloseRequested: () => void;
};

export function ChatScreenMainArea(props: ChatScreenMainAreaProps): ReactNode {
  if (props.chatSessionState.isCommandHelpModalVisible) {
    return (
      <box alignItems="center" flexGrow={1} justifyContent="center">
        <CommandHelpModal
          onCloseRequested={props.onCommandHelpCloseRequested}
          availableModalRowCount={props.availableCommandHelpModalRowCount}
          terminalSizeTierForChatScreen={props.terminalSizeTierForChatScreen}
          availableSlashCommands={props.availableChatSlashCommands}
        />
      </box>
    );
  }

  return (
    <ConversationMessageList
      conversationMessages={props.orderedConversationMessages}
      isReasoningSummaryVisible={props.chatSessionState.isReasoningSummaryVisible}
      resolveConversationMessageParts={props.resolveConversationMessageParts}
      conversationMessageScrollBoxRef={props.conversationMessageScrollBoxRef}
      horizontalRuleColor={props.inputPanelAccentColor}
    />
  );
}
