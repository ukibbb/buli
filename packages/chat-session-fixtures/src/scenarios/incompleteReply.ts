import type { ChatSessionFixtureScenario } from "../scenarioShape.ts";

export const incompleteReply: ChatSessionFixtureScenario = {
  scenarioName: "incompleteReply",
  responseEventSequence: [
    { type: "assistant_turn_started", messageId: "assistant-1", startedAtMs: 1 },
    {
      type: "assistant_message_part_added",
      messageId: "assistant-1",
      part: {
        id: "assistant-text-1",
        partKind: "assistant_text",
        partStatus: "streaming",
        rawMarkdownText: "Partial answer",
        completedContentParts: [],
        openContentPart: { kind: "streaming_markdown_text", text: "Partial answer" },
      },
    },
    {
      type: "assistant_message_incomplete",
      messageId: "assistant-1",
      incompleteReason: "max_output_tokens",
      usage: { total: 24, input: 20, output: 3, reasoning: 1, cache: { read: 0, write: 0 } },
    },
  ],
  expectedConversationMessages: [
    {
      role: "assistant",
      messageStatus: "incomplete",
      partKinds: ["assistant_text", "assistant_incomplete_notice"],
    },
  ],
  expectedConversationTurnStatus: "waiting_for_user_input",
};
