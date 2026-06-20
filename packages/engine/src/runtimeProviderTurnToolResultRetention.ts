import type {
  AssistantMessageConversationSessionEntry,
  OpenAiProviderTurnReplayInputItem,
  ProviderTurnReplay,
} from "@buli/contracts";

export type RetainedProviderTurnToolResult = Readonly<{
  toolCallId: string;
  retainedToolResultText: string;
}>;

export class RuntimeProviderTurnToolResultRetentionRegistry {
  readonly #retainedToolResultTextByToolCallId = new Map<string, string>();

  registerRetainedToolResult(input: RetainedProviderTurnToolResult): void {
    this.#retainedToolResultTextByToolCallId.set(input.toolCallId, input.retainedToolResultText);
  }

  readRetainedToolResultText(toolCallId: string): string | undefined {
    return this.#retainedToolResultTextByToolCallId.get(toolCallId);
  }

  hasRetainedToolResults(): boolean {
    return this.#retainedToolResultTextByToolCallId.size > 0;
  }
}

export function projectProviderTurnReplayForRetainedToolResults(input: {
  providerTurnReplay: ProviderTurnReplay | undefined;
  toolResultRetentionRegistry: RuntimeProviderTurnToolResultRetentionRegistry;
}): ProviderTurnReplay | undefined {
  if (!input.providerTurnReplay || !input.toolResultRetentionRegistry.hasRetainedToolResults()) {
    return input.providerTurnReplay;
  }

  if (input.providerTurnReplay.provider === "openai") {
    return {
      ...input.providerTurnReplay,
      inputItems: input.providerTurnReplay.inputItems.map((openAiReplayItem) =>
        projectOpenAiProviderTurnReplayInputItem({
          openAiReplayItem,
          toolResultRetentionRegistry: input.toolResultRetentionRegistry,
        })
      ),
    };
  }

  return input.providerTurnReplay;
}

export function projectAssistantMessageProviderTurnReplayForRetainedToolResults(input: {
  assistantMessageConversationSessionEntry: AssistantMessageConversationSessionEntry;
  toolResultRetentionRegistry: RuntimeProviderTurnToolResultRetentionRegistry;
}): AssistantMessageConversationSessionEntry {
  const projectedProviderTurnReplay = projectProviderTurnReplayForRetainedToolResults({
    providerTurnReplay: input.assistantMessageConversationSessionEntry.providerTurnReplay,
    toolResultRetentionRegistry: input.toolResultRetentionRegistry,
  });
  if (projectedProviderTurnReplay === input.assistantMessageConversationSessionEntry.providerTurnReplay) {
    return input.assistantMessageConversationSessionEntry;
  }

  return {
    ...input.assistantMessageConversationSessionEntry,
    ...(projectedProviderTurnReplay !== undefined ? { providerTurnReplay: projectedProviderTurnReplay } : {}),
  };
}

function projectOpenAiProviderTurnReplayInputItem(input: {
  openAiReplayItem: OpenAiProviderTurnReplayInputItem;
  toolResultRetentionRegistry: RuntimeProviderTurnToolResultRetentionRegistry;
}): OpenAiProviderTurnReplayInputItem {
  if (input.openAiReplayItem.type !== "function_call_output") {
    return input.openAiReplayItem;
  }

  const retainedToolResultText = input.toolResultRetentionRegistry.readRetainedToolResultText(input.openAiReplayItem.call_id);
  if (retainedToolResultText === undefined || retainedToolResultText === input.openAiReplayItem.output) {
    return input.openAiReplayItem;
  }

  return {
    ...input.openAiReplayItem,
    output: retainedToolResultText,
  };
}
