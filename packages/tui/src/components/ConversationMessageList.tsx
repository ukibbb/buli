import { memo, useRef, type ReactNode, type RefObject } from "react";
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
  conversationMessagePartsById: Record<string, ConversationMessagePart>;
  conversationMessageScrollBoxRef: RefObject<ScrollBoxRenderable | null>;
  horizontalRuleColor: string;
  hiddenOlderConversationMessageCount: number;
  olderConversationMessageRevealCount: number;
  onRevealOlderConversationMessages: () => void;
  userMessageBorderColor: string;
  terminalColumnCount?: number | undefined;
};

const MemoizedConversationMessageRow = memo(ConversationMessageRow, areConversationMessageRowPropsEqual);

export type RenderableConversationMessage = {
  conversationMessage: ConversationMessage;
  conversationMessageParts: readonly ConversationMessagePart[];
};

type ConversationMessageListPreparationCacheEntry = {
  conversationMessage: ConversationMessage;
  conversationMessageParts: readonly ConversationMessagePart[];
  isReasoningSummaryVisible: boolean;
  renderableConversationMessageParts: readonly ConversationMessagePart[];
};

export type ConversationMessageListPreparationCache = {
  cacheEntriesByConversationMessageId: Map<string, ConversationMessageListPreparationCacheEntry>;
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
  const preparationCacheRef = useRef(createConversationMessageListPreparationCache());
  const renderableConversationMessages = prepareRenderableConversationMessages({
    conversationMessages: props.conversationMessages,
    conversationMessagePartsById: props.conversationMessagePartsById,
    isReasoningSummaryVisible: props.isReasoningSummaryVisible,
    preparationCache: preparationCacheRef.current,
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

export function createConversationMessageListPreparationCache(): ConversationMessageListPreparationCache {
  return { cacheEntriesByConversationMessageId: new Map() };
}

export function prepareRenderableConversationMessages(input: {
  conversationMessages: readonly ConversationMessage[];
  conversationMessagePartsById: Record<string, ConversationMessagePart>;
  isReasoningSummaryVisible: boolean;
  preparationCache: ConversationMessageListPreparationCache;
}): RenderableConversationMessage[] {
  const nextCacheEntriesByConversationMessageId = new Map<string, ConversationMessageListPreparationCacheEntry>();
  const renderableConversationMessages: RenderableConversationMessage[] = [];

  for (const conversationMessage of input.conversationMessages) {
    const conversationMessageParts = listConversationMessageParts({
      conversationMessage,
      conversationMessagePartsById: input.conversationMessagePartsById,
    });
    const cachedPreparation = input.preparationCache.cacheEntriesByConversationMessageId.get(conversationMessage.id);
    const renderableConversationMessageParts = cachedPreparation && canReuseConversationMessagePreparation({
        cachedPreparation,
        conversationMessage,
        conversationMessageParts,
        isReasoningSummaryVisible: input.isReasoningSummaryVisible,
      })
      ? cachedPreparation.renderableConversationMessageParts
      : listRenderableConversationMessageParts({
        conversationMessageParts,
        isReasoningSummaryVisible: input.isReasoningSummaryVisible,
      });

    nextCacheEntriesByConversationMessageId.set(conversationMessage.id, {
      conversationMessage,
      conversationMessageParts,
      isReasoningSummaryVisible: input.isReasoningSummaryVisible,
      renderableConversationMessageParts,
    });

    if (
      conversationMessage.role === "assistant" &&
      conversationMessage.messageStatus !== "streaming" &&
      renderableConversationMessageParts.length === 0
    ) {
      continue;
    }

    renderableConversationMessages.push({
      conversationMessage,
      conversationMessageParts: renderableConversationMessageParts,
    });
  }

  input.preparationCache.cacheEntriesByConversationMessageId = nextCacheEntriesByConversationMessageId;
  return renderableConversationMessages;
}

function canReuseConversationMessagePreparation(input: {
  cachedPreparation: ConversationMessageListPreparationCacheEntry;
  conversationMessage: ConversationMessage;
  conversationMessageParts: readonly ConversationMessagePart[];
  isReasoningSummaryVisible: boolean;
}): boolean {
  return input.cachedPreparation.conversationMessage === input.conversationMessage &&
    input.cachedPreparation.isReasoningSummaryVisible === input.isReasoningSummaryVisible &&
    areConversationMessagePartReferencesEqual(input.cachedPreparation.conversationMessageParts, input.conversationMessageParts);
}

function listConversationMessageParts(input: {
  conversationMessage: ConversationMessage;
  conversationMessagePartsById: Record<string, ConversationMessagePart>;
}): ConversationMessagePart[] {
  const conversationMessageParts: ConversationMessagePart[] = [];
  for (const conversationMessagePartId of input.conversationMessage.partIds) {
    const conversationMessagePart = input.conversationMessagePartsById[conversationMessagePartId];
    if (conversationMessagePart) {
      conversationMessageParts.push(conversationMessagePart);
    }
  }

  return conversationMessageParts;
}
