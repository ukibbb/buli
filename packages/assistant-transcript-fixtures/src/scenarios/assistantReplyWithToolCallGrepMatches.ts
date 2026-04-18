import type { AssistantTranscriptScenario } from "../scenarioShape.ts";

export const assistantReplyWithToolCallGrepMatches: AssistantTranscriptScenario = {
  scenarioName: "assistantReplyWithToolCallGrepMatches",
  responseEventSequence: [
    { type: "assistant_response_started", model: "gpt-5.4" },
    {
      type: "assistant_tool_call_started",
      toolCallId: "tc-grep-1",
      toolCallDetail: {
        toolName: "grep",
        searchPattern: "useEffect",
      },
    },
    {
      type: "assistant_tool_call_completed",
      toolCallId: "tc-grep-1",
      toolCallDetail: {
        toolName: "grep",
        searchPattern: "useEffect",
        matchedFileCount: 2,
        totalMatchCount: 3,
        matchHits: [
          { matchFilePath: "/src/App.tsx", matchLineNumber: 12, matchSnippet: "  useEffect(() => {" },
          { matchFilePath: "/src/App.tsx", matchLineNumber: 25, matchSnippet: "  useEffect(() => {" },
          { matchFilePath: "/src/Header.tsx", matchLineNumber: 8, matchSnippet: "  useEffect(() => {" },
        ],
      },
      durationMs: 18,
    },
  ],
  expectedConversationTranscriptEntries: [
    {
      kind: "completed_tool_call",
      toolCallId: "tc-grep-1",
      toolCallDetail: {
        toolName: "grep",
        searchPattern: "useEffect",
        matchedFileCount: 2,
        totalMatchCount: 3,
        matchHits: [
          { matchFilePath: "/src/App.tsx", matchLineNumber: 12, matchSnippet: "  useEffect(() => {" },
          { matchFilePath: "/src/App.tsx", matchLineNumber: 25, matchSnippet: "  useEffect(() => {" },
          { matchFilePath: "/src/Header.tsx", matchLineNumber: 8, matchSnippet: "  useEffect(() => {" },
        ],
      },
      durationMs: 18,
    },
  ],
};
