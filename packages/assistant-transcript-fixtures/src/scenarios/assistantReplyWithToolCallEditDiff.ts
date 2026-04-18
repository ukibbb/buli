import type { AssistantTranscriptScenario } from "../scenarioShape.ts";

export const assistantReplyWithToolCallEditDiff: AssistantTranscriptScenario = {
  scenarioName: "assistantReplyWithToolCallEditDiff",
  responseEventSequence: [
    { type: "assistant_response_started", model: "gpt-5.4" },
    {
      type: "assistant_tool_call_started",
      toolCallId: "tc-edit-1",
      toolCallDetail: {
        toolName: "edit",
        editedFilePath: "/src/utils.ts",
      },
    },
    {
      type: "assistant_tool_call_completed",
      toolCallId: "tc-edit-1",
      toolCallDetail: {
        toolName: "edit",
        editedFilePath: "/src/utils.ts",
        addedLineCount: 2,
        removedLineCount: 1,
        diffLines: [
          { lineNumber: 5, lineKind: "context", lineText: "export function add(a: number, b: number) {" },
          { lineNumber: 6, lineKind: "removal", lineText: "  return a + b" },
          { lineNumber: 6, lineKind: "addition", lineText: "  return a + b;" },
          { lineNumber: 7, lineKind: "addition", lineText: "}" },
          { lineNumber: 8, lineKind: "context", lineText: "" },
        ],
      },
      durationMs: 55,
    },
  ],
  expectedConversationTranscriptEntries: [
    {
      kind: "completed_tool_call",
      toolCallId: "tc-edit-1",
      toolCallDetail: {
        toolName: "edit",
        editedFilePath: "/src/utils.ts",
        addedLineCount: 2,
        removedLineCount: 1,
        diffLines: [
          { lineNumber: 5, lineKind: "context", lineText: "export function add(a: number, b: number) {" },
          { lineNumber: 6, lineKind: "removal", lineText: "  return a + b" },
          { lineNumber: 6, lineKind: "addition", lineText: "  return a + b;" },
          { lineNumber: 7, lineKind: "addition", lineText: "}" },
          { lineNumber: 8, lineKind: "context", lineText: "" },
        ],
      },
      durationMs: 55,
    },
  ],
};
