import type { ProviderStreamEvent, ReasoningEffort } from "@buli/contracts";
import {
  createFunctionCallOutputInputItem,
  createOpenAiResponsesInputItems,
  type OpenAiConversationInputItem,
} from "./request.ts";
import { createBashToolDefinition } from "./toolDefinitions.ts";
import { parseOpenAiStream } from "./stream.ts";

type OpenAiStableResponseOutputItem = {
  type: string;
  id?: string;
  [fieldName: string]: unknown;
};

type OpenAiProviderToolResultSubmission = {
  toolCallId: string;
  toolResultText: string;
};

function createHttpRequestBody(input: {
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  systemPromptText: string;
  openAiInputItems: ReadonlyArray<OpenAiConversationInputItem | OpenAiStableResponseOutputItem>;
}) {
  return {
    model: input.selectedModelId,
    instructions: input.systemPromptText,
    store: false,
    input: input.openAiInputItems,
    tools: [createBashToolDefinition()],
    parallel_tool_calls: false,
    ...(input.selectedReasoningEffort ? { reasoning: { effort: input.selectedReasoningEffort } } : {}),
    stream: true,
  };
}

export class OpenAiProviderConversationTurn {
  readonly endpoint: string;
  readonly fetchImpl: typeof fetch;
  readonly loadRequestHeaders: () => Promise<Headers>;
  readonly selectedModelId: string;
  readonly selectedReasoningEffort: ReasoningEffort | undefined;
  readonly systemPromptText: string;
  readonly onStepRequestFailed: (response: Response) => Promise<Error>;
  readonly openAiConversationInputItems: Array<OpenAiConversationInputItem | OpenAiStableResponseOutputItem>;
  currentPendingToolResultSubmission: {
    toolCallId: string;
    resolveSubmission: (toolResultSubmission: OpenAiProviderToolResultSubmission) => void;
  } | undefined;
  queuedToolResultSubmission: OpenAiProviderToolResultSubmission | undefined;
  hasStartedStreamingProviderEvents = false;

  constructor(input: {
    endpoint: string;
    fetchImpl: typeof fetch;
    loadRequestHeaders: () => Promise<Headers>;
    selectedModelId: string;
    selectedReasoningEffort?: ReasoningEffort;
    systemPromptText: string;
    modelContextItems: Parameters<typeof createOpenAiResponsesInputItems>[0];
    onStepRequestFailed: (response: Response) => Promise<Error>;
  }) {
    this.endpoint = input.endpoint;
    this.fetchImpl = input.fetchImpl;
    this.loadRequestHeaders = input.loadRequestHeaders;
    this.selectedModelId = input.selectedModelId;
    this.selectedReasoningEffort = input.selectedReasoningEffort;
    this.systemPromptText = input.systemPromptText;
    this.onStepRequestFailed = input.onStepRequestFailed;
    this.openAiConversationInputItems = createOpenAiResponsesInputItems(input.modelContextItems);
  }

  async submitToolResult(input: OpenAiProviderToolResultSubmission): Promise<void> {
    if (this.currentPendingToolResultSubmission?.toolCallId === input.toolCallId) {
      this.currentPendingToolResultSubmission.resolveSubmission(input);
      this.currentPendingToolResultSubmission = undefined;
      return;
    }

    this.queuedToolResultSubmission = input;
  }

  async *streamProviderEvents(): AsyncGenerator<ProviderStreamEvent> {
    if (this.hasStartedStreamingProviderEvents) {
      throw new Error("Provider turn events can only be streamed once");
    }
    this.hasStartedStreamingProviderEvents = true;

    while (true) {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: await this.loadRequestHeaders(),
        body: JSON.stringify(
          createHttpRequestBody({
            selectedModelId: this.selectedModelId,
            ...(this.selectedReasoningEffort ? { selectedReasoningEffort: this.selectedReasoningEffort } : {}),
            systemPromptText: this.systemPromptText,
            openAiInputItems: this.openAiConversationInputItems,
          }),
        ),
      });

      if (!response.ok) {
        throw await this.onStepRequestFailed(response);
      }

      const openAiStepEventIterator = parseOpenAiStream(response)[Symbol.asyncIterator]();
      let terminalState;
      while (true) {
        const nextStepItem = await openAiStepEventIterator.next();
        if (nextStepItem.done) {
          terminalState = nextStepItem.value;
          break;
        }

        yield nextStepItem.value;
      }

      if (terminalState.terminalKind === "tool_call_requested") {
        this.openAiConversationInputItems.push(...stripTransientIdsFromResponseOutputItems(terminalState.responseOutputItems));
        const toolResultSubmission = await this.waitForToolResultSubmission(terminalState.toolCallId);
        this.openAiConversationInputItems.push(
          createFunctionCallOutputInputItem(toolResultSubmission.toolCallId, toolResultSubmission.toolResultText),
        );
        continue;
      }

      return;
    }
  }

  private waitForToolResultSubmission(toolCallId: string): Promise<OpenAiProviderToolResultSubmission> {
    if (this.queuedToolResultSubmission?.toolCallId === toolCallId) {
      const queuedToolResultSubmission = this.queuedToolResultSubmission;
      this.queuedToolResultSubmission = undefined;
      return Promise.resolve(queuedToolResultSubmission);
    }

    return new Promise<OpenAiProviderToolResultSubmission>((resolveSubmission) => {
      this.currentPendingToolResultSubmission = {
        toolCallId,
        resolveSubmission,
      };
    });
  }
}

function isOpenAiStableResponseOutputItem(value: unknown): value is OpenAiStableResponseOutputItem {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

function stripTransientIdsFromResponseOutputItems(responseOutputItems: readonly unknown[]): OpenAiStableResponseOutputItem[] {
  return responseOutputItems.flatMap((responseOutputItem) => {
    if (!isOpenAiStableResponseOutputItem(responseOutputItem)) {
      return [];
    }

    const { id: _ignoredTransientId, ...stableResponseOutputItem } = responseOutputItem;
    return [stableResponseOutputItem];
  });
}
