import os from "node:os";
import { resolve, sep } from "node:path";
import type { ReasoningEffort } from "@buli/contracts";
import { AssistantConversationRuntime, PromptContextCandidateCatalog } from "@buli/engine";
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
  const promptContextBrowseRootPath = os.homedir();
  const promptContextStartingDirectoryPath = resolvePromptContextStartingDirectoryPath({
    promptContextBrowseRootPath,
    requestedStartingDirectoryPath: process.cwd(),
  });
  const promptContextCandidateCatalog = new PromptContextCandidateCatalog({
    promptContextBrowseRootPath,
    promptContextStartingDirectoryPath,
  });
  const assistantConversationRunner = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath: process.cwd(),
    promptContextBrowseRootPath,
    promptContextStartingDirectoryPath,
  });
  const renderArgs = {
    assistantConversationRunner,
    loadAvailableAssistantModels: () => provider.listAvailableAssistantModels(),
    loadPromptContextCandidates: (promptContextQueryText: string) =>
      promptContextCandidateCatalog.listPromptContextCandidates(promptContextQueryText),
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

function resolvePromptContextStartingDirectoryPath(input: {
  promptContextBrowseRootPath: string;
  requestedStartingDirectoryPath: string;
}): string {
  const browseRootPath = resolve(input.promptContextBrowseRootPath);
  const requestedStartingDirectoryPath = resolve(input.requestedStartingDirectoryPath);
  if (
    requestedStartingDirectoryPath === browseRootPath
    || requestedStartingDirectoryPath.startsWith(`${browseRootPath}${sep}`)
  ) {
    return requestedStartingDirectoryPath;
  }

  return browseRootPath;
}
