import { OpenAiAuthStore, OpenAiProvider } from "@buli/openai";

function formatAvailableAssistantModelsOutput(
  availableAssistantModels: Awaited<ReturnType<OpenAiProvider["listAvailableAssistantModels"]>>,
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
} = {}): Promise<string> {
  const store = input.store ?? new OpenAiAuthStore();
  const auth = await store.loadOpenAi();
  if (!auth) {
    return "OpenAI auth not found. Run `buli login`.";
  }

  const provider = new OpenAiProvider({ store });
  return formatAvailableAssistantModelsOutput(await provider.listAvailableAssistantModels());
}
