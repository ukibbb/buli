import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import type { AssistantResponseRunner } from "@buli/engine";
import {
  ChatScreen,
  ConversationTranscriptPane,
  InputPanel,
  ModelAndReasoningSelectionPane,
  ReasoningCollapsedChip,
  ReasoningStreamBlock,
  TopBar,
  UserPromptBlock,
} from "../src/index.ts";

const assistantResponseRunner: AssistantResponseRunner = {
  async *streamAssistantResponse() {
    return;
  },
};

async function loadAvailableAssistantModels() {
  return [];
}

function renderWithoutAnsi(node: React.ReactElement) {
  return stripVTControlCharacters(renderToString(node));
}

test("ChatScreen renders the HERO 1 top bar with mode chip and selected model", () => {
  const output = renderWithoutAnsi(
    <ChatScreen
      assistantResponseRunner={assistantResponseRunner}
      authenticationState="ready"
      loadAvailableAssistantModels={loadAvailableAssistantModels}
      selectedModelId="gpt-5.4"
    />,
  );

  expect(output).toContain("implementation");
  expect(output).toContain("gpt-5.4");
});

test("ConversationTranscriptPane renders user and assistant lines", () => {
  const output = renderWithoutAnsi(
    <ConversationTranscriptPane
      conversationTranscriptEntries={[
        {
          kind: "message",
          message: { id: "user-1", role: "user", text: "Hello" },
        },
        {
          kind: "message",
          message: { id: "assistant-1", role: "assistant", text: "Hi" },
        },
      ]}
      hiddenTranscriptRowsAboveViewport={0}
      onConversationTranscriptViewportMeasured={() => {}}
    />,
  );

  expect(output).toContain("Hello");
  expect(output).toContain("// agent · response");
  expect(output).toContain("Hi");
});

test("ModelAndReasoningSelectionPane renders choices", () => {
  const selection = renderWithoutAnsi(
    <ModelAndReasoningSelectionPane
      visibleChoices={["Use model default (medium)", "high"]}
      highlightedChoiceIndex={1}
      headingText="Choose reasoning"
    />,
  );

  expect(selection).toContain("Choose reasoning");
  expect(selection).toContain("> high");
});
