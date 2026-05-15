import os from "node:os";
import { resolve, sep } from "node:path";
import type { ReasoningEffort } from "@buli/contracts";
import {
  AssistantConversationRuntime,
  DEFAULT_BASH_TOOL_APPROVAL_MODE,
  DEFAULT_CONVERSATION_AUTO_COMPACTION_THRESHOLD_RATIO,
  InMemoryConversationHistory,
  PromptContextCandidateCatalog,
  decideConversationAutoCompaction,
  parseBashToolApprovalMode,
  type BashToolApprovalMode,
  type ConversationAutoCompactionRequest,
  type ConversationAutoCompactionResult,
  type ConversationCompactionRequest,
} from "@buli/engine";
import { OpenAiAuthStore, OpenAiProvider } from "@buli/openai";
import { renderChatScreenInTerminal } from "@buli/tui";
import { openBrowserUrl, type BrowserUrlLauncher } from "../browserLauncher.ts";
import { installConsoleFileLogger } from "../consoleFileLogger.ts";
import {
  defaultConversationSessionExportDirectoryPath,
  writeConversationSessionHtmlExport,
} from "../conversationSessionHtmlExport.ts";
import { FileConversationSessionStore, type ConversationSessionStore } from "../conversationSessionStore.ts";
import { createDiagnosticFileLogger } from "../diagnosticFileLogger.ts";

const DEFAULT_MODEL_ID = "gpt-5.5";
const DEFAULT_MODEL_DEFAULT_REASONING_EFFORT: ReasoningEffort = "medium";
const INVALID_BASH_TOOL_APPROVAL_MODE_MESSAGE = "Invalid BULI_BASH_APPROVAL_MODE. Use `risk_based` or `trusted`.";
const INVALID_AUTO_COMPACTION_THRESHOLD_MESSAGE = "Invalid BULI_AUTO_COMPACT_THRESHOLD. Use a number from 0 through 1.";

type InteractiveChatRenderer = typeof renderChatScreenInTerminal;

type InteractiveChatEnvironment = Readonly<{
  [environmentVariableName: string]: string | undefined;
  BULI_BASH_APPROVAL_MODE?: string | undefined;
  BULI_AUTO_COMPACT_THRESHOLD?: string | undefined;
}>;

type AutoCompactionThresholdResolution =
  | { status: "resolved"; thresholdRatio: number }
  | { status: "invalid" };

export async function runInteractiveChat(input: {
  selectedModelId?: string;
  selectedReasoningEffort?: ReasoningEffort;
  bashToolApprovalMode?: BashToolApprovalMode;
  store?: OpenAiAuthStore;
  conversationSessionStore?: ConversationSessionStore;
  conversationSessionExportDirectoryPath?: string;
  openBrowserUrl?: BrowserUrlLauncher;
  renderChatScreen?: InteractiveChatRenderer;
  stdin?: Pick<NodeJS.ReadStream, "isTTY">;
  environment?: InteractiveChatEnvironment;
} = {}): Promise<string> {
  const environment = input.environment ?? process.env;
  const bashToolApprovalMode = resolveInteractiveChatBashToolApprovalMode({
    requestedBashToolApprovalMode: input.bashToolApprovalMode,
    environment,
  });
  if (!bashToolApprovalMode) {
    return INVALID_BASH_TOOL_APPROVAL_MODE_MESSAGE;
  }
  const autoCompactionThresholdResolution = resolveConversationAutoCompactionThresholdRatio({ environment });
  if (autoCompactionThresholdResolution.status === "invalid") {
    return INVALID_AUTO_COMPACTION_THRESHOLD_MESSAGE;
  }
  const autoCompactionThresholdRatio = autoCompactionThresholdResolution.thresholdRatio;
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
  const activeConversationSession = conversationSessionStore.loadActiveConversationSession();
  let activeConversationSessionId = activeConversationSession.sessionId;
  const initialConversationSessionEntries = activeConversationSession.conversationSessionEntries;
  diagnosticLogger?.({
    subsystem: "cli",
    eventName: "conversation_session.loaded",
    fields: {
      conversationSessionFilePath: activeConversationSession.filePath,
      conversationSessionId: activeConversationSession.sessionId,
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
    onConversationSessionEntryAppended: (conversationSessionEntry, conversationSessionEntries) => {
      conversationSessionStore.appendConversationSessionEntry(conversationSessionEntry);
      diagnosticLogger?.({
        subsystem: "cli",
        eventName: "conversation_session.saved",
        fields: {
          conversationSessionEntryKind: conversationSessionEntry.entryKind,
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
    ...(conversationSessionStore.promptCacheKey ? { promptCacheKey: conversationSessionStore.promptCacheKey } : {}),
    diagnosticLogger,
  });
  const renderArgs = {
    assistantConversationRunner,
    loadAvailableAssistantModels: () => provider.listAvailableAssistantModels(),
    loadPromptContextCandidates: (promptContextQueryText: string) =>
      promptContextCandidateCatalog.listPromptContextCandidates(promptContextQueryText),
    loadConversationSessions: () => conversationSessionStore.listConversationSessions(),
    switchConversationSession: async (conversationSessionId: string) => {
      const switchedConversationSession = conversationSessionStore.switchActiveConversationSession(conversationSessionId);
      activeConversationSessionId = switchedConversationSession.sessionId;
      conversationHistory.replaceConversationSessionEntries(switchedConversationSession.conversationSessionEntries);
      diagnosticLogger?.({
        subsystem: "cli",
        eventName: "conversation_session.switched",
        fields: {
          conversationSessionId: switchedConversationSession.sessionId,
          conversationSessionFilePath: switchedConversationSession.filePath,
          conversationSessionEntryCount: switchedConversationSession.conversationSessionEntries.length,
        },
      });
      return {
        conversationSessionId: switchedConversationSession.sessionId,
        conversationSessionEntries: switchedConversationSession.conversationSessionEntries,
      };
    },
    onConversationCleared: () => {
      const newConversationSession = conversationSessionStore.startNewConversationSession();
      activeConversationSessionId = newConversationSession.sessionId;
      conversationHistory.replaceConversationSessionEntries(newConversationSession.conversationSessionEntries);
      diagnosticLogger?.({
        subsystem: "cli",
        eventName: "conversation_session.created",
        fields: {
          conversationSessionId: newConversationSession.sessionId,
          conversationSessionFilePath: newConversationSession.filePath,
        },
      });
      return {
        conversationSessionId: newConversationSession.sessionId,
        conversationSessionEntries: newConversationSession.conversationSessionEntries,
      };
    },
    exportCurrentConversationSession: async () => {
      const exportResult = writeConversationSessionHtmlExport({
        conversationSessionEntries: conversationHistory.listConversationSessionEntries(),
        workspaceRootPath: process.cwd(),
        conversationSessionId: activeConversationSessionId,
        exportDirectoryPath: input.conversationSessionExportDirectoryPath ?? defaultConversationSessionExportDirectoryPath(),
      });
      await (input.openBrowserUrl ?? openBrowserUrl)(exportResult.exportFileUrl);
      diagnosticLogger?.({
        subsystem: "cli",
        eventName: "conversation_session.exported",
        fields: {
          conversationSessionId: activeConversationSessionId,
          exportFilePath: exportResult.exportFilePath,
        },
      });
      return exportResult;
    },
    compactCurrentConversationSession: async (compactionRequest: ConversationCompactionRequest) => {
      await assistantConversationRunner.compactConversationSession(compactionRequest);
      const conversationSessionEntries = conversationHistory.listConversationSessionEntries();
      diagnosticLogger?.({
        subsystem: "cli",
        eventName: "conversation_session.compacted",
        fields: {
          conversationSessionId: activeConversationSessionId,
          conversationSessionEntryCount: conversationSessionEntries.length,
        },
      });
      return { conversationSessionEntries };
    },
    autoCompactCurrentConversationSession: async (
      autoCompactionRequest: ConversationAutoCompactionRequest,
    ): Promise<ConversationAutoCompactionResult> => {
      // CLI owns user configuration and persistence, while the engine owns the
      // pure decision. This keeps auto-compaction on the same append-only
      // runtime path as manual /compact instead of creating a second history
      // mutation path.
      const autoCompactionDecision = decideConversationAutoCompaction({
        ...autoCompactionRequest,
        conversationSessionEntries: conversationHistory.listConversationSessionEntries(),
        thresholdRatio: autoCompactionThresholdRatio,
      });
      diagnosticLogger?.({
        subsystem: "cli",
        eventName: "conversation_session.auto_compaction_decided",
        fields: {
          conversationSessionId: activeConversationSessionId,
          shouldCompact: autoCompactionDecision.shouldCompact,
          reason: autoCompactionDecision.reason,
          selectedModelId: autoCompactionDecision.selectedModelId,
          contextTokensUsed: autoCompactionDecision.contextTokensUsed,
          contextWindowTokenCapacity: autoCompactionDecision.contextWindowTokenCapacity ?? null,
          contextUsageRatio: autoCompactionDecision.contextUsageRatio ?? null,
          thresholdRatio: autoCompactionDecision.thresholdRatio,
          sessionEntryCountAfterLatestCompactionSummary:
            autoCompactionDecision.sessionEntryCountAfterLatestCompactionSummary,
        },
      });
      if (!autoCompactionDecision.shouldCompact) {
        return { didCompact: false, decision: autoCompactionDecision };
      }

      await assistantConversationRunner.compactConversationSession({
        selectedModelId: autoCompactionRequest.selectedModelId,
        ...(autoCompactionRequest.selectedReasoningEffort
          ? { selectedReasoningEffort: autoCompactionRequest.selectedReasoningEffort }
          : {}),
      });
      const conversationSessionEntries = conversationHistory.listConversationSessionEntries();
      diagnosticLogger?.({
        subsystem: "cli",
        eventName: "conversation_session.auto_compacted",
        fields: {
          conversationSessionId: activeConversationSessionId,
          conversationSessionEntryCount: conversationSessionEntries.length,
          contextTokensUsed: autoCompactionDecision.contextTokensUsed,
          thresholdRatio: autoCompactionDecision.thresholdRatio,
        },
      });
      return {
        didCompact: true,
        decision: autoCompactionDecision,
        conversationSessionEntries,
      };
    },
    initialConversationSessionId: activeConversationSession.sessionId,
    initialConversationSessionEntries,
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

function resolveConversationAutoCompactionThresholdRatio(input: {
  environment: InteractiveChatEnvironment;
}): AutoCompactionThresholdResolution {
  const environmentThresholdRatio = input.environment.BULI_AUTO_COMPACT_THRESHOLD?.trim();
  if (!environmentThresholdRatio) {
    return { status: "resolved", thresholdRatio: DEFAULT_CONVERSATION_AUTO_COMPACTION_THRESHOLD_RATIO };
  }

  const thresholdRatio = Number(environmentThresholdRatio);
  if (!Number.isFinite(thresholdRatio) || thresholdRatio < 0 || thresholdRatio > 1) {
    return { status: "invalid" };
  }

  return { status: "resolved", thresholdRatio };
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
