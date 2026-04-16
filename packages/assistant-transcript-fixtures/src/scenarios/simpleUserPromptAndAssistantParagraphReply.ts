import type { AssistantTranscriptScenario } from "../scenarioShape.ts";

export const simpleUserPromptAndAssistantParagraphReply: AssistantTranscriptScenario = {
  scenarioName: "simpleUserPromptAndAssistantParagraphReply",
  responseEventSequence: [
    { type: "assistant_response_started", model: "gpt-5.4" },
    { type: "assistant_response_text_chunk", text: "Hello world" },
    {
      type: "assistant_response_completed",
      message: {
        id: "m-simple-1",
        role: "assistant",
        text: "Hello world",
        assistantContentParts: [
          { kind: "paragraph", inlineSpans: [{ spanKind: "plain", spanText: "Hello world" }] },
        ],
      },
      usage: { input: 5, output: 2, reasoning: 0, cache: { read: 0, write: 0 } },
    },
  ],
  expectedConversationTranscriptEntries: [
    {
      kind: "message",
      role: "assistant",
      text: "Hello world",
      assistantContentParts: [
        { kind: "paragraph", inlineSpans: [{ spanKind: "plain", spanText: "Hello world" }] },
      ],
    },
  ],
};
