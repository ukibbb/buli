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
import { createOpenAiToolCallRequest } from "./toolDefinitions.ts";

type PendingFunctionCallState = {
  toolCallId: string;
  toolName: string;
  argumentTextChunks: string[];
  completedArgumentsText?: string | undefined;
  hasRecordedToolCallRequest: boolean;
};

export class OpenAiFunctionCallStreamAccumulator {
  private readonly diagnosticLogger: BuliDiagnosticLogger | undefined;
  private readonly pendingRequestedToolCalls: ProviderRequestedToolCall[] = [];
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
      this.recordRequestedToolCallIfReady(input.itemId);
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
      toolCallId: input.functionCallItem.toolCallId,
      toolName: input.functionCallItem.toolName,
      argumentTextChunks: [],
      ...(input.functionCallItem.argumentsText && input.functionCallItem.argumentsText.length > 0
        ? { completedArgumentsText: input.functionCallItem.argumentsText }
        : bufferedArgumentsText !== undefined
          ? { completedArgumentsText: bufferedArgumentsText }
          : {}),
      hasRecordedToolCallRequest: false,
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
      this.recordRequestedToolCallIfReady(input.functionCallItem.itemId);
    }
  }

  recordRequestedToolCallsFromResponseOutputItems(responseOutputItems: readonly unknown[]): void {
    for (const responseOutputItem of responseOutputItems) {
      const functionCallOutputItem = readOpenAiFunctionCallOutputItem(responseOutputItem);
      if (!functionCallOutputItem || !functionCallOutputItem.argumentsText) {
        continue;
      }

      this.recordRequestedToolCall({
        itemId: functionCallOutputItem.itemId,
        toolCallId: functionCallOutputItem.toolCallId,
        toolName: functionCallOutputItem.toolName,
        argumentsText: functionCallOutputItem.argumentsText,
      });
    }
  }

  listPendingRequestedToolCalls(): ProviderRequestedToolCall[] {
    return [...this.pendingRequestedToolCalls];
  }

  private recordRequestedToolCall(input: {
    itemId?: string;
    toolCallId: string;
    toolName: string;
    argumentsText: string;
  }): void {
    const toolCallRequest = createOpenAiToolCallRequest({
      toolName: input.toolName,
      argumentsText: input.argumentsText,
    });
    const existingRequestedToolCallIndex = this.pendingRequestedToolCalls.findIndex(
      (requestedToolCall) => requestedToolCall.toolCallId === input.toolCallId,
    );
    if (existingRequestedToolCallIndex >= 0) {
      this.pendingRequestedToolCalls[existingRequestedToolCallIndex] = {
        toolCallId: input.toolCallId,
        toolCallRequest,
      };
      return;
    }

    this.pendingRequestedToolCalls.push({
      toolCallId: input.toolCallId,
      toolCallRequest,
    });
    if (input.itemId) {
      const pendingFunctionCallState = this.pendingFunctionCallStateByItemId.get(input.itemId);
      if (pendingFunctionCallState) {
        pendingFunctionCallState.hasRecordedToolCallRequest = true;
      }
    }
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.tool_call_ready", {
      toolCallId: input.toolCallId,
      functionArgumentsLength: input.argumentsText.length,
      ...summarizeOpenAiToolCallRequestForDiagnostics(toolCallRequest),
    });
  }

  private recordRequestedToolCallIfReady(itemId: string): void {
    const pendingFunctionCallState = this.pendingFunctionCallStateByItemId.get(itemId);
    const argumentsText = pendingFunctionCallState
      ? readPendingFunctionCallArgumentsText(pendingFunctionCallState)
      : "";
    if (
      !pendingFunctionCallState ||
      pendingFunctionCallState.hasRecordedToolCallRequest ||
      !argumentsText
    ) {
      return;
    }

    this.recordRequestedToolCall({
      itemId,
      toolCallId: pendingFunctionCallState.toolCallId,
      toolName: pendingFunctionCallState.toolName,
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
