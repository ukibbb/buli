import type { ChatScreenTheme } from "@buli/assistant-design-tokens";
import type { ReasoningSummaryDisplayMode } from "@buli/chat-session-state";
import type { ChatAppRenderStore, ConversationSessionCompactionStatus } from "@buli/chat-app-controller";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { ReactNode, RefObject } from "react";
import { ConversationMessageList } from "./ConversationMessageList.tsx";
import type { PendingToolApprovalDecision } from "./ConversationMessageRow.tsx";

export type ConversationTranscriptSurfaceProps = {
  chatAppRenderStore: ChatAppRenderStore;
  visibleConversationMessageIds: readonly string[];
  reasoningSummaryDisplayMode: ReasoningSummaryDisplayMode;
  conversationMessageScrollBoxRef: RefObject<ScrollBoxRenderable | null>;
  hiddenOlderConversationMessageCount: number;
  olderConversationMessageRevealCount: number;
  onRevealOlderConversationMessages: () => void;
  pendingToolApprovalDecision?: PendingToolApprovalDecision;
  pendingToolApprovalDecisionCallbacks?: Pick<
    PendingToolApprovalDecision,
    "onPendingToolApprovalApproved" | "onPendingToolApprovalDenied"
  > | undefined;
  transcriptAccentColor: ChatScreenTheme["accentAmber"] | ChatScreenTheme["accentGreen"] | ChatScreenTheme["accentPink"];
  conversationSessionCompactionStatus?: ConversationSessionCompactionStatus | undefined;
  queuedPromptCount?: number | undefined;
  totalContextTokensUsed?: number | undefined;
  contextMeterTokenLimit?: number | undefined;
};

export function ConversationTranscriptSurface(props: ConversationTranscriptSurfaceProps): ReactNode {
  return (
    <ConversationMessageList
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
      transcriptAccentColor={props.transcriptAccentColor}
      userMessageBorderColor={props.transcriptAccentColor}
      conversationSessionCompactionStatus={props.conversationSessionCompactionStatus}
      queuedPromptCount={props.queuedPromptCount}
      totalContextTokensUsed={props.totalContextTokensUsed}
      contextMeterTokenLimit={props.contextMeterTokenLimit}
    />
  );
}
