import { expect, test } from "bun:test";
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
  loadPromptContextCandidates: (promptContextQueryText: string) => Promise<readonly PromptContextCandidate[]>;
}): Promise<OpenTuiChatScreenHarness> {
  const renderedChatScreen = await testRender(
    <ChatScreen
      selectedModelId="gpt-5.4"
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

test("ChatScreen shows the startup gallery before any real conversation exists", async () => {
  const renderedChatScreen = await renderChatScreen({
    loadPromptContextCandidates: async () => [],
  });

  const frame = await renderedChatScreen.captureFrame();
  expect(frame).toContain("Startup Component Gallery");
  expect(frame).toContain("Shell And Control Surfaces");
  expect(frame).toContain("Temporary redesign surface");
  expect(frame).toContain("TopBar");
});

test("ChatScreen hides the startup gallery after the first submitted prompt", async () => {
  const renderedChatScreen = await renderChatScreen({
    loadPromptContextCandidates: async () => [],
  });

  await renderedChatScreen.typeText("show me the live transcript");
  const frameAfterSubmit = await renderedChatScreen.pressEnter();
  expect(frameAfterSubmit).not.toContain("Startup Component Gallery");
  expect(frameAfterSubmit).toContain("show me the live transcript");
  expect(frameAfterSubmit).toContain("working");
});
