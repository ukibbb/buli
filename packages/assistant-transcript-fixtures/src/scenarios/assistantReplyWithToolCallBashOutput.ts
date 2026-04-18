import type { AssistantTranscriptScenario } from "../scenarioShape.ts";

export const assistantReplyWithToolCallBashOutput: AssistantTranscriptScenario = {
  scenarioName: "assistantReplyWithToolCallBashOutput",
  responseEventSequence: [
    { type: "assistant_response_started", model: "gpt-5.4" },
    {
      type: "assistant_tool_call_started",
      toolCallId: "tc-bash-1",
      toolCallDetail: {
        toolName: "bash",
        commandLine: "bun test --coverage",
      },
    },
    {
      type: "assistant_tool_call_completed",
      toolCallId: "tc-bash-1",
      toolCallDetail: {
        toolName: "bash",
        commandLine: "bun test --coverage",
        exitCode: 0,
        outputLines: [
          { lineKind: "prompt", lineText: "$ bun test --coverage" },
          { lineKind: "stdout", lineText: "bun test v1.2.0" },
          { lineKind: "stdout", lineText: "✓ all tests passed" },
          { lineKind: "stderr", lineText: "warning: coverage threshold not configured" },
        ],
      },
      durationMs: 1200,
    },
  ],
  expectedConversationTranscriptEntries: [
    {
      kind: "completed_tool_call",
      toolCallId: "tc-bash-1",
      toolCallDetail: {
        toolName: "bash",
        commandLine: "bun test --coverage",
        exitCode: 0,
        outputLines: [
          { lineKind: "prompt", lineText: "$ bun test --coverage" },
          { lineKind: "stdout", lineText: "bun test v1.2.0" },
          { lineKind: "stdout", lineText: "✓ all tests passed" },
          { lineKind: "stderr", lineText: "warning: coverage threshold not configured" },
        ],
      },
      durationMs: 1200,
    },
  ],
};
