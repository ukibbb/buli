import type { ProviderRequestedToolCall, TokenUsage, ToolCallRequest } from "@buli/contracts";

export type OpenAiResponseStepToolCallRequestedState = {
  terminalKind: "tool_call_requested";
  toolCallId: string;
  toolCallRequest: ToolCallRequest;
  responseOutputItems: unknown[];
  usage: TokenUsage;
};

export type OpenAiResponseStepToolCallsRequestedState = {
  terminalKind: "tool_calls_requested";
  requestedToolCalls: ProviderRequestedToolCall[];
  responseOutputItems: unknown[];
  usage: TokenUsage;
};

export type OpenAiResponseStepCompletedState = {
  terminalKind: "completed";
};

export type OpenAiResponseStepIncompleteState = {
  terminalKind: "incomplete";
};

export type OpenAiResponseStepTerminalState =
  | OpenAiResponseStepToolCallRequestedState
  | OpenAiResponseStepToolCallsRequestedState
  | OpenAiResponseStepCompletedState
  | OpenAiResponseStepIncompleteState;

export type OpenAiResponseStepToolCallTerminalState =
  | OpenAiResponseStepToolCallRequestedState
  | OpenAiResponseStepToolCallsRequestedState;

export type OpenAiResponseStepTerminalKind = OpenAiResponseStepTerminalState["terminalKind"];

export function createOpenAiResponseStepToolCallTerminalState(input: {
  requestedToolCalls: readonly ProviderRequestedToolCall[];
  responseOutputItems: unknown[];
  usage: TokenUsage;
}): OpenAiResponseStepToolCallTerminalState {
  if (input.requestedToolCalls.length === 1) {
    const requestedToolCall = input.requestedToolCalls[0];
    if (!requestedToolCall) {
      throw new Error("OpenAI stream tried to finish an empty tool-call batch.");
    }

    return {
      terminalKind: "tool_call_requested",
      toolCallId: requestedToolCall.toolCallId,
      toolCallRequest: requestedToolCall.toolCallRequest,
      responseOutputItems: input.responseOutputItems,
      usage: input.usage,
    };
  }

  return {
    terminalKind: "tool_calls_requested",
    requestedToolCalls: [...input.requestedToolCalls],
    responseOutputItems: input.responseOutputItems,
    usage: input.usage,
  };
}

export function chooseOpenAiResponseStepTerminalKind(input: {
  requestedToolCallCount: number;
  fallbackTerminalKind: "completed" | "incomplete";
}): OpenAiResponseStepTerminalKind {
  if (input.requestedToolCallCount > 1) {
    return "tool_calls_requested";
  }

  if (input.requestedToolCallCount === 1) {
    return "tool_call_requested";
  }

  return input.fallbackTerminalKind;
}
