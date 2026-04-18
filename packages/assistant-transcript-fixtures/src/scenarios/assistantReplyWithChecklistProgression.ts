import type { AssistantTranscriptScenario } from "../scenarioShape.ts";

export const assistantReplyWithChecklistProgression: AssistantTranscriptScenario = {
  scenarioName: "assistantReplyWithChecklistProgression",
  responseEventSequence: [
    { type: "assistant_response_started", model: "gpt-5.4" },
    { type: "assistant_response_text_chunk", text: "- [ ] Write tests\n- [x] Set up project" },
    {
      type: "assistant_response_completed",
      message: {
        id: "m-checklist-1",
        role: "assistant",
        text: "- [ ] Write tests\n- [x] Set up project",
        assistantContentParts: [
          {
            kind: "checklist",
            items: [
              { itemTitle: "Write tests", itemStatus: "pending" },
              { itemTitle: "Set up project", itemStatus: "completed" },
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
      text: "- [ ] Write tests\n- [x] Set up project",
      assistantContentParts: [
        {
          kind: "checklist",
          items: [
            { itemTitle: "Write tests", itemStatus: "pending" },
            { itemTitle: "Set up project", itemStatus: "completed" },
          ],
        },
      ],
    },
  ],
};
