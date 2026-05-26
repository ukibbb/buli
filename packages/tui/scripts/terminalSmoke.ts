import type { AssistantConversationRunner } from "@buli/engine";
import { renderChatScreenInTerminal } from "../src/index.ts";

const smokeAssistantConversationRunner: AssistantConversationRunner = {
  startConversationTurn() {
    return {
      async *streamAssistantResponseEvents() {},
      async approvePendingToolCall() {},
      async denyPendingToolCall() {},
      interrupt() {},
    };
  },
};

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.log("Skipping terminal smoke: stdin and stdout must both be attached to a TTY.");
  process.exit(0);
}

const chatScreen = await renderChatScreenInTerminal({
  selectedModelId: "terminal-smoke-model",
  loadAvailableAssistantModels: async () => [],
  loadPromptContextCandidates: async () => [],
  assistantConversationRunner: smokeAssistantConversationRunner,
});

setTimeout(() => {
  chatScreen.destroy();
}, 750);

await chatScreen.waitUntilExit();
console.log("Buli terminal smoke passed: OpenTUI fullscreen renderer mounted and shut down cleanly.");
