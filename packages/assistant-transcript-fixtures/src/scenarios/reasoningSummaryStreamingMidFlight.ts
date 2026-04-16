import type { AssistantTranscriptScenario } from "../scenarioShape.ts";

export const reasoningSummaryStreamingMidFlight: AssistantTranscriptScenario = {
  scenarioName: "reasoningSummaryStreamingMidFlight",
  responseEventSequence: [
    { type: "assistant_response_started", model: "o3" },
    { type: "assistant_reasoning_summary_started" },
    { type: "assistant_reasoning_summary_text_chunk", text: "Let me think about" },
    { type: "assistant_reasoning_summary_text_chunk", text: " this carefully..." },
  ],
  expectedConversationTranscriptEntries: [
    {
      kind: "streaming_reasoning_summary",
      reasoningSummaryText: "Let me think about this carefully...",
    },
  ],
};
