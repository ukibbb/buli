import type { ChatSlashCommand } from "@buli/chat-session-state";
import type { ChatScreenTheme, TerminalSizeTierForChatScreen } from "@buli/assistant-design-tokens";
import type { ScrollBoxRenderable } from "@opentui/core";
import { memo, type ReactNode, type RefObject } from "react";
import type { VisibleConversationMessageRow } from "../behavior/chatScreenViewModel.ts";
import { CommandHelpModal } from "./CommandHelpModal.tsx";
import { ConversationTranscriptSurface } from "./ConversationTranscriptSurface.tsx";
import type { PendingToolApprovalDecision } from "./ConversationMessageRow.tsx";

export type ChatScreenMainAreaProps = {
  isCommandHelpModalVisible: boolean;
  isReasoningSummaryVisible: boolean;
  inputPanelAccentColor: ChatScreenTheme["accentAmber"] | ChatScreenTheme["accentGreen"] | ChatScreenTheme["accentPink"];
  availableCommandHelpModalRowCount: number;
  terminalSizeTierForChatScreen: TerminalSizeTierForChatScreen;
  terminalColumnCount: number;
  availableChatSlashCommands: readonly ChatSlashCommand[];
  visibleConversationMessageRows: readonly VisibleConversationMessageRow[];
  hiddenOlderConversationMessageCount: number;
  olderConversationMessageRevealCount: number;
  pendingToolApprovalDecision?: PendingToolApprovalDecision;
  conversationMessageScrollBoxRef: RefObject<ScrollBoxRenderable | null>;
  onRevealOlderConversationMessages: () => void;
  onCommandHelpCloseRequested: () => void;
};

function ChatScreenMainAreaComponent(props: ChatScreenMainAreaProps): ReactNode {
  if (props.isCommandHelpModalVisible) {
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
      visibleConversationMessageRows={props.visibleConversationMessageRows}
      hiddenOlderConversationMessageCount={props.hiddenOlderConversationMessageCount}
      isReasoningSummaryVisible={props.isReasoningSummaryVisible}
      olderConversationMessageRevealCount={props.olderConversationMessageRevealCount}
      onRevealOlderConversationMessages={props.onRevealOlderConversationMessages}
      {...(props.pendingToolApprovalDecision !== undefined
        ? { pendingToolApprovalDecision: props.pendingToolApprovalDecision }
        : {})}
      conversationMessageScrollBoxRef={props.conversationMessageScrollBoxRef}
      accentColor={props.inputPanelAccentColor}
      terminalColumnCount={props.terminalColumnCount}
    />
  );
}

export const ChatScreenMainArea = memo(ChatScreenMainAreaComponent);
