import type { ReasoningEffort } from "@buli/contracts";
import { AssistantResponseRuntime } from "@buli/engine";
import { renderChatScreenInTerminal } from "@buli/ink-tui";
import { OpenAiAuthStore, OpenAiProvider } from "@buli/openai";

const DEFAULT_MODEL_ID = "gpt-5.4";

export async function runInteractiveChat(input: {
  selectedModelId?: string;
  selectedReasoningEffort?: ReasoningEffort;
  store?: OpenAiAuthStore;
  stdin?: Pick<NodeJS.ReadStream, "isTTY">;
} = {}): Promise<string> {
  const store = input.store ?? new OpenAiAuthStore();
  const auth = await store.loadOpenAi();
  if (!auth) {
    return "OpenAI auth not found. Run `buli login`.";
  }

  const stdin = input.stdin ?? process.stdin;
  if (!stdin.isTTY) {
    return "Interactive chat requires a TTY. Run `buli` in a terminal.";
  }

  const provider = new OpenAiProvider({ store });
  const assistantResponseRunner = new AssistantResponseRuntime(provider);
  const chatScreen = renderChatScreenInTerminal({
    assistantResponseRunner,
    loadAvailableAssistantModels: () => provider.listAvailableAssistantModels(),
    selectedModelId: input.selectedModelId ?? DEFAULT_MODEL_ID,
    ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
  });

  await chatScreen.waitUntilExit();
  return "";
}
