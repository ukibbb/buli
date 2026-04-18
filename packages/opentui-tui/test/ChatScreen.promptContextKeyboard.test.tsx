import { expect, test } from "bun:test";
import type { AssistantConversationRunner, PromptContextCandidate } from "@buli/engine";
import { act } from "react";
import { ChatScreen } from "../src/ChatScreen.tsx";
import { testRender } from "./testRenderWithCleanup.ts";

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
  pressArrowDown(): Promise<string>;
  pressArrowLeft(): Promise<string>;
  pressEnter(): Promise<string>;
  typeText(text: string): Promise<string>;
  waitForFrame(delayMs: number): Promise<string>;
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
    { width: 120, height: 24 },
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
    async pressArrowDown(): Promise<string> {
      await act(async () => {
        renderedChatScreen.mockInput.pressKey("ARROW_DOWN");
      });
      return captureFrame();
    },
    async pressArrowLeft(): Promise<string> {
      await act(async () => {
        renderedChatScreen.mockInput.pressKey("ARROW_LEFT");
      });
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
    async waitForFrame(delayMs: number): Promise<string> {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      });
      return captureFrame();
    },
  };
}

test("ChatScreen inserts typed text at the caret instead of always appending at the end", async () => {
  const renderedChatScreen = await renderChatScreen({
    loadPromptContextCandidates: async () => [],
  });

  await renderedChatScreen.typeText("hello");
  await renderedChatScreen.pressArrowLeft();
  await renderedChatScreen.pressArrowLeft();

  const renderedFrameAfterInsert = await renderedChatScreen.typeText("x");
  expect(renderedFrameAfterInsert).toMatch(/helx.?lo/);
});

test("ChatScreen debounces fuzzy prompt-context queries before loading candidates", async () => {
  const requestedPromptContextQueryTexts: string[] = [];
  const renderedChatScreen = await renderChatScreen({
    loadPromptContextCandidates: async (promptContextQueryText) => {
      requestedPromptContextQueryTexts.push(promptContextQueryText);
      return [];
    },
  });

  await renderedChatScreen.typeText("@pr");
  expect(requestedPromptContextQueryTexts).not.toContain("pr");

  await renderedChatScreen.waitForFrame(150);
  expect(requestedPromptContextQueryTexts).toContain("pr");
});
