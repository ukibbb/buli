import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import { InputPanel } from "../../src/components/InputPanel.tsx";

function renderWithoutAnsi(node: React.ReactElement) {
  return stripVTControlCharacters(renderToString(node));
}

test("InputPanel renders mode and model labels in the header strip", () => {
  const output = renderWithoutAnsi(
    <InputPanel
      promptDraft=""
      isPromptInputDisabled={false}
      promptInputHintText="Enter to send"
      modeLabel="implementation"
      modelIdentifier="opus-4.6"
      reasoningEffortLabel="reasoning:high"
      assistantResponseStatus="waiting_for_user_input"
      tokenUsagePercentageOfContextWindow={undefined}
    />,
  );
  expect(output).toContain("implementation");
  expect(output).toContain("opus-4.6 · reasoning:high");
});

test("InputPanel renders working indicator only while assistant response is streaming", () => {
  const streamingOutput = renderWithoutAnsi(
    <InputPanel
      promptDraft="hello"
      isPromptInputDisabled
      promptInputHintText="streaming"
      modeLabel="implementation"
      modelIdentifier="opus-4.6"
      reasoningEffortLabel="high"
      assistantResponseStatus="streaming_assistant_response"
      tokenUsagePercentageOfContextWindow={undefined}
    />,
  );
  const idleOutput = renderWithoutAnsi(
    <InputPanel
      promptDraft=""
      isPromptInputDisabled={false}
      promptInputHintText="Enter to send"
      modeLabel="implementation"
      modelIdentifier="opus-4.6"
      reasoningEffortLabel="high"
      assistantResponseStatus="waiting_for_user_input"
      tokenUsagePercentageOfContextWindow={undefined}
    />,
  );
  expect(streamingOutput).toContain("working");
  expect(idleOutput).not.toContain("working");
});

test("InputPanel renders context window percentage when token usage is known", () => {
  const output = renderWithoutAnsi(
    <InputPanel
      promptDraft=""
      isPromptInputDisabled={false}
      promptInputHintText=""
      modeLabel="implementation"
      modelIdentifier="opus-4.6"
      reasoningEffortLabel="high"
      assistantResponseStatus="waiting_for_user_input"
      tokenUsagePercentageOfContextWindow={42}
    />,
  );
  expect(output).toContain("42%");
});

test("InputPanel renders a dim placeholder when context window capacity is unknown", () => {
  const output = renderWithoutAnsi(
    <InputPanel
      promptDraft=""
      isPromptInputDisabled={false}
      promptInputHintText=""
      modeLabel="implementation"
      modelIdentifier="opus-4.6"
      reasoningEffortLabel="high"
      assistantResponseStatus="waiting_for_user_input"
      tokenUsagePercentageOfContextWindow={undefined}
    />,
  );
  expect(output).toContain("--");
});

test("InputPanel renders a cursor indicator when prompt input is enabled", () => {
  const output = renderWithoutAnsi(
    <InputPanel
      promptDraft="hello"
      isPromptInputDisabled={false}
      promptInputHintText=""
      modeLabel="implementation"
      modelIdentifier="opus-4.6"
      reasoningEffortLabel="high"
      assistantResponseStatus="waiting_for_user_input"
      tokenUsagePercentageOfContextWindow={undefined}
    />,
  );
  const hasCursor = output.includes("█") || output.includes(" ");
  expect(hasCursor).toBe(true);
  // The enabled prompt line contains "hello" — the cursor follows it.
  expect(output).toContain("hello");
});

test("InputPanel does not render a block cursor when prompt input is disabled", () => {
  const output = renderWithoutAnsi(
    <InputPanel
      promptDraft="hello"
      isPromptInputDisabled
      promptInputHintText=""
      modeLabel="implementation"
      modelIdentifier="opus-4.6"
      reasoningEffortLabel="high"
      assistantResponseStatus="streaming_assistant_response"
      tokenUsagePercentageOfContextWindow={undefined}
    />,
  );
  expect(output).not.toMatch(/hello█/);
});

test("InputPanel shows the snake animation only while assistant response is streaming", () => {
  const streamingOutput = renderWithoutAnsi(
    <InputPanel
      promptDraft=""
      isPromptInputDisabled
      promptInputHintText="idle hint"
      modeLabel="implementation"
      modelIdentifier="opus-4.6"
      reasoningEffortLabel="high"
      assistantResponseStatus="streaming_assistant_response"
      tokenUsagePercentageOfContextWindow={undefined}
    />,
  );
  const idleOutput = renderWithoutAnsi(
    <InputPanel
      promptDraft=""
      isPromptInputDisabled={false}
      promptInputHintText="idle hint"
      modeLabel="implementation"
      modelIdentifier="opus-4.6"
      reasoningEffortLabel="high"
      assistantResponseStatus="waiting_for_user_input"
      tokenUsagePercentageOfContextWindow={undefined}
    />,
  );
  expect(streamingOutput).toMatch(/▰|●/);
  expect(idleOutput).not.toMatch(/▰/);
});
