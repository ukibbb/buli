import { expect, test } from "bun:test";
import { appendComposer, applyTurnEvent, backspaceComposer, createInitialState, submitPrompt } from "../src/index.ts";

test("submitPrompt moves the app into streaming and appends the user message", () => {
  const initial = appendComposer(createInitialState({ auth: "ready", model: "gpt-5.4" }), "Hello");
  const submitted = submitPrompt(initial);

  expect(submitted.prompt).toBe("Hello");
  expect(submitted.state.runtime).toBe("streaming");
  expect(submitted.state.composer).toBe("");
  expect(submitted.state.transcript).toEqual([
    {
      kind: "message",
      message: {
        id: "user-1",
        role: "user",
        text: "Hello",
      },
    },
  ]);
});

test("backspaceComposer removes one character", () => {
  const state = appendComposer(createInitialState({ auth: "ready", model: "gpt-5.4" }), "Hello");

  expect(backspaceComposer(state).composer).toBe("Hell");
});

test("applyTurnEvent appends assistant deltas and stores final token usage", () => {
  let state = appendComposer(createInitialState({ auth: "ready", model: "gpt-5.4" }), "Hello");
  state = submitPrompt(state).state;
  state = applyTurnEvent(state, { type: "assistant_stream_started", model: "gpt-5.4" });
  state = applyTurnEvent(state, { type: "assistant_text_delta", text: "Hi" });
  state = applyTurnEvent(state, { type: "assistant_text_delta", text: " there" });
  state = applyTurnEvent(state, {
    type: "assistant_stream_finished",
    message: {
      id: "assistant-1",
      role: "assistant",
      text: "Hi there",
    },
    usage: {
      total: 90,
      input: 50,
      output: 30,
      reasoning: 10,
      cache: { read: 0, write: 0 },
    },
  });

  expect(state.runtime).toBe("idle");
  expect(state.usage?.reasoning).toBe(10);
  expect(state.transcript.at(-1)).toEqual({
    kind: "message",
    message: {
      id: "assistant-1",
      role: "assistant",
      text: "Hi there",
    },
  });
});

test("submitPrompt does nothing while a turn is already streaming", () => {
  let state = appendComposer(createInitialState({ auth: "ready", model: "gpt-5.4" }), "Hello");
  state = submitPrompt(state).state;

  const result = submitPrompt(state);

  expect(result.prompt).toBeUndefined();
  expect(result.state).toEqual(state);
});

test("applyTurnEvent adds an error entry when the turn fails", () => {
  let state = createInitialState({ auth: "ready", model: "gpt-5.4" });
  state = applyTurnEvent(state, {
    type: "assistant_stream_failed",
    error: "provider failed",
  });

  expect(state.runtime).toBe("error");
  expect(state.transcript).toEqual([
    {
      kind: "error",
      text: "provider failed",
    },
  ]);
});
