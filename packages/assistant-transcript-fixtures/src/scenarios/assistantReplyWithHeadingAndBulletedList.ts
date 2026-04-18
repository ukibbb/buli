import type { AssistantTranscriptScenario } from "../scenarioShape.ts";

export const assistantReplyWithHeadingAndBulletedList: AssistantTranscriptScenario = {
  scenarioName: "assistantReplyWithHeadingAndBulletedList",
  responseEventSequence: [
    { type: "assistant_response_started", model: "gpt-5.4" },
    { type: "assistant_response_text_chunk", text: "# Title\n\n- item one\n- item two" },
    {
      type: "assistant_response_completed",
      message: {
        id: "m-heading-list-1",
        role: "assistant",
        text: "# Title\n\n- item one\n- item two",
        assistantContentParts: [
          { kind: "heading", headingLevel: 1, inlineSpans: [{ spanKind: "plain", spanText: "Title" }] },
          {
            kind: "bulleted_list",
            itemSpanArrays: [
              [{ spanKind: "plain", spanText: "item one" }],
              [{ spanKind: "plain", spanText: "item two" }],
            ],
          },
        ],
      },
      usage: { input: 8, output: 10, reasoning: 0, cache: { read: 0, write: 0 } },
    },
  ],
  expectedConversationTranscriptEntries: [
    {
      kind: "message",
      role: "assistant",
      text: "# Title\n\n- item one\n- item two",
      assistantContentParts: [
        { kind: "heading", headingLevel: 1, inlineSpans: [{ spanKind: "plain", spanText: "Title" }] },
        {
          kind: "bulleted_list",
          itemSpanArrays: [
            [{ spanKind: "plain", spanText: "item one" }],
            [{ spanKind: "plain", spanText: "item two" }],
          ],
        },
      ],
    },
  ],
};
