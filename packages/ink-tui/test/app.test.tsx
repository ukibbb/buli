import { expect, test } from "bun:test";
import { renderToString } from "ink";
import React from "react";
import { AgentRuntime } from "@buli/engine";
import { App, ComposerPane, StatusBar, TranscriptPane } from "../src/index.ts";

const runtime = new AgentRuntime({
  async *streamTurn() {
    return;
  },
});

test("App renders the empty transcript and idle status", () => {
  const output = renderToString(<App auth="ready" model="gpt-5.4" runtime={runtime} />);

  expect(output).toContain("No messages yet.");
  expect(output).toContain("Auth ready | Model gpt-5.4 | Status idle");
});

test("TranscriptPane renders user and assistant lines", () => {
  const output = renderToString(
    <TranscriptPane
      entries={[
        {
          kind: "message",
          message: { id: "user-1", role: "user", text: "Hello" },
        },
        {
          kind: "message",
          message: { id: "assistant-1", role: "assistant", text: "Hi" },
        },
      ]}
    />,
  );

  expect(output).toContain("You: Hello");
  expect(output).toContain("Assistant: Hi");
});

test("ComposerPane and StatusBar render the basic v1 shell", () => {
  const composer = renderToString(<ComposerPane disabled={false} value="hello" />);
  const status = renderToString(
    <StatusBar
      auth="ready"
      model="gpt-5.4"
      runtime="idle"
      usage={{ total: 90, input: 50, output: 30, reasoning: 10, cache: { read: 0, write: 0 } }}
    />,
  );

  expect(composer).toContain("> hello_");
  expect(status).toContain("In 50 | Out 30 | Reasoning 10");
});
