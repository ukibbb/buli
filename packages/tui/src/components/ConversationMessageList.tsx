import { memo, useCallback, useMemo, useRef, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import { calculateContextTokensUsedFromTokenUsage, type ConversationMessagePart } from "@buli/contracts";
import type { ReasoningSummaryDisplayMode } from "@buli/chat-session-state";
import type { ChatAppRenderStore, ConversationSessionCompactionStatus } from "@buli/chat-app-controller";
import { lookupDefaultConversationAutoCompactionTriggerTokenCountForModel } from "@buli/engine";
import type { VisibleConversationMessageRow } from "../behavior/chatScreenViewModel.ts";
import { AutoCompactingStatusLine } from "./AutoCompactingStatusLine.tsx";
import {
  ConversationMessageRow,
  listRenderableConversationMessageParts,
  type PendingToolApprovalDecision,
  type ConversationMessageRowProps,
} from "./ConversationMessageRow.tsx";
import { ConversationHistoryRevealRow } from "./ConversationHistoryRevealRow.tsx";

type ConversationMessageListRenderStoreProps = {
  chatAppRenderStore: ChatAppRenderStore;
  visibleConversationMessageIds: readonly string[];
  visibleConversationMessageRows?: undefined;
};

type ConversationMessageListPrebuiltRowsProps = {
  visibleConversationMessageRows: readonly VisibleConversationMessageRow[];
  chatAppRenderStore?: undefined;
  visibleConversationMessageIds?: undefined;
};

type ConversationMessageListCommonProps = {
  reasoningSummaryDisplayMode: ReasoningSummaryDisplayMode;
  conversationMessageScrollBoxRef: RefObject<ScrollBoxRenderable | null>;
  transcriptAccentColor: string;
  hiddenOlderConversationMessageCount: number;
  olderConversationMessageRevealCount: number;
  onRevealOlderConversationMessages: () => void;
  pendingToolApprovalDecision?: PendingToolApprovalDecision;
  pendingToolApprovalDecisionCallbacks?: PendingToolApprovalDecisionCallbacks | undefined;
  userMessageBorderColor: string;
  conversationSessionCompactionStatus?: ConversationSessionCompactionStatus | undefined;
  queuedPromptCount?: number | undefined;
  totalContextTokensUsed?: number | undefined;
  contextMeterTokenLimit?: number | undefined;
};

export type ConversationMessageListProps = ConversationMessageListCommonProps & (
  | ConversationMessageListRenderStoreProps
  | ConversationMessageListPrebuiltRowsProps
);

type PendingToolApprovalDecisionCallbacks = Pick<
  PendingToolApprovalDecision,
  "onPendingToolApprovalApproved" | "onPendingToolApprovalDenied"
>;

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
    previousProps.transcriptAccentColor === nextProps.transcriptAccentColor &&
    previousProps.userMessageBorderColor === nextProps.userMessageBorderColor &&
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
  const scrollboxViewportOptions = useMemo(() => ({ paddingRight: 0 }), []);
  const hiddenVerticalScrollbarOptions = useMemo(() => ({ visible: false, showArrows: false }), []);
  const hiddenHorizontalScrollbarOptions = useMemo(() => ({ visible: false, showArrows: false }), []);
  const subscribeToTranscriptAuxiliary = useCallback(
    (listener: () => void) => props.chatAppRenderStore?.subscribeTranscriptAuxiliary(listener) ?? (() => {}),
    [props.chatAppRenderStore],
  );
  const readTranscriptAuxiliarySnapshot = useCallback(
    () => props.chatAppRenderStore?.readTranscriptAuxiliarySnapshot(),
    [props.chatAppRenderStore],
  );
  const transcriptAuxiliarySnapshot = useSyncExternalStore(
    subscribeToTranscriptAuxiliary,
    readTranscriptAuxiliarySnapshot,
    readTranscriptAuxiliarySnapshot,
  );
  const preparationCacheRef = useRef(createConversationMessageListPreparationCache());
  const renderableConversationMessages = useMemo(
    () =>
      props.visibleConversationMessageRows
        ? prepareRenderableConversationMessages({
          visibleConversationMessageRows: props.visibleConversationMessageRows,
          reasoningSummaryDisplayMode: props.reasoningSummaryDisplayMode,
          preparationCache: preparationCacheRef.current,
        })
        : undefined,
    [props.reasoningSummaryDisplayMode, props.visibleConversationMessageRows],
  );
  const shouldRenderHistoryRevealRow = props.hiddenOlderConversationMessageCount > 0 &&
    props.olderConversationMessageRevealCount > 0;
  const conversationSessionCompactionStatus = transcriptAuxiliarySnapshot?.conversationSessionCompactionStatus ??
    props.conversationSessionCompactionStatus;
  const queuedPromptCount = transcriptAuxiliarySnapshot?.queuedPromptCount ?? props.queuedPromptCount ?? 0;
  const transcriptPendingToolApprovalRequest = transcriptAuxiliarySnapshot?.pendingToolApprovalRequest;
  const pendingToolApprovalDecisionCallbacks = props.pendingToolApprovalDecisionCallbacks;
  const directPendingToolApprovalDecision = transcriptPendingToolApprovalRequest && pendingToolApprovalDecisionCallbacks
    ? undefined
    : props.pendingToolApprovalDecision;
  const activePendingToolApprovalDecision = useMemo(
    () =>
      resolvePendingToolApprovalDecision({
        pendingToolApprovalRequest: transcriptPendingToolApprovalRequest,
        pendingToolApprovalDecision: directPendingToolApprovalDecision,
        pendingToolApprovalDecisionCallbacks,
      }),
    [
      directPendingToolApprovalDecision,
      pendingToolApprovalDecisionCallbacks?.onPendingToolApprovalApproved,
      pendingToolApprovalDecisionCallbacks?.onPendingToolApprovalDenied,
      transcriptPendingToolApprovalRequest,
    ],
  );
  const totalContextTokensUsed = transcriptAuxiliarySnapshot
    ? transcriptAuxiliarySnapshot.latestContextWindowUsage
      ? calculateContextTokensUsedFromTokenUsage(transcriptAuxiliarySnapshot.latestContextWindowUsage)
      : undefined
    : props.totalContextTokensUsed;
  const contextMeterTokenLimit = transcriptAuxiliarySnapshot
    ? lookupDefaultConversationAutoCompactionTriggerTokenCountForModel(transcriptAuxiliarySnapshot.selectedModelId)
    : props.contextMeterTokenLimit;
  const shouldRenderAutoCompactingStatusLine = conversationSessionCompactionStatus?.step === "compacting" &&
    conversationSessionCompactionStatus.source === "auto";

  return (
    <box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
      <scrollbox
        flexDirection="column"
        flexGrow={1}
        gap={1}
        minHeight={0}
        ref={props.conversationMessageScrollBoxRef}
        scrollX={false}
        stickyScroll={true}
        stickyStart="bottom"
        viewportCulling={true}
        viewportOptions={scrollboxViewportOptions}
        verticalScrollbarOptions={hiddenVerticalScrollbarOptions}
        horizontalScrollbarOptions={hiddenHorizontalScrollbarOptions}
      >
        {shouldRenderHistoryRevealRow ? (
          <ConversationHistoryRevealRow
            hiddenOlderConversationMessageCount={props.hiddenOlderConversationMessageCount}
            olderConversationMessageRevealCount={props.olderConversationMessageRevealCount}
            onRevealOlderConversationMessages={props.onRevealOlderConversationMessages}
          />
        ) : null}
        {props.chatAppRenderStore
          ? props.visibleConversationMessageIds.map((conversationMessageId) => (
            <ConversationMessageRowContainer
              key={conversationMessageId}
              chatAppRenderStore={props.chatAppRenderStore}
              conversationMessageId={conversationMessageId}
              reasoningSummaryDisplayMode={props.reasoningSummaryDisplayMode}
              transcriptAccentColor={props.transcriptAccentColor}
              {...(activePendingToolApprovalDecision !== undefined
                ? { pendingToolApprovalDecision: activePendingToolApprovalDecision }
                : {})}
              userMessageBorderColor={props.userMessageBorderColor}
            />
          ))
          : renderableConversationMessages?.map(({ conversationMessage, conversationMessageParts }) => {
            const rowPendingToolApprovalDecision = resolvePendingToolApprovalDecisionForConversationMessageRow({
              conversationMessageParts,
              pendingToolApprovalDecision: activePendingToolApprovalDecision,
            });

            return (
              <box flexDirection="column" flexShrink={0} key={conversationMessage.id} width="100%">
                <MemoizedConversationMessageRow
                  conversationMessage={conversationMessage}
                  conversationMessageParts={conversationMessageParts}
                  reasoningSummaryDisplayMode={props.reasoningSummaryDisplayMode}
                  transcriptAccentColor={props.transcriptAccentColor}
                  {...(rowPendingToolApprovalDecision !== undefined
                    ? { pendingToolApprovalDecision: rowPendingToolApprovalDecision }
                    : {})}
                  userMessageBorderColor={props.userMessageBorderColor}
                />
              </box>
            );
          })}
        {shouldRenderAutoCompactingStatusLine ? (
          <box flexDirection="column" flexShrink={0} width="100%">
            <AutoCompactingStatusLine
              queuedPromptCount={queuedPromptCount}
              totalContextTokensUsed={totalContextTokensUsed}
              contextMeterTokenLimit={contextMeterTokenLimit}
            />
          </box>
        ) : null}
      </scrollbox>
    </box>
  );
}

type ConversationMessageRowContainerProps = {
  chatAppRenderStore: ChatAppRenderStore;
  conversationMessageId: string;
  reasoningSummaryDisplayMode: ReasoningSummaryDisplayMode;
  transcriptAccentColor: string;
  pendingToolApprovalDecision?: PendingToolApprovalDecision;
  userMessageBorderColor: string;
};

function ConversationMessageRowContainer(props: ConversationMessageRowContainerProps): ReactNode {
  const subscribeToConversationMessageRow = useCallback(
    (listener: () => void) => props.chatAppRenderStore.subscribeConversationMessageRow(props.conversationMessageId, listener),
    [props.chatAppRenderStore, props.conversationMessageId],
  );
  const readConversationMessageRowSnapshot = useCallback(
    () => props.chatAppRenderStore.readConversationMessageRowSnapshot(props.conversationMessageId),
    [props.chatAppRenderStore, props.conversationMessageId],
  );
  const conversationMessageRowSnapshot = useSyncExternalStore(
    subscribeToConversationMessageRow,
    readConversationMessageRowSnapshot,
    readConversationMessageRowSnapshot,
  );
  const renderableConversationMessageParts = useMemo(
    () =>
      conversationMessageRowSnapshot
        ? listRenderableConversationMessageParts({
          conversationMessageParts: conversationMessageRowSnapshot.conversationMessageParts,
          reasoningSummaryDisplayMode: props.reasoningSummaryDisplayMode,
        })
        : [],
    [conversationMessageRowSnapshot?.conversationMessageParts, props.reasoningSummaryDisplayMode],
  );

  if (!conversationMessageRowSnapshot) {
    return null;
  }

  if (
    conversationMessageRowSnapshot.conversationMessage.role === "assistant" &&
    conversationMessageRowSnapshot.conversationMessage.messageStatus !== "streaming" &&
    renderableConversationMessageParts.length === 0
  ) {
    return null;
  }

  const pendingToolApprovalDecision = resolvePendingToolApprovalDecisionForConversationMessageRow({
    conversationMessageParts: renderableConversationMessageParts,
    pendingToolApprovalDecision: props.pendingToolApprovalDecision,
  });

  return (
    <box flexDirection="column" flexShrink={0} width="100%">
      <MemoizedConversationMessageRow
        conversationMessage={conversationMessageRowSnapshot.conversationMessage}
        conversationMessageParts={renderableConversationMessageParts}
        reasoningSummaryDisplayMode={props.reasoningSummaryDisplayMode}
        transcriptAccentColor={props.transcriptAccentColor}
        {...(pendingToolApprovalDecision !== undefined
          ? { pendingToolApprovalDecision }
          : {})}
        userMessageBorderColor={props.userMessageBorderColor}
      />
    </box>
  );
}

function resolvePendingToolApprovalDecision(input: {
  pendingToolApprovalRequest: PendingToolApprovalDecision["pendingToolApprovalRequest"] | undefined;
  pendingToolApprovalDecision: PendingToolApprovalDecision | undefined;
  pendingToolApprovalDecisionCallbacks: PendingToolApprovalDecisionCallbacks | undefined;
}): PendingToolApprovalDecision | undefined {
  if (input.pendingToolApprovalRequest && input.pendingToolApprovalDecisionCallbacks) {
    return {
      pendingToolApprovalRequest: input.pendingToolApprovalRequest,
      onPendingToolApprovalApproved: input.pendingToolApprovalDecisionCallbacks.onPendingToolApprovalApproved,
      onPendingToolApprovalDenied: input.pendingToolApprovalDecisionCallbacks.onPendingToolApprovalDenied,
    };
  }

  return input.pendingToolApprovalDecision;
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
