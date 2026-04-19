import type { ChatSessionFixtureScenario } from "../scenarioShape.ts";

export const reasoningAndTextReply: ChatSessionFixtureScenario = {
  scenarioName: "reasoningAndTextReply",
  responseEventSequence: [
    { type: "assistant_turn_started", messageId: "assistant-1", startedAtMs: 1 },
    {
      type: "assistant_message_part_added",
      messageId: "assistant-1",
      part: {
        id: "reasoning-1",
        partKind: "assistant_reasoning",
        partStatus: "streaming",
        reasoningSummaryText: "Thinking",
        reasoningStartedAtMs: 1,
      },
    },
    {
      type: "assistant_message_part_updated",
      messageId: "assistant-1",
      part: {
        id: "reasoning-1",
        partKind: "assistant_reasoning",
        partStatus: "completed",
        reasoningSummaryText: "Thinking",
        reasoningStartedAtMs: 1,
        reasoningDurationMs: 500,
      },
    },
    {
      type: "assistant_message_part_added",
      messageId: "assistant-1",
      part: {
        id: "assistant-text-1",
        partKind: "assistant_text",
        partStatus: "streaming",
        rawMarkdownText: "Because.",
        completedContentParts: [],
        openContentPart: { kind: "streaming_markdown_text", text: "Because." },
      },
    },
    {
      type: "assistant_message_completed",
      messageId: "assistant-1",
      usage: { total: 12, input: 5, output: 5, reasoning: 2, cache: { read: 0, write: 0 } },
    },
  ],
  expectedConversationMessages: [
    {
      role: "assistant",
      messageStatus: "completed",
      partKinds: ["assistant_reasoning", "assistant_text"],
    },
  ],
  expectedConversationTurnStatus: "waiting_for_user_input",
};
