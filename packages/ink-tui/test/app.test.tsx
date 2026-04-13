import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import type { AssistantResponseRunner } from "@buli/engine";
import {
  ChatScreen,
  ChatSessionStatusBar,
  ConversationTranscriptPane,
  ModelAndReasoningSelectionPane,
  PromptDraftPane,
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

test("ChatScreen renders the empty transcript and waiting status", () => {
  const output = renderWithoutAnsi(
    <ChatScreen
      assistantResponseRunner={assistantResponseRunner}
      authenticationState="ready"
      loadAvailableAssistantModels={loadAvailableAssistantModels}
      selectedModelId="gpt-5.4"
    />,
  );

  expect(output).toContain("buli");
  expect(output).toContain("Conversation");
  expect(output).toContain("No messages yet.");
  expect(output).toContain("Prompt");
  expect(output).toContain("Enter send | Ctrl+L models | PgUp/PgDn/Home/End scroll");
  expect(output).toContain("status idle | auth ready");
  expect(output).toContain("conversation latest");
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

  expect(output).toContain("You");
  expect(output).toContain("Hello");
  expect(output).toContain("Assistant");
  expect(output).toContain("Hi");
});

test("PromptDraftPane and ChatSessionStatusBar render the basic shell", () => {
  const promptDraftPane = renderWithoutAnsi(
    <PromptDraftPane
      isPromptInputDisabled={false}
      promptDraft="hello"
      promptInputHintText="Enter send | Ctrl+L models | PgUp/PgDn/Home/End scroll"
    />,
  );
  const selection = renderWithoutAnsi(
    <ModelAndReasoningSelectionPane
      visibleChoices={["Use model default (medium)", "high"]}
      highlightedChoiceIndex={1}
      headingText="Choose reasoning"
    />,
  );
  const status = renderWithoutAnsi(
    <ChatSessionStatusBar
      assistantResponseStatus="waiting_for_user_input"
      authenticationState="ready"
      conversationTranscriptViewportStatusText="conversation scrolling"
      latestTokenUsage={{ total: 90, input: 50, output: 30, reasoning: 10, cache: { read: 0, write: 0 } }}
    />,
  );

  expect(promptDraftPane).toContain("Prompt");
  expect(promptDraftPane).toContain("> hello_");
  expect(promptDraftPane).toContain("Enter send | Ctrl+L models | PgUp/PgDn/Home/End scroll");
  expect(selection).toContain("Choose reasoning");
  expect(selection).toContain("> high");
  expect(status).toContain("status idle | auth ready");
  expect(status).toContain("conversation scrolling");
  expect(status).toContain("in 50 out 30 reason 10");
});
