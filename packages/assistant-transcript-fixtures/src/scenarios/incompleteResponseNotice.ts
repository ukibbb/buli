import type { AssistantTranscriptScenario } from "../scenarioShape.ts";

export const incompleteResponseNotice: AssistantTranscriptScenario = {
  scenarioName: "incompleteResponseNotice",
  responseEventSequence: [
    { type: "assistant_response_started", model: "gpt-5.4" },
    { type: "assistant_response_text_chunk", text: "Here is a partial" },
    {
      type: "assistant_response_incomplete",
      incompleteReason: "max_output_tokens",
      usage: { input: 10, output: 4096, reasoning: 0, cache: { read: 0, write: 0 } },
    },
  ],
  expectedConversationTranscriptEntries: [
    {
      kind: "message",
      role: "assistant",
      text: "Here is a partial",
    },
    {
      kind: "incomplete_response_notice",
      incompleteReason: "max_output_tokens",
    },
  ],
};
