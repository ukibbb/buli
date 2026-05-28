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
import {
  combineBuliDiagnosticLoggers,
  installBuliProfileLogger,
} from "../profiling/buliProfileLogger.ts";
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
import {
  INVALID_PROVIDER_HOST_COMMAND_MESSAGE,
  resolveProviderHostCommandFromEnvironment,
} from "../providerProtocol/providerHostCommand.ts";

type InteractiveChatRenderer = (input: RenderChatScreenInTerminalInput) => Promise<TuiChatScreenInstance>;

type LoadedInteractiveChatRenderer = {
  renderChatScreen: InteractiveChatRenderer;
  rendererLoadDurationMs: number;
  rendererSource: "default" | "injected";
};

type InteractiveChatStartupConfiguration = {
  environment: InteractiveChatEnvironment;
  externalProviderHostCommand: readonly string[] | undefined;
  bashToolApprovalMode: BashToolApprovalMode;
  autoCompactionThresholdRatio: number | undefined;
  maximumConcurrentReadOnlyToolCalls: number | undefined;
  maximumConcurrentSubagentConversations: number | undefined;
  maximumConcurrentResponseStepStreams: number | undefined;
  workspaceRootPath: string;
  promptContextScope: ReturnType<typeof resolveInteractiveChatPromptContextScope>;
};

type InteractiveChatStartupConfigurationResolution =
  | {
    status: "ready";
    configuration: InteractiveChatStartupConfiguration;
  }
  | {
    status: "failed";
    message: string;
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
  const workspaceRootPath = process.cwd();
  const startupConfigurationResolution = resolveInteractiveChatStartupConfiguration({
    environment,
    requestedBashToolApprovalMode: input.bashToolApprovalMode,
    workspaceRootPath,
  });
  if (startupConfigurationResolution.status === "failed") {
    return startupConfigurationResolution.message;
  }
  const {
    externalProviderHostCommand,
    bashToolApprovalMode,
    autoCompactionThresholdRatio,
    maximumConcurrentReadOnlyToolCalls,
    maximumConcurrentSubagentConversations,
    maximumConcurrentResponseStepStreams,
    promptContextScope,
  } = startupConfigurationResolution.configuration;

  const store = input.store ?? new OpenAiAuthStore();
  const authLoadStartedAtMs = Date.now();
  const authTask = externalProviderHostCommand ? Promise.resolve(undefined) : store.loadOpenAi();
  const stdin = input.stdin ?? process.stdin;
  const auth = await authTask;
  const authLoadDurationMs = Date.now() - authLoadStartedAtMs;
  if (!externalProviderHostCommand && !auth) {
    return "OpenAI auth not found. Run `buli login`.";
  }

  if (!stdin.isTTY) {
    return "Interactive chat requires a TTY. Run `buli` in a terminal.";
  }

  const consoleFileLoggerInstallation = installConsoleFileLogger({ environment });
  const profileLoggerInstallation = installBuliProfileLogger({ environment });
  const consoleFileDiagnosticLogger = consoleFileLoggerInstallation.logFilePath
    ? createDiagnosticFileLogger({ logFilePath: consoleFileLoggerInstallation.logFilePath })
    : undefined;
  const diagnosticLogger = combineBuliDiagnosticLoggers([
    consoleFileDiagnosticLogger,
    profileLoggerInstallation.diagnosticLogger,
  ]);
  let defaultConversationSessionStore: SqliteConversationSessionStore | undefined;
  let conversationTurnProviderResolution: InteractiveChatConversationTurnProviderResolution | undefined;
  try {
    logInteractiveChatStartupTiming(diagnosticLogger, {
      phase: "auth",
      startupStartedAtMs,
      phaseDurationMs: authLoadDurationMs,
    });

    const rendererLoadTask = loadInteractiveChatRenderer(input.renderChatScreen);
    void rendererLoadTask.catch(() => { });

    const conversationSessionLoadStartedAtMs = Date.now();
    const conversationSessionStore = input.conversationSessionStore ??
      (defaultConversationSessionStore = new SqliteConversationSessionStore({ diagnosticLogger }));
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
      profileFilePath: profileLoggerInstallation.profileFilePath ?? null,
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

    const provider = externalProviderHostCommand
      ? undefined
      : new OpenAiProvider({
        store,
        ...(maximumConcurrentResponseStepStreams !== undefined ? { maximumConcurrentResponseStepStreams } : {}),
        diagnosticLogger,
      });
    conversationTurnProviderResolution = resolveInteractiveChatConversationTurnProvider({
      ...(provider !== undefined ? { openAiProvider: provider } : {}),
      store,
      environment,
      workspaceRootPath,
      ...(externalProviderHostCommand !== undefined
        ? { providerHostCommand: externalProviderHostCommand, providerHostKind: "external" }
        : input.providerHostCommand !== undefined
          ? { providerHostCommand: input.providerHostCommand }
          : {}),
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
      diagnosticLogger,
    });
    const conversationHistory = new InMemoryConversationHistory({
      onConversationSessionEntryAppended: (conversationSessionEntry, appendMetadata) => {
        const conversationSessionAppendStartedAtMs = Date.now();
        conversationSessionStore.appendConversationSessionEntry(conversationSessionEntry);
        logCliDiagnosticEvent(diagnosticLogger, "conversation_session.append_entry_timing", {
          conversationSessionEntryKind: conversationSessionEntry.entryKind,
          durationMs: Date.now() - conversationSessionAppendStartedAtMs,
          conversationSessionEntryCount: appendMetadata.conversationSessionEntryCount,
        });
        logCliDiagnosticEvent(diagnosticLogger, "conversation_session.saved", {
          conversationSessionEntryKind: conversationSessionEntry.entryKind,
          assistantOperatingMode: conversationSessionEntry.entryKind === "user_prompt"
            ? conversationSessionEntry.assistantOperatingMode ?? null
            : null,
          conversationSessionEntryCount: appendMetadata.conversationSessionEntryCount,
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
      enforceAssistantWorkflowModeTransitions: true,
      ...(conversationSessionStore.promptCacheKey ? { promptCacheKey: conversationSessionStore.promptCacheKey } : {}),
      diagnosticLogger,
      ...(autoCompactionThresholdRatio !== undefined ? { autoCompactionThresholdRatio } : {}),
      ...(maximumConcurrentReadOnlyToolCalls !== undefined ? { maximumConcurrentReadOnlyToolCalls } : {}),
      ...(maximumConcurrentSubagentConversations !== undefined ? { maximumConcurrentSubagentConversations } : {}),
    });
    assistantConversationRunner.startWorkspaceCodebaseKnowledgeIndexing();
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
    const availableSkills = await assistantConversationRunner.listAvailableSkills();
    const resolvedConversationTurnProvider = conversationTurnProviderResolution;

    const renderArgs: RenderChatScreenInTerminalInput = {
      assistantConversationRunner,
      availableSkills,
      loadAvailableAssistantModels: async () => [...await resolvedConversationTurnProvider.listAvailableAssistantModels()],
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
    await profileLoggerInstallation.dispose();
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

function resolveInteractiveChatStartupConfiguration(input: {
  environment: InteractiveChatEnvironment;
  requestedBashToolApprovalMode: BashToolApprovalMode | undefined;
  workspaceRootPath: string;
}): InteractiveChatStartupConfigurationResolution {
  const externalProviderHostCommandResolution = resolveProviderHostCommandFromEnvironment({ environment: input.environment });
  if (externalProviderHostCommandResolution.status === "invalid") {
    return { status: "failed", message: INVALID_PROVIDER_HOST_COMMAND_MESSAGE };
  }

  const bashToolApprovalMode = resolveInteractiveChatBashToolApprovalMode({
    requestedBashToolApprovalMode: input.requestedBashToolApprovalMode,
    environment: input.environment,
  });
  if (!bashToolApprovalMode) {
    return { status: "failed", message: INVALID_BASH_TOOL_APPROVAL_MODE_MESSAGE };
  }

  const autoCompactionThresholdResolution = resolveConversationAutoCompactionThresholdRatio({
    environment: input.environment,
  });
  if (autoCompactionThresholdResolution.status === "invalid") {
    return { status: "failed", message: INVALID_AUTO_COMPACTION_THRESHOLD_MESSAGE };
  }

  const readOnlyToolConcurrencyResolution = resolveInteractiveChatReadOnlyToolConcurrency({ environment: input.environment });
  if (readOnlyToolConcurrencyResolution.status === "invalid") {
    return { status: "failed", message: INVALID_READ_ONLY_TOOL_CONCURRENCY_MESSAGE };
  }

  const subagentConcurrencyResolution = resolveInteractiveChatSubagentConcurrency({ environment: input.environment });
  if (subagentConcurrencyResolution.status === "invalid") {
    return { status: "failed", message: INVALID_SUBAGENT_CONCURRENCY_MESSAGE };
  }

  const openAiMaxConcurrentStreamsResolution = resolveInteractiveChatOpenAiMaxConcurrentStreams({
    environment: input.environment,
  });
  if (openAiMaxConcurrentStreamsResolution.status === "invalid") {
    return { status: "failed", message: INVALID_OPENAI_MAX_CONCURRENT_STREAMS_MESSAGE };
  }

  return {
    status: "ready",
    configuration: {
      environment: input.environment,
      externalProviderHostCommand: externalProviderHostCommandResolution.providerHostCommand,
      bashToolApprovalMode,
      autoCompactionThresholdRatio: autoCompactionThresholdResolution.thresholdRatio,
      maximumConcurrentReadOnlyToolCalls: readOnlyToolConcurrencyResolution.value,
      maximumConcurrentSubagentConversations: subagentConcurrencyResolution.value,
      maximumConcurrentResponseStepStreams: openAiMaxConcurrentStreamsResolution.value,
      workspaceRootPath: input.workspaceRootPath,
      promptContextScope: resolveInteractiveChatPromptContextScope({
        workspaceRootPath: input.workspaceRootPath,
        environment: input.environment,
      }),
    },
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
