import type { AssistantTranscriptScenario } from "../scenarioShape.ts";

export const assistantReplyWithToolCallTodoWrite: AssistantTranscriptScenario = {
  scenarioName: "assistantReplyWithToolCallTodoWrite",
  responseEventSequence: [
    { type: "assistant_response_started", model: "gpt-5.4" },
    {
      type: "assistant_tool_call_started",
      toolCallId: "tc-todo-1",
      toolCallDetail: {
        toolName: "todowrite",
        todoItems: [
          { todoItemTitle: "Read existing tests", todoItemStatus: "completed" },
          { todoItemTitle: "Implement feature", todoItemStatus: "in_progress" },
          { todoItemTitle: "Write new tests", todoItemStatus: "pending" },
        ],
      },
    },
    {
      type: "assistant_tool_call_completed",
      toolCallId: "tc-todo-1",
      toolCallDetail: {
        toolName: "todowrite",
        todoItems: [
          { todoItemTitle: "Read existing tests", todoItemStatus: "completed" },
          { todoItemTitle: "Implement feature", todoItemStatus: "in_progress" },
          { todoItemTitle: "Write new tests", todoItemStatus: "pending" },
        ],
      },
      durationMs: 5,
    },
  ],
  expectedConversationTranscriptEntries: [
    {
      kind: "completed_tool_call",
      toolCallId: "tc-todo-1",
      toolCallDetail: {
        toolName: "todowrite",
        todoItems: [
          { todoItemTitle: "Read existing tests", todoItemStatus: "completed" },
          { todoItemTitle: "Implement feature", todoItemStatus: "in_progress" },
          { todoItemTitle: "Write new tests", todoItemStatus: "pending" },
        ],
      },
      durationMs: 5,
    },
  ],
};
