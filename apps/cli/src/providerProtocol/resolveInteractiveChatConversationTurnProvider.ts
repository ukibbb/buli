import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BuliDiagnosticLogger } from "@buli/contracts";
import {
  ProviderProtocolConversationTurnProvider,
  type ConversationTurnProvider,
  type ProviderProtocolClientTransport,
} from "@buli/engine";
import { OpenAiAuthStore, OpenAiProvider } from "@buli/openai";
import {
  resolveInteractiveChatProviderIpcEnabled,
  type InteractiveChatEnvironment,
} from "../interactiveChat/interactiveChatEnvironment.ts";
import {
  ProviderProtocolSubprocessTransport,
  type ProviderProtocolSubprocessEnvironment,
  type ProviderProtocolSubprocessSpawner,
} from "./providerProtocolSubprocessTransport.ts";

export type InteractiveChatProviderConnectionKind = "direct_openai" | "openai_provider_protocol_ipc";

export type DisposableProviderProtocolClientTransport = ProviderProtocolClientTransport & Readonly<{
  dispose?: (() => Promise<void> | void) | undefined;
}>;

export type InteractiveChatConversationTurnProviderResolution = Readonly<{
  conversationTurnProvider: ConversationTurnProvider;
  providerConnectionKind: InteractiveChatProviderConnectionKind;
  dispose: () => Promise<void>;
}>;

export type CreateInteractiveChatProviderProtocolTransportInput = Readonly<{
  command: readonly string[];
  environment: ProviderProtocolSubprocessEnvironment;
  workingDirectoryPath: string;
}>;

export type ResolveInteractiveChatConversationTurnProviderInput = Readonly<{
  openAiProvider: OpenAiProvider;
  store: OpenAiAuthStore;
  environment: InteractiveChatEnvironment;
  workspaceRootPath: string;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
  providerHostCommand?: readonly string[] | undefined;
  createProviderProtocolTransport?: (
    input: CreateInteractiveChatProviderProtocolTransportInput,
  ) => DisposableProviderProtocolClientTransport;
  spawnProviderProtocolSubprocess?: ProviderProtocolSubprocessSpawner | undefined;
}>;

export function resolveInteractiveChatConversationTurnProvider(
  input: ResolveInteractiveChatConversationTurnProviderInput,
): InteractiveChatConversationTurnProviderResolution {
  if (!resolveInteractiveChatProviderIpcEnabled({ environment: input.environment })) {
    return {
      conversationTurnProvider: input.openAiProvider,
      providerConnectionKind: "direct_openai",
      dispose: async () => {},
    };
  }

  const providerProtocolTransport = createInteractiveChatProviderProtocolTransport(input);
  return {
    conversationTurnProvider: new ProviderProtocolConversationTurnProvider({
      transport: providerProtocolTransport,
    }),
    providerConnectionKind: "openai_provider_protocol_ipc",
    dispose: async () => {
      await providerProtocolTransport.dispose?.();
    },
  };
}

export function resolveDefaultOpenAiProviderHostCommand(): readonly string[] {
  return [process.execPath, resolveDefaultOpenAiProviderHostEntrypointPath()];
}

function createInteractiveChatProviderProtocolTransport(
  input: ResolveInteractiveChatConversationTurnProviderInput,
): DisposableProviderProtocolClientTransport {
  const transportInput = {
    command: input.providerHostCommand ?? resolveDefaultOpenAiProviderHostCommand(),
    environment: createOpenAiProviderHostSubprocessEnvironment({
      environment: input.environment,
      openAiAuthFilePath: input.store.filePath,
    }),
    workingDirectoryPath: input.workspaceRootPath,
  } satisfies CreateInteractiveChatProviderProtocolTransportInput;

  if (input.createProviderProtocolTransport) {
    return input.createProviderProtocolTransport(transportInput);
  }

  return new ProviderProtocolSubprocessTransport({
    ...transportInput,
    ...(input.spawnProviderProtocolSubprocess !== undefined
      ? { spawnSubprocess: input.spawnProviderProtocolSubprocess }
      : {}),
  });
}

function createOpenAiProviderHostSubprocessEnvironment(input: {
  environment: InteractiveChatEnvironment;
  openAiAuthFilePath: string;
}): ProviderProtocolSubprocessEnvironment {
  return {
    ...input.environment,
    BULI_OPENAI_AUTH_FILE: input.openAiAuthFilePath,
  };
}

function resolveDefaultOpenAiProviderHostEntrypointPath(): string {
  const currentModulePath = fileURLToPath(import.meta.url);
  if (currentModulePath.endsWith(".ts")) {
    return fileURLToPath(new URL("./openAiProviderHostEntrypoint.ts", import.meta.url));
  }

  return join(dirname(currentModulePath), "openAiProviderHostEntrypoint.js");
}
