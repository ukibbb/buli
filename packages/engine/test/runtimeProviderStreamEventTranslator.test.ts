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

function createRuntimeProviderStreamEventTranslator(input?: {
  currentTimeInMilliseconds?: number;
}): RuntimeProviderStreamEventTranslator {
  let nextPartNumber = 0;
  return new RuntimeProviderStreamEventTranslator({
    assistantResponseMessageId: "assistant-message-1",
    assistantTextPartId: "assistant-text-1",
    conversationTurnStartedAtMilliseconds: 1_000,
    selectedModelId: "gpt-5.4",
    createConversationMessagePartId: () => {
      nextPartNumber += 1;
      return `generated-part-${nextPartNumber}`;
    },
    readCurrentTimeInMilliseconds: () => input?.currentTimeInMilliseconds ?? 1_250,
  });
}

test("RuntimeProviderStreamEventTranslator emits add then update events for streamed text", () => {
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
  expect(updatedTextTranslation.assistantResponseEvents).toEqual([
    {
      type: "assistant_message_part_updated",
      messageId: "assistant-message-1",
      part: {
        id: "assistant-text-1",
        partKind: "assistant_text",
        partStatus: "streaming",
        rawMarkdownText: "Hello world",
      },
    },
  ]);
  expect(providerStreamEventTranslator.assistantMessageText).toBe("Hello world");
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

test("RuntimeProviderStreamEventTranslator translates completed provider events into terminal assistant output", () => {
  const providerStreamEventTranslator = createRuntimeProviderStreamEventTranslator({ currentTimeInMilliseconds: 1_500 });

  providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: { type: "text_chunk", text: "Done." },
  });
  const terminalTranslation = providerStreamEventTranslator.translateProviderStreamEvent({
    providerStreamEvent: { type: "completed", usage: completedTokenUsage },
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
  expect(toolCallTranslation.assistantTextSegmentSessionEntryBeforeToolCall).toEqual({
    entryKind: "assistant_text_segment",
    assistantTextSegmentText: "Before tool. ",
  });
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
  expect(terminalTranslation.assistantTextSegmentSessionEntryBeforeTerminalSessionEntry).toEqual({
    entryKind: "assistant_text_segment",
    assistantTextSegmentText: "After tool.",
  });
  expect(terminalTranslation.terminalAssistantMessageSessionEntry).toMatchObject({
    entryKind: "assistant_message",
    assistantMessageStatus: "completed",
    assistantMessageText: "Before tool. After tool.",
  });
});
