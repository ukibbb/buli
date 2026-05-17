import { memo, type ReactNode, type RefObject } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { ConversationMessage, ConversationMessagePart } from "@buli/contracts";
import { ConversationMessageRow, type ConversationMessageRowProps } from "./ConversationMessageRow.tsx";

export type ConversationMessageListProps = {
  conversationMessages: readonly ConversationMessage[];
  isReasoningSummaryVisible: boolean;
  resolveConversationMessageParts: (messageId: string) => readonly ConversationMessagePart[];
  conversationMessageScrollBoxRef: RefObject<ScrollBoxRenderable | null>;
  horizontalRuleColor: string;
  terminalColumnCount?: number | undefined;
};

const MemoizedConversationMessageRow = memo(ConversationMessageRow, areConversationMessageRowPropsEqual);

function areConversationMessageRowPropsEqual(
  previousProps: ConversationMessageRowProps,
  nextProps: ConversationMessageRowProps,
): boolean {
  return previousProps.conversationMessage === nextProps.conversationMessage &&
    previousProps.isReasoningSummaryVisible === nextProps.isReasoningSummaryVisible &&
    previousProps.horizontalRuleColor === nextProps.horizontalRuleColor &&
    previousProps.terminalColumnCount === nextProps.terminalColumnCount &&
    areConversationMessagePartReferencesEqual(
      previousProps.conversationMessageParts,
      nextProps.conversationMessageParts,
    );
}

function areConversationMessagePartReferencesEqual(
  previousConversationMessageParts: readonly ConversationMessagePart[],
  nextConversationMessageParts: readonly ConversationMessagePart[],
): boolean {
  if (previousConversationMessageParts.length !== nextConversationMessageParts.length) {
    return false;
  }

  return previousConversationMessageParts.every(
    (conversationMessagePart, partIndex) => conversationMessagePart === nextConversationMessageParts[partIndex],
  );
}

export function ConversationMessageList(props: ConversationMessageListProps): ReactNode {
  return (
    <box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
      <scrollbox
        flexDirection="column"
        flexGrow={1}
        minHeight={0}
        ref={props.conversationMessageScrollBoxRef}
        scrollX={false}
        stickyScroll={true}
        stickyStart="bottom"
        verticalScrollbarOptions={{ visible: false, showArrows: false }}
        horizontalScrollbarOptions={{ visible: false, showArrows: false }}
      >
        {props.conversationMessages.map((conversationMessage, index) => (
          <box flexDirection="column" key={conversationMessage.id} marginTop={index === 0 ? 0 : 1} width="100%">
            <MemoizedConversationMessageRow
              conversationMessage={conversationMessage}
              conversationMessageParts={props.resolveConversationMessageParts(conversationMessage.id)}
              isReasoningSummaryVisible={props.isReasoningSummaryVisible}
              horizontalRuleColor={props.horizontalRuleColor}
              terminalColumnCount={props.terminalColumnCount}
            />
          </box>
        ))}
      </scrollbox>
    </box>
  );
}
