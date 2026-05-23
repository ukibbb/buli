import type { ChatScreenTheme } from "@buli/assistant-design-tokens";
import type { ConversationMessage, ConversationMessagePart } from "@buli/contracts";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { ReactNode, RefObject } from "react";
import { ConversationMessageList } from "./ConversationMessageList.tsx";

export type ConversationTranscriptSurfaceProps = {
  conversationMessages: readonly ConversationMessage[];
  isReasoningSummaryVisible: boolean;
  resolveConversationMessageParts: (messageId: string) => readonly ConversationMessagePart[];
  conversationMessageScrollBoxRef: RefObject<ScrollBoxRenderable | null>;
  hiddenOlderConversationMessageCount: number;
  olderConversationMessageRevealCount: number;
  onRevealOlderConversationMessages: () => void;
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
      resolveConversationMessageParts={props.resolveConversationMessageParts}
      conversationMessageScrollBoxRef={props.conversationMessageScrollBoxRef}
      horizontalRuleColor={props.accentColor}
      userMessageBorderColor={props.accentColor}
      terminalColumnCount={props.terminalColumnCount}
    />
  );
}
