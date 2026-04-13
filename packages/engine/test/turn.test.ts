import { expect, test } from "bun:test";
import { createAssistantTranscriptMessage, createCompletedAssistantResponseEvent } from "../src/index.ts";

test("createAssistantTranscriptMessage always creates an assistant transcript message", () => {
  const message = createAssistantTranscriptMessage("Hello from the engine", "msg_1");

  expect(message).toEqual({
    id: "msg_1",
    role: "assistant",
    text: "Hello from the engine",
  });
});

test("createCompletedAssistantResponseEvent wraps the assistant message and usage", () => {
  const event = createCompletedAssistantResponseEvent({
    assistantText: "Done",
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
