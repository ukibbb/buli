import {
  isOpenAiOutputTextContentPart,
  isOpenAiReasoningSummaryTextPart,
  isOpenAiResponseObject,
  listOpenAiOutputTextContentParts,
  listOpenAiReasoningSummaryTextParts,
  readOpenAiResponseObjectArrayField,
  readOpenAiResponseObjectStringField,
  type OpenAiResponseObject,
} from "./openAiResponseObjects.ts";

type TextChunkBufferByPartIndex = Map<number, string[]>;

export type OpenAiAssistantOutputTextDelta = {
  itemId: string;
  outputIndex?: number | undefined;
  contentIndex: number;
  deltaText: string;
};

export type OpenAiReasoningSummaryTextDelta = {
  itemId: string;
  outputIndex?: number | undefined;
  summaryIndex: number;
  deltaText: string;
};

export type OpenAiReasoningSummaryPart = {
  itemId: string;
  outputIndex?: number | undefined;
  summaryIndex: number;
};

export class OpenAiResponseOutputItemTracker {
  private readonly trackedOutputItemsByIndex = new Map<number, unknown>();
  private readonly assistantTextChunksByItemIdAndContentIndex = new Map<string, TextChunkBufferByPartIndex>();
  private readonly reasoningSummaryChunksByItemIdAndSummaryIndex = new Map<string, TextChunkBufferByPartIndex>();
  private readonly functionCallArgumentChunksByItemId = new Map<string, string[]>();
  private readonly completedFunctionCallArgumentsTextByItemId = new Map<string, string>();
  private nextUnindexedTrackedOutputItemIndex = -1_000_000;

  get trackedOutputItemCount(): number {
    return this.trackedOutputItemsByIndex.size;
  }

  appendAssistantOutputTextDelta(input: OpenAiAssistantOutputTextDelta): void {
    appendTextChunkToIndexedChunkBuffer({
      chunkBuffersByItemId: this.assistantTextChunksByItemIdAndContentIndex,
      itemId: input.itemId,
      partIndex: input.contentIndex,
      textChunk: input.deltaText,
    });
    if (this.hasTrackedOutputItemByItemId(input.itemId, "message")) {
      return;
    }

    const outputIndex = input.outputIndex ?? this.reserveUnindexedTrackedOutputItemIndex();
    const trackedOutputItemAtIndex = this.trackedOutputItemsByIndex.get(outputIndex);
    this.trackedOutputItemsByIndex.set(
      outputIndex,
      isOpenAiResponseObject(trackedOutputItemAtIndex) && trackedOutputItemAtIndex.type === "message"
        ? { ...trackedOutputItemAtIndex, id: input.itemId, role: "assistant" }
        : createTrackedOpenAiAssistantMessageOutputItem({ itemId: input.itemId }),
    );
  }

  appendReasoningSummaryTextDelta(input: OpenAiReasoningSummaryTextDelta): void {
    appendTextChunkToIndexedChunkBuffer({
      chunkBuffersByItemId: this.reasoningSummaryChunksByItemIdAndSummaryIndex,
      itemId: input.itemId,
      partIndex: input.summaryIndex,
      textChunk: input.deltaText,
    });
    this.ensureReasoningSummaryPart(input);
  }

  ensureReasoningSummaryPart(input: OpenAiReasoningSummaryPart): void {
    if (this.hasTrackedOutputItemByItemId(input.itemId, "reasoning")) {
      return;
    }

    const outputIndex = input.outputIndex ?? this.reserveUnindexedTrackedOutputItemIndex();
    const trackedOutputItemAtIndex = this.trackedOutputItemsByIndex.get(outputIndex);
    this.trackedOutputItemsByIndex.set(
      outputIndex,
      isOpenAiResponseObject(trackedOutputItemAtIndex) && trackedOutputItemAtIndex.type === "reasoning"
        ? { ...trackedOutputItemAtIndex, id: input.itemId }
        : createTrackedOpenAiReasoningOutputItem({ itemId: input.itemId }),
    );
  }

  appendFunctionCallArgumentsTextDeltaByItemId(itemId: string, argumentsTextDelta: string): void {
    const functionCallArgumentChunks = this.functionCallArgumentChunksByItemId.get(itemId) ?? [];
    functionCallArgumentChunks.push(argumentsTextDelta);
    this.functionCallArgumentChunksByItemId.set(itemId, functionCallArgumentChunks);
  }

  setFunctionCallArgumentsTextByItemId(itemId: string, argumentsText: string): void {
    this.completedFunctionCallArgumentsTextByItemId.set(itemId, argumentsText);
    this.functionCallArgumentChunksByItemId.delete(itemId);
  }

  setTrackedOutputItemAtIndex(input: {
    outputIndex: number;
    responseOutputItem: unknown;
  }): void {
    const responseOutputItem = input.responseOutputItem;
    if (!isOpenAiResponseObject(responseOutputItem)) {
      this.trackedOutputItemsByIndex.set(input.outputIndex, responseOutputItem);
      return;
    }

    const responseOutputItemId = readOpenAiResponseObjectStringField(responseOutputItem, "id");
    if (responseOutputItemId === undefined) {
      this.trackedOutputItemsByIndex.set(input.outputIndex, responseOutputItem);
      return;
    }

    let nextTrackedOutputItem: unknown = responseOutputItem;
    for (const [trackedOutputIndex, trackedOutputItem] of this.trackedOutputItemsByIndex.entries()) {
      if (
        trackedOutputIndex === input.outputIndex ||
        !isOpenAiResponseObject(trackedOutputItem) ||
        trackedOutputItem.type !== responseOutputItem.type ||
        readOpenAiResponseObjectStringField(trackedOutputItem, "id") !== responseOutputItemId
      ) {
        continue;
      }

      nextTrackedOutputItem = mergeTrackedAndResponseOutputItem({
        trackedOutputItem,
        responseOutputItem,
      });
      this.trackedOutputItemsByIndex.delete(trackedOutputIndex);
      break;
    }

    const currentOutputItemAtIndex = this.trackedOutputItemsByIndex.get(input.outputIndex);
    if (
      isOpenAiResponseObject(currentOutputItemAtIndex) &&
      currentOutputItemAtIndex.type === responseOutputItem.type &&
      readOpenAiResponseObjectStringField(currentOutputItemAtIndex, "id") === responseOutputItemId
    ) {
      nextTrackedOutputItem = mergeTrackedAndResponseOutputItem({
        trackedOutputItem: currentOutputItemAtIndex,
        responseOutputItem: isOpenAiResponseObject(nextTrackedOutputItem) ? nextTrackedOutputItem : responseOutputItem,
      });
    }

    this.trackedOutputItemsByIndex.set(input.outputIndex, nextTrackedOutputItem);
  }

  mergeOutputItemDoneWithoutOutputIndex(responseOutputItem: OpenAiResponseObject): void {
    const responseOutputItemId = readOpenAiResponseObjectStringField(responseOutputItem, "id");
    if (responseOutputItemId === undefined) {
      return;
    }

    this.updateTrackedOutputItemByItemId(responseOutputItemId, (trackedOutputItem) =>
      trackedOutputItem.type === responseOutputItem.type
        ? mergeTrackedAndResponseOutputItem({
            trackedOutputItem,
            responseOutputItem,
          })
        : responseOutputItem
    );
  }

  createTrackedBackedResponseOutputItems(responseOutputItems: readonly unknown[] | undefined): unknown[] {
    const trackedOutputItems = this.listTrackedOutputItems();
    if (trackedOutputItems.length === 0) {
      return responseOutputItems ? [...responseOutputItems] : [];
    }

    if (!responseOutputItems || responseOutputItems.length === 0) {
      return trackedOutputItems;
    }

    const responseOutputItemById = new Map<string, OpenAiResponseObject>();
    for (const responseOutputItem of responseOutputItems) {
      if (!isOpenAiResponseObject(responseOutputItem)) {
        continue;
      }

      const responseOutputItemId = readOpenAiResponseObjectStringField(responseOutputItem, "id");
      if (responseOutputItemId === undefined) {
        continue;
      }

      responseOutputItemById.set(responseOutputItemId, responseOutputItem);
    }

    const consumedResponseOutputItemIds = new Set<string>();
    const mergedOutputItems: unknown[] = [];
    for (const trackedOutputItem of trackedOutputItems) {
      if (!isOpenAiResponseObject(trackedOutputItem)) {
        mergedOutputItems.push(trackedOutputItem);
        continue;
      }

      const trackedOutputItemId = readOpenAiResponseObjectStringField(trackedOutputItem, "id");
      if (trackedOutputItemId === undefined) {
        mergedOutputItems.push(trackedOutputItem);
        continue;
      }

      const responseOutputItem = responseOutputItemById.get(trackedOutputItemId);
      if (!responseOutputItem || responseOutputItem.type !== trackedOutputItem.type) {
        mergedOutputItems.push(trackedOutputItem);
        continue;
      }

      consumedResponseOutputItemIds.add(trackedOutputItemId);
      mergedOutputItems.push(
        mergeTrackedAndResponseOutputItem({ trackedOutputItem, responseOutputItem }),
      );
    }

    for (const responseOutputItem of responseOutputItems) {
      if (
        isOpenAiResponseObject(responseOutputItem) &&
        hasConsumedOpenAiResponseOutputItem(responseOutputItem, consumedResponseOutputItemIds)
      ) {
        continue;
      }

      mergedOutputItems.push(responseOutputItem);
    }

    return mergedOutputItems;
  }

  listUnemittedAssistantOutputTextChunks(responseOutputItems: readonly unknown[]): string[] {
    return responseOutputItems.flatMap((responseOutputItem) =>
      listUnemittedAssistantOutputTextChunksFromOutputItem({
        responseOutputItem,
        assistantTextChunksByItemIdAndContentIndex: this.assistantTextChunksByItemIdAndContentIndex,
      })
    );
  }

  private hasTrackedOutputItemByItemId(itemId: string, outputItemType: string): boolean {
    for (const outputItem of this.trackedOutputItemsByIndex.values()) {
      if (
        isOpenAiResponseObject(outputItem) &&
        outputItem.type === outputItemType &&
        readOpenAiResponseObjectStringField(outputItem, "id") === itemId
      ) {
        return true;
      }
    }

    return false;
  }

  private listTrackedOutputItems(): unknown[] {
    return [...this.trackedOutputItemsByIndex.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([, outputItem]) => this.materializeTrackedOutputItem(outputItem));
  }

  private updateTrackedOutputItemByItemId(
    itemId: string,
    createUpdatedOutputItem: (outputItem: OpenAiResponseObject) => unknown,
  ): boolean {
    for (const [outputIndex, outputItem] of this.trackedOutputItemsByIndex.entries()) {
      if (!isOpenAiResponseObject(outputItem) || readOpenAiResponseObjectStringField(outputItem, "id") !== itemId) {
        continue;
      }

      this.trackedOutputItemsByIndex.set(outputIndex, createUpdatedOutputItem(outputItem));
      return true;
    }

    return false;
  }

  private reserveUnindexedTrackedOutputItemIndex(): number {
    const reservedOutputIndex = this.nextUnindexedTrackedOutputItemIndex;
    this.nextUnindexedTrackedOutputItemIndex += 1;
    return reservedOutputIndex;
  }

  private materializeTrackedOutputItem(outputItem: unknown): unknown {
    if (!isOpenAiResponseObject(outputItem)) {
      return outputItem;
    }

    const outputItemId = readOpenAiResponseObjectStringField(outputItem, "id");
    if (outputItemId === undefined) {
      return outputItem;
    }

    if (outputItem.type === "message") {
      return materializeOpenAiAssistantOutputTextChunks({
        messageOutputItem: outputItem,
        assistantTextChunksByContentIndex: this.assistantTextChunksByItemIdAndContentIndex.get(outputItemId),
      });
    }

    if (outputItem.type === "reasoning") {
      return materializeOpenAiReasoningSummaryTextChunks({
        reasoningOutputItem: outputItem,
        reasoningSummaryChunksBySummaryIndex: this.reasoningSummaryChunksByItemIdAndSummaryIndex.get(outputItemId),
      });
    }

    if (outputItem.type === "function_call") {
      return materializeOpenAiFunctionCallArgumentsText({
        functionCallOutputItem: outputItem,
        completedArgumentsText: this.completedFunctionCallArgumentsTextByItemId.get(outputItemId),
        argumentTextChunks: this.functionCallArgumentChunksByItemId.get(outputItemId),
      });
    }

    return outputItem;
  }
}

function appendTextChunkToIndexedChunkBuffer(input: {
  chunkBuffersByItemId: Map<string, TextChunkBufferByPartIndex>;
  itemId: string;
  partIndex: number;
  textChunk: string;
}): void {
  const textChunkBuffersByPartIndex = input.chunkBuffersByItemId.get(input.itemId) ?? new Map<number, string[]>();
  const textChunks = textChunkBuffersByPartIndex.get(input.partIndex) ?? [];
  textChunks.push(input.textChunk);
  textChunkBuffersByPartIndex.set(input.partIndex, textChunks);
  input.chunkBuffersByItemId.set(input.itemId, textChunkBuffersByPartIndex);
}

function hasConsumedOpenAiResponseOutputItem(
  responseOutputItem: OpenAiResponseObject,
  consumedResponseOutputItemIds: ReadonlySet<string>,
): boolean {
  const responseOutputItemId = readOpenAiResponseObjectStringField(responseOutputItem, "id");
  return responseOutputItemId !== undefined && consumedResponseOutputItemIds.has(responseOutputItemId);
}

function listUnemittedAssistantOutputTextChunksFromOutputItem(input: {
  responseOutputItem: unknown;
  assistantTextChunksByItemIdAndContentIndex: ReadonlyMap<string, TextChunkBufferByPartIndex>;
}): string[] {
  if (
    !isOpenAiResponseObject(input.responseOutputItem) ||
    input.responseOutputItem.type !== "message" ||
    readOpenAiResponseObjectStringField(input.responseOutputItem, "role") !== "assistant"
  ) {
    return [];
  }

  const responseOutputItemId = readOpenAiResponseObjectStringField(input.responseOutputItem, "id");
  const emittedTextChunksByContentIndex = responseOutputItemId !== undefined
    ? input.assistantTextChunksByItemIdAndContentIndex.get(responseOutputItemId)
    : undefined;
  return (readOpenAiResponseObjectArrayField(input.responseOutputItem, "content") ?? []).flatMap(
    (contentPart, contentIndex) => {
      if (!isOpenAiOutputTextContentPart(contentPart) || contentPart.text.length === 0) {
        return [];
      }

      const alreadyEmittedText = emittedTextChunksByContentIndex?.get(contentIndex)?.join("") ?? "";
      if (alreadyEmittedText.length === 0) {
        return [contentPart.text];
      }

      if (!contentPart.text.startsWith(alreadyEmittedText)) {
        return [];
      }

      const unemittedText = contentPart.text.slice(alreadyEmittedText.length);
      return unemittedText.length > 0 ? [unemittedText] : [];
    },
  );
}

function materializeOpenAiAssistantOutputTextChunks(input: {
  messageOutputItem: OpenAiResponseObject;
  assistantTextChunksByContentIndex: TextChunkBufferByPartIndex | undefined;
}): OpenAiResponseObject {
  if (!input.assistantTextChunksByContentIndex || input.assistantTextChunksByContentIndex.size === 0) {
    return input.messageOutputItem;
  }

  const contentParts = [...(readOpenAiResponseObjectArrayField(input.messageOutputItem, "content") ?? [])];
  for (const [contentIndex, textChunks] of input.assistantTextChunksByContentIndex.entries()) {
    const currentContentPart = contentParts[contentIndex];
    const currentText = isOpenAiOutputTextContentPart(currentContentPart) ? currentContentPart.text : "";
    if (currentText.length > 0) {
      continue;
    }

    contentParts[contentIndex] = {
      type: "output_text",
      text: textChunks.join(""),
    };
  }

  return {
    ...input.messageOutputItem,
    content: contentParts,
  };
}

function materializeOpenAiReasoningSummaryTextChunks(input: {
  reasoningOutputItem: OpenAiResponseObject;
  reasoningSummaryChunksBySummaryIndex: TextChunkBufferByPartIndex | undefined;
}): OpenAiResponseObject {
  if (!input.reasoningSummaryChunksBySummaryIndex || input.reasoningSummaryChunksBySummaryIndex.size === 0) {
    return input.reasoningOutputItem;
  }

  const summaryParts = [...(readOpenAiResponseObjectArrayField(input.reasoningOutputItem, "summary") ?? [])];
  for (const [summaryIndex, textChunks] of input.reasoningSummaryChunksBySummaryIndex.entries()) {
    const currentSummaryPart = summaryParts[summaryIndex];
    const currentSummaryText = isOpenAiReasoningSummaryTextPart(currentSummaryPart) ? currentSummaryPart.text : "";
    if (currentSummaryText.length > 0) {
      continue;
    }

    summaryParts[summaryIndex] = {
      type: "summary_text",
      text: textChunks.join(""),
    };
  }

  return {
    ...input.reasoningOutputItem,
    summary: summaryParts,
  };
}

function materializeOpenAiFunctionCallArgumentsText(input: {
  functionCallOutputItem: OpenAiResponseObject;
  completedArgumentsText: string | undefined;
  argumentTextChunks: readonly string[] | undefined;
}): OpenAiResponseObject {
  const currentArgumentsText = readOpenAiResponseObjectStringField(input.functionCallOutputItem, "arguments");
  if (currentArgumentsText !== undefined && currentArgumentsText.length > 0) {
    return input.functionCallOutputItem;
  }

  const argumentsText = input.completedArgumentsText ?? input.argumentTextChunks?.join("");
  return argumentsText !== undefined
    ? { ...input.functionCallOutputItem, arguments: argumentsText }
    : input.functionCallOutputItem;
}

function mergeTrackedAndResponseOutputItem(input: {
  trackedOutputItem: OpenAiResponseObject;
  responseOutputItem: OpenAiResponseObject;
}): unknown {
  if (input.trackedOutputItem.type === "function_call") {
    const trackedArgumentsText = readOpenAiResponseObjectStringField(input.trackedOutputItem, "arguments");
    const responseArgumentsText = readOpenAiResponseObjectStringField(input.responseOutputItem, "arguments");
    const trackedArguments = trackedArgumentsText !== undefined && trackedArgumentsText.length > 0
      ? trackedArgumentsText
      : undefined;
    const responseArguments = responseArgumentsText !== undefined && responseArgumentsText.length > 0
      ? responseArgumentsText
      : undefined;
    const mostCompleteArguments = responseArguments ?? trackedArguments;

    return {
      ...input.trackedOutputItem,
      ...input.responseOutputItem,
      ...(mostCompleteArguments !== undefined ? { arguments: mostCompleteArguments } : {}),
    };
  }

  if (input.trackedOutputItem.type === "message") {
    const responseContent = readOpenAiResponseObjectArrayField(input.responseOutputItem, "content");
    const trackedContent = readOpenAiResponseObjectArrayField(input.trackedOutputItem, "content");
    const responseOutputTextContentParts = listOpenAiOutputTextContentParts(responseContent);
    const trackedOutputTextContentParts = listOpenAiOutputTextContentParts(trackedContent);
    return {
      ...input.trackedOutputItem,
      ...input.responseOutputItem,
      ...(responseOutputTextContentParts.length > 0
        ? { content: responseContent }
        : trackedOutputTextContentParts.length > 0
          ? { content: trackedContent }
          : {}),
    };
  }

  if (input.trackedOutputItem.type !== "reasoning") {
    return { ...input.trackedOutputItem, ...input.responseOutputItem };
  }

  const trackedSummaryParts = listOpenAiReasoningSummaryTextParts(readOpenAiResponseObjectArrayField(input.trackedOutputItem, "summary"));
  const responseSummaryParts = listOpenAiReasoningSummaryTextParts(readOpenAiResponseObjectArrayField(input.responseOutputItem, "summary"));
  return {
    ...input.trackedOutputItem,
    ...input.responseOutputItem,
    summary: responseSummaryParts.length > 0 ? responseSummaryParts : trackedSummaryParts,
  };
}

function createTrackedOpenAiReasoningOutputItem(input: { itemId: string }): OpenAiResponseObject {
  return {
    type: "reasoning",
    id: input.itemId,
    summary: [],
  };
}

function createTrackedOpenAiAssistantMessageOutputItem(input: { itemId: string }): OpenAiResponseObject {
  return {
    type: "message",
    id: input.itemId,
    role: "assistant",
    content: [],
  };
}
