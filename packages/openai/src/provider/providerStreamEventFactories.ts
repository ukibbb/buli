import type {
  ProviderRequestedToolCall,
  ProviderStreamEvent,
  TokenUsage,
  ToolCallRequest,
} from "@buli/contracts";
import { classifyOpenAiProviderFunctionCallIntents } from "./openAiProviderFunctionCallIntentClassification.ts";
import type {
  OpenAiCodeExecutionWalkthroughPresentationFunctionCallIntent,
  OpenAiProviderFunctionCallIntent,
} from "./toolDefinitions.ts";

export function createProviderTextChunkEvent(text: string): ProviderStreamEvent {
  return { type: "text_chunk", text };
}

export function createProviderToolCallRequestedEvent(toolCallId: string, toolCallRequest: ToolCallRequest): ProviderStreamEvent {
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

function createProviderCodeExecutionWalkthroughPresentedEvent(
  providerFunctionCallIntent: OpenAiCodeExecutionWalkthroughPresentationFunctionCallIntent,
): ProviderStreamEvent {
  return {
    type: "code_execution_walkthrough_presented",
    presentationCallId: providerFunctionCallIntent.functionCallId,
    codeExecutionWalkthrough: providerFunctionCallIntent.codeExecutionWalkthrough,
  };
}

export function createProviderFunctionCallIntentEvents(
  providerFunctionCallIntents: readonly OpenAiProviderFunctionCallIntent[],
): ProviderStreamEvent[] {
  const providerFunctionCallIntentClassification = classifyOpenAiProviderFunctionCallIntents(providerFunctionCallIntents);
  const codeExecutionWalkthroughPresentedEvents = providerFunctionCallIntentClassification.presentationFunctionCallIntents.map(
    createProviderCodeExecutionWalkthroughPresentedEvent,
  );

  return [
    ...codeExecutionWalkthroughPresentedEvents,
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
