import { memo, useRef, type ReactNode, type RefObject } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { ConversationMessagePart } from "@buli/contracts";
import type { ReasoningSummaryDisplayMode } from "@buli/chat-session-state";
import type { VisibleConversationMessageRow } from "../behavior/chatScreenViewModel.ts";
import {
  ConversationMessageRow,
  listRenderableConversationMessageParts,
  type PendingToolApprovalDecision,
  type ConversationMessageRowProps,
} from "./ConversationMessageRow.tsx";
import { ConversationHistoryRevealRow } from "./ConversationHistoryRevealRow.tsx";

export type ConversationMessageListProps = {
  visibleConversationMessageRows: readonly VisibleConversationMessageRow[];
  reasoningSummaryDisplayMode: ReasoningSummaryDisplayMode;
  conversationMessageScrollBoxRef: RefObject<ScrollBoxRenderable | null>;
  horizontalRuleColor: string;
  hiddenOlderConversationMessageCount: number;
  olderConversationMessageRevealCount: number;
  onRevealOlderConversationMessages: () => void;
  pendingToolApprovalDecision?: PendingToolApprovalDecision;
  userMessageBorderColor: string;
  terminalColumnCount?: number | undefined;
};

const MemoizedConversationMessageRow = memo(ConversationMessageRow, areConversationMessageRowPropsEqual);

export type RenderableConversationMessage = VisibleConversationMessageRow;

type ConversationMessageListPreparationCacheEntry = {
  conversationMessage: VisibleConversationMessageRow["conversationMessage"];
  conversationMessageParts: readonly ConversationMessagePart[];
  reasoningSummaryDisplayMode: ReasoningSummaryDisplayMode;
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
    previousProps.reasoningSummaryDisplayMode === nextProps.reasoningSummaryDisplayMode &&
    previousProps.horizontalRuleColor === nextProps.horizontalRuleColor &&
    previousProps.userMessageBorderColor === nextProps.userMessageBorderColor &&
    previousProps.terminalColumnCount === nextProps.terminalColumnCount &&
    previousProps.pendingToolApprovalDecision === nextProps.pendingToolApprovalDecision &&
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
    visibleConversationMessageRows: props.visibleConversationMessageRows,
    reasoningSummaryDisplayMode: props.reasoningSummaryDisplayMode,
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
        {renderableConversationMessages.map(({ conversationMessage, conversationMessageParts }, index) => {
          const pendingToolApprovalDecision = resolvePendingToolApprovalDecisionForConversationMessageRow({
            conversationMessageParts,
            pendingToolApprovalDecision: props.pendingToolApprovalDecision,
          });

          return (
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
                reasoningSummaryDisplayMode={props.reasoningSummaryDisplayMode}
                horizontalRuleColor={props.horizontalRuleColor}
                {...(pendingToolApprovalDecision !== undefined
                  ? { pendingToolApprovalDecision }
                  : {})}
                userMessageBorderColor={props.userMessageBorderColor}
                terminalColumnCount={props.terminalColumnCount}
              />
            </box>
          );
        })}
      </scrollbox>
    </box>
  );
}

function resolvePendingToolApprovalDecisionForConversationMessageRow(input: {
  conversationMessageParts: readonly ConversationMessagePart[];
  pendingToolApprovalDecision: PendingToolApprovalDecision | undefined;
}): PendingToolApprovalDecision | undefined {
  const pendingToolCallId = input.pendingToolApprovalDecision?.pendingToolApprovalRequest.pendingToolCallId;
  if (!pendingToolCallId) {
    return undefined;
  }

  return input.conversationMessageParts.some(
    (conversationMessagePart) => conversationMessagePart.partKind === "assistant_tool_call" &&
      conversationMessagePart.toolCallId === pendingToolCallId,
  )
    ? input.pendingToolApprovalDecision
    : undefined;
}

export function createConversationMessageListPreparationCache(): ConversationMessageListPreparationCache {
  return { cacheEntriesByConversationMessageId: new Map() };
}

export function prepareRenderableConversationMessages(input: {
  visibleConversationMessageRows: readonly VisibleConversationMessageRow[];
  reasoningSummaryDisplayMode: ReasoningSummaryDisplayMode;
  preparationCache: ConversationMessageListPreparationCache;
}): RenderableConversationMessage[] {
  const nextCacheEntriesByConversationMessageId = new Map<string, ConversationMessageListPreparationCacheEntry>();
  const renderableConversationMessages: RenderableConversationMessage[] = [];

  for (const { conversationMessage, conversationMessageParts } of input.visibleConversationMessageRows) {
    const cachedPreparation = input.preparationCache.cacheEntriesByConversationMessageId.get(conversationMessage.id);
    const renderableConversationMessageParts = cachedPreparation && canReuseConversationMessagePreparation({
        cachedPreparation,
        conversationMessage,
        conversationMessageParts,
        reasoningSummaryDisplayMode: input.reasoningSummaryDisplayMode,
      })
      ? cachedPreparation.renderableConversationMessageParts
      : listRenderableConversationMessageParts({
        conversationMessageParts,
        reasoningSummaryDisplayMode: input.reasoningSummaryDisplayMode,
      });

    nextCacheEntriesByConversationMessageId.set(conversationMessage.id, {
      conversationMessage,
      conversationMessageParts,
      reasoningSummaryDisplayMode: input.reasoningSummaryDisplayMode,
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
  conversationMessage: VisibleConversationMessageRow["conversationMessage"];
  conversationMessageParts: readonly ConversationMessagePart[];
  reasoningSummaryDisplayMode: ReasoningSummaryDisplayMode;
}): boolean {
  return input.cachedPreparation.conversationMessage === input.conversationMessage &&
    input.cachedPreparation.reasoningSummaryDisplayMode === input.reasoningSummaryDisplayMode &&
    areConversationMessagePartReferencesEqual(input.cachedPreparation.conversationMessageParts, input.conversationMessageParts);
}
