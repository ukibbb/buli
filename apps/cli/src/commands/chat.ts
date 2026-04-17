import os from "node:os";
import { join } from "node:path";
import type { ReasoningEffort } from "@buli/contracts";
import { AssistantConversationRuntime, listPromptContextCandidates } from "@buli/engine";
import { renderChatScreenInTerminalWithInk } from "@buli/ink-tui";
import { OpenAiAuthStore, OpenAiProvider } from "@buli/openai";
import { renderChatScreenInTerminalWithOpentui } from "@buli/opentui-tui";

const DEFAULT_MODEL_ID = "gpt-5.4";

export async function runInteractiveChat(input: {
  selectedModelId?: string;
  selectedReasoningEffort?: ReasoningEffort;
  selectedTerminalUserInterface?: "ink" | "opentui";
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
  const promptContextBrowseRootPath = join(os.homedir(), "Desktop");
  const assistantConversationRunner = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath: process.cwd(),
    promptContextBrowseRootPath,
  });
  const renderArgs = {
    assistantConversationRunner,
    loadAvailableAssistantModels: () => provider.listAvailableAssistantModels(),
    loadPromptContextCandidates: (promptContextQueryText: string) =>
      listPromptContextCandidates({
        promptContextBrowseRootPath,
        promptContextQueryText,
      }),
    selectedModelId: input.selectedModelId ?? DEFAULT_MODEL_ID,
    ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
  };

  const chatScreen =
    input.selectedTerminalUserInterface === "opentui"
      ? await renderChatScreenInTerminalWithOpentui(renderArgs)
      : renderChatScreenInTerminalWithInk(renderArgs);

  await chatScreen.waitUntilExit();
  return "";
}
