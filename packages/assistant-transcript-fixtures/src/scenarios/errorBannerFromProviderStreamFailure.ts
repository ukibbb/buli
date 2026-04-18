import type { AssistantTranscriptScenario } from "../scenarioShape.ts";

export const errorBannerFromProviderStreamFailure: AssistantTranscriptScenario = {
  scenarioName: "errorBannerFromProviderStreamFailure",
  responseEventSequence: [
    { type: "assistant_response_started", model: "gpt-5.4" },
    {
      type: "assistant_response_failed",
      error: "Provider stream ended before completion",
    },
  ],
  expectedConversationTranscriptEntries: [
    {
      kind: "error",
      text: "Provider stream ended before completion",
    },
  ],
};
