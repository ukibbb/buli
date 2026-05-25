import type { ProviderRequestedToolCall, TokenUsage, ToolCallRequest } from "@buli/contracts";
import { classifyOpenAiProviderFunctionCallIntents } from "./openAiProviderFunctionCallIntentClassification.ts";
import type { OpenAiProviderFunctionCallIntent } from "./toolDefinitions.ts";

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

export type OpenAiResponseStepProviderFunctionCallsRequestedState = {
  terminalKind: "provider_function_calls_requested";
  providerFunctionCallIntents: OpenAiProviderFunctionCallIntent[];
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
  | OpenAiResponseStepProviderFunctionCallsRequestedState
  | OpenAiResponseStepCompletedState
  | OpenAiResponseStepIncompleteState;

export type OpenAiResponseStepToolCallTerminalState =
  | OpenAiResponseStepToolCallRequestedState
  | OpenAiResponseStepToolCallsRequestedState;

export type OpenAiResponseStepProviderFunctionCallTerminalState =
  | OpenAiResponseStepToolCallTerminalState
  | OpenAiResponseStepProviderFunctionCallsRequestedState;

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

export function createOpenAiResponseStepProviderFunctionCallTerminalState(input: {
  providerFunctionCallIntents: readonly OpenAiProviderFunctionCallIntent[];
  responseOutputItems: unknown[];
  usage: TokenUsage;
}): OpenAiResponseStepProviderFunctionCallTerminalState {
  const providerFunctionCallIntentClassification = classifyOpenAiProviderFunctionCallIntents(input.providerFunctionCallIntents);
  if (providerFunctionCallIntentClassification.hasOnlyExecutableToolCallIntents) {
    return createOpenAiResponseStepToolCallTerminalState({
      requestedToolCalls: providerFunctionCallIntentClassification.requestedToolCalls,
      responseOutputItems: input.responseOutputItems,
      usage: input.usage,
    });
  }

  return {
    terminalKind: "provider_function_calls_requested",
    providerFunctionCallIntents: [...input.providerFunctionCallIntents],
    responseOutputItems: input.responseOutputItems,
    usage: input.usage,
  };
}

export function chooseOpenAiResponseStepTerminalKind(input: {
  requestedToolCallCount: number;
  invalidFunctionCallCount?: number | undefined;
  fallbackTerminalKind: "completed" | "incomplete";
}): OpenAiResponseStepTerminalKind {
  if ((input.invalidFunctionCallCount ?? 0) > 0) {
    return "provider_function_calls_requested";
  }

  if (input.requestedToolCallCount > 1) {
    return "tool_calls_requested";
  }

  if (input.requestedToolCallCount === 1) {
    return "tool_call_requested";
  }

  return input.fallbackTerminalKind;
}
