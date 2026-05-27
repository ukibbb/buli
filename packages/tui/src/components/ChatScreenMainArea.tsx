import type { ChatSlashCommand, ReasoningSummaryDisplayMode } from "@buli/chat-session-state";
import type { ChatAppRenderStore, ConversationSessionCompactionStatus } from "@buli/chat-app-controller";
import type { ChatScreenTheme, TerminalSizeTierForChatScreen } from "@buli/assistant-design-tokens";
import type { ScrollBoxRenderable } from "@opentui/core";
import { memo, type ReactNode, type RefObject } from "react";
import { CommandHelpModal } from "./CommandHelpModal.tsx";
import { ConversationTranscriptSurface } from "./ConversationTranscriptSurface.tsx";
import type { PendingToolApprovalDecision } from "./ConversationMessageRow.tsx";

export type ChatScreenMainAreaProps = {
  isCommandHelpModalVisible: boolean;
  reasoningSummaryDisplayMode: ReasoningSummaryDisplayMode;
  inputPanelAccentColor: ChatScreenTheme["accentAmber"] | ChatScreenTheme["accentGreen"] | ChatScreenTheme["accentPink"];
  availableCommandHelpModalRowCount: number;
  terminalSizeTierForChatScreen: TerminalSizeTierForChatScreen;
  terminalColumnCount: number;
  availableChatSlashCommands: readonly ChatSlashCommand[];
  chatAppRenderStore: ChatAppRenderStore;
  visibleConversationMessageIds: readonly string[];
  hiddenOlderConversationMessageCount: number;
  olderConversationMessageRevealCount: number;
  pendingToolApprovalDecision?: PendingToolApprovalDecision;
  pendingToolApprovalDecisionCallbacks?: Pick<
    PendingToolApprovalDecision,
    "onPendingToolApprovalApproved" | "onPendingToolApprovalDenied"
  > | undefined;
  conversationMessageScrollBoxRef: RefObject<ScrollBoxRenderable | null>;
  conversationSessionCompactionStatus?: ConversationSessionCompactionStatus | undefined;
  queuedPromptCount?: number | undefined;
  totalContextTokensUsed?: number | undefined;
  contextMeterTokenLimit?: number | undefined;
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
      chatAppRenderStore={props.chatAppRenderStore}
      visibleConversationMessageIds={props.visibleConversationMessageIds}
      hiddenOlderConversationMessageCount={props.hiddenOlderConversationMessageCount}
      reasoningSummaryDisplayMode={props.reasoningSummaryDisplayMode}
      olderConversationMessageRevealCount={props.olderConversationMessageRevealCount}
      onRevealOlderConversationMessages={props.onRevealOlderConversationMessages}
      {...(props.pendingToolApprovalDecision !== undefined
        ? { pendingToolApprovalDecision: props.pendingToolApprovalDecision }
        : {})}
      {...(props.pendingToolApprovalDecisionCallbacks !== undefined
        ? { pendingToolApprovalDecisionCallbacks: props.pendingToolApprovalDecisionCallbacks }
        : {})}
      conversationMessageScrollBoxRef={props.conversationMessageScrollBoxRef}
      accentColor={props.inputPanelAccentColor}
      terminalColumnCount={props.terminalColumnCount}
      conversationSessionCompactionStatus={props.conversationSessionCompactionStatus}
      queuedPromptCount={props.queuedPromptCount}
      totalContextTokensUsed={props.totalContextTokensUsed}
      contextMeterTokenLimit={props.contextMeterTokenLimit}
    />
  );
}

export const ChatScreenMainArea = memo(ChatScreenMainAreaComponent);
