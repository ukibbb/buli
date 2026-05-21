import { expect, test } from "bun:test";
import type { UserPromptImageAttachment } from "@buli/contracts";
import type { AssistantConversationRunner, ConversationTurnRequest } from "@buli/engine";
import { act } from "react";
import { ChatScreen } from "../src/ChatScreen.tsx";
import { testRender } from "./testRenderWithCleanup.ts";

const pastedImageAttachment: UserPromptImageAttachment = {
  attachmentId: "image-1",
  mimeType: "image/png",
  dataUrl: "data:image/png;base64,aGVsbG8=",
  fileName: "clipboard.png",
};

test("ChatScreen pastes a clipboard image with Ctrl V and submits it with the prompt", async () => {
  const submittedConversationTurnRequests: ConversationTurnRequest[] = [];
  const assistantConversationRunner: AssistantConversationRunner = {
    startConversationTurn(input) {
      submittedConversationTurnRequests.push(input);
      return {
        async *streamAssistantResponseEvents() {
          return;
        },
        async approvePendingToolCall() {},
        async denyPendingToolCall() {},
        interrupt() {},
      };
    },
  };
  const renderedChatScreen = await testRender(
    <ChatScreen
      selectedModelId="gpt-5.4"
      loadAvailableAssistantModels={async () => []}
      loadPromptContextCandidates={async () => []}
      assistantConversationRunner={assistantConversationRunner}
      readClipboardImageAttachment={async () => pastedImageAttachment}
    />,
    { width: 120, height: 24 },
  );

  for (const character of "Describe this") {
    await act(async () => {
      renderedChatScreen.mockInput.pressKey(character);
    });
  }
  for (let movedCursorLeftCount = 0; movedCursorLeftCount < "this".length; movedCursorLeftCount += 1) {
    await act(async () => {
      renderedChatScreen.mockInput.pressKey("ARROW_LEFT");
    });
  }
  await act(async () => {
    renderedChatScreen.mockInput.pressKey("v", { ctrl: true });
    await Promise.resolve();
  });
  await renderedChatScreen.renderOnce();
  expect(renderedChatScreen.captureCharFrame()).toMatch(/Describe \[Image 1\].*this/);

  await act(async () => {
    renderedChatScreen.mockInput.pressEnter();
  });

  expect(submittedConversationTurnRequests).toEqual([
    expect.objectContaining({
      userPromptText: "Describe [Image 1] this",
      userPromptImageAttachments: [pastedImageAttachment],
    }),
  ]);
});

test("ChatScreen removes the last pasted image with Backspace when the prompt draft is empty", async () => {
  const assistantConversationRunner: AssistantConversationRunner = {
    startConversationTurn() {
      return {
        async *streamAssistantResponseEvents() {
          return;
        },
        async approvePendingToolCall() {},
        async denyPendingToolCall() {},
        interrupt() {},
      };
    },
  };
  const renderedChatScreen = await testRender(
    <ChatScreen
      selectedModelId="gpt-5.4"
      loadAvailableAssistantModels={async () => []}
      loadPromptContextCandidates={async () => []}
      assistantConversationRunner={assistantConversationRunner}
      readClipboardImageAttachment={async () => pastedImageAttachment}
    />,
    { width: 120, height: 24 },
  );

  await act(async () => {
    renderedChatScreen.mockInput.pressKey("v", { ctrl: true });
    await Promise.resolve();
  });
  await renderedChatScreen.renderOnce();
  expect(renderedChatScreen.captureCharFrame()).toContain("[Image 1]");

  await act(async () => {
    renderedChatScreen.mockInput.pressKey("BACKSPACE");
  });
  await renderedChatScreen.renderOnce();
  expect(renderedChatScreen.captureCharFrame()).not.toContain("[Image 1]");
});

test("ChatScreen does not read the native clipboard when bracketed paste sanitizes to empty text", async () => {
  let nativeClipboardReadCount = 0;
  const assistantConversationRunner: AssistantConversationRunner = {
    startConversationTurn() {
      return {
        async *streamAssistantResponseEvents() {
          return;
        },
        async approvePendingToolCall() {},
        async denyPendingToolCall() {},
        interrupt() {},
      };
    },
  };
  const renderedChatScreen = await testRender(
    <ChatScreen
      selectedModelId="gpt-5.4"
      loadAvailableAssistantModels={async () => []}
      loadPromptContextCandidates={async () => []}
      assistantConversationRunner={assistantConversationRunner}
      readClipboardImageAttachment={async () => {
        nativeClipboardReadCount += 1;
        return pastedImageAttachment;
      }}
    />,
    { width: 120, height: 24 },
  );

  await act(async () => {
    await renderedChatScreen.mockInput.pasteBracketedText("\x1B[31m\x1B[0m");
  });
  await renderedChatScreen.renderOnce();

  expect(nativeClipboardReadCount).toBe(0);
  expect(renderedChatScreen.captureCharFrame()).not.toContain("[Image 1]");
});

test("ChatScreen ignores a delayed clipboard image when the prompt becomes non-editable before read completes", async () => {
  const submittedConversationTurnRequests: ConversationTurnRequest[] = [];
  let resolveClipboardImageRead: ((imageAttachment: UserPromptImageAttachment | undefined) => void) | undefined;
  let resolveAssistantTurn: (() => void) | undefined;
  const clipboardImageReadPromise = new Promise<UserPromptImageAttachment | undefined>((resolve) => {
    resolveClipboardImageRead = resolve;
  });
  const assistantTurnPromise = new Promise<void>((resolve) => {
    resolveAssistantTurn = resolve;
  });
  const assistantConversationRunner: AssistantConversationRunner = {
    startConversationTurn(input) {
      submittedConversationTurnRequests.push(input);
      return {
        async *streamAssistantResponseEvents() {
          await assistantTurnPromise;
        },
        async approvePendingToolCall() {},
        async denyPendingToolCall() {},
        interrupt() {},
      };
    },
  };
  const renderedChatScreen = await testRender(
    <ChatScreen
      selectedModelId="gpt-5.4"
      loadAvailableAssistantModels={async () => []}
      loadPromptContextCandidates={async () => []}
      assistantConversationRunner={assistantConversationRunner}
      readClipboardImageAttachment={() => clipboardImageReadPromise}
    />,
    { width: 120, height: 24 },
  );

  for (const character of "Describe this") {
    await act(async () => {
      renderedChatScreen.mockInput.pressKey(character);
    });
  }
  await act(async () => {
    renderedChatScreen.mockInput.pressKey("v", { ctrl: true });
  });
  await act(async () => {
    renderedChatScreen.mockInput.pressEnter();
  });
  await act(async () => {
    resolveClipboardImageRead?.(pastedImageAttachment);
    await Promise.resolve();
  });
  await renderedChatScreen.renderOnce();

  expect(submittedConversationTurnRequests).toEqual([
    expect.objectContaining({
      userPromptText: "Describe this",
    }),
  ]);
  expect(submittedConversationTurnRequests[0]?.userPromptImageAttachments ?? []).toEqual([]);
  expect(renderedChatScreen.captureCharFrame()).not.toContain("[Image 1]");

  await act(async () => {
    resolveAssistantTurn?.();
    await Promise.resolve();
  });
});
