import type { ChatScreenTheme } from "@buli/assistant-design-tokens";
import type { ConversationMessage, ConversationMessagePart } from "@buli/contracts";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { ReactNode, RefObject } from "react";
import { ConversationMessageList } from "./ConversationMessageList.tsx";
import type { PendingToolApprovalDecision } from "./ConversationMessageRow.tsx";

export type ConversationTranscriptSurfaceProps = {
  conversationMessages: readonly ConversationMessage[];
  isReasoningSummaryVisible: boolean;
  conversationMessagePartsById: Record<string, ConversationMessagePart>;
  conversationMessageScrollBoxRef: RefObject<ScrollBoxRenderable | null>;
  hiddenOlderConversationMessageCount: number;
  olderConversationMessageRevealCount: number;
  onRevealOlderConversationMessages: () => void;
  pendingToolApprovalDecision?: PendingToolApprovalDecision;
  accentColor: ChatScreenTheme["accentAmber"] | ChatScreenTheme["accentGreen"] | ChatScreenTheme["accentPink"];
  terminalColumnCount: number;
};

export function ConversationTranscriptSurface(props: ConversationTranscriptSurfaceProps): ReactNode {
  return (
    <ConversationMessageList
      conversationMessages={props.conversationMessages}
      hiddenOlderConversationMessageCount={props.hiddenOlderConversationMessageCount}
      isReasoningSummaryVisible={props.isReasoningSummaryVisible}
      olderConversationMessageRevealCount={props.olderConversationMessageRevealCount}
      onRevealOlderConversationMessages={props.onRevealOlderConversationMessages}
      {...(props.pendingToolApprovalDecision !== undefined
        ? { pendingToolApprovalDecision: props.pendingToolApprovalDecision }
        : {})}
      conversationMessagePartsById={props.conversationMessagePartsById}
      conversationMessageScrollBoxRef={props.conversationMessageScrollBoxRef}
      horizontalRuleColor={props.accentColor}
      userMessageBorderColor={props.accentColor}
      terminalColumnCount={props.terminalColumnCount}
    />
  );
}
