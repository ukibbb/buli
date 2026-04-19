import type {
  ConversationSessionEntry,
  OpenAiProviderTurnReplay,
  OpenAiProviderTurnReplayInputItem,
  ProviderStreamEvent,
  ReasoningEffort,
} from "@buli/contracts";
import {
  createFunctionCallOutputInputItem,
  createOpenAiResponseReplayItems,
  createOpenAiResponsesInputItems,
  type OpenAiConversationInputItem,
} from "./request.ts";
import { writeOpenAiDebugLog } from "./debugLog.ts";
import { createBashToolDefinition } from "./toolDefinitions.ts";
import { parseOpenAiStream } from "./stream.ts";

type OpenAiProviderToolResultSubmission = {
  toolCallId: string;
  toolResultText: string;
};

type HttpErrorDebugResponse = {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
};

function createHttpRequestBody(input: {
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  systemPromptText: string;
  openAiInputItems: ReadonlyArray<OpenAiConversationInputItem>;
}) {
  return {
    model: input.selectedModelId,
    instructions: input.systemPromptText,
    store: false,
    input: input.openAiInputItems,
    tools: [createBashToolDefinition()],
    parallel_tool_calls: false,
    ...(shouldIncludeReasoningEncryptedContent(input) ? { include: ["reasoning.encrypted_content"] } : {}),
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
  readonly openAiConversationInputItems: OpenAiConversationInputItem[];
  readonly providerTurnReplayInputItems: OpenAiProviderTurnReplayInputItem[];
  readonly queuedToolResultSubmissionByToolCallId: Map<string, OpenAiProviderToolResultSubmission>;
  readonly pendingToolResultSubmissionResolverByToolCallId: Map<
    string,
    (toolResultSubmission: OpenAiProviderToolResultSubmission) => void
  >;
  hasStartedStreamingProviderEvents = false;

  constructor(input: {
    endpoint: string;
    fetchImpl: typeof fetch;
    loadRequestHeaders: () => Promise<Headers>;
    selectedModelId: string;
    selectedReasoningEffort?: ReasoningEffort;
    systemPromptText: string;
    conversationSessionEntries: readonly ConversationSessionEntry[];
    onStepRequestFailed: (response: Response) => Promise<Error>;
  }) {
    this.endpoint = input.endpoint;
    this.fetchImpl = input.fetchImpl;
    this.loadRequestHeaders = input.loadRequestHeaders;
    this.selectedModelId = input.selectedModelId;
    this.selectedReasoningEffort = input.selectedReasoningEffort;
    this.systemPromptText = input.systemPromptText;
    this.onStepRequestFailed = input.onStepRequestFailed;
    this.openAiConversationInputItems = createOpenAiResponsesInputItems(input.conversationSessionEntries);
    this.providerTurnReplayInputItems = [];
    this.queuedToolResultSubmissionByToolCallId = new Map<string, OpenAiProviderToolResultSubmission>();
    this.pendingToolResultSubmissionResolverByToolCallId = new Map<
      string,
      (toolResultSubmission: OpenAiProviderToolResultSubmission) => void
    >();
  }

  async submitToolResult(input: OpenAiProviderToolResultSubmission): Promise<void> {
    const resolveSubmission = this.pendingToolResultSubmissionResolverByToolCallId.get(input.toolCallId);
    if (resolveSubmission) {
      this.pendingToolResultSubmissionResolverByToolCallId.delete(input.toolCallId);
      resolveSubmission(input);
      return;
    }

    this.queuedToolResultSubmissionByToolCallId.set(input.toolCallId, input);
  }

  getProviderTurnReplay(): OpenAiProviderTurnReplay | undefined {
    if (this.providerTurnReplayInputItems.length === 0) {
      return undefined;
    }

    return {
      provider: "openai",
      inputItems: [...this.providerTurnReplayInputItems],
    };
  }

  async *streamProviderEvents(): AsyncGenerator<ProviderStreamEvent> {
    if (this.hasStartedStreamingProviderEvents) {
      throw new Error("Provider turn events can only be streamed once");
    }
    this.hasStartedStreamingProviderEvents = true;

    while (true) {
      const requestBody = createHttpRequestBody({
        selectedModelId: this.selectedModelId,
        ...(this.selectedReasoningEffort ? { selectedReasoningEffort: this.selectedReasoningEffort } : {}),
        systemPromptText: this.systemPromptText,
        openAiInputItems: this.openAiConversationInputItems,
      });
      await writeOpenAiDebugLog("OpenAI responses request", requestBody);

      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: await this.loadRequestHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        await writeOpenAiDebugLog("OpenAI responses request failed", await createFailedResponseDebugPayload(response.clone()));
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
        const responseReplayItems = createOpenAiResponseReplayItems(terminalState.responseOutputItems);
        await writeOpenAiDebugLog("OpenAI tool-call terminal state", {
          toolCallId: terminalState.toolCallId,
          toolCallRequest: terminalState.toolCallRequest,
          responseOutputItems: terminalState.responseOutputItems,
          responseReplayItems,
        });
        if (!responseReplayItems.providerTurnReplayInputItems.some(isMatchingFunctionCallReplayItem(terminalState.toolCallId))) {
          throw new Error(
            `OpenAI response omitted a replayable function_call item for tool call ${terminalState.toolCallId}.`,
          );
        }

        this.openAiConversationInputItems.push(...responseReplayItems.continuationInputItems);
        this.providerTurnReplayInputItems.push(...responseReplayItems.providerTurnReplayInputItems);
        const toolResultSubmission = await this.waitForToolResultSubmission(terminalState.toolCallId);
        const functionCallOutputInputItem = createFunctionCallOutputInputItem(
          toolResultSubmission.toolCallId,
          toolResultSubmission.toolResultText,
        );
        await writeOpenAiDebugLog("OpenAI tool result submission", functionCallOutputInputItem);
        this.openAiConversationInputItems.push(functionCallOutputInputItem);
        this.providerTurnReplayInputItems.push(functionCallOutputInputItem);
        continue;
      }

      return;
    }
  }

  private waitForToolResultSubmission(toolCallId: string): Promise<OpenAiProviderToolResultSubmission> {
    const queuedToolResultSubmission = this.queuedToolResultSubmissionByToolCallId.get(toolCallId);
    if (queuedToolResultSubmission) {
      this.queuedToolResultSubmissionByToolCallId.delete(toolCallId);
      return Promise.resolve(queuedToolResultSubmission);
    }

    return new Promise<OpenAiProviderToolResultSubmission>((resolveSubmission) => {
      this.pendingToolResultSubmissionResolverByToolCallId.set(toolCallId, (toolResultSubmission) => {
        this.pendingToolResultSubmissionResolverByToolCallId.delete(toolCallId);
        resolveSubmission(toolResultSubmission);
      });
    });
  }
}

function shouldIncludeReasoningEncryptedContent(input: {
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  openAiInputItems: ReadonlyArray<OpenAiConversationInputItem>;
}): boolean {
  if (input.selectedReasoningEffort) {
    return true;
  }

  if (input.openAiInputItems.some(isOpenAiReasoningInputItem)) {
    return true;
  }

  return /gpt-5|codex/i.test(input.selectedModelId);
}

function isMatchingFunctionCallReplayItem(toolCallId: string) {
  return (openAiInputItem: OpenAiProviderTurnReplayInputItem): boolean =>
    openAiInputItem.type === "function_call" && openAiInputItem.call_id === toolCallId;
}

function isOpenAiReasoningInputItem(openAiInputItem: OpenAiConversationInputItem): openAiInputItem is Extract<OpenAiConversationInputItem, { type: "reasoning" }> {
  return "type" in openAiInputItem && openAiInputItem.type === "reasoning";
}

async function createFailedResponseDebugPayload(response: HttpErrorDebugResponse): Promise<{
  status: number;
  requestId: string | null;
  bodyText: string;
}> {
  return {
    status: response.status,
    requestId:
      response.headers.get("x-request-id") ??
      response.headers.get("request-id") ??
      response.headers.get("openai-request-id"),
    bodyText: await response.text(),
  };
}
