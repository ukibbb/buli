import type { ChatSessionFixtureScenario } from "../scenarioShape.ts";

export const simpleUserPromptAndAssistantParagraphReply: ChatSessionFixtureScenario = {
  scenarioName: "simpleUserPromptAndAssistantParagraphReply",
  responseEventSequence: [
    { type: "assistant_turn_started", messageId: "assistant-1", startedAtMs: 1 },
    {
      type: "assistant_message_part_added",
      messageId: "assistant-1",
      part: {
        id: "assistant-text-1",
        partKind: "assistant_text",
        partStatus: "streaming",
        rawMarkdownText: "Hello world",
        completedContentParts: [],
        openContentPart: { kind: "streaming_markdown_text", text: "Hello world" },
      },
    },
    {
      type: "assistant_message_part_added",
      messageId: "assistant-1",
      part: {
        id: "assistant-turn-summary-1",
        partKind: "assistant_turn_summary",
        turnDurationMs: 1200,
        modelDisplayName: "gpt-5.4",
      },
    },
    {
      type: "assistant_message_part_updated",
      messageId: "assistant-1",
      part: {
        id: "assistant-text-1",
        partKind: "assistant_text",
        partStatus: "completed",
        rawMarkdownText: "Hello world",
        completedContentParts: [
          { kind: "paragraph", inlineSpans: [{ spanKind: "plain", spanText: "Hello world" }] },
        ],
      },
    },
    {
      type: "assistant_message_completed",
      messageId: "assistant-1",
      usage: { total: 10, input: 4, output: 5, reasoning: 1, cache: { read: 0, write: 0 } },
    },
  ],
  expectedConversationMessages: [
    {
      role: "assistant",
      messageStatus: "completed",
      partKinds: ["assistant_text", "assistant_turn_summary"],
    },
  ],
  expectedConversationTurnStatus: "waiting_for_user_input",
};
