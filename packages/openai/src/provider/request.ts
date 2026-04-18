import type { BashToolCallRequest, ModelContextItem } from "@buli/contracts";

export type OpenAiConversationMessageInputItem = {
  role: "user" | "assistant";
  content: string;
};

export type OpenAiFunctionCallInputItem = {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
};

export type OpenAiFunctionCallOutputInputItem = {
  type: "function_call_output";
  call_id: string;
  output: string;
};

export type OpenAiConversationInputItem =
  | OpenAiConversationMessageInputItem
  | OpenAiFunctionCallInputItem
  | OpenAiFunctionCallOutputInputItem;

export function createOpenAiResponsesInputItems(modelContextItems: readonly ModelContextItem[]): OpenAiConversationInputItem[] {
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

export function createFunctionCallOutputInputItem(
  toolCallId: string,
  toolResultText: string,
): OpenAiFunctionCallOutputInputItem {
  return {
    type: "function_call_output",
    call_id: toolCallId,
    output: toolResultText,
  };
}

function createMessageInputItem(
  role: "user" | "assistant",
  messageText: string,
): OpenAiConversationMessageInputItem {
  return {
    role,
    content: messageText,
  };
}

function createFunctionCallInputItem(
  toolCallId: string,
  bashToolCallRequest: BashToolCallRequest,
): OpenAiFunctionCallInputItem {
  return {
    type: "function_call",
    call_id: toolCallId,
    name: "bash",
    arguments: JSON.stringify({
      command: bashToolCallRequest.shellCommand,
      description: bashToolCallRequest.commandDescription,
      workdir: bashToolCallRequest.workingDirectoryPath ?? null,
      timeout: bashToolCallRequest.timeoutMilliseconds ?? null,
    }),
  };
}
