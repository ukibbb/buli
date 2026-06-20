import type { ChatSlashCommand, ConversationTranscriptPageRow, ReasoningSummaryDisplayMode } from "@buli/chat-session-state";
import type { ChatAppRenderStore, ConversationSessionCompactionStatus } from "@buli/chat-app-controller";
import type { TerminalSizeTierForChatScreen } from "@buli/assistant-design-tokens";
import type { ScrollBoxRenderable } from "@opentui/core";
import { memo, type ReactNode, type RefObject } from "react";
import { CommandHelpModal } from "./CommandHelpModal.tsx";
import { ConversationTranscriptSurface } from "./ConversationTranscriptSurface.tsx";
import type { PendingToolApprovalDecision } from "./ConversationMessageRow.tsx";

type ChatScreenMainAreaRenderStoreProps = {
  chatAppRenderStore: ChatAppRenderStore;
  visibleConversationMessageIds: readonly string[];
  visibleConversationMessageRows?: undefined;
};

type ChatScreenMainAreaPrebuiltRowsProps = {
  visibleConversationMessageRows: readonly ConversationTranscriptPageRow[];
  chatAppRenderStore?: undefined;
  visibleConversationMessageIds?: undefined;
};

type ChatScreenMainAreaCommonProps = {
  isCommandHelpModalVisible: boolean;
  reasoningSummaryDisplayMode: ReasoningSummaryDisplayMode;
  inputPanelAccentColor: string;
  availableCommandHelpModalRowCount: number;
  terminalSizeTierForChatScreen: TerminalSizeTierForChatScreen;
  availableChatSlashCommands: readonly ChatSlashCommand[];
  hasOlderConversationTranscriptPage: boolean;
  hasNewerConversationTranscriptPage: boolean;
  isLatestConversationTranscriptPage: boolean;
  isConversationTranscriptPageNavigationDisabled: boolean;
  isConversationTranscriptPageNavigationLoading: boolean;
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
  onLoadOlderConversationTranscriptPage: () => void;
  onLoadNewerConversationTranscriptPage: () => void;
  onJumpToLatestConversationTranscriptPage: () => void;
  onCommandHelpCloseRequested: () => void;
};

export type ChatScreenMainAreaProps = ChatScreenMainAreaCommonProps & (
  | ChatScreenMainAreaRenderStoreProps
  | ChatScreenMainAreaPrebuiltRowsProps
);

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
      {...(props.chatAppRenderStore
        ? { chatAppRenderStore: props.chatAppRenderStore, visibleConversationMessageIds: props.visibleConversationMessageIds }
        : { visibleConversationMessageRows: props.visibleConversationMessageRows })}
      hasOlderConversationTranscriptPage={props.hasOlderConversationTranscriptPage}
      hasNewerConversationTranscriptPage={props.hasNewerConversationTranscriptPage}
      isLatestConversationTranscriptPage={props.isLatestConversationTranscriptPage}
      isConversationTranscriptPageNavigationDisabled={props.isConversationTranscriptPageNavigationDisabled}
      isConversationTranscriptPageNavigationLoading={props.isConversationTranscriptPageNavigationLoading}
      reasoningSummaryDisplayMode={props.reasoningSummaryDisplayMode}
      onLoadOlderConversationTranscriptPage={props.onLoadOlderConversationTranscriptPage}
      onLoadNewerConversationTranscriptPage={props.onLoadNewerConversationTranscriptPage}
      onJumpToLatestConversationTranscriptPage={props.onJumpToLatestConversationTranscriptPage}
      {...(props.pendingToolApprovalDecision !== undefined
        ? { pendingToolApprovalDecision: props.pendingToolApprovalDecision }
        : {})}
      {...(props.pendingToolApprovalDecisionCallbacks !== undefined
        ? { pendingToolApprovalDecisionCallbacks: props.pendingToolApprovalDecisionCallbacks }
        : {})}
      conversationMessageScrollBoxRef={props.conversationMessageScrollBoxRef}
      transcriptAccentColor={props.inputPanelAccentColor}
      conversationSessionCompactionStatus={props.conversationSessionCompactionStatus}
      queuedPromptCount={props.queuedPromptCount}
      totalContextTokensUsed={props.totalContextTokensUsed}
      contextMeterTokenLimit={props.contextMeterTokenLimit}
    />
  );
}

export const ChatScreenMainArea = memo(ChatScreenMainAreaComponent);
