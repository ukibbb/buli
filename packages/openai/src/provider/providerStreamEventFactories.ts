import type {
  ProviderRequestedToolCall,
  ProviderStreamEvent,
  TokenUsage,
  AssistantToolCallRequest,
} from "@buli/contracts";
import { classifyOpenAiProviderFunctionCallIntents } from "./openAiProviderFunctionCallIntentClassification.ts";
import type { OpenAiProviderFunctionCallIntent } from "./toolDefinitions.ts";

export function createProviderTextChunkEvent(text: string): ProviderStreamEvent {
  return { type: "text_chunk", text };
}

export function createProviderToolCallRequestedEvent(toolCallId: string, toolCallRequest: AssistantToolCallRequest): ProviderStreamEvent {
  return { type: "tool_call_requested", toolCallId, toolCallRequest };
}

export function createProviderToolCallsRequestedEvent(
  requestedToolCalls: readonly ProviderRequestedToolCall[],
): ProviderStreamEvent {
  if (requestedToolCalls.length === 1) {
    const requestedToolCall = requestedToolCalls[0];
    if (!requestedToolCall) {
      throw new Error("OpenAI stream tried to emit an empty tool-call batch.");
    }

    return createProviderToolCallRequestedEvent(requestedToolCall.toolCallId, requestedToolCall.toolCallRequest);
  }

  return {
    type: "tool_calls_requested",
    requestedToolCalls: [...requestedToolCalls],
  };
}

export function createProviderFunctionCallIntentEvents(
  providerFunctionCallIntents: readonly OpenAiProviderFunctionCallIntent[],
): ProviderStreamEvent[] {
  const providerFunctionCallIntentClassification = classifyOpenAiProviderFunctionCallIntents(providerFunctionCallIntents);

  return [
    ...(providerFunctionCallIntentClassification.requestedToolCalls.length > 0
      ? [createProviderToolCallsRequestedEvent(providerFunctionCallIntentClassification.requestedToolCalls)]
      : []),
  ];
}

export function createProviderCompletedEvent(usage: TokenUsage): ProviderStreamEvent {
  return {
    type: "completed",
    usage,
  };
}

export function createProviderIncompleteEvent(input: {
  incompleteReason: string;
  usage: TokenUsage;
}): ProviderStreamEvent {
  return {
    type: "incomplete",
    incompleteReason: input.incompleteReason,
    usage: input.usage,
  };
}
