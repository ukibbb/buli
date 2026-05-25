import type {
  BuliDiagnosticLogFields,
  BuliDiagnosticLogger,
  ConversationSessionModelSelection,
  ReasoningEffort,
} from "@buli/contracts";
import {
  AssistantConversationRuntime,
  InMemoryConversationHistory,
  PrivateGitWorkspaceSnapshotStore,
  PromptContextCandidateCatalog,
  type BashToolApprovalMode,
} from "@buli/engine";
import { OpenAiAuthStore, OpenAiProvider } from "@buli/openai";
import type { RenderChatScreenInTerminalInput, TuiChatScreenInstance } from "@buli/tui";
import { type BrowserUrlLauncher } from "../browserLauncher.ts";
import { installConsoleFileLogger } from "../diagnostics/consoleFileLogger.ts";
import { type ConversationSessionStore, SqliteConversationSessionStore } from "../conversationSession/index.ts";
import { createDiagnosticFileLogger } from "../diagnostics/diagnosticFileLogger.ts";
import { createInteractiveChatConversationSessionBindings } from "../interactiveChat/interactiveChatConversationSessionBindings.ts";
import { logCliDiagnosticEvent } from "../diagnostics/cliDiagnosticLog.ts";
import {
  INVALID_AUTO_COMPACTION_THRESHOLD_MESSAGE,
  INVALID_BASH_TOOL_APPROVAL_MODE_MESSAGE,
  INVALID_OPENAI_MAX_CONCURRENT_STREAMS_MESSAGE,
  INVALID_READ_ONLY_TOOL_CONCURRENCY_MESSAGE,
  INVALID_SUBAGENT_CONCURRENCY_MESSAGE,
  type InteractiveChatEnvironment,
  resolveConversationAutoCompactionThresholdRatio,
  resolveInteractiveChatBashToolApprovalMode,
  resolveInteractiveChatOpenAiMaxConcurrentStreams,
  resolveInteractiveChatPromptContextScope,
  resolveInteractiveChatReadOnlyToolConcurrency,
  resolveInteractiveChatSubagentConcurrency,
} from "../interactiveChat/interactiveChatEnvironment.ts";
import { resolveInitialConversationSessionModelSelection } from "../interactiveChat/interactiveChatModelSelection.ts";
import {
  resolveInteractiveChatConversationTurnProvider,
  type CreateInteractiveChatProviderProtocolTransportInput,
  type DisposableProviderProtocolClientTransport,
  type InteractiveChatConversationTurnProviderResolution,
} from "../providerProtocol/resolveInteractiveChatConversationTurnProvider.ts";

type InteractiveChatRenderer = (input: RenderChatScreenInTerminalInput) => Promise<TuiChatScreenInstance>;

type LoadedInteractiveChatRenderer = {
  renderChatScreen: InteractiveChatRenderer;
  rendererLoadDurationMs: number;
  rendererSource: "default" | "injected";
};

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
  providerHostCommand?: readonly string[];
  createProviderProtocolTransport?: (
    input: CreateInteractiveChatProviderProtocolTransportInput,
  ) => DisposableProviderProtocolClientTransport;
} = {}): Promise<string> {
  const startupStartedAtMs = Date.now();
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
  const readOnlyToolConcurrencyResolution = resolveInteractiveChatReadOnlyToolConcurrency({ environment });
  if (readOnlyToolConcurrencyResolution.status === "invalid") {
    return INVALID_READ_ONLY_TOOL_CONCURRENCY_MESSAGE;
  }
  const maximumConcurrentReadOnlyToolCalls = readOnlyToolConcurrencyResolution.value;
  const subagentConcurrencyResolution = resolveInteractiveChatSubagentConcurrency({ environment });
  if (subagentConcurrencyResolution.status === "invalid") {
    return INVALID_SUBAGENT_CONCURRENCY_MESSAGE;
  }
  const maximumConcurrentSubagentConversations = subagentConcurrencyResolution.value;
  const openAiMaxConcurrentStreamsResolution = resolveInteractiveChatOpenAiMaxConcurrentStreams({ environment });
  if (openAiMaxConcurrentStreamsResolution.status === "invalid") {
    return INVALID_OPENAI_MAX_CONCURRENT_STREAMS_MESSAGE;
  }
  const maximumConcurrentResponseStepStreams = openAiMaxConcurrentStreamsResolution.value;

  const store = input.store ?? new OpenAiAuthStore();
  const authLoadStartedAtMs = Date.now();
  const authTask = store.loadOpenAi();
  const stdin = input.stdin ?? process.stdin;
  const workspaceRootPath = process.cwd();
  const promptContextScope = resolveInteractiveChatPromptContextScope({
    workspaceRootPath,
    environment,
  });
  const auth = await authTask;
  const authLoadDurationMs = Date.now() - authLoadStartedAtMs;
  if (!auth) {
    return "OpenAI auth not found. Run `buli login`.";
  }

  if (!stdin.isTTY) {
    return "Interactive chat requires a TTY. Run `buli` in a terminal.";
  }

  const consoleFileLoggerInstallation = installConsoleFileLogger({ environment });
  const diagnosticLogger = consoleFileLoggerInstallation.logFilePath
    ? createDiagnosticFileLogger({ logFilePath: consoleFileLoggerInstallation.logFilePath })
    : undefined;
  let defaultConversationSessionStore: SqliteConversationSessionStore | undefined;
  let conversationTurnProviderResolution: InteractiveChatConversationTurnProviderResolution | undefined;
  try {
    logInteractiveChatStartupTiming(diagnosticLogger, {
      phase: "auth",
      startupStartedAtMs,
      phaseDurationMs: authLoadDurationMs,
    });

    const rendererLoadTask = loadInteractiveChatRenderer(input.renderChatScreen);
    void rendererLoadTask.catch(() => {});

    const conversationSessionLoadStartedAtMs = Date.now();
    const conversationSessionStore = input.conversationSessionStore ??
      (defaultConversationSessionStore = new SqliteConversationSessionStore());
    const activeConversationSessionMetadata = conversationSessionStore.loadActiveConversationSessionMetadata();
    const initialModelSelectionResolution = resolveInitialConversationSessionModelSelection({
      requestedModelId: input.selectedModelId,
      requestedReasoningEffort: input.selectedReasoningEffort,
      persistedModelSelection: activeConversationSessionMetadata.modelSelection,
    });
    const activeConversationSessionModelSelection = initialModelSelectionResolution.modelSelection;
    if (
      !areConversationSessionModelSelectionsEqual(
        activeConversationSessionMetadata.modelSelection,
        activeConversationSessionModelSelection,
      )
    ) {
      conversationSessionStore.saveActiveConversationSessionModelSelection(activeConversationSessionModelSelection);
    }
    const selectedModelId = activeConversationSessionModelSelection.selectedModelId;
    const selectedModelDefaultReasoningEffort = initialModelSelectionResolution.selectedModelDefaultReasoningEffort;
    const selectedReasoningEffort = initialModelSelectionResolution.selectedReasoningEffort;
    logInteractiveChatStartupTiming(diagnosticLogger, {
      phase: "session_load",
      startupStartedAtMs,
      phaseStartedAtMs: conversationSessionLoadStartedAtMs,
      fields: {
        conversationSessionEntryCount: activeConversationSessionMetadata.conversationSessionEntryCount,
      },
    });

    logCliDiagnosticEvent(diagnosticLogger, "interactive_chat.starting", {
      selectedModelId,
      selectedModelDefaultReasoningEffort: selectedModelDefaultReasoningEffort ?? null,
      selectedReasoningEffort: selectedReasoningEffort ?? null,
      bashToolApprovalMode,
      workingDirectoryPath: workspaceRootPath,
      promptContextBrowseRootPath: promptContextScope.promptContextBrowseRootPath,
      promptContextStartingDirectoryPath: promptContextScope.promptContextStartingDirectoryPath,
      logFilePath: consoleFileLoggerInstallation.logFilePath ?? null,
      maximumConcurrentReadOnlyToolCalls: maximumConcurrentReadOnlyToolCalls ?? null,
      maximumConcurrentSubagentConversations: maximumConcurrentSubagentConversations ?? null,
      maximumConcurrentResponseStepStreams: maximumConcurrentResponseStepStreams ?? null,
      startupElapsedMs: Date.now() - startupStartedAtMs,
    });
    logCliDiagnosticEvent(diagnosticLogger, "conversation_session.loaded", {
      conversationSessionStoragePath: conversationSessionStore.storagePath ?? null,
      conversationSessionId: activeConversationSessionMetadata.sessionId,
      conversationSessionEntryCount: activeConversationSessionMetadata.conversationSessionEntryCount,
    });

    const provider = new OpenAiProvider({
      store,
      ...(maximumConcurrentResponseStepStreams !== undefined ? { maximumConcurrentResponseStepStreams } : {}),
      diagnosticLogger,
    });
    conversationTurnProviderResolution = resolveInteractiveChatConversationTurnProvider({
      openAiProvider: provider,
      store,
      environment,
      workspaceRootPath,
      ...(input.providerHostCommand !== undefined ? { providerHostCommand: input.providerHostCommand } : {}),
      ...(input.createProviderProtocolTransport !== undefined
        ? { createProviderProtocolTransport: input.createProviderProtocolTransport }
        : {}),
    });
    logCliDiagnosticEvent(diagnosticLogger, "interactive_chat.provider_resolved", {
      providerConnectionKind: conversationTurnProviderResolution.providerConnectionKind,
    });
    const workspaceSnapshotStore = new PrivateGitWorkspaceSnapshotStore({ workspaceRootPath });
    const promptContextCandidateCatalog = new PromptContextCandidateCatalog({
      promptContextBrowseRootPath: promptContextScope.promptContextBrowseRootPath,
      promptContextStartingDirectoryPath: promptContextScope.promptContextStartingDirectoryPath,
    });
    const conversationHistory = new InMemoryConversationHistory({
      onConversationSessionEntryAppended: (conversationSessionEntry, conversationSessionEntries) => {
        conversationSessionStore.appendConversationSessionEntry(conversationSessionEntry);
        logCliDiagnosticEvent(diagnosticLogger, "conversation_session.saved", {
          conversationSessionEntryKind: conversationSessionEntry.entryKind,
          assistantOperatingMode: conversationSessionEntry.entryKind === "user_prompt"
            ? conversationSessionEntry.assistantOperatingMode ?? null
            : null,
          conversationSessionEntryCount: conversationSessionEntries.length,
        });
      },
    });
    const loadInitialConversationSessionEntries = (conversationSessionId: string) => {
      const conversationSessionEntriesLoadStartedAtMs = Date.now();
      const conversationSessionEntries = conversationSessionStore.loadConversationSessionEntries(conversationSessionId);
      logInteractiveChatStartupTiming(diagnosticLogger, {
        phase: "session_entries_load",
        startupStartedAtMs,
        phaseStartedAtMs: conversationSessionEntriesLoadStartedAtMs,
        fields: {
          conversationSessionEntryCount: conversationSessionEntries.length,
        },
      });
      logCliDiagnosticEvent(diagnosticLogger, "conversation_session.entries_loaded", {
        conversationSessionStoragePath: conversationSessionStore.storagePath ?? null,
        conversationSessionId,
        conversationSessionEntryCount: conversationSessionEntries.length,
      });

      return {
        conversationSessionId,
        conversationSessionEntries,
      };
    };
    const assistantConversationRunner = new AssistantConversationRuntime({
      conversationTurnProvider: conversationTurnProviderResolution.conversationTurnProvider,
      workspaceRootPath,
      promptContextBrowseRootPath: promptContextScope.promptContextBrowseRootPath,
      promptContextStartingDirectoryPath: promptContextScope.promptContextStartingDirectoryPath,
      conversationHistory,
      workspaceSnapshotStore,
      bashToolApprovalMode,
      ...(conversationSessionStore.promptCacheKey ? { promptCacheKey: conversationSessionStore.promptCacheKey } : {}),
      diagnosticLogger,
      ...(autoCompactionThresholdRatio !== undefined ? { autoCompactionThresholdRatio } : {}),
      ...(maximumConcurrentReadOnlyToolCalls !== undefined ? { maximumConcurrentReadOnlyToolCalls } : {}),
      ...(maximumConcurrentSubagentConversations !== undefined ? { maximumConcurrentSubagentConversations } : {}),
    });
    const conversationSessionBindings = createInteractiveChatConversationSessionBindings({
      conversationSessionStore,
      conversationHistory,
      assistantConversationRunner,
      initialConversationSessionId: activeConversationSessionMetadata.sessionId,
      initialConversationSessionModelSelection: activeConversationSessionModelSelection,
      workspaceRootPath,
      conversationSessionExportDirectoryPath: input.conversationSessionExportDirectoryPath,
      openBrowserUrl: input.openBrowserUrl,
      diagnosticLogger,
    });
    const renderArgs: RenderChatScreenInTerminalInput = {
      assistantConversationRunner,
      loadAvailableAssistantModels: () => provider.listAvailableAssistantModels(),
      loadPromptContextCandidates: (promptContextQueryText: string) =>
        promptContextCandidateCatalog.listPromptContextCandidates(promptContextQueryText),
      ...conversationSessionBindings.renderInput,
      initialConversationSessionId: activeConversationSessionMetadata.sessionId,
      ...(activeConversationSessionMetadata.conversationSessionEntryCount > 0
        ? {
            loadInitialConversationSessionEntries,
            onInitialConversationSessionEntriesHydrated: (initialConversationSessionEntriesLoadResult) => {
              conversationHistory.replaceConversationSessionEntries(
                initialConversationSessionEntriesLoadResult.conversationSessionEntries,
              );
            },
          }
        : { initialConversationSessionEntries: [] }),
      selectedModelId,
      ...(selectedModelDefaultReasoningEffort ? { selectedModelDefaultReasoningEffort } : {}),
      ...(selectedReasoningEffort ? { selectedReasoningEffort } : {}),
      ...(diagnosticLogger ? { diagnosticLogger } : {}),
    };

    const loadedRenderer = await rendererLoadTask;
    logInteractiveChatStartupTiming(diagnosticLogger, {
      phase: "renderer_load",
      startupStartedAtMs,
      phaseDurationMs: loadedRenderer.rendererLoadDurationMs,
      fields: {
        rendererSource: loadedRenderer.rendererSource,
      },
    });

    const renderStartedAtMs = Date.now();
    const chatScreen = await loadedRenderer.renderChatScreen(renderArgs);
    logInteractiveChatStartupTiming(diagnosticLogger, {
      phase: "render",
      startupStartedAtMs,
      phaseStartedAtMs: renderStartedAtMs,
    });

    await chatScreen.waitUntilExit();
    logCliDiagnosticEvent(diagnosticLogger, "interactive_chat.exited", {
      selectedModelId: conversationSessionBindings.readActiveConversationSessionModelSelection().selectedModelId,
    });
    return "";
  } finally {
    await conversationTurnProviderResolution?.dispose();
    consoleFileLoggerInstallation.restore();
    defaultConversationSessionStore?.close();
  }
}

async function loadInteractiveChatRenderer(
  injectedRenderChatScreen: InteractiveChatRenderer | undefined,
): Promise<LoadedInteractiveChatRenderer> {
  if (injectedRenderChatScreen) {
    return {
      renderChatScreen: injectedRenderChatScreen,
      rendererLoadDurationMs: 0,
      rendererSource: "injected",
    };
  }

  const rendererLoadStartedAtMs = Date.now();
  const { renderChatScreenInTerminal } = await import("@buli/tui");
  return {
    renderChatScreen: renderChatScreenInTerminal,
    rendererLoadDurationMs: Date.now() - rendererLoadStartedAtMs,
    rendererSource: "default",
  };
}

function logInteractiveChatStartupTiming(
  diagnosticLogger: BuliDiagnosticLogger | undefined,
  input: {
    phase: string;
    startupStartedAtMs: number;
    phaseStartedAtMs?: number | undefined;
    phaseDurationMs?: number | undefined;
    fields?: BuliDiagnosticLogFields | undefined;
  },
): void {
  const durationMs = input.phaseDurationMs ?? Date.now() - (input.phaseStartedAtMs ?? input.startupStartedAtMs);
  logCliDiagnosticEvent(diagnosticLogger, "interactive_chat.startup_timing", {
    phase: input.phase,
    durationMs: Math.max(0, durationMs),
    elapsedMs: Math.max(0, Date.now() - input.startupStartedAtMs),
    ...(input.fields ?? {}),
  });
}

function areConversationSessionModelSelectionsEqual(
  persistedModelSelection: ConversationSessionModelSelection | undefined,
  resolvedModelSelection: ConversationSessionModelSelection,
): boolean {
  if (!persistedModelSelection) {
    return false;
  }

  return persistedModelSelection.selectedModelId === resolvedModelSelection.selectedModelId &&
    persistedModelSelection.selectedModelDefaultReasoningEffort ===
      resolvedModelSelection.selectedModelDefaultReasoningEffort &&
    persistedModelSelection.selectedReasoningEffort === resolvedModelSelection.selectedReasoningEffort;
}
