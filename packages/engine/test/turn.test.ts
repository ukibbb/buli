import { expect, test } from "bun:test";
import { createAssistantMessage, finishAssistantTurn } from "../src/index.ts";

test("createAssistantMessage always creates an assistant transcript message", () => {
  const message = createAssistantMessage("Hello from the engine", "msg_1");

  expect(message).toEqual({
    id: "msg_1",
    role: "assistant",
    text: "Hello from the engine",
  });
});

test("finishAssistantTurn wraps the assistant message and usage", () => {
  const event = finishAssistantTurn({
    text: "Done",
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
    type: "assistant_stream_finished",
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
