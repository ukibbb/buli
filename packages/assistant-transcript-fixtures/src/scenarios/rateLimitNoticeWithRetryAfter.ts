import type { AssistantTranscriptScenario } from "../scenarioShape.ts";

export const rateLimitNoticeWithRetryAfter: AssistantTranscriptScenario = {
  scenarioName: "rateLimitNoticeWithRetryAfter",
  responseEventSequence: [
    { type: "assistant_response_started", model: "gpt-5.4" },
    {
      type: "assistant_rate_limit_pending",
      retryAfterSeconds: 30,
      limitExplanation: "Daily token limit reached",
    },
  ],
  expectedConversationTranscriptEntries: [
    {
      kind: "rate_limit_notice",
      retryAfterSeconds: 30,
      limitExplanation: "Daily token limit reached",
    },
  ],
};
