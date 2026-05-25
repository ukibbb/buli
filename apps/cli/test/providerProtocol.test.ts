import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROVIDER_PROTOCOL_VERSION,
  decodeProviderProtocolProviderFrameFromJsonLine,
  encodeProviderProtocolFrameAsJsonLine,
  type AvailableAssistantModel,
  type ConversationSessionEntry,
  type ConversationSessionModelSelection,
  type ProviderProtocolHostFrame,
  type ProviderProtocolProviderFrame,
  type ProviderStreamEvent,
  type ProviderTurnReplay,
} from "@buli/contracts";
import {
  AssistantConversationRuntime,
  ProviderProtocolConversationTurnProvider,
} from "@buli/engine";
import {
  OpenAiAuthStore,
  OpenAiProvider,
  type OpenAiProviderProtocolHostConversationTurn,
  type OpenAiProviderProtocolHostConversationTurnProvider,
  type OpenAiProviderProtocolHostTurnRequest,
} from "@buli/openai";
import { runInteractiveChat } from "../src/commands/chat.ts";
import type { ConversationSessionStore } from "../src/conversationSession/index.ts";
import { OPENAI_PROVIDER_PROTOCOL_IPC_ENVIRONMENT_VALUE } from "../src/interactiveChat/interactiveChatEnvironment.ts";
import { runOpenAiProviderHostEntrypoint } from "../src/providerProtocol/openAiProviderHostEntrypoint.ts";
import {
  ProviderProtocolSubprocessTransport,
  type ProviderProtocolSubprocess,
  type ProviderProtocolSubprocessSpawnInput,
} from "../src/providerProtocol/providerProtocolSubprocessTransport.ts";
import {
  resolveInteractiveChatConversationTurnProvider,
  type CreateInteractiveChatProviderProtocolTransportInput,
  type DisposableProviderProtocolClientTransport,
} from "../src/providerProtocol/resolveInteractiveChatConversationTurnProvider.ts";

const completedUsage = {
  input: 10,
  output: 4,
  reasoning: 0,
  cache: { read: 0, write: 0 },
};

class EmptyProviderProtocolClientTransport implements DisposableProviderProtocolClientTransport {
  private readonly disposeCallback: () => void;

  constructor(disposeCallback: () => void = () => {}) {
    this.disposeCallback = disposeCallback;
  }

  receiveProviderFrames(): AsyncIterable<ProviderProtocolProviderFrame> {
    return streamEmptyProviderProtocolProviderFrames();
  }

  async sendHostFrame(): Promise<void> {}

  async dispose(): Promise<void> {
    this.disposeCallback();
  }
}

class ScriptedOpenAiProviderProtocolHostProvider implements OpenAiProviderProtocolHostConversationTurnProvider {
  readonly startedTurnRequests: OpenAiProviderProtocolHostTurnRequest[] = [];
  private readonly providerTurn: OpenAiProviderProtocolHostConversationTurn;
  private readonly availableModels: readonly AvailableAssistantModel[];

  constructor(
    providerTurn: OpenAiProviderProtocolHostConversationTurn,
    availableModels: readonly AvailableAssistantModel[] = [],
  ) {
    this.providerTurn = providerTurn;
    this.availableModels = availableModels;
  }

  listAvailableAssistantModels(): readonly AvailableAssistantModel[] {
    return this.availableModels;
  }

  startConversationTurn(input: OpenAiProviderProtocolHostTurnRequest): OpenAiProviderProtocolHostConversationTurn {
    this.startedTurnRequests.push(input);
    return this.providerTurn;
  }
}

class CompletedOpenAiProviderProtocolHostTurn implements OpenAiProviderProtocolHostConversationTurn {
  async *streamProviderEvents(): AsyncGenerator<ProviderStreamEvent> {
    yield { type: "text_chunk", text: "Hello" };
    yield { type: "completed", usage: completedUsage };
  }

  async submitToolResult(): Promise<void> {}

  getProviderTurnReplay(): ProviderTurnReplay | undefined {
    return { provider: "openai", inputItems: [] };
  }
}

async function* streamEmptyProviderProtocolProviderFrames(): AsyncGenerator<ProviderProtocolProviderFrame> {}

async function* streamProviderProtocolTestChunks(chunks: readonly string[]): AsyncGenerator<string> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

function createHostStartTurnFrame(): ProviderProtocolHostFrame {
  return {
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "host_start_turn",
    requestId: "req-start-1",
    turnId: "turn-1",
    turnRequest: {
      systemPromptText: "You are Buli.",
      conversationSessionEntries: [],
      selectedModelId: "gpt-5.5",
    },
  };
}

function createHostListModelsFrame(): ProviderProtocolHostFrame {
  return {
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "host_list_models",
    requestId: "req-models-1",
  };
}

test("resolveInteractiveChatConversationTurnProvider keeps direct OpenAI as the default", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-provider-resolution-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  const openAiProvider = new OpenAiProvider({ store });

  const resolution = resolveInteractiveChatConversationTurnProvider({
    openAiProvider,
    store,
    environment: {},
    workspaceRootPath: process.cwd(),
  });

  expect(resolution.providerConnectionKind).toBe("direct_openai");
  expect(resolution.conversationTurnProvider).toBe(openAiProvider);
  await resolution.dispose();
});

test("resolveInteractiveChatConversationTurnProvider creates IPC provider when explicitly enabled", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-cli-provider-resolution-ipc-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  const openAiProvider = new OpenAiProvider({ store });
  let capturedTransportInput: CreateInteractiveChatProviderProtocolTransportInput | undefined;
  let didDisposeTransport = false;

  const resolution = resolveInteractiveChatConversationTurnProvider({
    openAiProvider,
    store,
    environment: { BULI_PROVIDER_IPC: OPENAI_PROVIDER_PROTOCOL_IPC_ENVIRONMENT_VALUE, PATH: "/bin" },
    workspaceRootPath: process.cwd(),
    providerHostCommand: ["bun", "provider-host.ts"],
    createProviderProtocolTransport: (transportInput) => {
      capturedTransportInput = transportInput;
      return new EmptyProviderProtocolClientTransport(() => {
        didDisposeTransport = true;
      });
    },
  });

  expect(resolution.providerConnectionKind).toBe("openai_provider_protocol_ipc");
  expect(resolution.conversationTurnProvider).toBeInstanceOf(ProviderProtocolConversationTurnProvider);
  expect(capturedTransportInput).toEqual({
    command: ["bun", "provider-host.ts"],
    environment: {
      BULI_PROVIDER_IPC: OPENAI_PROVIDER_PROTOCOL_IPC_ENVIRONMENT_VALUE,
      BULI_OPENAI_AUTH_FILE: store.filePath,
      PATH: "/bin",
    },
    workingDirectoryPath: process.cwd(),
  });

  await resolution.dispose();
  expect(didDisposeTransport).toBe(true);
});

test("ProviderProtocolSubprocessTransport writes host frames and decodes provider stdout", async () => {
  const hostFrame = createHostStartTurnFrame();
  const providerFrame: ProviderProtocolProviderFrame = {
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_request_acknowledged",
    requestId: "req-start-1",
    turnId: "turn-1",
    acknowledgedFrameKind: "host_start_turn",
  };
  let capturedSpawnInput: ProviderProtocolSubprocessSpawnInput | undefined;
  let stdinText = "";
  let didKillSubprocess = false;
  const textDecoder = new TextDecoder();
  const textEncoder = new TextEncoder();
  const subprocess: ProviderProtocolSubprocess = {
    stdout: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(textEncoder.encode(encodeProviderProtocolFrameAsJsonLine(providerFrame)));
        controller.close();
      },
    }),
    exited: Promise.resolve(0),
    writeStdin: async (chunk) => {
      stdinText += textDecoder.decode(chunk, { stream: true });
    },
    closeStdin: async () => {},
    kill: () => {
      didKillSubprocess = true;
    },
  };
  const transport = new ProviderProtocolSubprocessTransport({
    command: ["bun", "provider-host.ts"],
    environment: { PATH: "/bin", OMITTED: undefined },
    workingDirectoryPath: "/workspace",
    gracefulShutdownTimeoutMilliseconds: 1,
    spawnSubprocess: (spawnInput) => {
      capturedSpawnInput = spawnInput;
      return subprocess;
    },
  });

  await transport.sendHostFrame(hostFrame);
  const decodedProviderFrames: ProviderProtocolProviderFrame[] = [];
  for await (const decodedProviderFrame of transport.receiveProviderFrames()) {
    decodedProviderFrames.push(decodedProviderFrame);
  }
  await transport.dispose();

  expect(capturedSpawnInput).toEqual({
    command: ["bun", "provider-host.ts"],
    environment: { PATH: "/bin", OMITTED: undefined },
    workingDirectoryPath: "/workspace",
  });
  expect(stdinText).toBe(encodeProviderProtocolFrameAsJsonLine(hostFrame));
  expect(decodedProviderFrames).toEqual([providerFrame]);
  expect(didKillSubprocess).toBe(false);
});

test("ProviderProtocolSubprocessTransport carries a real provider turn over stdio", async () => {
  const transport = new ProviderProtocolSubprocessTransport({
    command: [process.execPath, fileURLToPath(new URL("./fixtures/providerProtocolFixtureHost.ts", import.meta.url))],
    environment: process.env,
    workingDirectoryPath: process.cwd(),
    gracefulShutdownTimeoutMilliseconds: 1_000,
  });
  const provider = new ProviderProtocolConversationTurnProvider({ transport });
  const providerTurn = provider.startConversationTurn({
    systemPromptText: "You are Buli.",
    conversationSessionEntries: [],
    selectedModelId: "gpt-5.5",
    availableToolNames: ["read"],
  });
  const providerEvents: ProviderStreamEvent[] = [];

  try {
    for await (const providerEvent of providerTurn.streamProviderEvents()) {
      providerEvents.push(providerEvent);
      if (providerEvent.type === "tool_call_requested") {
        await providerTurn.submitToolResult({
          toolCallId: providerEvent.toolCallId,
          toolResultText: "README contents from fixture",
        });
      }
    }
  } finally {
    await transport.dispose();
  }

  expect(providerEvents.map((providerEvent) => providerEvent.type)).toEqual([
    "tool_call_requested",
    "text_chunk",
    "completed",
  ]);
  expect(providerEvents[0]).toMatchObject({
    type: "tool_call_requested",
    toolCallId: "call-read-fixture",
    toolCallRequest: {
      toolName: "read",
      readTargetPath: "README.md",
    },
  });
  expect(providerTurn.getProviderTurnReplay()).toEqual({ provider: "openai", inputItems: [] });
});

test("runOpenAiProviderHostEntrypoint serves provider protocol frames outside public CLI dispatch", async () => {
  const provider = new ScriptedOpenAiProviderProtocolHostProvider(new CompletedOpenAiProviderProtocolHostTurn());
  const writtenProviderJsonLines: string[] = [];

  await runOpenAiProviderHostEntrypoint({
    provider,
    hostFrameChunks: streamProviderProtocolTestChunks([encodeProviderProtocolFrameAsJsonLine(createHostStartTurnFrame())]),
    writeProviderFrameJsonLine: async (jsonLine) => {
      writtenProviderJsonLines.push(jsonLine);
    },
  });

  const writtenProviderFrames = writtenProviderJsonLines.map((jsonLine) =>
    decodeProviderProtocolProviderFrameFromJsonLine(jsonLine)
  );
  expect(provider.startedTurnRequests).toHaveLength(1);
  expect(writtenProviderFrames.map((frame) => frame.frameKind)).toEqual([
    "provider_request_acknowledged",
    "provider_event",
    "provider_event",
    "provider_turn_closed",
  ]);
  expect(writtenProviderFrames.at(-1)).toMatchObject({
    frameKind: "provider_turn_closed",
    closedReason: "completed",
  });
});

test("runOpenAiProviderHostEntrypoint serves model listing frames", async () => {
  const provider = new ScriptedOpenAiProviderProtocolHostProvider(new CompletedOpenAiProviderProtocolHostTurn(), [
    {
      id: "fixture-model",
      displayName: "Fixture model",
      supportedReasoningEfforts: ["medium"],
    },
  ]);
  const writtenProviderJsonLines: string[] = [];

  await runOpenAiProviderHostEntrypoint({
    provider,
    hostFrameChunks: streamProviderProtocolTestChunks([encodeProviderProtocolFrameAsJsonLine(createHostListModelsFrame())]),
    writeProviderFrameJsonLine: async (jsonLine) => {
      writtenProviderJsonLines.push(jsonLine);
    },
  });

  const writtenProviderFrames = writtenProviderJsonLines.map((jsonLine) =>
    decodeProviderProtocolProviderFrameFromJsonLine(jsonLine)
  );
  expect(writtenProviderFrames).toEqual([
    {
      protocol: PROVIDER_PROTOCOL_VERSION,
      frameKind: "provider_request_acknowledged",
      requestId: "req-models-1",
      acknowledgedFrameKind: "host_list_models",
    },
    {
      protocol: PROVIDER_PROTOCOL_VERSION,
      frameKind: "provider_available_models",
      requestId: "req-models-1",
      availableModels: [
        {
          id: "fixture-model",
          displayName: "Fixture model",
          supportedReasoningEfforts: ["medium"],
        },
      ],
    },
  ]);
});

test("runInteractiveChat wires the direct provider by default and IPC provider when requested", async () => {
  const directDir = await mkdtemp(join(tmpdir(), "buli-cli-direct-provider-"));
  const directStore = new OpenAiAuthStore({ filePath: join(directDir, "auth.json") });
  const directConversationSessionStore = createConversationSessionStoreStub({ directoryPath: directDir });
  let directRuntime: AssistantConversationRuntime | undefined;
  await directStore.saveOpenAi(createValidOpenAiAuth());

  await expect(runInteractiveChat({
    store: directStore,
    conversationSessionStore: directConversationSessionStore,
    stdin: { isTTY: true },
    environment: {},
    renderChatScreen: async (renderInput) => {
      directRuntime = renderInput.assistantConversationRunner as AssistantConversationRuntime;
      return { destroy: () => {}, waitUntilExit: async () => {} };
    },
  })).resolves.toBe("");
  expect(directRuntime?.conversationTurnProvider).toBeInstanceOf(OpenAiProvider);

  const ipcDir = await mkdtemp(join(tmpdir(), "buli-cli-ipc-provider-"));
  const ipcStore = new OpenAiAuthStore({ filePath: join(ipcDir, "auth.json") });
  const ipcConversationSessionStore = createConversationSessionStoreStub({ directoryPath: ipcDir });
  let ipcRuntime: AssistantConversationRuntime | undefined;
  let capturedTransportInput: CreateInteractiveChatProviderProtocolTransportInput | undefined;
  let didDisposeTransport = false;
  await ipcStore.saveOpenAi(createValidOpenAiAuth());

  await expect(runInteractiveChat({
    store: ipcStore,
    conversationSessionStore: ipcConversationSessionStore,
    stdin: { isTTY: true },
    environment: { BULI_PROVIDER_IPC: OPENAI_PROVIDER_PROTOCOL_IPC_ENVIRONMENT_VALUE },
    providerHostCommand: ["bun", "provider-host.ts"],
    createProviderProtocolTransport: (transportInput) => {
      capturedTransportInput = transportInput;
      return new EmptyProviderProtocolClientTransport(() => {
        didDisposeTransport = true;
      });
    },
    renderChatScreen: async (renderInput) => {
      ipcRuntime = renderInput.assistantConversationRunner as AssistantConversationRuntime;
      return { destroy: () => {}, waitUntilExit: async () => {} };
    },
  })).resolves.toBe("");
  expect(ipcRuntime?.conversationTurnProvider).toBeInstanceOf(ProviderProtocolConversationTurnProvider);
  expect(capturedTransportInput?.environment["BULI_OPENAI_AUTH_FILE"]).toBe(ipcStore.filePath);
  expect(didDisposeTransport).toBe(true);
});

test("runInteractiveChat can use an external provider host command without OpenAI auth", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-cli-external-provider-"));
  const store = new OpenAiAuthStore({ filePath: join(directoryPath, "auth.json") });
  const conversationSessionStore = createConversationSessionStoreStub({ directoryPath });
  let capturedRuntime: AssistantConversationRuntime | undefined;
  let capturedTransportInput: CreateInteractiveChatProviderProtocolTransportInput | undefined;

  await expect(runInteractiveChat({
    store,
    conversationSessionStore,
    stdin: { isTTY: true },
    environment: { BULI_PROVIDER_HOST_COMMAND: "[\"python3\",\"provider.py\"]" },
    createProviderProtocolTransport: (transportInput) => {
      capturedTransportInput = transportInput;
      return new EmptyProviderProtocolClientTransport();
    },
    renderChatScreen: async (renderInput) => {
      capturedRuntime = renderInput.assistantConversationRunner as AssistantConversationRuntime;
      return { destroy: () => {}, waitUntilExit: async () => {} };
    },
  })).resolves.toBe("");

  expect(capturedRuntime?.conversationTurnProvider).toBeInstanceOf(ProviderProtocolConversationTurnProvider);
  expect(capturedTransportInput).toEqual({
    command: ["python3", "provider.py"],
    environment: { BULI_PROVIDER_HOST_COMMAND: "[\"python3\",\"provider.py\"]" },
    workingDirectoryPath: process.cwd(),
  });
});

function createValidOpenAiAuth() {
  return {
    provider: "openai" as const,
    method: "oauth" as const,
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 60_000,
    accountId: "acct_123",
  };
}

function createConversationSessionStoreStub(input: {
  directoryPath: string;
  activeModelSelection?: ConversationSessionModelSelection | undefined;
  initialConversationSessionEntries?: readonly ConversationSessionEntry[] | undefined;
}): ConversationSessionStore {
  const initialConversationSessionEntries = input.initialConversationSessionEntries ?? [];
  let activeModelSelection = input.activeModelSelection;
  return {
    storagePath: join(input.directoryPath, "session-store.sqlite"),
    promptCacheKey: "buli:test-workspace",
    loadActiveConversationSessionMetadata: () => ({
      sessionId: "session-a",
      modelSelection: activeModelSelection,
      conversationSessionEntryCount: initialConversationSessionEntries.length,
    }),
    loadActiveConversationSession: () => ({
      sessionId: "session-a",
      modelSelection: activeModelSelection,
      conversationSessionEntries: initialConversationSessionEntries,
    }),
    loadConversationSessionEntries: () => initialConversationSessionEntries,
    appendConversationSessionEntry: () => {},
    saveActiveConversationSessionModelSelection: (modelSelection) => {
      activeModelSelection = modelSelection;
    },
    saveConversationSessionEntries: () => {},
    startNewConversationSession: (startNewConversationSessionInput) => {
      activeModelSelection = startNewConversationSessionInput?.modelSelection;
      return {
        sessionId: "session-new",
        modelSelection: activeModelSelection,
        conversationSessionEntries: [],
      };
    },
    listConversationSessions: () => [],
    switchActiveConversationSession: (sessionId) => ({
      sessionId,
      modelSelection: activeModelSelection,
      conversationSessionEntries: initialConversationSessionEntries,
    }),
    deleteConversationSession: () => ({
      sessionId: "session-a",
      modelSelection: activeModelSelection,
      conversationSessionEntries: initialConversationSessionEntries,
    }),
  } satisfies ConversationSessionStore;
}
