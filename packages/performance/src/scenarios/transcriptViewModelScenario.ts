import type { ConversationMessage, ConversationMessagePart } from "@buli/contracts";
import {
  createInitialChatSessionState,
  type ChatSessionState,
} from "@buli/chat-session-state";
import {
  createCountMetric,
  createDurationMetric,
  createBytesMetric,
  measureDurationMs,
  type PerformanceScenario,
} from "../model/performanceScenario.ts";
import {
  buildStableChatScreenTranscriptViewModel,
  type ChatScreenTranscriptViewModelCache,
} from "../../../tui/src/behavior/chatScreenViewModel.ts";

const transcriptConversationMessageCount = 10_000;
const requestedVisibleConversationMessageCount = 48;

export const transcriptViewModelScenario: PerformanceScenario = {
  scenarioName: "transcript-view-model",
  description:
    "Builds a large synthetic transcript and measures cold view-model build, cache reuse, and one visible-row update.",
  defaultWarmupCount: 1,
  defaultRepeatCount: 8,
  async runIteration(input) {
    const chatSessionState = createChatSessionStateWithTranscript({
      conversationMessageCount: transcriptConversationMessageCount,
    });

    const heapUsedBeforeBuilds = process.memoryUsage().heapUsed;
    const coldBuild = await measureDurationMs(() => buildStableTranscriptViewModel(chatSessionState, undefined));
    const cachedBuild = await measureDurationMs(() =>
      buildStableTranscriptViewModel(chatSessionState, coldBuild.measuredValue.nextCache)
    );
    const changedVisibleState = replaceVisibleTailConversationMessagePart(chatSessionState);
    const changedVisibleBuild = await measureDurationMs(() =>
      buildStableTranscriptViewModel(changedVisibleState, coldBuild.measuredValue.nextCache)
    );
    const heapUsedAfterBuilds = process.memoryUsage().heapUsed;

    return {
      iterationLabel: `${input.isWarmup ? "warmup" : "repeat"}-${input.iterationIndex}`,
      metrics: [
        createDurationMetric({
          metricName: "transcript_view_model.cold_build.duration_ms",
          durationMs: coldBuild.durationMs,
          budget: { warnAbove: 10, failAbove: 25 },
        }),
        createDurationMetric({
          metricName: "transcript_view_model.cached_build.duration_ms",
          durationMs: cachedBuild.durationMs,
          budget: { warnAbove: 1, failAbove: 5 },
        }),
        createDurationMetric({
          metricName: "transcript_view_model.changed_visible_part.duration_ms",
          durationMs: changedVisibleBuild.durationMs,
          budget: { warnAbove: 5, failAbove: 15 },
        }),
        createCountMetric({
          metricName: "transcript_view_model.total_message_count",
          count: transcriptConversationMessageCount,
          lowerIsBetter: false,
        }),
        createCountMetric({
          metricName: "transcript_view_model.visible_message_count",
          count: coldBuild.measuredValue.transcriptViewModel.conversationTranscriptWindow.visibleConversationMessageCount,
          lowerIsBetter: false,
        }),
        createBytesMetric({
          metricName: "transcript_view_model.heap_used_delta_bytes",
          bytes: Math.max(0, heapUsedAfterBuilds - heapUsedBeforeBuilds),
          budget: { warnAbove: 10_000_000, failAbove: 25_000_000 },
        }),
      ],
    };
  },
};

function buildStableTranscriptViewModel(
  chatSessionState: ChatSessionState,
  previousCache: ChatScreenTranscriptViewModelCache | undefined,
) {
  return buildStableChatScreenTranscriptViewModel({
    chatSessionState,
    requestedVisibleConversationMessageCount,
    previousCache,
  });
}

function createChatSessionStateWithTranscript(input: { conversationMessageCount: number }): ChatSessionState {
  const conversationMessagesById: Record<string, ConversationMessage> = {};
  const conversationMessagePartsById: Record<string, ConversationMessagePart> = {};
  const orderedConversationMessageIds: string[] = [];

  for (let messageIndex = 0; messageIndex < input.conversationMessageCount; messageIndex += 1) {
    const messageId = `message-${messageIndex}`;
    const partId = `part-${messageIndex}`;
    orderedConversationMessageIds.push(messageId);
    conversationMessagesById[messageId] = {
      id: messageId,
      role: messageIndex % 2 === 0 ? "user" : "assistant",
      messageStatus: "completed",
      createdAtMs: messageIndex,
      partIds: [partId],
    };
    conversationMessagePartsById[partId] = messageIndex % 2 === 0
      ? { id: partId, partKind: "user_text", text: `Prompt ${messageIndex}` }
      : {
          id: partId,
          partKind: "assistant_text",
          partStatus: "completed",
          rawMarkdownText: `Assistant response ${messageIndex}\n\n- item one\n- item two`,
        };
  }

  return {
    ...createInitialChatSessionState({ selectedModelId: "gpt-5.5" }),
    conversationMessagesById,
    conversationMessagePartsById,
    orderedConversationMessageIds,
    conversationMessagePartCount: input.conversationMessageCount,
  };
}

function replaceVisibleTailConversationMessagePart(chatSessionState: ChatSessionState): ChatSessionState {
  const changedMessageIndex = transcriptConversationMessageCount - 1;
  const changedPartId = `part-${changedMessageIndex}`;
  const changedConversationMessagePart: ConversationMessagePart = {
    id: changedPartId,
    partKind: "assistant_text",
    partStatus: "completed",
    rawMarkdownText: "Changed visible assistant response\n\n```ts\nconst changed = true;\n```",
  };

  return {
    ...chatSessionState,
    conversationMessagePartsById: {
      ...chatSessionState.conversationMessagePartsById,
      [changedPartId]: changedConversationMessagePart,
    },
  };
}
