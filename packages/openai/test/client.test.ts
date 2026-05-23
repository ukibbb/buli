import { expect, test } from "bun:test";
import { OpenAiProvider } from "../src/provider/client.ts";

test("OpenAiProvider applies default hard turn limits", () => {
  const provider = new OpenAiProvider({ endpoint: "https://example.test/v1/responses" });

  const providerTurn = provider.startConversationTurn({
    systemPromptText: "You are buli.",
    conversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Inspect the project",
        modelFacingPromptText: "Inspect the project",
      },
    ],
    selectedModelId: "gpt-5.4",
  });

  expect(providerTurn.maxResponseStepsPerTurn).toBe(64);
  expect(providerTurn.maxToolCallsPerTurn).toBe(256);
});
