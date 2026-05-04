import { expect, test } from "bun:test";
import type { AssistantResponseEvent, AvailableAssistantModel } from "@buli/contracts";
import type { AssistantConversationRunner, PromptContextCandidate } from "@buli/engine";
import { act } from "react";
import { ChatScreen } from "../src/ChatScreen.tsx";
import { testRender } from "./testRenderWithCleanup.ts";

const neverEmittingAssistantConversationRunner: AssistantConversationRunner = {
  startConversationTurn() {
    return {
      async *streamAssistantResponseEvents() {
        return;
      },
      async approvePendingToolCall() {},
      async denyPendingToolCall() {},
    };
  },
};

const reasoningSummaryAssistantResponseEvents = [
  {
    type: "assistant_turn_started",
    messageId: "assistant-reasoning-1",
    startedAtMs: 1000,
  },
  {
    type: "assistant_message_part_added",
    messageId: "assistant-reasoning-1",
    part: {
      id: "reasoning-1",
      partKind: "assistant_reasoning",
      partStatus: "completed",
      reasoningSummaryText: "I inspected the available context before answering.",
      reasoningStartedAtMs: 1000,
      reasoningDurationMs: 1200,
      reasoningTokenCount: 7,
    },
  },
  {
    type: "assistant_message_completed",
    messageId: "assistant-reasoning-1",
    usage: {
      total: 30,
      input: 20,
      output: 3,
      reasoning: 7,
      cache: { read: 0, write: 0 },
    },
  },
] as const satisfies readonly AssistantResponseEvent[];

const reasoningSummaryAssistantConversationRunner: AssistantConversationRunner = {
  startConversationTurn() {
    return {
      async *streamAssistantResponseEvents() {
        for (const assistantResponseEvent of reasoningSummaryAssistantResponseEvents) {
          yield assistantResponseEvent;
        }
      },
      async approvePendingToolCall() {},
      async denyPendingToolCall() {},
    };
  },
};

type OpenTuiChatScreenHarness = {
  captureFrame(): Promise<string>;
  pressCtrlL(): Promise<string>;
  pressEnter(): Promise<string>;
  typeText(text: string): Promise<string>;
  waitForAssistantEvents(): Promise<string>;
};

async function renderChatScreen(input: {
  loadAvailableAssistantModels?: () => Promise<AvailableAssistantModel[]>;
  loadPromptContextCandidates?: (promptContextQueryText: string) => Promise<readonly PromptContextCandidate[]>;
  assistantConversationRunner?: AssistantConversationRunner;
} = {}): Promise<OpenTuiChatScreenHarness> {
  const renderedChatScreen = await testRender(
    <ChatScreen
      selectedModelId="gpt-5.4"
      loadAvailableAssistantModels={input.loadAvailableAssistantModels ?? (async () => [])}
      loadPromptContextCandidates={input.loadPromptContextCandidates ?? (async () => [])}
      assistantConversationRunner={input.assistantConversationRunner ?? neverEmittingAssistantConversationRunner}
    />,
    { width: 120, height: 28 },
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
    async pressCtrlL(): Promise<string> {
      await act(async () => {
        renderedChatScreen.mockInput.pressKey("l", { ctrl: true });
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
    async waitForAssistantEvents(): Promise<string> {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return captureFrame();
    },
  };
}

test("ChatScreen shows user-facing slash commands after typing a bare slash", async () => {
  const renderedChatScreen = await renderChatScreen();

  const frame = await renderedChatScreen.typeText("/");

  expect(frame).toContain("Commands");
  expect(frame).toContain("/help");
  expect(frame).toContain("/model");
  expect(frame).toContain("/thinking");
  expect(frame).toContain("Hide thinking");
  expect(frame).not.toContain("/scroll-up");
  expect(frame).not.toContain("/bottom");
});

test("ChatScreen opens command help through slash command instead of question mark shortcut", async () => {
  const renderedChatScreen = await renderChatScreen();

  await renderedChatScreen.typeText("/help");
  const helpFrame = await renderedChatScreen.pressEnter();

  expect(helpFrame).toContain("help · commands");
  expect(helpFrame).toContain("/help");
  expect(helpFrame).toContain("/model");
  expect(helpFrame).toContain("/thinking");
  expect(helpFrame).toContain("Hide thinking");

  const renderedQuestionMarkScreen = await renderChatScreen();
  const questionMarkFrame = await renderedQuestionMarkScreen.typeText("?");
  expect(questionMarkFrame).not.toContain("help · commands");
  expect(questionMarkFrame).toContain("?");
});

test("ChatScreen opens model picker through slash command instead of ctrl-l", async () => {
  let modelLoadCount = 0;
  const renderedChatScreen = await renderChatScreen({
    loadAvailableAssistantModels: async () => {
      modelLoadCount += 1;
      return [
        {
          id: "gpt-5.4",
          displayName: "GPT 5.4",
          defaultReasoningEffort: "medium",
          supportedReasoningEfforts: ["low", "medium", "high"],
        },
      ];
    },
  });

  const ctrlLFrame = await renderedChatScreen.pressCtrlL();
  expect(ctrlLFrame).not.toContain("Choose model");
  expect(modelLoadCount).toBe(0);

  await renderedChatScreen.typeText("/model");
  const modelFrame = await renderedChatScreen.pressEnter();

  expect(modelLoadCount).toBe(1);
  expect(modelFrame).toContain("Choose model");
  expect(modelFrame).toContain("GPT 5.4");
});

test("ChatScreen shows the model default reasoning label after choosing the model default", async () => {
  const renderedChatScreen = await renderChatScreen({
    loadAvailableAssistantModels: async () => [
      {
        id: "gpt-5.4",
        displayName: "GPT 5.4",
        defaultReasoningEffort: "medium",
        supportedReasoningEfforts: ["low", "medium", "high"],
      },
    ],
  });

  await renderedChatScreen.typeText("/model");
  await renderedChatScreen.pressEnter();
  const reasoningChoicesFrame = await renderedChatScreen.pressEnter();
  expect(reasoningChoicesFrame).toContain("Choose reasoning for GPT 5.4");
  expect(reasoningChoicesFrame).toContain("Use model default (medium)");

  const selectedDefaultReasoningFrame = await renderedChatScreen.pressEnter();
  expect(selectedDefaultReasoningFrame).toContain("gpt-5.4");
  expect(selectedDefaultReasoningFrame).toContain("medium");
});

test("ChatScreen toggles reasoning summary visibility through thinking slash command", async () => {
  const renderedChatScreen = await renderChatScreen({
    assistantConversationRunner: reasoningSummaryAssistantConversationRunner,
  });

  await renderedChatScreen.typeText("Answer with reasoning");
  await renderedChatScreen.pressEnter();
  const visibleReasoningFrame = await renderedChatScreen.waitForAssistantEvents();
  expect(visibleReasoningFrame).toContain("_Thinking:_");
  expect(visibleReasoningFrame).toContain("I inspected the available context before answering.");

  await renderedChatScreen.typeText("/thinking");
  const hiddenReasoningFrame = await renderedChatScreen.pressEnter();
  expect(hiddenReasoningFrame).toContain("Thinking");
  expect(hiddenReasoningFrame).toContain("7 reasoning tok");
  expect(hiddenReasoningFrame).not.toContain("I inspected the available context before answering.");

  const slashMenuFrame = await renderedChatScreen.typeText("/");
  expect(slashMenuFrame).toContain("/thinking");
  expect(slashMenuFrame).toContain("Show thinking");
});
