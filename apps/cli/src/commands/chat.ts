import os from "node:os";
import { resolve, sep } from "node:path";
import type { ReasoningEffort } from "@buli/contracts";
import {
  AssistantConversationRuntime,
  DEFAULT_BASH_TOOL_APPROVAL_MODE,
  InMemoryConversationHistory,
  PromptContextCandidateCatalog,
  parseBashToolApprovalMode,
  type BashToolApprovalMode,
} from "@buli/engine";
import { OpenAiAuthStore, OpenAiProvider } from "@buli/openai";
import { renderChatScreenInTerminal } from "@buli/tui";
import { installConsoleFileLogger } from "../consoleFileLogger.ts";
import { FileConversationSessionStore, type ConversationSessionStore } from "../conversationSessionStore.ts";
import { createDiagnosticFileLogger } from "../diagnosticFileLogger.ts";

const DEFAULT_MODEL_ID = "gpt-5.5";
const DEFAULT_MODEL_DEFAULT_REASONING_EFFORT: ReasoningEffort = "xhigh";
const INVALID_BASH_TOOL_APPROVAL_MODE_MESSAGE = "Invalid BULI_BASH_APPROVAL_MODE. Use `risk_based` or `trusted`.";

type InteractiveChatRenderer = typeof renderChatScreenInTerminal;

type InteractiveChatEnvironment = Readonly<{
  [environmentVariableName: string]: string | undefined;
  BULI_BASH_APPROVAL_MODE?: string | undefined;
}>;

export async function runInteractiveChat(input: {
  selectedModelId?: string;
  selectedReasoningEffort?: ReasoningEffort;
  bashToolApprovalMode?: BashToolApprovalMode;
  store?: OpenAiAuthStore;
  conversationSessionStore?: ConversationSessionStore;
  renderChatScreen?: InteractiveChatRenderer;
  stdin?: Pick<NodeJS.ReadStream, "isTTY">;
  environment?: InteractiveChatEnvironment;
} = {}): Promise<string> {
  const bashToolApprovalMode = resolveInteractiveChatBashToolApprovalMode({
    requestedBashToolApprovalMode: input.bashToolApprovalMode,
    environment: input.environment ?? process.env,
  });
  if (!bashToolApprovalMode) {
    return INVALID_BASH_TOOL_APPROVAL_MODE_MESSAGE;
  }
  const selectedModelId = input.selectedModelId ?? DEFAULT_MODEL_ID;
  const selectedModelDefaultReasoningEffort = lookupKnownModelDefaultReasoningEffort(selectedModelId);

  const store = input.store ?? new OpenAiAuthStore();
  const auth = await store.loadOpenAi();
  if (!auth) {
    return "OpenAI auth not found. Run `buli login`.";
  }

  const stdin = input.stdin ?? process.stdin;
  if (!stdin.isTTY) {
    return "Interactive chat requires a TTY. Run `buli` in a terminal.";
  }

  const consoleFileLoggerInstallation = installConsoleFileLogger();
  const diagnosticLogger = consoleFileLoggerInstallation.logFilePath
    ? createDiagnosticFileLogger({ logFilePath: consoleFileLoggerInstallation.logFilePath })
    : undefined;
  diagnosticLogger?.({
    subsystem: "cli",
    eventName: "interactive_chat.starting",
    fields: {
      selectedModelId,
      selectedModelDefaultReasoningEffort: selectedModelDefaultReasoningEffort ?? null,
      selectedReasoningEffort: input.selectedReasoningEffort ?? null,
      bashToolApprovalMode,
      workingDirectoryPath: process.cwd(),
      logFilePath: consoleFileLoggerInstallation.logFilePath ?? null,
    },
  });
  const conversationSessionStore = input.conversationSessionStore ?? new FileConversationSessionStore();
  const initialConversationSessionEntries = conversationSessionStore.loadConversationSessionEntries();
  diagnosticLogger?.({
    subsystem: "cli",
    eventName: "conversation_session.loaded",
    fields: {
      conversationSessionFilePath: conversationSessionStore.filePath ?? null,
      conversationSessionEntryCount: initialConversationSessionEntries.length,
    },
  });

  const provider = new OpenAiProvider({ store, diagnosticLogger });
  const promptContextBrowseRootPath = os.homedir();
  const promptContextStartingDirectoryPath = resolvePromptContextStartingDirectoryPath({
    promptContextBrowseRootPath,
    requestedStartingDirectoryPath: process.cwd(),
  });
  const promptContextCandidateCatalog = new PromptContextCandidateCatalog({
    promptContextBrowseRootPath,
    promptContextStartingDirectoryPath,
  });
  const conversationHistory = new InMemoryConversationHistory({
    initialConversationSessionEntries,
    onConversationSessionEntriesChanged: (conversationSessionEntries) => {
      conversationSessionStore.saveConversationSessionEntries(conversationSessionEntries);
      diagnosticLogger?.({
        subsystem: "cli",
        eventName: "conversation_session.saved",
        fields: {
          conversationSessionFilePath: conversationSessionStore.filePath ?? null,
          conversationSessionEntryCount: conversationSessionEntries.length,
        },
      });
    },
  });
  const assistantConversationRunner = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath: process.cwd(),
    promptContextBrowseRootPath,
    promptContextStartingDirectoryPath,
    conversationHistory,
    bashToolApprovalMode,
    diagnosticLogger,
  });
  const renderArgs = {
    assistantConversationRunner,
    loadAvailableAssistantModels: () => provider.listAvailableAssistantModels(),
    loadPromptContextCandidates: (promptContextQueryText: string) =>
      promptContextCandidateCatalog.listPromptContextCandidates(promptContextQueryText),
    selectedModelId,
    ...(selectedModelDefaultReasoningEffort ? { selectedModelDefaultReasoningEffort } : {}),
    ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
    ...(diagnosticLogger ? { diagnosticLogger } : {}),
  };

  const renderChatScreen = input.renderChatScreen ?? renderChatScreenInTerminal;
  const chatScreen = await renderChatScreen(renderArgs);

  await chatScreen.waitUntilExit();
  diagnosticLogger?.({
    subsystem: "cli",
    eventName: "interactive_chat.exited",
    fields: {
      selectedModelId: renderArgs.selectedModelId,
    },
  });
  return "";
}

function lookupKnownModelDefaultReasoningEffort(selectedModelId: string): ReasoningEffort | undefined {
  if (selectedModelId === DEFAULT_MODEL_ID) {
    return DEFAULT_MODEL_DEFAULT_REASONING_EFFORT;
  }

  return undefined;
}

function resolveInteractiveChatBashToolApprovalMode(input: {
  requestedBashToolApprovalMode: BashToolApprovalMode | undefined;
  environment: InteractiveChatEnvironment;
}): BashToolApprovalMode | undefined {
  if (input.requestedBashToolApprovalMode) {
    return input.requestedBashToolApprovalMode;
  }

  const environmentBashToolApprovalMode = input.environment.BULI_BASH_APPROVAL_MODE?.trim();
  if (!environmentBashToolApprovalMode) {
    return DEFAULT_BASH_TOOL_APPROVAL_MODE;
  }

  return parseBashToolApprovalMode(environmentBashToolApprovalMode);
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
