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
      totalContextTokensUsed={undefined}
      contextWindowTokenCapacity={undefined}
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
      totalContextTokensUsed={undefined}
      contextWindowTokenCapacity={undefined}
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
      totalContextTokensUsed={undefined}
      contextWindowTokenCapacity={undefined}
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
      totalContextTokensUsed={42_000}
      contextWindowTokenCapacity={100_000}
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
      totalContextTokensUsed={undefined}
      contextWindowTokenCapacity={undefined}
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
      totalContextTokensUsed={undefined}
      contextWindowTokenCapacity={undefined}
    />,
  );
  expect(output).toContain("hello█");
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
      totalContextTokensUsed={undefined}
      contextWindowTokenCapacity={undefined}
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
      totalContextTokensUsed={undefined}
      contextWindowTokenCapacity={undefined}
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
      totalContextTokensUsed={undefined}
      contextWindowTokenCapacity={undefined}
    />,
  );
  expect(streamingOutput).toMatch(/▰|●/);
  expect(idleOutput).not.toMatch(/▰/);
});

test("InputPanel centers the prompt row between header and footer", () => {
  const output = renderWithoutAnsi(
    <InputPanel
      promptDraft=""
      isPromptInputDisabled={false}
      promptInputHintText="[ ? ] help · shortcuts"
      modeLabel="implementation"
      modelIdentifier="gpt-5.4"
      reasoningEffortLabel="default"
      assistantResponseStatus="waiting_for_user_input"
      totalContextTokensUsed={undefined}
      contextWindowTokenCapacity={undefined}
    />,
  );

  const renderedLines = output.split("\n");
  const promptLineIndex = renderedLines.findIndex((renderedLine) => renderedLine.includes("│  > "));

  expect(promptLineIndex).toBeGreaterThan(0);
  expect(renderedLines[promptLineIndex - 1]).toMatch(/^│\s+│$/);
  expect(renderedLines[promptLineIndex + 1]).toMatch(/^│\s+│$/);
});
