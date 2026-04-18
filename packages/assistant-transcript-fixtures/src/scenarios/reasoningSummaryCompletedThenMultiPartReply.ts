import type { AssistantTranscriptScenario } from "../scenarioShape.ts";

export const reasoningSummaryCompletedThenMultiPartReply: AssistantTranscriptScenario = {
  scenarioName: "reasoningSummaryCompletedThenMultiPartReply",
  responseEventSequence: [
    { type: "assistant_response_started", model: "o3" },
    { type: "assistant_reasoning_summary_started" },
    { type: "assistant_reasoning_summary_text_chunk", text: "I should outline the steps." },
    { type: "assistant_reasoning_summary_completed", reasoningDurationMs: 1500 },
    { type: "assistant_response_text_chunk", text: "# Overview\n\nHere are the details:\n\n- First item\n- Second item" },
    {
      type: "assistant_response_completed",
      message: {
        id: "m-reasoning-multipart-1",
        role: "assistant",
        text: "# Overview\n\nHere are the details:\n\n- First item\n- Second item",
        assistantContentParts: [
          { kind: "heading", headingLevel: 1, inlineSpans: [{ spanKind: "plain", spanText: "Overview" }] },
          { kind: "paragraph", inlineSpans: [{ spanKind: "plain", spanText: "Here are the details:" }] },
          {
            kind: "bulleted_list",
            itemSpanArrays: [
              [{ spanKind: "plain", spanText: "First item" }],
              [{ spanKind: "plain", spanText: "Second item" }],
            ],
          },
        ],
      },
      usage: { input: 20, output: 15, reasoning: 120, cache: { read: 0, write: 0 } },
    },
  ],
  expectedConversationTranscriptEntries: [
    {
      kind: "completed_reasoning_summary",
      reasoningSummaryText: "I should outline the steps.",
      reasoningDurationMs: 1500,
      reasoningTokenCount: 120,
    },
    {
      kind: "message",
      role: "assistant",
      text: "# Overview\n\nHere are the details:\n\n- First item\n- Second item",
      assistantContentParts: [
        { kind: "heading", headingLevel: 1, inlineSpans: [{ spanKind: "plain", spanText: "Overview" }] },
        { kind: "paragraph", inlineSpans: [{ spanKind: "plain", spanText: "Here are the details:" }] },
        {
          kind: "bulleted_list",
          itemSpanArrays: [
            [{ spanKind: "plain", spanText: "First item" }],
            [{ spanKind: "plain", spanText: "Second item" }],
          ],
        },
      ],
    },
  ],
};
