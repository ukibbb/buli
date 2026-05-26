import { expect, test } from "bun:test";
import type { AssistantConversationRunner } from "@buli/engine";
import { ChatScreen, type ChatScreenSlotPlugin } from "../src/index.ts";
import { testRender } from "./testRenderWithCleanup.ts";

const neverEmittingAssistantConversationRunner: AssistantConversationRunner = {
  startConversationTurn() {
    return {
      async *streamAssistantResponseEvents() {},
      async approvePendingToolCall() {},
      async denyPendingToolCall() {},
      interrupt() {},
    };
  },
};

test("ChatScreen renders typed internal slot contributions", async () => {
  const slotPlugin: ChatScreenSlotPlugin = {
    id: "test:chat-screen-slots",
    slots: {
      top_bar_right() {
        return <text>slot-top</text>;
      },
      prompt_right(_context, props) {
        return <text>{`slot-model:${props.selectedModelId}`}</text>;
      },
      live_status_extra(_context, props) {
        return <text>{`slot-queued:${props.queuedPromptCount}`}</text>;
      },
      app_overlay() {
        return (
          <box position="absolute" right={2} top={1}>
            <text>slot-overlay</text>
          </box>
        );
      },
    },
  };

  const renderedChatScreen = await testRender(
    <ChatScreen
      selectedModelId="gpt-5.4"
      loadAvailableAssistantModels={async () => []}
      loadPromptContextCandidates={async () => []}
      assistantConversationRunner={neverEmittingAssistantConversationRunner}
      chatScreenSlotPlugins={[slotPlugin]}
    />,
    { width: 100, height: 24 },
  );

  await renderedChatScreen.renderOnce();
  const frame = renderedChatScreen.captureCharFrame();

  expect(frame).toContain("slot-top");
  expect(frame).toContain("slot-model:gpt-5.4");
  expect(frame).toContain("slot-queued:0");
  expect(frame).toContain("slot-overlay");
});
