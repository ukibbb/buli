import { OpenAiAuthStore, OpenAiProvider } from "@buli/openai";
import { ProviderProtocolConversationTurnProvider } from "@buli/engine";
import type { AvailableAssistantModel } from "@buli/contracts";
import type { InteractiveChatEnvironment } from "../interactiveChat/interactiveChatEnvironment.ts";
import { ProviderProtocolSubprocessTransport } from "../providerProtocol/providerProtocolSubprocessTransport.ts";
import {
  INVALID_PROVIDER_HOST_COMMAND_MESSAGE,
  resolveProviderHostCommandFromEnvironment,
} from "../providerProtocol/providerHostCommand.ts";

function formatAvailableAssistantModelsOutput(
  availableAssistantModels: readonly AvailableAssistantModel[],
): string {
  if (availableAssistantModels.length === 0) {
    return "No models available.";
  }

  return [
    "Available models:",
    ...availableAssistantModels.map((availableAssistantModel) => {
      const defaultReasoning = availableAssistantModel.defaultReasoningEffort ?? "none";
      const supportedReasoning =
        availableAssistantModel.supportedReasoningEfforts.length > 0
          ? availableAssistantModel.supportedReasoningEfforts.join(", ")
          : "none";

      return `${availableAssistantModel.id} | ${availableAssistantModel.displayName} | default ${defaultReasoning} | supported ${supportedReasoning}`;
    }),
  ].join("\n");
}

export async function runListAvailableModels(input: {
  store?: OpenAiAuthStore;
  environment?: InteractiveChatEnvironment | undefined;
} = {}): Promise<string> {
  const environment = input.environment ?? process.env;
  const externalProviderHostCommandResolution = resolveProviderHostCommandFromEnvironment({ environment });
  if (externalProviderHostCommandResolution.status === "invalid") {
    return INVALID_PROVIDER_HOST_COMMAND_MESSAGE;
  }
  if (externalProviderHostCommandResolution.providerHostCommand) {
    return formatAvailableAssistantModelsOutput(
      await listAvailableAssistantModelsFromExternalProviderHost({
        providerHostCommand: externalProviderHostCommandResolution.providerHostCommand,
        environment,
      }),
    );
  }

  const store = input.store ?? new OpenAiAuthStore();
  const auth = await store.loadOpenAi();
  if (!auth) {
    return "OpenAI auth not found. Run `buli login`.";
  }

  const provider = new OpenAiProvider({ store });
  return formatAvailableAssistantModelsOutput(await provider.listAvailableAssistantModels());
}

async function listAvailableAssistantModelsFromExternalProviderHost(input: {
  providerHostCommand: readonly string[];
  environment: InteractiveChatEnvironment;
}): Promise<readonly AvailableAssistantModel[]> {
  const providerProtocolTransport = new ProviderProtocolSubprocessTransport({
    command: input.providerHostCommand,
    environment: input.environment,
    workingDirectoryPath: process.cwd(),
  });
  const provider = new ProviderProtocolConversationTurnProvider({ transport: providerProtocolTransport });
  try {
    return await provider.listAvailableAssistantModels();
  } finally {
    await providerProtocolTransport.dispose();
  }
}
