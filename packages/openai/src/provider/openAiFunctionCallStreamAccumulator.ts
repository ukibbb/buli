import type {
  BuliDiagnosticLogger,
  ProviderRequestedToolCall,
} from "@buli/contracts";
import {
  logOpenAiDiagnosticEvent,
  summarizeOpenAiToolCallRequestForDiagnostics,
} from "./diagnostics.ts";
import {
  readOpenAiFunctionCallOutputItem,
  type OpenAiFunctionCallOutputItem,
} from "./openAiResponseObjects.ts";
import { classifyOpenAiProviderFunctionCallIntents } from "./openAiProviderFunctionCallIntentClassification.ts";
import {
  createOpenAiProviderFunctionCallIntent,
  type OpenAiProviderFunctionCallIntent,
} from "./toolDefinitions.ts";

type PendingFunctionCallState = {
  functionCallId: string;
  functionName: string;
  argumentTextChunks: string[];
  completedArgumentsText?: string | undefined;
  hasRecordedFunctionCallIntent: boolean;
};

export class OpenAiFunctionCallStreamAccumulator {
  private readonly diagnosticLogger: BuliDiagnosticLogger | undefined;
  private readonly pendingProviderFunctionCallIntents: OpenAiProviderFunctionCallIntent[] = [];
  private readonly pendingFunctionCallStateByItemId = new Map<string, PendingFunctionCallState>();
  private readonly pendingFunctionCallArgumentChunksByItemId = new Map<string, string[]>();
  private readonly completedPendingFunctionCallArgumentsTextByItemId = new Map<string, string>();

  constructor(input: { diagnosticLogger?: BuliDiagnosticLogger | undefined } = {}) {
    this.diagnosticLogger = input.diagnosticLogger;
  }

  appendFunctionCallArgumentsDelta(input: { itemId: string; deltaText: string }): void {
    const pendingFunctionCallState = this.pendingFunctionCallStateByItemId.get(input.itemId);
    if (pendingFunctionCallState) {
      pendingFunctionCallState.argumentTextChunks.push(input.deltaText);
      return;
    }

    this.appendPendingFunctionCallArgumentTextChunk(input.itemId, input.deltaText);
  }

  completeFunctionCallArguments(input: { itemId: string; argumentsText: string }): void {
    const pendingFunctionCallState = this.pendingFunctionCallStateByItemId.get(input.itemId);
    if (pendingFunctionCallState) {
      pendingFunctionCallState.completedArgumentsText = input.argumentsText;
      pendingFunctionCallState.argumentTextChunks = [];
      this.recordProviderFunctionCallIntentIfReady(input.itemId);
      return;
    }

    this.completedPendingFunctionCallArgumentsTextByItemId.set(input.itemId, input.argumentsText);
    this.pendingFunctionCallArgumentChunksByItemId.delete(input.itemId);
  }

  observeFunctionCallOutputItem(input: {
    functionCallItem: OpenAiFunctionCallOutputItem;
    shouldRecordRequestedToolCallIfReady: boolean;
  }): void {
    const bufferedArgumentsText = this.readBufferedPendingFunctionCallArgumentsText(input.functionCallItem.itemId);
    const pendingFunctionCallState = this.pendingFunctionCallStateByItemId.get(input.functionCallItem.itemId) ?? {
      functionCallId: input.functionCallItem.functionCallId,
      functionName: input.functionCallItem.functionName,
      argumentTextChunks: [],
      ...(input.functionCallItem.argumentsText && input.functionCallItem.argumentsText.length > 0
        ? { completedArgumentsText: input.functionCallItem.argumentsText }
        : bufferedArgumentsText !== undefined
          ? { completedArgumentsText: bufferedArgumentsText }
          : {}),
      hasRecordedFunctionCallIntent: false,
    };

    if (input.functionCallItem.argumentsText && input.functionCallItem.argumentsText.length > 0) {
      pendingFunctionCallState.completedArgumentsText = input.functionCallItem.argumentsText;
      pendingFunctionCallState.argumentTextChunks = [];
    } else if (readPendingFunctionCallArgumentsText(pendingFunctionCallState).length === 0 && bufferedArgumentsText) {
      pendingFunctionCallState.completedArgumentsText = bufferedArgumentsText;
      pendingFunctionCallState.argumentTextChunks = [];
    }

    this.pendingFunctionCallStateByItemId.set(input.functionCallItem.itemId, pendingFunctionCallState);
    if (readPendingFunctionCallArgumentsText(pendingFunctionCallState).length > 0) {
      this.pendingFunctionCallArgumentChunksByItemId.delete(input.functionCallItem.itemId);
      this.completedPendingFunctionCallArgumentsTextByItemId.delete(input.functionCallItem.itemId);
    }
    if (input.shouldRecordRequestedToolCallIfReady) {
      this.recordProviderFunctionCallIntentIfReady(input.functionCallItem.itemId);
    }
  }

  recordProviderFunctionCallIntentsFromResponseOutputItems(responseOutputItems: readonly unknown[]): void {
    for (const responseOutputItem of responseOutputItems) {
      const functionCallOutputItem = readOpenAiFunctionCallOutputItem(responseOutputItem);
      if (!functionCallOutputItem || !functionCallOutputItem.argumentsText) {
        continue;
      }

      this.recordProviderFunctionCallIntent({
        itemId: functionCallOutputItem.itemId,
        functionCallId: functionCallOutputItem.functionCallId,
        functionName: functionCallOutputItem.functionName,
        argumentsText: functionCallOutputItem.argumentsText,
      });
    }
  }

  listPendingRequestedToolCalls(): ProviderRequestedToolCall[] {
    return classifyOpenAiProviderFunctionCallIntents(this.pendingProviderFunctionCallIntents).requestedToolCalls;
  }

  listPendingProviderFunctionCallIntents(): OpenAiProviderFunctionCallIntent[] {
    return [...this.pendingProviderFunctionCallIntents];
  }

  private recordProviderFunctionCallIntent(input: {
    itemId?: string;
    functionCallId: string;
    functionName: string;
    argumentsText: string;
  }): void {
    const providerFunctionCallIntent = createOpenAiProviderFunctionCallIntent({
      functionCallId: input.functionCallId,
      functionName: input.functionName,
      argumentsText: input.argumentsText,
    });
    const existingProviderFunctionCallIndex = this.pendingProviderFunctionCallIntents.findIndex(
      (pendingProviderFunctionCallIntent) => pendingProviderFunctionCallIntent.functionCallId === input.functionCallId,
    );
    if (existingProviderFunctionCallIndex >= 0) {
      this.pendingProviderFunctionCallIntents[existingProviderFunctionCallIndex] = providerFunctionCallIntent;
      return;
    }

    this.pendingProviderFunctionCallIntents.push(providerFunctionCallIntent);
    if (input.itemId) {
      const pendingFunctionCallState = this.pendingFunctionCallStateByItemId.get(input.itemId);
      if (pendingFunctionCallState) {
        pendingFunctionCallState.hasRecordedFunctionCallIntent = true;
      }
    }
    switch (providerFunctionCallIntent.intentKind) {
      case "code_execution_walkthrough_presentation":
        logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.presentation_function_call_ready", {
          presentationCallId: input.functionCallId,
          functionArgumentsLength: input.argumentsText.length,
          presentationFunctionName: input.functionName,
        });
        return;
      case "executable_tool":
        logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.tool_call_ready", {
          toolCallId: input.functionCallId,
          functionArgumentsLength: input.argumentsText.length,
          ...summarizeOpenAiToolCallRequestForDiagnostics(providerFunctionCallIntent.toolCallRequest),
        });
        return;
      default:
        assertUnhandledOpenAiProviderFunctionCallIntent(providerFunctionCallIntent);
    }
  }

  private recordProviderFunctionCallIntentIfReady(itemId: string): void {
    const pendingFunctionCallState = this.pendingFunctionCallStateByItemId.get(itemId);
    const argumentsText = pendingFunctionCallState
      ? readPendingFunctionCallArgumentsText(pendingFunctionCallState)
      : "";
    if (
      !pendingFunctionCallState ||
      pendingFunctionCallState.hasRecordedFunctionCallIntent ||
      !argumentsText
    ) {
      return;
    }

    this.recordProviderFunctionCallIntent({
      itemId,
      functionCallId: pendingFunctionCallState.functionCallId,
      functionName: pendingFunctionCallState.functionName,
      argumentsText,
    });
  }

  private appendPendingFunctionCallArgumentTextChunk(itemId: string, argumentsTextChunk: string): void {
    const argumentTextChunks = this.pendingFunctionCallArgumentChunksByItemId.get(itemId) ?? [];
    argumentTextChunks.push(argumentsTextChunk);
    this.pendingFunctionCallArgumentChunksByItemId.set(itemId, argumentTextChunks);
  }

  private readBufferedPendingFunctionCallArgumentsText(itemId: string): string | undefined {
    const completedArgumentsText = this.completedPendingFunctionCallArgumentsTextByItemId.get(itemId);
    if (completedArgumentsText !== undefined) {
      return completedArgumentsText;
    }

    const argumentTextChunks = this.pendingFunctionCallArgumentChunksByItemId.get(itemId);
    return argumentTextChunks && argumentTextChunks.length > 0 ? argumentTextChunks.join("") : undefined;
  }
}

function readPendingFunctionCallArgumentsText(pendingFunctionCallState: PendingFunctionCallState): string {
  return pendingFunctionCallState.completedArgumentsText ?? pendingFunctionCallState.argumentTextChunks.join("");
}

function assertUnhandledOpenAiProviderFunctionCallIntent(providerFunctionCallIntent: never): never {
  throw new Error(`Unhandled OpenAI provider function-call intent: ${String(providerFunctionCallIntent)}`);
}
