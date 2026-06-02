import { expect, test } from "bun:test";
import type { TokenUsage } from "@buli/contracts";
import { RuntimeProviderStreamEventTranslator } from "../src/runtimeProviderStreamEventTranslator.ts";

const completedTokenUsage: TokenUsage = {
  total: 10,
  input: 4,
  output: 5,
  reasoning: 1,
  cache: { read: 0, write: 0 },
};

const contextWindowTokenUsage: TokenUsage = {
  total: 7,
  input: 5,
  output: 1,
  reasoning: 1,
  cache: { read: 0, write: 0 },
};

function createRuntimeProviderStreamEventTranslator(input?: {
  currentTimeInMilliseconds?: number;
}): RuntimeProviderStreamEventTranslator {
  let nextPartNumber = 0;
  return new RuntimeProviderStreamEventTranslator({
    assistantResponseMessageId: "assistant-message-1",
    assistantTextPartId: "assistant-text-1",
    conversationTurnStartedAtMilliseconds: 1_000,
    assistantOperatingMode: "implementation",
    selectedModelId: "gpt-5.4",
    createConversationMessagePartId: () => {
      nextPartNumber += 1;
      return `generated-part-${nextPartNumber}`;
    },
    readCurrentTimeInMilliseconds: () => input?.currentTimeInMilliseconds ?? 1_250,
  });
}

test("RuntimeProviderStreamEventTranslator emits the first streamed text chunk then buffers small updates", () => {
  const providerStreamEventTranslator = createRuntimeProviderStreamEventTranslator();

  const addedTextTranslation = providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: { type: "text_chunk", text: "Hello" },
  });
  const updatedTextTranslation = providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: { type: "text_chunk", text: " world" },
  });

  if (addedTextTranslation.translationKind !== "assistant_response_events") {
    throw new Error("expected assistant response events");
  }
  if (updatedTextTranslation.translationKind !== "assistant_response_events") {
    throw new Error("expected assistant response events");
  }

  expect(addedTextTranslation.assistantResponseEvents).toEqual([
    {
      type: "assistant_message_part_added",
      messageId: "assistant-message-1",
      part: {
        id: "assistant-text-1",
        partKind: "assistant_text",
        partStatus: "streaming",
        rawMarkdownText: "Hello",
      },
    },
  ]);
  expect(updatedTextTranslation.assistantResponseEvents).toEqual([]);
  expect(providerStreamEventTranslator.assistantMessageText).toBe("Hello world");
});

test("RuntimeProviderStreamEventTranslator keeps internal mode tags out of streamed and persisted assistant text", () => {
  const providerStreamEventTranslator = createRuntimeProviderStreamEventTranslator();

  const openingTagTranslation = providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: { type: "text_chunk", text: '<understand_mode speaker="assistant">\n' },
  });
  const visibleAnswerTranslation = providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: { type: "text_chunk", text: "Visible answer." },
  });
  const closingTagTranslation = providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: { type: "text_chunk", text: "\n</understand_mode>" },
  });
  const terminalTranslation = providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: { type: "completed", usage: completedTokenUsage },
  });

  if (openingTagTranslation.translationKind !== "assistant_response_events") {
    throw new Error("expected assistant response events");
  }
  if (visibleAnswerTranslation.translationKind !== "assistant_response_events") {
    throw new Error("expected assistant response events");
  }
  if (closingTagTranslation.translationKind !== "assistant_response_events") {
    throw new Error("expected assistant response events");
  }
  if (terminalTranslation.translationKind !== "terminal_assistant_response") {
    throw new Error("expected terminal assistant response");
  }

  expect(openingTagTranslation.assistantResponseEvents).toEqual([]);
  expect(visibleAnswerTranslation.assistantResponseEvents).toEqual([
    {
      type: "assistant_message_part_added",
      messageId: "assistant-message-1",
      part: {
        id: "assistant-text-1",
        partKind: "assistant_text",
        partStatus: "streaming",
        rawMarkdownText: "Visible answer.",
      },
    },
  ]);
  expect(closingTagTranslation.assistantResponseEvents).toEqual([]);
  expect(terminalTranslation.terminalAssistantMessageSessionEntry.assistantMessageText).toBe("Visible answer.");
  expect(JSON.stringify(terminalTranslation.assistantResponseEventsBeforeTerminalSessionEntry)).not.toContain(
    "understand_mode",
  );
});

test("RuntimeProviderStreamEventTranslator coalesces many streamed text chunks and flushes exact terminal text", () => {
  const providerStreamEventTranslator = createRuntimeProviderStreamEventTranslator({ currentTimeInMilliseconds: 1_500 });
  const assistantTextChunks = Array.from({ length: 40 }, (_, chunkIndex) => `${chunkIndex % 10}`);
  const assistantTextEvents = assistantTextChunks.flatMap((assistantTextChunk) => {
    const translation = providerStreamEventTranslator.translateProviderStreamEvent({
      providerStreamEvent: { type: "text_chunk", text: assistantTextChunk },
    });
    if (translation.translationKind !== "assistant_response_events") {
      throw new Error("expected assistant response events");
    }

    return translation.assistantResponseEvents;
  });
  const terminalTranslation = providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: { type: "completed", usage: completedTokenUsage },
  });

  if (terminalTranslation.translationKind !== "terminal_assistant_response") {
    throw new Error("expected terminal assistant response");
  }

  const assistantText = assistantTextChunks.join("");
  expect(assistantTextEvents.length).toBeLessThan(assistantTextChunks.length);
  expect(providerStreamEventTranslator.assistantMessageText).toBe(assistantText);
  expect(terminalTranslation.assistantResponseEventsBeforeTerminalSessionEntry).toContainEqual({
    type: "assistant_message_part_updated",
    messageId: "assistant-message-1",
    part: {
      id: "assistant-text-1",
      partKind: "assistant_text",
      partStatus: "completed",
      rawMarkdownText: assistantText,
    },
  });
  expect(terminalTranslation.terminalAssistantMessageSessionEntry.assistantMessageText).toBe(assistantText);
});

test("RuntimeProviderStreamEventTranslator emits reasoning summary lifecycle events", () => {
  const providerStreamEventTranslator = createRuntimeProviderStreamEventTranslator({ currentTimeInMilliseconds: 1_100 });

  const startedTranslation = providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: { type: "reasoning_summary_started" },
  });
  const updatedTranslation = providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: { type: "reasoning_summary_text_chunk", text: "Need context." },
  });
  const completedTranslation = providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: { type: "reasoning_summary_completed", reasoningDurationMs: 42 },
  });

  if (startedTranslation.translationKind !== "assistant_response_events") {
    throw new Error("expected assistant response events");
  }
  if (updatedTranslation.translationKind !== "assistant_response_events") {
    throw new Error("expected assistant response events");
  }
  if (completedTranslation.translationKind !== "assistant_response_events") {
    throw new Error("expected assistant response events");
  }

  expect(startedTranslation.assistantResponseEvents).toEqual([
    {
      type: "assistant_message_part_added",
      messageId: "assistant-message-1",
      part: {
        id: "generated-part-1",
        partKind: "assistant_reasoning",
        partStatus: "streaming",
        reasoningSummaryText: "",
        reasoningStartedAtMs: 1_100,
      },
    },
  ]);
  expect(updatedTranslation.assistantResponseEvents).toEqual([
    {
      type: "assistant_message_part_updated",
      messageId: "assistant-message-1",
      part: {
        id: "generated-part-1",
        partKind: "assistant_reasoning",
        partStatus: "streaming",
        reasoningSummaryText: "Need context.",
        reasoningStartedAtMs: 1_100,
      },
    },
  ]);
  expect(completedTranslation.assistantResponseEvents).toEqual([
    {
      type: "assistant_message_part_updated",
      messageId: "assistant-message-1",
      part: {
        id: "generated-part-1",
        partKind: "assistant_reasoning",
        partStatus: "completed",
        reasoningSummaryText: "Need context.",
        reasoningStartedAtMs: 1_100,
        reasoningDurationMs: 42,
      },
    },
  ]);
});

test("RuntimeProviderStreamEventTranslator streams each reasoning summary chunk and completes exact text", () => {
  const providerStreamEventTranslator = createRuntimeProviderStreamEventTranslator({ currentTimeInMilliseconds: 1_100 });
  const startedTranslation = providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: { type: "reasoning_summary_started" },
  });
  const reasoningSummaryChunks = Array.from({ length: 32 }, (_, chunkIndex) => `${chunkIndex % 10}`);
  const reasoningSummaryEvents = reasoningSummaryChunks.flatMap((reasoningSummaryChunk) => {
    const translation = providerStreamEventTranslator.translateProviderStreamEvent({
      providerStreamEvent: { type: "reasoning_summary_text_chunk", text: reasoningSummaryChunk },
    });
    if (translation.translationKind !== "assistant_response_events") {
      throw new Error("expected assistant response events");
    }

    return translation.assistantResponseEvents;
  });
  const completedTranslation = providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: { type: "reasoning_summary_completed", reasoningDurationMs: 42 },
  });

  if (startedTranslation.translationKind !== "assistant_response_events") {
    throw new Error("expected assistant response events");
  }
  if (completedTranslation.translationKind !== "assistant_response_events") {
    throw new Error("expected assistant response events");
  }

  const reasoningSummaryText = reasoningSummaryChunks.join("");
  expect(startedTranslation.assistantResponseEvents).toHaveLength(1);
  expect(reasoningSummaryEvents).toHaveLength(reasoningSummaryChunks.length);
  expect(reasoningSummaryEvents.at(-1)).toEqual({
    type: "assistant_message_part_updated",
    messageId: "assistant-message-1",
    part: {
      id: "generated-part-1",
      partKind: "assistant_reasoning",
      partStatus: "streaming",
      reasoningSummaryText,
      reasoningStartedAtMs: 1_100,
    },
  });
  expect(completedTranslation.assistantResponseEvents).toEqual([
    {
      type: "assistant_message_part_updated",
      messageId: "assistant-message-1",
      part: {
        id: "generated-part-1",
        partKind: "assistant_reasoning",
        partStatus: "completed",
        reasoningSummaryText,
        reasoningStartedAtMs: 1_100,
        reasoningDurationMs: 42,
      },
    },
  ]);
});

test("RuntimeProviderStreamEventTranslator translates completed provider events into terminal assistant output", () => {
  const providerStreamEventTranslator = createRuntimeProviderStreamEventTranslator({ currentTimeInMilliseconds: 1_500 });

  providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: { type: "text_chunk", text: "Done." },
  });
  const terminalTranslation = providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: { type: "completed", usage: completedTokenUsage, contextWindowUsage: contextWindowTokenUsage },
    providerTurnReplay: {
      provider: "openai",
      inputItems: [
        {
          type: "function_call_output",
          call_id: "call_1",
          output: "tool result",
        },
      ],
    },
  });

  if (terminalTranslation.translationKind !== "terminal_assistant_response") {
    throw new Error("expected terminal assistant response");
  }

  expect(terminalTranslation.assistantResponseEventsBeforeTerminalSessionEntry).toEqual([
    {
      type: "assistant_message_part_added",
      messageId: "assistant-message-1",
      part: {
        id: "generated-part-1",
        partKind: "assistant_turn_summary",
        turnDurationMs: 500,
        modelDisplayName: "gpt-5.4",
        assistantOperatingMode: "implementation",
        usage: completedTokenUsage,
      },
    },
    {
      type: "assistant_message_part_updated",
      messageId: "assistant-message-1",
      part: {
        id: "assistant-text-1",
        partKind: "assistant_text",
        partStatus: "completed",
        rawMarkdownText: "Done.",
      },
    },
  ]);
  expect(terminalTranslation.terminalAssistantMessageSessionEntry).toEqual({
    entryKind: "assistant_message",
    assistantMessageStatus: "completed",
    assistantMessageText: "Done.",
    selectedModelId: "gpt-5.4",
    assistantOperatingMode: "implementation",
    turnDurationMs: 500,
    usage: completedTokenUsage,
    providerTurnReplay: {
      provider: "openai",
      inputItems: [
        {
          type: "function_call_output",
          call_id: "call_1",
          output: "tool result",
        },
      ],
    },
  });
  expect(terminalTranslation.terminalAssistantResponseEvent).toEqual({
    type: "assistant_message_completed",
    messageId: "assistant-message-1",
    usage: completedTokenUsage,
    contextWindowUsage: contextWindowTokenUsage,
  });
});

test("RuntimeProviderStreamEventTranslator translates incomplete provider events into terminal assistant output", () => {
  const providerStreamEventTranslator = createRuntimeProviderStreamEventTranslator({ currentTimeInMilliseconds: 1_750 });

  providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: { type: "text_chunk", text: "Partial" },
  });
  const terminalTranslation = providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: {
      type: "incomplete",
      incompleteReason: "max_output_tokens",
      usage: completedTokenUsage,
    },
  });

  if (terminalTranslation.translationKind !== "terminal_assistant_response") {
    throw new Error("expected terminal assistant response");
  }

  expect(terminalTranslation.assistantResponseEventsBeforeTerminalSessionEntry).toEqual([
    {
      type: "assistant_message_part_added",
      messageId: "assistant-message-1",
      part: {
        id: "generated-part-1",
        partKind: "assistant_turn_summary",
        turnDurationMs: 750,
        modelDisplayName: "gpt-5.4",
        assistantOperatingMode: "implementation",
        usage: completedTokenUsage,
      },
    },
    {
      type: "assistant_message_part_updated",
      messageId: "assistant-message-1",
      part: {
        id: "assistant-text-1",
        partKind: "assistant_text",
        partStatus: "incomplete",
        rawMarkdownText: "Partial",
      },
    },
  ]);
  expect(terminalTranslation.terminalAssistantMessageSessionEntry).toEqual({
    entryKind: "assistant_message",
    assistantMessageStatus: "incomplete",
    assistantMessageText: "Partial",
    selectedModelId: "gpt-5.4",
    assistantOperatingMode: "implementation",
    turnDurationMs: 750,
    usage: completedTokenUsage,
    incompleteReason: "max_output_tokens",
  });
  expect(terminalTranslation.terminalAssistantResponseEvent).toEqual({
    type: "assistant_message_incomplete",
    messageId: "assistant-message-1",
    incompleteReason: "max_output_tokens",
    usage: completedTokenUsage,
  });
});

test("RuntimeProviderStreamEventTranslator passes tool call requests through to the runtime", () => {
  const providerStreamEventTranslator = createRuntimeProviderStreamEventTranslator();
  const toolCallTranslation = providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: {
      type: "tool_call_requested",
      toolCallId: "call_bash_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "pwd",
        commandDescription: "Show working directory",
      },
    },
  });

  expect(toolCallTranslation).toEqual({
    translationKind: "tool_call_requested",
    providerToolCallRequestedEvent: {
      type: "tool_call_requested",
      toolCallId: "call_bash_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "pwd",
        commandDescription: "Show working directory",
      },
    },
  });
});

test("RuntimeProviderStreamEventTranslator anchors rate-limit notices to provider retry wait start time", () => {
  const providerStreamEventTranslator = createRuntimeProviderStreamEventTranslator({ currentTimeInMilliseconds: 5_000 });
  const rateLimitTranslation = providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: {
      type: "rate_limit_pending",
      retryAfterSeconds: 3,
      retryWaitStartedAtMs: 4_250,
      retryReason: "rate_limit",
      limitExplanation: "OpenAI request was rate limited. Retrying after 3 seconds.",
    },
  });

  if (rateLimitTranslation.translationKind !== "assistant_response_events") {
    throw new Error("expected assistant response events");
  }

  expect(rateLimitTranslation.assistantResponseEvents).toEqual([
    {
      type: "assistant_message_part_added",
      messageId: "assistant-message-1",
      part: {
        id: "generated-part-1",
        partKind: "assistant_rate_limit_notice",
        retryAfterSeconds: 3,
        retryReason: "rate_limit",
        limitExplanation: "OpenAI request was rate limited. Retrying after 3 seconds.",
        noticeStartedAtMs: 4_250,
      },
    },
  ]);
});

test("RuntimeProviderStreamEventTranslator falls back to local time for legacy rate-limit events", () => {
  const providerStreamEventTranslator = createRuntimeProviderStreamEventTranslator({ currentTimeInMilliseconds: 5_000 });
  const rateLimitTranslation = providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: {
      type: "rate_limit_pending",
      retryAfterSeconds: 3,
      limitExplanation: "Retry later.",
    },
  });

  if (rateLimitTranslation.translationKind !== "assistant_response_events") {
    throw new Error("expected assistant response events");
  }

  expect(rateLimitTranslation.assistantResponseEvents[0]).toMatchObject({
    type: "assistant_message_part_added",
    part: {
      partKind: "assistant_rate_limit_notice",
      noticeStartedAtMs: 5_000,
    },
  });
});

test("RuntimeProviderStreamEventTranslator segments assistant text around tool calls", () => {
  const providerStreamEventTranslator = createRuntimeProviderStreamEventTranslator({ currentTimeInMilliseconds: 2_000 });

  providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: { type: "text_chunk", text: "Before tool. " },
  });
  const toolCallTranslation = providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: {
      type: "tool_call_requested",
      toolCallId: "call_read_1",
      toolCallRequest: {
        toolName: "read",
        readTargetPath: "README.md",
      },
    },
  });
  const afterToolTextTranslation = providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: { type: "text_chunk", text: "After tool." },
  });
  const terminalTranslation = providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: { type: "completed", usage: completedTokenUsage },
  });

  if (toolCallTranslation.translationKind !== "tool_call_requested") {
    throw new Error("expected tool call requested translation");
  }
  if (afterToolTextTranslation.translationKind !== "assistant_response_events") {
    throw new Error("expected assistant response events");
  }
  if (terminalTranslation.translationKind !== "terminal_assistant_response") {
    throw new Error("expected terminal assistant response");
  }

  expect(toolCallTranslation.assistantResponseEventsBeforeToolCall).toEqual([
    {
      type: "assistant_message_part_updated",
      messageId: "assistant-message-1",
      part: {
        id: "assistant-text-1",
        partKind: "assistant_text",
        partStatus: "completed",
        rawMarkdownText: "Before tool. ",
      },
    },
  ]);
  expect(toolCallTranslation.assistantSegmentSessionEntriesBeforeToolCall).toEqual([
    {
      entryKind: "assistant_text_segment",
      assistantTextSegmentText: "Before tool. ",
    },
  ]);
  expect(afterToolTextTranslation.assistantResponseEvents).toEqual([
    {
      type: "assistant_message_part_added",
      messageId: "assistant-message-1",
      part: {
        id: "generated-part-1",
        partKind: "assistant_text",
        partStatus: "streaming",
        rawMarkdownText: "After tool.",
      },
    },
  ]);
  expect(terminalTranslation.assistantSegmentSessionEntriesBeforeTerminalSessionEntry).toEqual([
    {
      entryKind: "assistant_text_segment",
      assistantTextSegmentText: "After tool.",
    },
  ]);
  expect(terminalTranslation.terminalAssistantMessageSessionEntry).toMatchObject({
    entryKind: "assistant_message",
    assistantMessageStatus: "completed",
    assistantMessageText: "Before tool. After tool.",
  });
});
