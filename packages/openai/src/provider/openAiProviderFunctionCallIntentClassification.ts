import type { ProviderRequestedToolCall } from "@buli/contracts";
import type {
  OpenAiExecutableToolCallIntent,
  OpenAiInvalidFunctionCallIntent,
  OpenAiProviderFunctionCallIntent,
} from "./toolDefinitions.ts";

export type OpenAiProviderFunctionCallIntentClassification = {
  readonly executableToolCallIntents: OpenAiExecutableToolCallIntent[];
  readonly invalidFunctionCallIntents: OpenAiInvalidFunctionCallIntent[];
  readonly requestedToolCalls: ProviderRequestedToolCall[];
  readonly hasOnlyExecutableToolCallIntents: boolean;
};

export function classifyOpenAiProviderFunctionCallIntents(
  providerFunctionCallIntents: readonly OpenAiProviderFunctionCallIntent[],
): OpenAiProviderFunctionCallIntentClassification {
  const executableToolCallIntents: OpenAiExecutableToolCallIntent[] = [];
  const invalidFunctionCallIntents: OpenAiInvalidFunctionCallIntent[] = [];
  const requestedToolCalls: ProviderRequestedToolCall[] = [];

  for (const providerFunctionCallIntent of providerFunctionCallIntents) {
    switch (providerFunctionCallIntent.intentKind) {
      case "executable_tool":
        executableToolCallIntents.push(providerFunctionCallIntent);
        requestedToolCalls.push({
          toolCallId: providerFunctionCallIntent.functionCallId,
          toolCallRequest: providerFunctionCallIntent.toolCallRequest,
        });
        break;
      case "invalid_function_call":
        invalidFunctionCallIntents.push(providerFunctionCallIntent);
        break;
      default:
        assertUnhandledOpenAiProviderFunctionCallIntent(providerFunctionCallIntent);
    }
  }

  return {
    executableToolCallIntents,
    invalidFunctionCallIntents,
    requestedToolCalls,
    hasOnlyExecutableToolCallIntents: executableToolCallIntents.length === providerFunctionCallIntents.length,
  };
}

function assertUnhandledOpenAiProviderFunctionCallIntent(providerFunctionCallIntent: never): never {
  throw new Error(`Unhandled OpenAI provider function-call intent: ${String(providerFunctionCallIntent)}`);
}
