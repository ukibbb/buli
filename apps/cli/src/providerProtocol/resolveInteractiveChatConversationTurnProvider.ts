import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AvailableAssistantModel, BuliDiagnosticLogger } from "@buli/contracts";
import {
  ProviderProtocolConversationTurnProvider,
  type AssistantProviderName,
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

export type InteractiveChatProviderConnectionKind = "direct_openai" | "openai_provider_protocol_ipc" | "external_provider_protocol_ipc";
export type InteractiveChatProviderHostKind = "openai" | "external";

export type DisposableProviderProtocolClientTransport = ProviderProtocolClientTransport & Readonly<{
  dispose?: (() => Promise<void> | void) | undefined;
}>;

export type InteractiveChatConversationTurnProviderResolution = Readonly<{
  conversationTurnProvider: ConversationTurnProvider;
  providerConnectionKind: InteractiveChatProviderConnectionKind;
  assistantProviderName: AssistantProviderName;
  listAvailableAssistantModels: () => Promise<readonly AvailableAssistantModel[]>;
  dispose: () => Promise<void>;
}>;

export type CreateInteractiveChatProviderProtocolTransportInput = Readonly<{
  command: readonly string[];
  environment: ProviderProtocolSubprocessEnvironment;
  workingDirectoryPath: string;
}>;

export type ResolveInteractiveChatConversationTurnProviderInput = Readonly<{
  openAiProvider?: OpenAiProvider | undefined;
  store?: OpenAiAuthStore | undefined;
  environment: InteractiveChatEnvironment;
  workspaceRootPath: string;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
  providerHostCommand?: readonly string[] | undefined;
  providerHostKind?: InteractiveChatProviderHostKind | undefined;
  createProviderProtocolTransport?: (
    input: CreateInteractiveChatProviderProtocolTransportInput,
  ) => DisposableProviderProtocolClientTransport;
  spawnProviderProtocolSubprocess?: ProviderProtocolSubprocessSpawner | undefined;
}>;

export function resolveInteractiveChatConversationTurnProvider(
  input: ResolveInteractiveChatConversationTurnProviderInput,
): InteractiveChatConversationTurnProviderResolution {
  const providerHostKind = input.providerHostKind ?? "openai";
  if (providerHostKind !== "external" && !resolveInteractiveChatProviderIpcEnabled({ environment: input.environment })) {
    const openAiProvider = input.openAiProvider;
    if (!openAiProvider) {
      throw new Error("OpenAI provider is required for direct provider mode.");
    }

    return {
      conversationTurnProvider: openAiProvider,
      providerConnectionKind: "direct_openai",
      assistantProviderName: "openai",
      listAvailableAssistantModels: () => openAiProvider.listAvailableAssistantModels(),
      dispose: async () => {},
    };
  }

  const providerProtocolTransport = createInteractiveChatProviderProtocolTransport(input);
  const providerProtocolConversationTurnProvider = new ProviderProtocolConversationTurnProvider({
    transport: providerProtocolTransport,
  });
  return {
    conversationTurnProvider: providerProtocolConversationTurnProvider,
    providerConnectionKind: providerHostKind === "external" ? "external_provider_protocol_ipc" : "openai_provider_protocol_ipc",
    assistantProviderName: providerHostKind === "external" ? "external_provider_protocol" : "openai",
    listAvailableAssistantModels: () => providerProtocolConversationTurnProvider.listAvailableAssistantModels(),
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
    environment: createProviderHostSubprocessEnvironment({
      environment: input.environment,
      ...(input.providerHostKind === "external" ? {} : { openAiAuthFilePath: requireOpenAiAuthStore(input).filePath }),
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

function requireOpenAiAuthStore(input: ResolveInteractiveChatConversationTurnProviderInput): OpenAiAuthStore {
  if (!input.store) {
    throw new Error("OpenAI auth store is required for OpenAI provider IPC mode.");
  }

  return input.store;
}

function createProviderHostSubprocessEnvironment(input: {
  environment: InteractiveChatEnvironment;
  openAiAuthFilePath?: string | undefined;
}): ProviderProtocolSubprocessEnvironment {
  return {
    ...input.environment,
    ...(input.openAiAuthFilePath !== undefined ? { BULI_OPENAI_AUTH_FILE: input.openAiAuthFilePath } : {}),
  };
}

function resolveDefaultOpenAiProviderHostEntrypointPath(): string {
  const currentModulePath = fileURLToPath(import.meta.url);
  if (currentModulePath.endsWith(".ts")) {
    return fileURLToPath(new URL("./openAiProviderHostEntrypoint.ts", import.meta.url));
  }

  return join(dirname(currentModulePath), "openAiProviderHostEntrypoint.js");
}
