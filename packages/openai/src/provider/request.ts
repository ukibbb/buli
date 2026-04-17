import type { BashToolCallRequest, ModelContextItem } from "@buli/contracts";

type OpenAiInputItem =
  | {
      role: "user" | "assistant";
      content: Array<{
        type: "input_text";
        text: string;
      }>;
    }
  | {
      type: "function_call";
      call_id: string;
      name: string;
      arguments: string;
    }
  | {
      type: "function_call_output";
      call_id: string;
      output: string;
    };

export function createOpenAiResponsesInputItems(modelContextItems: readonly ModelContextItem[]): OpenAiInputItem[] {
  return modelContextItems.map((modelContextItem) => {
    if (modelContextItem.itemKind === "user_message") {
      return createMessageInputItem("user", modelContextItem.messageText);
    }

    if (modelContextItem.itemKind === "assistant_message") {
      return createMessageInputItem("assistant", modelContextItem.messageText);
    }

    if (modelContextItem.itemKind === "tool_call") {
      return createFunctionCallInputItem(modelContextItem.toolCallId, modelContextItem.toolCallRequest as BashToolCallRequest);
    }

    return createFunctionCallOutputInputItem(modelContextItem.toolCallId, modelContextItem.toolResultText);
  });
}

export function createFunctionCallOutputInputItem(toolCallId: string, toolResultText: string): OpenAiInputItem {
  return {
    type: "function_call_output",
    call_id: toolCallId,
    output: toolResultText,
  };
}

function createMessageInputItem(role: "user" | "assistant", messageText: string): OpenAiInputItem {
  return {
    role,
    content: [
      {
        type: "input_text",
        text: messageText,
      },
    ],
  };
}

function createFunctionCallInputItem(toolCallId: string, bashToolCallRequest: BashToolCallRequest): OpenAiInputItem {
  return {
    type: "function_call",
    call_id: toolCallId,
    name: "bash",
    arguments: JSON.stringify({
      command: bashToolCallRequest.shellCommand,
      description: bashToolCallRequest.commandDescription,
      ...(bashToolCallRequest.workingDirectoryPath ? { workdir: bashToolCallRequest.workingDirectoryPath } : {}),
      ...(bashToolCallRequest.timeoutMilliseconds ? { timeout: bashToolCallRequest.timeoutMilliseconds } : {}),
    }),
  };
}
