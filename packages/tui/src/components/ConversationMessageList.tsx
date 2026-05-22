import { memo, type ReactNode, type RefObject } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { ConversationMessage, ConversationMessagePart } from "@buli/contracts";
import {
  ConversationMessageRow,
  listRenderableConversationMessageParts,
  type ConversationMessageRowProps,
} from "./ConversationMessageRow.tsx";
import { ConversationHistoryRevealRow } from "./ConversationHistoryRevealRow.tsx";

export type ConversationMessageListProps = {
  conversationMessages: readonly ConversationMessage[];
  isReasoningSummaryVisible: boolean;
  resolveConversationMessageParts: (messageId: string) => readonly ConversationMessagePart[];
  conversationMessageScrollBoxRef: RefObject<ScrollBoxRenderable | null>;
  horizontalRuleColor: string;
  hiddenOlderConversationMessageCount: number;
  olderConversationMessageRevealCount: number;
  onRevealOlderConversationMessages: () => void;
  userMessageBorderColor: string;
  terminalColumnCount?: number | undefined;
};

const MemoizedConversationMessageRow = memo(ConversationMessageRow, areConversationMessageRowPropsEqual);

type RenderableConversationMessage = {
  conversationMessage: ConversationMessage;
  conversationMessageParts: readonly ConversationMessagePart[];
};

function areConversationMessageRowPropsEqual(
  previousProps: ConversationMessageRowProps,
  nextProps: ConversationMessageRowProps,
): boolean {
  return previousProps.conversationMessage === nextProps.conversationMessage &&
    previousProps.isReasoningSummaryVisible === nextProps.isReasoningSummaryVisible &&
    previousProps.horizontalRuleColor === nextProps.horizontalRuleColor &&
    previousProps.userMessageBorderColor === nextProps.userMessageBorderColor &&
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
  const renderableConversationMessages: RenderableConversationMessage[] = props.conversationMessages.flatMap((
    conversationMessage,
  ): RenderableConversationMessage[] => {
    const conversationMessageParts = listRenderableConversationMessageParts({
      conversationMessageParts: props.resolveConversationMessageParts(conversationMessage.id),
      isReasoningSummaryVisible: props.isReasoningSummaryVisible,
    });
    if (
      conversationMessage.role === "assistant" &&
      conversationMessage.messageStatus !== "streaming" &&
      conversationMessageParts.length === 0
    ) {
      return [];
    }

    return [{ conversationMessage, conversationMessageParts }];
  });
  const shouldRenderHistoryRevealRow = props.hiddenOlderConversationMessageCount > 0 &&
    props.olderConversationMessageRevealCount > 0;

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
        viewportCulling={true}
        viewportOptions={{ paddingRight: 0 }}
        verticalScrollbarOptions={{ visible: false, showArrows: false }}
        horizontalScrollbarOptions={{ visible: false, showArrows: false }}
      >
        {shouldRenderHistoryRevealRow ? (
          <ConversationHistoryRevealRow
            hiddenOlderConversationMessageCount={props.hiddenOlderConversationMessageCount}
            olderConversationMessageRevealCount={props.olderConversationMessageRevealCount}
            onRevealOlderConversationMessages={props.onRevealOlderConversationMessages}
          />
        ) : null}
        {renderableConversationMessages.map(({ conversationMessage, conversationMessageParts }, index) => (
          <box
            flexDirection="column"
            flexShrink={0}
            key={conversationMessage.id}
            marginTop={index === 0 && !shouldRenderHistoryRevealRow ? 0 : 1}
            width="100%"
          >
            <MemoizedConversationMessageRow
              conversationMessage={conversationMessage}
              conversationMessageParts={conversationMessageParts}
              isReasoningSummaryVisible={props.isReasoningSummaryVisible}
              horizontalRuleColor={props.horizontalRuleColor}
              userMessageBorderColor={props.userMessageBorderColor}
              terminalColumnCount={props.terminalColumnCount}
            />
          </box>
        ))}
      </scrollbox>
    </box>
  );
}
