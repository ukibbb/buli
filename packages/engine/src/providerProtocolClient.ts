import { randomUUID } from "node:crypto";
import {
  CONTEXT_WINDOW_OVERFLOW_FAILURE_KIND,
  PROVIDER_PROTOCOL_VERSION,
  type AvailableAssistantModel,
  type ContextWindowOverflowFailureKind,
  type ProviderProtocolAcknowledgedFrameKind,
  type ProviderProtocolCancellationReason,
  type ProviderProtocolError,
  type ProviderProtocolHostFrame,
  type ProviderProtocolHostListModelsFrame,
  type ProviderProtocolHostStartTurnFrame,
  type ProviderProtocolProviderAvailableModelsFrame,
  type ProviderProtocolProviderEventFrame,
  type ProviderProtocolProviderFrame,
  type ProviderProtocolProviderTurnClosedFrame,
  type ProviderProtocolRequestId,
  type ProviderProtocolTurnId,
  type ProviderProtocolTurnRequest,
  type ProviderStreamEvent,
  type ProviderTurnReplay,
} from "@buli/contracts";
import type {
  ConversationTurnProvider,
  ProviderConversationTurn,
  ProviderConversationTurnRequest,
  ProviderToolResultSubmission,
} from "./provider.ts";

export type ProviderProtocolClientTransport = Readonly<{
  receiveProviderFrames: () => AsyncIterable<ProviderProtocolProviderFrame>;
  sendHostFrame: (frame: ProviderProtocolHostFrame) => Promise<void>;
}>;

export type ProviderProtocolConversationTurnProviderInput = Readonly<{
  transport: ProviderProtocolClientTransport;
  createRequestId?: (() => ProviderProtocolRequestId) | undefined;
  createTurnId?: (() => ProviderProtocolTurnId) | undefined;
  requestAcknowledgementTimeoutMilliseconds?: number | undefined;
}>;

type PendingProviderProtocolRequestAcknowledgement = Readonly<{
  acknowledgedFrameKind: ProviderProtocolAcknowledgedFrameKind;
  turnId?: ProviderProtocolTurnId | undefined;
  resolveAcknowledgement: () => void;
  rejectAcknowledgement: (error: Error) => void;
}>;

type PendingProviderProtocolModelListRequest = Readonly<{
  resolveAvailableModels: (availableModels: readonly AvailableAssistantModel[]) => void;
  rejectAvailableModels: (error: Error) => void;
}>;

type ProviderProtocolClientTurnStreamItem =
  | { itemKind: "provider_event"; providerStreamEvent: ProviderStreamEvent }
  | { itemKind: "provider_error"; error: Error }
  | { itemKind: "provider_turn_closed" };

type DeferredPromise<ResolvedValue> = Readonly<{
  promise: Promise<ResolvedValue>;
  resolve: (resolvedValue: ResolvedValue) => void;
  reject: (error: Error) => void;
}>;

const DEFAULT_PROVIDER_PROTOCOL_REQUEST_ACKNOWLEDGEMENT_TIMEOUT_MILLISECONDS = 30_000;

export class ProviderProtocolRemoteProviderError extends Error {
  readonly providerProtocolError: ProviderProtocolError;
  readonly failureKind: ContextWindowOverflowFailureKind | undefined;

  constructor(providerProtocolError: ProviderProtocolError) {
    super(providerProtocolError.errorMessage);
    this.name = "ProviderProtocolRemoteProviderError";
    this.providerProtocolError = providerProtocolError;
    this.failureKind = readProviderProtocolRemoteFailureKind(providerProtocolError);
  }
}

function readProviderProtocolRemoteFailureKind(
  providerProtocolError: ProviderProtocolError,
): ContextWindowOverflowFailureKind | undefined {
  if (providerProtocolError.details?.["failureKind"] === CONTEXT_WINDOW_OVERFLOW_FAILURE_KIND) {
    return CONTEXT_WINDOW_OVERFLOW_FAILURE_KIND;
  }

  if (providerProtocolError.details?.["errorName"] === "ContextWindowOverflowError") {
    return CONTEXT_WINDOW_OVERFLOW_FAILURE_KIND;
  }

  if (providerProtocolError.errorCode === CONTEXT_WINDOW_OVERFLOW_FAILURE_KIND) {
    return CONTEXT_WINDOW_OVERFLOW_FAILURE_KIND;
  }

  return undefined;
}

export class ProviderProtocolConversationTurnProvider implements ConversationTurnProvider {
  private readonly transport: ProviderProtocolClientTransport;
  private readonly createRequestId: () => ProviderProtocolRequestId;
  private readonly createTurnId: () => ProviderProtocolTurnId;
  private readonly requestAcknowledgementTimeoutMilliseconds: number;
  private readonly activeProviderTurnsById = new Map<ProviderProtocolTurnId, ProviderProtocolClientConversationTurn>();
  private readonly pendingRequestAcknowledgementsById = new Map<
    ProviderProtocolRequestId,
    PendingProviderProtocolRequestAcknowledgement
  >();
  private readonly pendingModelListRequestsById = new Map<
    ProviderProtocolRequestId,
    PendingProviderProtocolModelListRequest
  >();
  private incomingFramePumpPromise: Promise<void> | undefined;

  constructor(input: ProviderProtocolConversationTurnProviderInput) {
    this.transport = input.transport;
    this.createRequestId = input.createRequestId ?? randomUUID;
    this.createTurnId = input.createTurnId ?? randomUUID;
    this.requestAcknowledgementTimeoutMilliseconds = normalizeProviderProtocolTimeoutMilliseconds(
      input.requestAcknowledgementTimeoutMilliseconds,
      DEFAULT_PROVIDER_PROTOCOL_REQUEST_ACKNOWLEDGEMENT_TIMEOUT_MILLISECONDS,
    );
  }

  startConversationTurn(input: ProviderConversationTurnRequest): ProviderConversationTurn {
    this.startIncomingFramePump();
    const turnId = this.createTurnId();
    const startRequestAcknowledgement = createDeferredPromise<void>();
    const providerConversationTurn = new ProviderProtocolClientConversationTurn({
      turnId,
      startRequestAcknowledged: startRequestAcknowledgement.promise,
      createRequestId: this.createRequestId,
      sendHostFrameAndWaitForAcknowledgement: (frame) => this.sendHostFrameAndWaitForAcknowledgement(frame),
      unregisterTurn: (completedTurnId) => this.activeProviderTurnsById.delete(completedTurnId),
    });
    this.activeProviderTurnsById.set(turnId, providerConversationTurn);
    const removeAbortSignalListener = this.registerAbortSignalListener(input.abortSignal, providerConversationTurn);
    providerConversationTurn.registerCleanup(removeAbortSignalListener);

    void this.sendHostFrameAndWaitForAcknowledgement(createProviderProtocolHostStartTurnFrame({
      requestId: this.createRequestId(),
      turnId,
      turnRequest: createProviderProtocolTurnRequest(input),
    })).then(
      () => startRequestAcknowledgement.resolve(undefined),
      (error: unknown) => startRequestAcknowledgement.reject(toError(error)),
    );

    return providerConversationTurn;
  }

  async listAvailableAssistantModels(): Promise<readonly AvailableAssistantModel[]> {
    this.startIncomingFramePump();
    const requestId = this.createRequestId();
    const availableModels = createDeferredPromise<readonly AvailableAssistantModel[]>();
    this.pendingModelListRequestsById.set(requestId, {
      resolveAvailableModels: availableModels.resolve,
      rejectAvailableModels: availableModels.reject,
    });

    try {
      await this.sendHostFrameAndWaitForAcknowledgement(createProviderProtocolHostListModelsFrame({ requestId }));
      return await availableModels.promise;
    } catch (error) {
      this.pendingModelListRequestsById.delete(requestId);
      throw error;
    }
  }

  private startIncomingFramePump(): void {
    if (this.incomingFramePumpPromise) {
      return;
    }

    this.incomingFramePumpPromise = this.pumpIncomingProviderFrames();
    void this.incomingFramePumpPromise.catch(() => {});
  }

  private async pumpIncomingProviderFrames(): Promise<void> {
    try {
      for await (const providerFrame of this.transport.receiveProviderFrames()) {
        this.routeIncomingProviderFrame(providerFrame);
      }

      this.failAllPendingProtocolWork(new Error("Provider protocol transport closed."));
    } catch (error) {
      this.failAllPendingProtocolWork(toError(error));
      throw error;
    }
  }

  private routeIncomingProviderFrame(providerFrame: ProviderProtocolProviderFrame): void {
    switch (providerFrame.frameKind) {
      case "provider_request_acknowledged":
        this.resolveRequestAcknowledgement({
          requestId: providerFrame.requestId,
          turnId: providerFrame.turnId,
          acknowledgedFrameKind: providerFrame.acknowledgedFrameKind,
        });
        return;
      case "provider_available_models":
        this.resolveModelListRequest(providerFrame);
        return;
      case "provider_event":
        this.activeProviderTurnsById.get(providerFrame.turnId)?.receiveProviderEventFrame(providerFrame);
        return;
      case "provider_error": {
        const remoteProviderError = new ProviderProtocolRemoteProviderError(providerFrame.error);
        if (providerFrame.requestId) {
          this.rejectRequestAcknowledgement(providerFrame.requestId, remoteProviderError);
          this.rejectModelListRequest(providerFrame.requestId, remoteProviderError);
        }
        if (providerFrame.turnId) {
          this.activeProviderTurnsById.get(providerFrame.turnId)?.receiveProviderError(remoteProviderError);
        }
        return;
      }
      case "provider_turn_closed":
        this.activeProviderTurnsById.get(providerFrame.turnId)?.receiveProviderTurnClosedFrame(providerFrame);
        return;
      default:
        assertUnhandledProviderProtocolProviderFrame(providerFrame);
    }
  }

  private async sendHostFrameAndWaitForAcknowledgement(frame: ProviderProtocolHostFrame): Promise<void> {
    this.startIncomingFramePump();
    const acknowledgement = createDeferredPromise<void>();
    this.pendingRequestAcknowledgementsById.set(frame.requestId, {
      acknowledgedFrameKind: frame.frameKind,
      turnId: "turnId" in frame ? frame.turnId : undefined,
      resolveAcknowledgement: () => acknowledgement.resolve(undefined),
      rejectAcknowledgement: acknowledgement.reject,
    });

    try {
      await waitForProviderProtocolRequestAcknowledgement({
        requestId: frame.requestId,
        frameKind: frame.frameKind,
        timeoutMilliseconds: this.requestAcknowledgementTimeoutMilliseconds,
        sendHostFrameAndWaitForAcknowledgement: async () => {
          await this.transport.sendHostFrame(frame);
          await acknowledgement.promise;
        },
      });
    } catch (error) {
      this.pendingRequestAcknowledgementsById.delete(frame.requestId);
      throw error;
    }
  }

  private resolveRequestAcknowledgement(input: {
    requestId: ProviderProtocolRequestId;
    turnId?: ProviderProtocolTurnId | undefined;
    acknowledgedFrameKind: ProviderProtocolAcknowledgedFrameKind;
  }): void {
    const pendingAcknowledgement = this.pendingRequestAcknowledgementsById.get(input.requestId);
    if (!pendingAcknowledgement) {
      return;
    }

    this.pendingRequestAcknowledgementsById.delete(input.requestId);
    if (pendingAcknowledgement.acknowledgedFrameKind !== input.acknowledgedFrameKind) {
      pendingAcknowledgement.rejectAcknowledgement(new Error(
        `Provider protocol acknowledged ${input.acknowledgedFrameKind} for ${pendingAcknowledgement.acknowledgedFrameKind} request ${input.requestId}.`,
      ));
      return;
    }

    if (pendingAcknowledgement.turnId !== input.turnId) {
      pendingAcknowledgement.rejectAcknowledgement(new Error(
        `Provider protocol acknowledged turn ${input.turnId ?? "<missing>"} for ${pendingAcknowledgement.turnId ?? "<missing>"} request ${input.requestId}.`,
      ));
      return;
    }

    pendingAcknowledgement.resolveAcknowledgement();
  }

  private rejectRequestAcknowledgement(requestId: ProviderProtocolRequestId, error: Error): void {
    const pendingAcknowledgement = this.pendingRequestAcknowledgementsById.get(requestId);
    if (!pendingAcknowledgement) {
      return;
    }

    this.pendingRequestAcknowledgementsById.delete(requestId);
    pendingAcknowledgement.rejectAcknowledgement(error);
  }

  private resolveModelListRequest(providerFrame: ProviderProtocolProviderAvailableModelsFrame): void {
    const pendingModelListRequest = this.pendingModelListRequestsById.get(providerFrame.requestId);
    if (!pendingModelListRequest) {
      return;
    }

    this.pendingModelListRequestsById.delete(providerFrame.requestId);
    pendingModelListRequest.resolveAvailableModels(providerFrame.availableModels);
  }

  private rejectModelListRequest(requestId: ProviderProtocolRequestId, error: Error): void {
    const pendingModelListRequest = this.pendingModelListRequestsById.get(requestId);
    if (!pendingModelListRequest) {
      return;
    }

    this.pendingModelListRequestsById.delete(requestId);
    pendingModelListRequest.rejectAvailableModels(error);
  }

  private failAllPendingProtocolWork(error: Error): void {
    for (const [requestId, pendingAcknowledgement] of this.pendingRequestAcknowledgementsById) {
      this.pendingRequestAcknowledgementsById.delete(requestId);
      pendingAcknowledgement.rejectAcknowledgement(error);
    }
    for (const [requestId, pendingModelListRequest] of this.pendingModelListRequestsById) {
      this.pendingModelListRequestsById.delete(requestId);
      pendingModelListRequest.rejectAvailableModels(error);
    }
    for (const providerConversationTurn of this.activeProviderTurnsById.values()) {
      providerConversationTurn.receiveProviderError(error);
    }
  }

  private registerAbortSignalListener(
    abortSignal: AbortSignal | undefined,
    providerConversationTurn: ProviderProtocolClientConversationTurn,
  ): () => void {
    if (!abortSignal) {
      return () => {};
    }

    const abortListener = (): void => {
      providerConversationTurn.requestCancellation("user_interrupted");
    };
    abortSignal.addEventListener("abort", abortListener, { once: true });
    if (abortSignal.aborted) {
      abortListener();
    }

    return () => abortSignal.removeEventListener("abort", abortListener);
  }
}

class ProviderProtocolClientConversationTurn implements ProviderConversationTurn {
  private readonly turnId: ProviderProtocolTurnId;
  private readonly startRequestAcknowledged: Promise<void>;
  private readonly createRequestId: () => ProviderProtocolRequestId;
  private readonly sendHostFrameAndWaitForAcknowledgement: (frame: ProviderProtocolHostFrame) => Promise<void>;
  private readonly unregisterTurn: (turnId: ProviderProtocolTurnId) => void;
  private readonly turnStreamItems = new ProviderProtocolAsyncQueue<ProviderProtocolClientTurnStreamItem>();
  private removeAbortSignalListener: (() => void) | undefined;
  private providerTurnReplay: ProviderTurnReplay | undefined;
  private nextExpectedProviderEventSequenceNumber = 1;
  private hasStartedStreamingProviderEvents = false;
  private hasDisposed = false;
  private hasTurnEnded = false;

  constructor(input: {
    turnId: ProviderProtocolTurnId;
    startRequestAcknowledged: Promise<void>;
    createRequestId: () => ProviderProtocolRequestId;
    sendHostFrameAndWaitForAcknowledgement: (frame: ProviderProtocolHostFrame) => Promise<void>;
    unregisterTurn: (turnId: ProviderProtocolTurnId) => void;
  }) {
    this.turnId = input.turnId;
    this.startRequestAcknowledged = input.startRequestAcknowledged;
    this.createRequestId = input.createRequestId;
    this.sendHostFrameAndWaitForAcknowledgement = input.sendHostFrameAndWaitForAcknowledgement;
    this.unregisterTurn = input.unregisterTurn;
  }

  registerCleanup(removeAbortSignalListener: () => void): void {
    this.removeAbortSignalListener = removeAbortSignalListener;
  }

  async *streamProviderEvents(): AsyncGenerator<ProviderStreamEvent> {
    if (this.hasStartedStreamingProviderEvents) {
      throw new Error("Provider protocol turn events can only be streamed once.");
    }
    this.hasStartedStreamingProviderEvents = true;

    try {
      await this.startRequestAcknowledged;
      for await (const turnStreamItem of this.turnStreamItems) {
        if (turnStreamItem.itemKind === "provider_event") {
          yield turnStreamItem.providerStreamEvent;
          continue;
        }

        if (turnStreamItem.itemKind === "provider_error") {
          throw turnStreamItem.error;
        }

        return;
      }
    } finally {
      this.dispose();
    }
  }

  async submitToolResult(input: ProviderToolResultSubmission): Promise<void> {
    if (this.hasTurnEnded) {
      throw new Error(`Cannot submit tool result ${input.toolCallId} after provider protocol turn ${this.turnId} ended.`);
    }

    await this.startRequestAcknowledged;
    await this.sendHostFrameAndWaitForAcknowledgement({
      protocol: PROVIDER_PROTOCOL_VERSION,
      frameKind: "host_submit_tool_result",
      requestId: this.createRequestId(),
      turnId: this.turnId,
      toolCallId: input.toolCallId,
      toolResultText: input.toolResultText,
    });
  }

  getProviderTurnReplay(): ProviderTurnReplay | undefined {
    return this.providerTurnReplay;
  }

  requestCancellation(cancellationReason: ProviderProtocolCancellationReason): void {
    if (this.hasTurnEnded) {
      return;
    }

    void this.sendHostFrameAndWaitForAcknowledgement({
      protocol: PROVIDER_PROTOCOL_VERSION,
      frameKind: "host_cancel_turn",
      requestId: this.createRequestId(),
      turnId: this.turnId,
      cancellationReason,
    }).catch(() => {});
  }

  receiveProviderEventFrame(frame: ProviderProtocolProviderEventFrame): void {
    if (frame.sequenceNumber !== this.nextExpectedProviderEventSequenceNumber) {
      this.receiveProviderError(new Error(
        `Provider protocol turn ${this.turnId} received sequence ${frame.sequenceNumber}, expected ${this.nextExpectedProviderEventSequenceNumber}.`,
      ));
      return;
    }

    this.nextExpectedProviderEventSequenceNumber += 1;
    this.turnStreamItems.enqueue({ itemKind: "provider_event", providerStreamEvent: frame.providerStreamEvent });
  }

  receiveProviderTurnClosedFrame(frame: ProviderProtocolProviderTurnClosedFrame): void {
    const lastReceivedProviderEventSequenceNumber = this.nextExpectedProviderEventSequenceNumber - 1;
    if (
      frame.finalSequenceNumber !== undefined
      && frame.finalSequenceNumber !== lastReceivedProviderEventSequenceNumber
    ) {
      this.receiveProviderError(new Error(
        `Provider protocol turn ${this.turnId} closed at sequence ${frame.finalSequenceNumber}, expected ${lastReceivedProviderEventSequenceNumber}.`,
      ));
      return;
    }

    this.hasTurnEnded = true;
    this.providerTurnReplay = frame.providerTurnReplay ?? this.providerTurnReplay;
    this.turnStreamItems.enqueue({ itemKind: "provider_turn_closed" });
    this.turnStreamItems.close();
  }

  receiveProviderError(error: Error): void {
    this.hasTurnEnded = true;
    this.turnStreamItems.enqueue({ itemKind: "provider_error", error });
    this.turnStreamItems.close();
  }

  private dispose(): void {
    if (this.hasDisposed) {
      return;
    }

    this.hasDisposed = true;
    this.hasTurnEnded = true;
    this.removeAbortSignalListener?.();
    this.unregisterTurn(this.turnId);
    this.turnStreamItems.close();
  }
}

class ProviderProtocolAsyncQueue<QueuedValue> implements AsyncIterable<QueuedValue> {
  private readonly queuedValues: QueuedValue[] = [];
  private nextQueuedValueIndex = 0;
  private pendingNext: ((result: IteratorResult<QueuedValue>) => void) | undefined;
  private isClosed = false;

  enqueue(value: QueuedValue): void {
    if (this.isClosed) {
      return;
    }

    if (this.pendingNext) {
      const resolvePendingNext = this.pendingNext;
      this.pendingNext = undefined;
      resolvePendingNext({ done: false, value });
      return;
    }

    this.queuedValues.push(value);
  }

  close(): void {
    this.isClosed = true;
    if (!this.pendingNext) {
      return;
    }

    const resolvePendingNext = this.pendingNext;
    this.pendingNext = undefined;
    resolvePendingNext({ done: true, value: undefined });
  }

  [Symbol.asyncIterator](): AsyncIterator<QueuedValue> {
    return {
      next: () => this.next(),
    };
  }

  private next(): Promise<IteratorResult<QueuedValue>> {
    if (this.nextQueuedValueIndex < this.queuedValues.length) {
      const queuedValue = this.queuedValues[this.nextQueuedValueIndex] as QueuedValue;
      this.nextQueuedValueIndex += 1;
      this.compactQueuedValuesIfNeeded();
      return Promise.resolve({ done: false, value: queuedValue });
    }

    if (this.isClosed) {
      return Promise.resolve({ done: true, value: undefined });
    }

    return new Promise<IteratorResult<QueuedValue>>((resolveNext) => {
      this.pendingNext = resolveNext;
    });
  }

  private compactQueuedValuesIfNeeded(): void {
    if (this.nextQueuedValueIndex < 64 || this.nextQueuedValueIndex * 2 < this.queuedValues.length) {
      return;
    }

    this.queuedValues.splice(0, this.nextQueuedValueIndex);
    this.nextQueuedValueIndex = 0;
  }
}

function createProviderProtocolHostStartTurnFrame(input: {
  requestId: ProviderProtocolRequestId;
  turnId: ProviderProtocolTurnId;
  turnRequest: ProviderProtocolTurnRequest;
}): ProviderProtocolHostStartTurnFrame {
  return {
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "host_start_turn",
    requestId: input.requestId,
    turnId: input.turnId,
    turnRequest: input.turnRequest,
  };
}

async function waitForProviderProtocolRequestAcknowledgement(input: {
  requestId: ProviderProtocolRequestId;
  frameKind: ProviderProtocolHostFrame["frameKind"];
  timeoutMilliseconds: number;
  sendHostFrameAndWaitForAcknowledgement: () => Promise<void>;
}): Promise<void> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(
        `Provider protocol host did not acknowledge ${input.frameKind} request ${input.requestId} within ${input.timeoutMilliseconds}ms.`,
      ));
    }, input.timeoutMilliseconds);
  });

  try {
    await Promise.race([input.sendHostFrameAndWaitForAcknowledgement(), timeoutPromise]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

function normalizeProviderProtocolTimeoutMilliseconds(requestedTimeoutMilliseconds: number | undefined, defaultTimeoutMilliseconds: number): number {
  if (requestedTimeoutMilliseconds === undefined || !Number.isFinite(requestedTimeoutMilliseconds)) {
    return defaultTimeoutMilliseconds;
  }

  return Math.max(1, Math.floor(requestedTimeoutMilliseconds));
}

function createProviderProtocolHostListModelsFrame(input: {
  requestId: ProviderProtocolRequestId;
}): ProviderProtocolHostListModelsFrame {
  return {
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "host_list_models",
    requestId: input.requestId,
  };
}

function createProviderProtocolTurnRequest(input: ProviderConversationTurnRequest): ProviderProtocolTurnRequest {
  return {
    ...(input.conversationTurnId !== undefined ? { conversationTurnId: input.conversationTurnId } : {}),
    systemPromptText: input.systemPromptText,
    conversationSessionEntries: [...input.conversationSessionEntries],
    selectedModelId: input.selectedModelId,
    ...(input.selectedReasoningEffort !== undefined ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
    ...(input.promptCacheKey !== undefined ? { promptCacheKey: input.promptCacheKey } : {}),
    ...(input.availableToolNames !== undefined ? { availableToolNames: [...input.availableToolNames] } : {}),
  };
}

function createDeferredPromise<ResolvedValue>(): DeferredPromise<ResolvedValue> {
  let resolvePromise: ((resolvedValue: ResolvedValue) => void) | undefined;
  let rejectPromise: ((error: Error) => void) | undefined;
  const promise = new Promise<ResolvedValue>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve: (resolvedValue) => resolvePromise?.(resolvedValue),
    reject: (error) => rejectPromise?.(error),
  };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function assertUnhandledProviderProtocolProviderFrame(providerFrame: never): never {
  throw new Error(`Unhandled provider protocol provider frame: ${JSON.stringify(providerFrame)}`);
}
