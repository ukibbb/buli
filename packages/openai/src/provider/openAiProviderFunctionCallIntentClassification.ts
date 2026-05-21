import type { ProviderRequestedToolCall } from "@buli/contracts";
import type {
  OpenAiCodeExecutionWalkthroughPresentationFunctionCallIntent,
  OpenAiExecutableToolCallIntent,
  OpenAiProviderFunctionCallIntent,
} from "./toolDefinitions.ts";

export type OpenAiProviderFunctionCallIntentClassification = {
  readonly executableToolCallIntents: OpenAiExecutableToolCallIntent[];
  readonly requestedToolCalls: ProviderRequestedToolCall[];
  readonly presentationFunctionCallIntents: OpenAiCodeExecutionWalkthroughPresentationFunctionCallIntent[];
  readonly hasOnlyExecutableToolCallIntents: boolean;
};

export function classifyOpenAiProviderFunctionCallIntents(
  providerFunctionCallIntents: readonly OpenAiProviderFunctionCallIntent[],
): OpenAiProviderFunctionCallIntentClassification {
  const executableToolCallIntents: OpenAiExecutableToolCallIntent[] = [];
  const requestedToolCalls: ProviderRequestedToolCall[] = [];
  const presentationFunctionCallIntents: OpenAiCodeExecutionWalkthroughPresentationFunctionCallIntent[] = [];

  for (const providerFunctionCallIntent of providerFunctionCallIntents) {
    switch (providerFunctionCallIntent.intentKind) {
      case "executable_tool":
        executableToolCallIntents.push(providerFunctionCallIntent);
        requestedToolCalls.push({
          toolCallId: providerFunctionCallIntent.functionCallId,
          toolCallRequest: providerFunctionCallIntent.toolCallRequest,
        });
        break;
      case "code_execution_walkthrough_presentation":
        presentationFunctionCallIntents.push(providerFunctionCallIntent);
        break;
      default:
        assertUnhandledOpenAiProviderFunctionCallIntent(providerFunctionCallIntent);
    }
  }

  return {
    executableToolCallIntents,
    requestedToolCalls,
    presentationFunctionCallIntents,
    hasOnlyExecutableToolCallIntents: executableToolCallIntents.length === providerFunctionCallIntents.length,
  };
}

function assertUnhandledOpenAiProviderFunctionCallIntent(providerFunctionCallIntent: never): never {
  throw new Error(`Unhandled OpenAI provider function-call intent: ${String(providerFunctionCallIntent)}`);
}
