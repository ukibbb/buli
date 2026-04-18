import type { AssistantTranscriptScenario } from "../scenarioShape.ts";

export const assistantReplyWithFencedCodeBlockAndInlineCode: AssistantTranscriptScenario = {
  scenarioName: "assistantReplyWithFencedCodeBlockAndInlineCode",
  responseEventSequence: [
    { type: "assistant_response_started", model: "gpt-5.4" },
    { type: "assistant_response_text_chunk", text: "Use `npm install` to install:\n\n```bash\nnpm install foo\n```" },
    {
      type: "assistant_response_completed",
      message: {
        id: "m-code-1",
        role: "assistant",
        text: "Use `npm install` to install:\n\n```bash\nnpm install foo\n```",
        assistantContentParts: [
          {
            kind: "paragraph",
            inlineSpans: [
              { spanKind: "plain", spanText: "Use " },
              { spanKind: "code", spanText: "npm install" },
              { spanKind: "plain", spanText: " to install:" },
            ],
          },
          {
            kind: "fenced_code_block",
            languageLabel: "bash",
            codeLines: ["npm install foo"],
          },
        ],
      },
      usage: { input: 10, output: 12, reasoning: 0, cache: { read: 0, write: 0 } },
    },
  ],
  expectedConversationTranscriptEntries: [
    {
      kind: "message",
      role: "assistant",
      text: "Use `npm install` to install:\n\n```bash\nnpm install foo\n```",
      assistantContentParts: [
        {
          kind: "paragraph",
          inlineSpans: [
            { spanKind: "plain", spanText: "Use " },
            { spanKind: "code", spanText: "npm install" },
            { spanKind: "plain", spanText: " to install:" },
          ],
        },
        {
          kind: "fenced_code_block",
          languageLabel: "bash",
          codeLines: ["npm install foo"],
        },
      ],
    },
  ],
};
