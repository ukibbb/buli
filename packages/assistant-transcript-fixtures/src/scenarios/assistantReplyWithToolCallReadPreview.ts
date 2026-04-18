import type { AssistantTranscriptScenario } from "../scenarioShape.ts";

export const assistantReplyWithToolCallReadPreview: AssistantTranscriptScenario = {
  scenarioName: "assistantReplyWithToolCallReadPreview",
  responseEventSequence: [
    { type: "assistant_response_started", model: "gpt-5.4" },
    {
      type: "assistant_tool_call_started",
      toolCallId: "tc-read-1",
      toolCallDetail: {
        toolName: "read",
        readFilePath: "/src/index.ts",
      },
    },
    {
      type: "assistant_tool_call_completed",
      toolCallId: "tc-read-1",
      toolCallDetail: {
        toolName: "read",
        readFilePath: "/src/index.ts",
        readLineCount: 3,
        readByteCount: 60,
        previewLines: [
          { lineNumber: 1, lineText: "export * from './foo.ts';" },
          { lineNumber: 2, lineText: "export * from './bar.ts';" },
          { lineNumber: 3, lineText: "export * from './baz.ts';" },
        ],
      },
      durationMs: 42,
    },
  ],
  expectedConversationTranscriptEntries: [
    {
      kind: "completed_tool_call",
      toolCallId: "tc-read-1",
      toolCallDetail: {
        toolName: "read",
        readFilePath: "/src/index.ts",
        readLineCount: 3,
        readByteCount: 60,
        previewLines: [
          { lineNumber: 1, lineText: "export * from './foo.ts';" },
          { lineNumber: 2, lineText: "export * from './bar.ts';" },
          { lineNumber: 3, lineText: "export * from './baz.ts';" },
        ],
      },
      durationMs: 42,
    },
  ],
};
