import type { AssistantTranscriptScenario } from "../scenarioShape.ts";

export const assistantReplyWithCalloutSeverityVariants: AssistantTranscriptScenario = {
  scenarioName: "assistantReplyWithCalloutSeverityVariants",
  responseEventSequence: [
    { type: "assistant_response_started", model: "gpt-5.4" },
    { type: "assistant_response_text_chunk", text: "Four callout variants." },
    {
      type: "assistant_response_completed",
      message: {
        id: "m-callouts-1",
        role: "assistant",
        text: "Four callout variants.",
        assistantContentParts: [
          {
            kind: "callout",
            severity: "info",
            titleText: "Info",
            inlineSpans: [{ spanKind: "plain", spanText: "This is an informational note." }],
          },
          {
            kind: "callout",
            severity: "success",
            titleText: "Success",
            inlineSpans: [{ spanKind: "plain", spanText: "Operation completed successfully." }],
          },
          {
            kind: "callout",
            severity: "warning",
            titleText: "Warning",
            inlineSpans: [{ spanKind: "plain", spanText: "Proceed with caution." }],
          },
          {
            kind: "callout",
            severity: "error",
            titleText: "Error",
            inlineSpans: [{ spanKind: "plain", spanText: "Something went wrong." }],
          },
        ],
      },
      usage: { input: 12, output: 20, reasoning: 0, cache: { read: 0, write: 0 } },
    },
  ],
  expectedConversationTranscriptEntries: [
    {
      kind: "message",
      role: "assistant",
      text: "Four callout variants.",
      assistantContentParts: [
        {
          kind: "callout",
          severity: "info",
          titleText: "Info",
          inlineSpans: [{ spanKind: "plain", spanText: "This is an informational note." }],
        },
        {
          kind: "callout",
          severity: "success",
          titleText: "Success",
          inlineSpans: [{ spanKind: "plain", spanText: "Operation completed successfully." }],
        },
        {
          kind: "callout",
          severity: "warning",
          titleText: "Warning",
          inlineSpans: [{ spanKind: "plain", spanText: "Proceed with caution." }],
        },
        {
          kind: "callout",
          severity: "error",
          titleText: "Error",
          inlineSpans: [{ spanKind: "plain", spanText: "Something went wrong." }],
        },
      ],
    },
  ],
};
