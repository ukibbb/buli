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

  await act(async () => {
    renderedChatScreen.mockInput.pressKey("v", { ctrl: true });
    await Promise.resolve();
  });
  await renderedChatScreen.renderOnce();
  expect(renderedChatScreen.captureCharFrame()).toContain("[Image 1]");

  for (const character of "Describe this") {
    await act(async () => {
      renderedChatScreen.mockInput.pressKey(character);
    });
  }
  await act(async () => {
    renderedChatScreen.mockInput.pressEnter();
  });

  expect(submittedConversationTurnRequests).toEqual([
    expect.objectContaining({
      userPromptText: "Describe this",
      userPromptImageAttachments: [pastedImageAttachment],
    }),
  ]);
});
