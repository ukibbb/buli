import type { ConversationTranscriptPageRow, ReasoningSummaryDisplayMode } from "@buli/chat-session-state";
import type { ChatAppRenderStore, ConversationSessionCompactionStatus } from "@buli/chat-app-controller";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { ReactNode, RefObject } from "react";
import { ConversationMessageList } from "./ConversationMessageList.tsx";
import type { PendingToolApprovalDecision } from "./ConversationMessageRow.tsx";

type ConversationTranscriptSurfaceRenderStoreProps = {
  chatAppRenderStore: ChatAppRenderStore;
  visibleConversationMessageIds: readonly string[];
  visibleConversationMessageRows?: undefined;
};

type ConversationTranscriptSurfacePrebuiltRowsProps = {
  visibleConversationMessageRows: readonly ConversationTranscriptPageRow[];
  chatAppRenderStore?: undefined;
  visibleConversationMessageIds?: undefined;
};

type ConversationTranscriptSurfaceCommonProps = {
  reasoningSummaryDisplayMode: ReasoningSummaryDisplayMode;
  conversationMessageScrollBoxRef: RefObject<ScrollBoxRenderable | null>;
  hasOlderConversationTranscriptPage: boolean;
  hasNewerConversationTranscriptPage: boolean;
  isLatestConversationTranscriptPage: boolean;
  isConversationTranscriptPageNavigationDisabled: boolean;
  isConversationTranscriptPageNavigationLoading: boolean;
  transcriptPageNavigationErrorMessage?: string | undefined;
  onLoadOlderConversationTranscriptPage: () => void;
  onLoadNewerConversationTranscriptPage: () => void;
  onJumpToLatestConversationTranscriptPage: () => void;
  pendingToolApprovalDecision?: PendingToolApprovalDecision;
  pendingToolApprovalDecisionCallbacks?: Pick<
    PendingToolApprovalDecision,
    "onPendingToolApprovalApproved" | "onPendingToolApprovalDenied"
  > | undefined;
  transcriptAccentColor: string;
  conversationSessionCompactionStatus?: ConversationSessionCompactionStatus | undefined;
  queuedPromptCount?: number | undefined;
  totalContextTokensUsed?: number | undefined;
  contextMeterTokenLimit?: number | undefined;
};

export type ConversationTranscriptSurfaceProps = ConversationTranscriptSurfaceCommonProps & (
  | ConversationTranscriptSurfaceRenderStoreProps
  | ConversationTranscriptSurfacePrebuiltRowsProps
);

export function ConversationTranscriptSurface(props: ConversationTranscriptSurfaceProps): ReactNode {
  return (
    <ConversationMessageList
      {...(props.chatAppRenderStore
        ? { chatAppRenderStore: props.chatAppRenderStore, visibleConversationMessageIds: props.visibleConversationMessageIds }
        : { visibleConversationMessageRows: props.visibleConversationMessageRows })}
      hasOlderConversationTranscriptPage={props.hasOlderConversationTranscriptPage}
      hasNewerConversationTranscriptPage={props.hasNewerConversationTranscriptPage}
      isLatestConversationTranscriptPage={props.isLatestConversationTranscriptPage}
      isConversationTranscriptPageNavigationDisabled={props.isConversationTranscriptPageNavigationDisabled}
      isConversationTranscriptPageNavigationLoading={props.isConversationTranscriptPageNavigationLoading}
      transcriptPageNavigationErrorMessage={props.transcriptPageNavigationErrorMessage}
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
      transcriptAccentColor={props.transcriptAccentColor}
      userMessageBorderColor={props.transcriptAccentColor}
      conversationSessionCompactionStatus={props.conversationSessionCompactionStatus}
      queuedPromptCount={props.queuedPromptCount}
      totalContextTokensUsed={props.totalContextTokensUsed}
      contextMeterTokenLimit={props.contextMeterTokenLimit}
    />
  );
}
