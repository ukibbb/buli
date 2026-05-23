import type { ChatSessionState, ChatSlashCommand } from "@buli/chat-session-state";
import type { ChatScreenTheme, TerminalSizeTierForChatScreen } from "@buli/assistant-design-tokens";
import type { ConversationMessage, ConversationMessagePart } from "@buli/contracts";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { ReactNode, RefObject } from "react";
import { CommandHelpModal } from "./CommandHelpModal.tsx";
import { ConversationTranscriptSurface } from "./ConversationTranscriptSurface.tsx";

export type ChatScreenMainAreaProps = {
  chatSessionState: ChatSessionState;
  inputPanelAccentColor: ChatScreenTheme["accentAmber"] | ChatScreenTheme["accentGreen"] | ChatScreenTheme["accentPink"];
  availableCommandHelpModalRowCount: number;
  terminalSizeTierForChatScreen: TerminalSizeTierForChatScreen;
  terminalColumnCount: number;
  availableChatSlashCommands: readonly ChatSlashCommand[];
  orderedConversationMessages: readonly ConversationMessage[];
  hiddenOlderConversationMessageCount: number;
  olderConversationMessageRevealCount: number;
  conversationMessageScrollBoxRef: RefObject<ScrollBoxRenderable | null>;
  resolveConversationMessageParts: (messageId: string) => readonly ConversationMessagePart[];
  onRevealOlderConversationMessages: () => void;
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
    <ConversationTranscriptSurface
      conversationMessages={props.orderedConversationMessages}
      hiddenOlderConversationMessageCount={props.hiddenOlderConversationMessageCount}
      isReasoningSummaryVisible={props.chatSessionState.isReasoningSummaryVisible}
      olderConversationMessageRevealCount={props.olderConversationMessageRevealCount}
      onRevealOlderConversationMessages={props.onRevealOlderConversationMessages}
      resolveConversationMessageParts={props.resolveConversationMessageParts}
      conversationMessageScrollBoxRef={props.conversationMessageScrollBoxRef}
      accentColor={props.inputPanelAccentColor}
      terminalColumnCount={props.terminalColumnCount}
    />
  );
}
