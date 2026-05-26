import type { ChatScreenTheme } from "@buli/assistant-design-tokens";
import type { ReasoningSummaryDisplayMode } from "@buli/chat-session-state";
import type { ConversationSessionCompactionStatus } from "@buli/chat-app-controller";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { ReactNode, RefObject } from "react";
import type { VisibleConversationMessageRow } from "../behavior/chatScreenViewModel.ts";
import { ConversationMessageList } from "./ConversationMessageList.tsx";
import type { PendingToolApprovalDecision } from "./ConversationMessageRow.tsx";

export type ConversationTranscriptSurfaceProps = {
  visibleConversationMessageRows: readonly VisibleConversationMessageRow[];
  reasoningSummaryDisplayMode: ReasoningSummaryDisplayMode;
  conversationMessageScrollBoxRef: RefObject<ScrollBoxRenderable | null>;
  hiddenOlderConversationMessageCount: number;
  olderConversationMessageRevealCount: number;
  onRevealOlderConversationMessages: () => void;
  pendingToolApprovalDecision?: PendingToolApprovalDecision;
  accentColor: ChatScreenTheme["accentAmber"] | ChatScreenTheme["accentGreen"] | ChatScreenTheme["accentPink"];
  terminalColumnCount: number;
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus;
  queuedPromptCount: number;
  totalContextTokensUsed: number | undefined;
  contextWindowTokenCapacity: number | undefined;
};

export function ConversationTranscriptSurface(props: ConversationTranscriptSurfaceProps): ReactNode {
  return (
    <ConversationMessageList
      visibleConversationMessageRows={props.visibleConversationMessageRows}
      hiddenOlderConversationMessageCount={props.hiddenOlderConversationMessageCount}
      reasoningSummaryDisplayMode={props.reasoningSummaryDisplayMode}
      olderConversationMessageRevealCount={props.olderConversationMessageRevealCount}
      onRevealOlderConversationMessages={props.onRevealOlderConversationMessages}
      {...(props.pendingToolApprovalDecision !== undefined
        ? { pendingToolApprovalDecision: props.pendingToolApprovalDecision }
        : {})}
      conversationMessageScrollBoxRef={props.conversationMessageScrollBoxRef}
      horizontalRuleColor={props.accentColor}
      userMessageBorderColor={props.accentColor}
      terminalColumnCount={props.terminalColumnCount}
      conversationSessionCompactionStatus={props.conversationSessionCompactionStatus}
      queuedPromptCount={props.queuedPromptCount}
      totalContextTokensUsed={props.totalContextTokensUsed}
      contextWindowTokenCapacity={props.contextWindowTokenCapacity}
    />
  );
}
