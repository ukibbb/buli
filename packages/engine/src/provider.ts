import type { ProviderStreamEvent, ReasoningEffort } from "@buli/contracts";

export type AssistantResponseRequest = {
  promptText: string;
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
};

export interface AssistantResponseProvider {
  streamAssistantResponse(input: AssistantResponseRequest): AsyncIterable<ProviderStreamEvent>;
}
