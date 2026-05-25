import {
  PROVIDER_PROTOCOL_VERSION,
  encodeProviderProtocolFrameAsJsonLine,
  streamProviderProtocolHostFramesFromJsonLines,
  type AvailableAssistantModel,
  type ProviderProtocolClosedReason,
  type ProviderProtocolError,
  type ProviderProtocolHostCancelTurnFrame,
  type ProviderProtocolHostFrame,
  type ProviderProtocolHostListModelsFrame,
  type ProviderProtocolHostStartTurnFrame,
  type ProviderProtocolHostSubmitToolResultFrame,
  type ProviderProtocolJsonLineChunk,
  type ProviderProtocolProviderFrame,
  type ProviderProtocolTurnId,
  type ProviderProtocolTurnRequest,
  type ProviderStreamEvent,
  type ProviderTurnReplay,
} from "@buli/contracts";

type ProviderProtocolHostToolResultSubmission = Readonly<{
  toolCallId: string;
  toolResultText: string;
}>;

export type OpenAiProviderProtocolHostConversationTurn = Readonly<{
  streamProviderEvents: () => AsyncIterable<ProviderStreamEvent>;
  submitToolResult: (input: ProviderProtocolHostToolResultSubmission) => Promise<void>;
  getProviderTurnReplay: () => ProviderTurnReplay | undefined;
}>;

export type OpenAiProviderProtocolHostTurnRequest = ProviderProtocolTurnRequest & Readonly<{
  abortSignal?: AbortSignal | undefined;
}>;

export type OpenAiProviderProtocolHostConversationTurnProvider = Readonly<{
  listAvailableAssistantModels?: (() => Promise<readonly AvailableAssistantModel[]> | readonly AvailableAssistantModel[]) | undefined;
  startConversationTurn: (input: OpenAiProviderProtocolHostTurnRequest) => OpenAiProviderProtocolHostConversationTurn;
}>;

export type OpenAiProviderProtocolHostTransport = Readonly<{
  hostFrames: AsyncIterable<ProviderProtocolHostFrame>;
  sendProviderFrame: (frame: ProviderProtocolProviderFrame) => Promise<void>;
}>;

export type RunOpenAiProviderProtocolHostInput = Readonly<{
  provider: OpenAiProviderProtocolHostConversationTurnProvider;
  transport: OpenAiProviderProtocolHostTransport;
  providerName?: string | undefined;
}>;

export type RunOpenAiProviderProtocolJsonLineHostInput = Readonly<{
  provider: OpenAiProviderProtocolHostConversationTurnProvider;
  hostFrameChunks: AsyncIterable<ProviderProtocolJsonLineChunk>;
  writeProviderFrameJsonLine: (jsonLine: string) => Promise<void>;
  providerName?: string | undefined;
}>;

type ActiveOpenAiProviderProtocolTurn = Readonly<{
  turnId: ProviderProtocolTurnId;
  submitToolResult: (input: ProviderProtocolHostToolResultSubmission) => Promise<void>;
  requestCancellation: () => void;
  waitUntilClosed: () => Promise<void>;
}>;

const DEFAULT_OPENAI_PROVIDER_PROTOCOL_PROVIDER_NAME = "openai";

export async function runOpenAiProviderProtocolHost(input: RunOpenAiProviderProtocolHostInput): Promise<void> {
  const activeProviderTurnsById = new Map<ProviderProtocolTurnId, ActiveOpenAiProviderProtocolTurn>();
  const providerName = input.providerName ?? DEFAULT_OPENAI_PROVIDER_PROTOCOL_PROVIDER_NAME;
  const sendProviderFrame = input.transport.sendProviderFrame;

  try {
    for await (const hostFrame of input.transport.hostFrames) {
      switch (hostFrame.frameKind) {
        case "host_list_models":
          await listOpenAiProviderProtocolModels({
            provider: input.provider,
            providerName,
            hostListModelsFrame: hostFrame,
            sendProviderFrame,
          });
          continue;
        case "host_start_turn":
          await startOpenAiProviderProtocolTurn({
            provider: input.provider,
            providerName,
            hostStartTurnFrame: hostFrame,
            activeProviderTurnsById,
            sendProviderFrame,
          });
          continue;
        case "host_submit_tool_result":
          await submitOpenAiProviderProtocolToolResult({
            providerName,
            hostSubmitToolResultFrame: hostFrame,
            activeProviderTurnsById,
            sendProviderFrame,
          });
          continue;
        case "host_cancel_turn":
          await cancelOpenAiProviderProtocolTurn({
            providerName,
            hostCancelTurnFrame: hostFrame,
            activeProviderTurnsById,
            sendProviderFrame,
          });
          continue;
        default:
          assertUnhandledProviderProtocolHostFrame(hostFrame);
      }
    }
  } finally {
    const activeProviderTurns = [...activeProviderTurnsById.values()];
    for (const activeProviderTurn of activeProviderTurns) {
      activeProviderTurn.requestCancellation();
    }
    await Promise.allSettled(activeProviderTurns.map((activeProviderTurn) => activeProviderTurn.waitUntilClosed()));
  }
}

export async function runOpenAiProviderProtocolJsonLineHost(
  input: RunOpenAiProviderProtocolJsonLineHostInput,
): Promise<void> {
  await runOpenAiProviderProtocolHost({
    provider: input.provider,
    ...(input.providerName !== undefined ? { providerName: input.providerName } : {}),
    transport: {
      hostFrames: streamProviderProtocolHostFramesFromJsonLines(input.hostFrameChunks),
      sendProviderFrame: async (frame) => {
        await input.writeProviderFrameJsonLine(encodeProviderProtocolFrameAsJsonLine(frame));
      },
    },
  });
}

async function listOpenAiProviderProtocolModels(input: {
  provider: OpenAiProviderProtocolHostConversationTurnProvider;
  providerName: string;
  hostListModelsFrame: ProviderProtocolHostListModelsFrame;
  sendProviderFrame: (frame: ProviderProtocolProviderFrame) => Promise<void>;
}): Promise<void> {
  if (!input.provider.listAvailableAssistantModels) {
    await input.sendProviderFrame(createProviderProtocolErrorFrame({
      requestId: input.hostListModelsFrame.requestId,
      providerName: input.providerName,
      errorCode: "provider_model_list_unsupported",
      error: new Error("Provider protocol host does not support model listing."),
    }));
    return;
  }

  try {
    await input.sendProviderFrame(createProviderProtocolAcknowledgementFrame(input.hostListModelsFrame));
    await input.sendProviderFrame({
      protocol: PROVIDER_PROTOCOL_VERSION,
      frameKind: "provider_available_models",
      requestId: input.hostListModelsFrame.requestId,
      availableModels: [...await input.provider.listAvailableAssistantModels()],
    });
  } catch (error) {
    await input.sendProviderFrame(createProviderProtocolErrorFrame({
      requestId: input.hostListModelsFrame.requestId,
      providerName: input.providerName,
      errorCode: "provider_model_list_failed",
      error,
    }));
  }
}

async function startOpenAiProviderProtocolTurn(input: {
  provider: OpenAiProviderProtocolHostConversationTurnProvider;
  providerName: string;
  hostStartTurnFrame: ProviderProtocolHostStartTurnFrame;
  activeProviderTurnsById: Map<ProviderProtocolTurnId, ActiveOpenAiProviderProtocolTurn>;
  sendProviderFrame: (frame: ProviderProtocolProviderFrame) => Promise<void>;
}): Promise<void> {
  const abortController = new AbortController();
  let providerConversationTurn: OpenAiProviderProtocolHostConversationTurn;
  try {
    providerConversationTurn = input.provider.startConversationTurn({
      ...input.hostStartTurnFrame.turnRequest,
      abortSignal: abortController.signal,
    });
  } catch (error) {
    await input.sendProviderFrame(createProviderProtocolErrorFrame({
      requestId: input.hostStartTurnFrame.requestId,
      turnId: input.hostStartTurnFrame.turnId,
      providerName: input.providerName,
      errorCode: "provider_turn_start_failed",
      error,
    }));
    return;
  }

  const activeProviderTurn = new OpenAiProviderProtocolTurnHost({
    turnId: input.hostStartTurnFrame.turnId,
    providerName: input.providerName,
    providerConversationTurn,
    abortController,
    sendProviderFrame: input.sendProviderFrame,
    onTurnClosed: (turnId) => input.activeProviderTurnsById.delete(turnId),
  });
  input.activeProviderTurnsById.set(input.hostStartTurnFrame.turnId, activeProviderTurn);
  await input.sendProviderFrame(createProviderProtocolAcknowledgementFrame(input.hostStartTurnFrame));
  activeProviderTurn.startStreamingProviderEvents();
}

async function submitOpenAiProviderProtocolToolResult(input: {
  providerName: string;
  hostSubmitToolResultFrame: ProviderProtocolHostSubmitToolResultFrame;
  activeProviderTurnsById: Map<ProviderProtocolTurnId, ActiveOpenAiProviderProtocolTurn>;
  sendProviderFrame: (frame: ProviderProtocolProviderFrame) => Promise<void>;
}): Promise<void> {
  const activeProviderTurn = input.activeProviderTurnsById.get(input.hostSubmitToolResultFrame.turnId);
  if (!activeProviderTurn) {
    await input.sendProviderFrame(createProviderTurnNotFoundErrorFrame({
      providerName: input.providerName,
      requestId: input.hostSubmitToolResultFrame.requestId,
      turnId: input.hostSubmitToolResultFrame.turnId,
    }));
    return;
  }

  try {
    await activeProviderTurn.submitToolResult({
      toolCallId: input.hostSubmitToolResultFrame.toolCallId,
      toolResultText: input.hostSubmitToolResultFrame.toolResultText,
    });
    await input.sendProviderFrame(createProviderProtocolAcknowledgementFrame(input.hostSubmitToolResultFrame));
  } catch (error) {
    await input.sendProviderFrame(createProviderProtocolErrorFrame({
      providerName: input.providerName,
      requestId: input.hostSubmitToolResultFrame.requestId,
      turnId: input.hostSubmitToolResultFrame.turnId,
      errorCode: "provider_tool_result_submission_failed",
      error,
    }));
  }
}

async function cancelOpenAiProviderProtocolTurn(input: {
  providerName: string;
  hostCancelTurnFrame: ProviderProtocolHostCancelTurnFrame;
  activeProviderTurnsById: Map<ProviderProtocolTurnId, ActiveOpenAiProviderProtocolTurn>;
  sendProviderFrame: (frame: ProviderProtocolProviderFrame) => Promise<void>;
}): Promise<void> {
  const activeProviderTurn = input.activeProviderTurnsById.get(input.hostCancelTurnFrame.turnId);
  if (!activeProviderTurn) {
    await input.sendProviderFrame(createProviderTurnNotFoundErrorFrame({
      providerName: input.providerName,
      requestId: input.hostCancelTurnFrame.requestId,
      turnId: input.hostCancelTurnFrame.turnId,
    }));
    return;
  }

  activeProviderTurn.requestCancellation();
  await input.sendProviderFrame(createProviderProtocolAcknowledgementFrame(input.hostCancelTurnFrame));
}

class OpenAiProviderProtocolTurnHost implements ActiveOpenAiProviderProtocolTurn {
  readonly turnId: ProviderProtocolTurnId;
  private readonly providerName: string;
  private readonly providerConversationTurn: OpenAiProviderProtocolHostConversationTurn;
  private readonly abortController: AbortController;
  private readonly sendProviderFrame: (frame: ProviderProtocolProviderFrame) => Promise<void>;
  private readonly onTurnClosed: (turnId: ProviderProtocolTurnId) => void;
  private providerEventSequenceNumber = 0;
  private terminalClosedReason: ProviderProtocolClosedReason | undefined;
  private streamCompletion: Promise<void> | undefined;

  constructor(input: {
    turnId: ProviderProtocolTurnId;
    providerName: string;
    providerConversationTurn: OpenAiProviderProtocolHostConversationTurn;
    abortController: AbortController;
    sendProviderFrame: (frame: ProviderProtocolProviderFrame) => Promise<void>;
    onTurnClosed: (turnId: ProviderProtocolTurnId) => void;
  }) {
    this.turnId = input.turnId;
    this.providerName = input.providerName;
    this.providerConversationTurn = input.providerConversationTurn;
    this.abortController = input.abortController;
    this.sendProviderFrame = input.sendProviderFrame;
    this.onTurnClosed = input.onTurnClosed;
  }

  startStreamingProviderEvents(): void {
    if (this.streamCompletion) {
      return;
    }

    this.streamCompletion = this.streamProviderEventsToProtocolFrames();
    void this.streamCompletion.catch(() => {});
  }

  async submitToolResult(input: ProviderProtocolHostToolResultSubmission): Promise<void> {
    await this.providerConversationTurn.submitToolResult(input);
  }

  requestCancellation(): void {
    if (this.abortController.signal.aborted) {
      return;
    }

    this.abortController.abort();
  }

  waitUntilClosed(): Promise<void> {
    return this.streamCompletion ?? Promise.resolve();
  }

  private async streamProviderEventsToProtocolFrames(): Promise<void> {
    try {
      for await (const providerStreamEvent of this.providerConversationTurn.streamProviderEvents()) {
        this.providerEventSequenceNumber += 1;
        this.terminalClosedReason = readTerminalClosedReason(providerStreamEvent) ?? this.terminalClosedReason;
        await this.sendProviderFrame(this.createProviderProtocolEventFrame(providerStreamEvent));
      }

      await this.sendProviderFrame(this.createProviderProtocolTurnClosedFrame(
        this.terminalClosedReason ?? (this.abortController.signal.aborted ? "cancelled" : "incomplete"),
      ));
    } catch (error) {
      await this.sendProviderFrame(createProviderProtocolErrorFrame({
        providerName: this.providerName,
        turnId: this.turnId,
        errorCode: "provider_turn_stream_failed",
        error,
      }));
      await this.sendProviderFrame(this.createProviderProtocolTurnClosedFrame(
        this.abortController.signal.aborted ? "cancelled" : "failed",
      ));
    } finally {
      this.onTurnClosed(this.turnId);
    }
  }

  private createProviderProtocolEventFrame(providerStreamEvent: ProviderStreamEvent): ProviderProtocolProviderFrame {
    return {
      protocol: PROVIDER_PROTOCOL_VERSION,
      frameKind: "provider_event",
      turnId: this.turnId,
      sequenceNumber: this.providerEventSequenceNumber,
      providerStreamEvent,
    };
  }

  private createProviderProtocolTurnClosedFrame(closedReason: ProviderProtocolClosedReason): ProviderProtocolProviderFrame {
    const providerTurnReplay = this.providerConversationTurn.getProviderTurnReplay();
    return {
      protocol: PROVIDER_PROTOCOL_VERSION,
      frameKind: "provider_turn_closed",
      turnId: this.turnId,
      closedReason,
      ...(this.providerEventSequenceNumber > 0 ? { finalSequenceNumber: this.providerEventSequenceNumber } : {}),
      ...(providerTurnReplay !== undefined ? { providerTurnReplay } : {}),
    };
  }
}

function createProviderProtocolAcknowledgementFrame(
  hostFrame: ProviderProtocolHostFrame,
): ProviderProtocolProviderFrame {
  const acknowledgementFrame: ProviderProtocolProviderFrame = {
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_request_acknowledged",
    requestId: hostFrame.requestId,
    acknowledgedFrameKind: hostFrame.frameKind,
  };
  if ("turnId" in hostFrame) {
    return {
      ...acknowledgementFrame,
      turnId: hostFrame.turnId,
    };
  }

  return acknowledgementFrame;
}

function createProviderTurnNotFoundErrorFrame(input: {
  providerName: string;
  requestId: string;
  turnId: ProviderProtocolTurnId;
}): ProviderProtocolProviderFrame {
  return {
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_error",
    requestId: input.requestId,
    turnId: input.turnId,
    error: {
      errorCode: "provider_turn_not_found",
      errorMessage: `Provider protocol turn ${input.turnId} is not active.`,
      providerName: input.providerName,
    },
  };
}

function createProviderProtocolErrorFrame(input: {
  providerName: string;
  errorCode: string;
  error: unknown;
  requestId?: string | undefined;
  turnId?: ProviderProtocolTurnId | undefined;
}): ProviderProtocolProviderFrame {
  return {
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_error",
    ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
    ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
    error: createProviderProtocolError(input),
  };
}

function createProviderProtocolError(input: {
  providerName: string;
  errorCode: string;
  error: unknown;
}): ProviderProtocolError {
  const errorMessage = createErrorMessage(input.error);
  return {
    errorCode: input.errorCode,
    errorMessage: errorMessage.length > 0 ? errorMessage : "Unknown OpenAI provider protocol host error.",
    providerName: input.providerName,
    ...(input.error instanceof Error && input.error.name.length > 0
      ? { details: { errorName: input.error.name } }
      : {}),
  };
}

function createErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readTerminalClosedReason(providerStreamEvent: ProviderStreamEvent): ProviderProtocolClosedReason | undefined {
  if (providerStreamEvent.type === "completed") {
    return "completed";
  }

  if (providerStreamEvent.type === "incomplete") {
    return "incomplete";
  }

  return undefined;
}

function assertUnhandledProviderProtocolHostFrame(hostFrame: never): never {
  throw new Error(`Unhandled provider protocol host frame: ${JSON.stringify(hostFrame)}`);
}
