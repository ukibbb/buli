import { fileURLToPath } from "node:url";
import {
  OpenAiAuthStore,
  OpenAiProvider,
  type OpenAiConversationTurnRequest,
  type OpenAiProviderProtocolHostConversationTurnProvider,
  type OpenAiProviderProtocolHostTurnRequest,
  runOpenAiProviderProtocolJsonLineHost,
} from "@buli/openai";
import type { ProviderProtocolJsonLineChunk } from "@buli/contracts";
import {
  INVALID_OPENAI_MAX_CONCURRENT_STREAMS_MESSAGE,
  type InteractiveChatEnvironment,
  resolveInteractiveChatOpenAiMaxConcurrentStreams,
} from "../interactiveChat/interactiveChatEnvironment.ts";

export type RunOpenAiProviderHostEntrypointInput = Readonly<{
  environment?: InteractiveChatEnvironment | undefined;
  hostFrameChunks?: AsyncIterable<ProviderProtocolJsonLineChunk> | undefined;
  writeProviderFrameJsonLine?: ((jsonLine: string) => Promise<void>) | undefined;
  provider?: OpenAiProviderProtocolHostConversationTurnProvider | undefined;
}>;

export async function runOpenAiProviderHostEntrypoint(
  input: RunOpenAiProviderHostEntrypointInput = {},
): Promise<void> {
  const environment = input.environment ?? process.env;
  const provider = input.provider ?? createDefaultOpenAiProviderProtocolHostProvider({ environment });

  await runOpenAiProviderProtocolJsonLineHost({
    provider,
    hostFrameChunks: input.hostFrameChunks ?? Bun.stdin.stream(),
    writeProviderFrameJsonLine: input.writeProviderFrameJsonLine ?? writeProviderFrameJsonLineToStdout,
  });
}

function createOpenAiProviderHostAuthStore(input: {
  environment: InteractiveChatEnvironment;
}): OpenAiAuthStore {
  const openAiAuthFilePath = input.environment.BULI_OPENAI_AUTH_FILE?.trim();
  return new OpenAiAuthStore(openAiAuthFilePath ? { filePath: openAiAuthFilePath } : {});
}

function createDefaultOpenAiProviderProtocolHostProvider(input: {
  environment: InteractiveChatEnvironment;
}): OpenAiProviderProtocolHostConversationTurnProvider {
  const openAiMaxConcurrentStreamsResolution = resolveInteractiveChatOpenAiMaxConcurrentStreams({ environment: input.environment });
  if (openAiMaxConcurrentStreamsResolution.status === "invalid") {
    throw new Error(INVALID_OPENAI_MAX_CONCURRENT_STREAMS_MESSAGE);
  }

  const openAiProvider = new OpenAiProvider({
    store: createOpenAiProviderHostAuthStore({ environment: input.environment }),
    ...(openAiMaxConcurrentStreamsResolution.value !== undefined
      ? { maximumConcurrentResponseStepStreams: openAiMaxConcurrentStreamsResolution.value }
      : {}),
  });

  return {
    startConversationTurn(turnRequest) {
      return openAiProvider.startConversationTurn(createOpenAiConversationTurnRequest(turnRequest));
    },
  };
}

function createOpenAiConversationTurnRequest(
  turnRequest: OpenAiProviderProtocolHostTurnRequest,
): OpenAiConversationTurnRequest {
  return {
    systemPromptText: turnRequest.systemPromptText,
    conversationSessionEntries: turnRequest.conversationSessionEntries,
    selectedModelId: turnRequest.selectedModelId,
    ...(turnRequest.selectedReasoningEffort !== undefined
      ? { selectedReasoningEffort: turnRequest.selectedReasoningEffort }
      : {}),
    ...(turnRequest.promptCacheKey !== undefined ? { promptCacheKey: turnRequest.promptCacheKey } : {}),
    ...(turnRequest.availableToolNames !== undefined ? { availableToolNames: turnRequest.availableToolNames } : {}),
    ...(turnRequest.abortSignal !== undefined ? { abortSignal: turnRequest.abortSignal } : {}),
  };
}

async function writeProviderFrameJsonLineToStdout(jsonLine: string): Promise<void> {
  await Bun.write(Bun.stdout, jsonLine);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  await runOpenAiProviderHostEntrypoint();
}
