import { expect, test } from "bun:test";
import { createAssistantTranscriptMessage, createCompletedAssistantResponseEvent } from "../src/index.ts";

test("createAssistantTranscriptMessage always creates an assistant transcript message", () => {
  const message = createAssistantTranscriptMessage({
    assistantText: "Hello from the engine",
    assistantContentParts: [],
    messageId: "msg_1",
  });

  expect(message).toEqual({
    id: "msg_1",
    role: "assistant",
    text: "Hello from the engine",
    assistantContentParts: [],
  });
});

test("createCompletedAssistantResponseEvent wraps the assistant message and usage", () => {
  const event = createCompletedAssistantResponseEvent({
    assistantText: "Done",
    assistantContentParts: [],
    id: "msg_2",
    usage: {
      total: 80,
      input: 40,
      output: 30,
      reasoning: 10,
      cache: { read: 0, write: 0 },
    },
  });

  expect(event).toEqual({
    type: "assistant_response_completed",
    message: {
      id: "msg_2",
      role: "assistant",
      text: "Done",
      assistantContentParts: [],
    },
    usage: {
      total: 80,
      input: 40,
      output: 30,
      reasoning: 10,
      cache: { read: 0, write: 0 },
    },
  });
});

test("attaches_assistant_content_parts_to_completed_message", () => {
  const assistantContentParts = [
    { kind: "paragraph" as const, inlineSpans: [{ spanKind: "plain" as const, spanText: "Hello world" }] },
  ];
  const completedEvent = createCompletedAssistantResponseEvent({
    assistantText: "Hello world",
    assistantContentParts,
    usage: {
      total: 15,
      input: 10,
      output: 5,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
  });
  expect(completedEvent.type).toBe("assistant_response_completed");
  expect(completedEvent.message.assistantContentParts).toEqual([
    { kind: "paragraph", inlineSpans: [{ spanKind: "plain", spanText: "Hello world" }] },
  ]);
});
