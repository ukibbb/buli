import { expect, test } from "bun:test";
import type { ReasoningEffort } from "@buli/contracts";
import type { AssistantConversationRunner, PromptContextCandidate } from "@buli/engine";
import { act } from "react";
import { ChatScreen } from "../../src/ChatScreen.tsx";
import { testRender } from "../testRenderWithCleanup.ts";

const neverEmittingAssistantConversationRunner: AssistantConversationRunner = {
  startConversationTurn() {
    return {
      // eslint-disable-next-line require-yield -- intentional: stub never yields a turn.
      async *streamAssistantResponseEvents() {
        return;
      },
      async approvePendingToolCall() {},
      async denyPendingToolCall() {},
      interrupt() {},
    };
  },
};

const noopAvailableModelsLoader = async () => [];

type OpenTuiChatScreenHarness = {
  captureFrame(): Promise<string>;
  pressEnter(): Promise<string>;
  typeText(text: string): Promise<string>;
};

async function renderChatScreen(input: {
  selectedModelId?: string;
  selectedModelDefaultReasoningEffort?: ReasoningEffort;
  loadPromptContextCandidates: (promptContextQueryText: string) => Promise<readonly PromptContextCandidate[]>;
}): Promise<OpenTuiChatScreenHarness> {
  const renderedChatScreen = await testRender(
    <ChatScreen
      selectedModelId={input.selectedModelId ?? "gpt-5.4"}
      {...(input.selectedModelDefaultReasoningEffort
        ? { selectedModelDefaultReasoningEffort: input.selectedModelDefaultReasoningEffort }
        : {})}
      loadAvailableAssistantModels={noopAvailableModelsLoader}
      loadPromptContextCandidates={input.loadPromptContextCandidates}
      assistantConversationRunner={neverEmittingAssistantConversationRunner}
    />,
    { width: 120, height: 32 },
  );

  const captureFrame = async (): Promise<string> => {
    await renderedChatScreen.renderOnce();
    return renderedChatScreen.captureCharFrame();
  };

  await captureFrame();

  return {
    async captureFrame(): Promise<string> {
      return captureFrame();
    },
    async pressEnter(): Promise<string> {
      await act(async () => {
        renderedChatScreen.mockInput.pressKey("RETURN");
      });
      return captureFrame();
    },
    async typeText(text: string): Promise<string> {
      let frame = "";
      for (const character of text) {
        await act(async () => {
          renderedChatScreen.mockInput.pressKey(character);
        });
        frame = await captureFrame();
      }

      return frame;
    },
  };
}

test("ChatScreen starts with an empty transcript before any real conversation exists", async () => {
  const renderedChatScreen = await renderChatScreen({
    loadPromptContextCandidates: async () => [],
  });

  const frame = await renderedChatScreen.captureFrame();
  expect(frame).toContain(">");
  expect(frame).not.toContain("gpt-5.4");
  expect(frame).not.toContain("Understand");
});

test("ChatScreen keeps selected model reasoning metadata out of the prompt chrome", async () => {
  const renderedChatScreen = await renderChatScreen({
    selectedModelId: "gpt-5.5",
    selectedModelDefaultReasoningEffort: "xhigh",
    loadPromptContextCandidates: async () => [],
  });

  const frame = await renderedChatScreen.captureFrame();
  expect(frame).not.toContain("gpt-5.5");
  expect(frame).not.toContain("xhigh");
});

test("ChatScreen shows the submitted prompt after the first message is added", async () => {
  const renderedChatScreen = await renderChatScreen({
    loadPromptContextCandidates: async () => [],
  });

  await renderedChatScreen.typeText("show me the live transcript");
  const frameAfterSubmit = await renderedChatScreen.pressEnter();
  expect(frameAfterSubmit).toContain("show me the live transcript");
});
