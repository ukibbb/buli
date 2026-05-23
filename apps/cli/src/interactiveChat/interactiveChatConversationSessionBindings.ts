import type {
  BuliDiagnosticLogger,
  ConversationSessionModelSelection,
} from "@buli/contracts";
import type {
  AssistantConversationRuntime,
  ConversationAutoCompactionRequest,
  ConversationAutoCompactionResult,
  ConversationCompactionRequest,
  InMemoryConversationHistory,
} from "@buli/engine";
import type { RenderChatScreenInTerminalInput } from "@buli/tui";
import type { BrowserUrlLauncher } from "../browserLauncher.ts";
import type { ConversationSessionStore } from "../conversationSession/index.ts";
import { logCliDiagnosticEvent } from "../diagnostics/cliDiagnosticLog.ts";

type InteractiveChatConversationSessionRenderInput = Pick<
  RenderChatScreenInTerminalInput,
  | "loadConversationSessions"
  | "switchConversationSession"
  | "deleteConversationSession"
  | "onConversationCleared"
  | "exportCurrentConversationSession"
  | "compactCurrentConversationSession"
  | "autoCompactCurrentConversationSession"
  | "onConversationSessionModelSelectionChanged"
>;

export type InteractiveChatConversationSessionBindings = {
  renderInput: InteractiveChatConversationSessionRenderInput;
  readActiveConversationSessionModelSelection(): ConversationSessionModelSelection;
};

export function createInteractiveChatConversationSessionBindings(input: {
  conversationSessionStore: ConversationSessionStore;
  conversationHistory: InMemoryConversationHistory;
  assistantConversationRunner: AssistantConversationRuntime;
  initialConversationSessionId: string;
  initialConversationSessionModelSelection: ConversationSessionModelSelection;
  workspaceRootPath: string;
  conversationSessionExportDirectoryPath?: string | undefined;
  openBrowserUrl?: BrowserUrlLauncher | undefined;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): InteractiveChatConversationSessionBindings {
  let activeConversationSessionId = input.initialConversationSessionId;
  let activeConversationSessionModelSelection = input.initialConversationSessionModelSelection;

  return {
    renderInput: {
      loadConversationSessions: () => input.conversationSessionStore.listConversationSessions(),
      switchConversationSession: async (conversationSessionId: string) => {
        const switchedConversationSession = input.conversationSessionStore.switchActiveConversationSession(
          conversationSessionId,
        );
        activeConversationSessionId = switchedConversationSession.sessionId;
        if (switchedConversationSession.modelSelection) {
          activeConversationSessionModelSelection = switchedConversationSession.modelSelection;
        }
        input.conversationHistory.replaceConversationSessionEntries(switchedConversationSession.conversationSessionEntries);
        logCliDiagnosticEvent(input.diagnosticLogger, "conversation_session.switched", {
          conversationSessionId: switchedConversationSession.sessionId,
          conversationSessionStoragePath: input.conversationSessionStore.storagePath ?? null,
          conversationSessionEntryCount: switchedConversationSession.conversationSessionEntries.length,
          selectedModelId: switchedConversationSession.modelSelection?.selectedModelId ?? null,
        });
        return {
          conversationSessionId: switchedConversationSession.sessionId,
          ...(switchedConversationSession.modelSelection ? { modelSelection: switchedConversationSession.modelSelection } : {}),
          conversationSessionEntries: switchedConversationSession.conversationSessionEntries,
        };
      },
      deleteConversationSession: async (conversationSessionId: string) => {
        const activeConversationSessionAfterDelete = input.conversationSessionStore.deleteConversationSession(
          conversationSessionId,
          { replacementModelSelection: activeConversationSessionModelSelection },
        );
        activeConversationSessionId = activeConversationSessionAfterDelete.sessionId;
        if (activeConversationSessionAfterDelete.modelSelection) {
          activeConversationSessionModelSelection = activeConversationSessionAfterDelete.modelSelection;
        }
        input.conversationHistory.replaceConversationSessionEntries(
          activeConversationSessionAfterDelete.conversationSessionEntries,
        );
        const conversationSessionsAfterDelete = input.conversationSessionStore.listConversationSessions();
        logCliDiagnosticEvent(input.diagnosticLogger, "conversation_session.deleted", {
          deletedConversationSessionId: conversationSessionId,
          activeConversationSessionId: activeConversationSessionAfterDelete.sessionId,
          activeConversationSessionEntryCount: activeConversationSessionAfterDelete.conversationSessionEntries.length,
          conversationSessionCount: conversationSessionsAfterDelete.length,
        });
        return {
          deletedConversationSessionId: conversationSessionId,
          activeConversationSessionId: activeConversationSessionAfterDelete.sessionId,
          ...(activeConversationSessionAfterDelete.modelSelection
            ? { activeConversationSessionModelSelection: activeConversationSessionAfterDelete.modelSelection }
            : {}),
          activeConversationSessionEntries: activeConversationSessionAfterDelete.conversationSessionEntries,
          conversationSessions: conversationSessionsAfterDelete,
        };
      },
      onConversationCleared: () => {
        const newConversationSession = input.conversationSessionStore.startNewConversationSession({
          modelSelection: activeConversationSessionModelSelection,
        });
        activeConversationSessionId = newConversationSession.sessionId;
        activeConversationSessionModelSelection = newConversationSession.modelSelection ?? activeConversationSessionModelSelection;
        input.conversationHistory.replaceConversationSessionEntries(newConversationSession.conversationSessionEntries);
        logCliDiagnosticEvent(input.diagnosticLogger, "conversation_session.created", {
          conversationSessionId: newConversationSession.sessionId,
          conversationSessionStoragePath: input.conversationSessionStore.storagePath ?? null,
          selectedModelId: activeConversationSessionModelSelection.selectedModelId,
        });
        return {
          conversationSessionId: newConversationSession.sessionId,
          ...(newConversationSession.modelSelection ? { modelSelection: newConversationSession.modelSelection } : {}),
          conversationSessionEntries: newConversationSession.conversationSessionEntries,
        };
      },
      exportCurrentConversationSession: async () => {
        const conversationSessionExportModule = await import("../conversationSession/export/conversationSessionHtmlExport.ts");
        const exportResult = conversationSessionExportModule.writeConversationSessionHtmlExport({
          conversationSessionEntries: input.conversationHistory.listConversationSessionEntries(),
          workspaceRootPath: input.workspaceRootPath,
          conversationSessionId: activeConversationSessionId,
          exportDirectoryPath: input.conversationSessionExportDirectoryPath ??
            conversationSessionExportModule.defaultConversationSessionExportDirectoryPath(),
        });
        const openBrowserUrl = input.openBrowserUrl ?? (await import("../browserLauncher.ts")).openBrowserUrl;
        await openBrowserUrl(exportResult.exportFileUrl);
        logCliDiagnosticEvent(input.diagnosticLogger, "conversation_session.exported", {
          conversationSessionId: activeConversationSessionId,
          exportFilePath: exportResult.exportFilePath,
        });
        return exportResult;
      },
      compactCurrentConversationSession: async (compactionRequest: ConversationCompactionRequest) => {
        await input.assistantConversationRunner.compactConversationSession(compactionRequest);
        const conversationSessionEntries = input.conversationHistory.listConversationSessionEntries();
        logCliDiagnosticEvent(input.diagnosticLogger, "conversation_session.compacted", {
          conversationSessionId: activeConversationSessionId,
          conversationSessionEntryCount: conversationSessionEntries.length,
        });
        return { conversationSessionEntries };
      },
      autoCompactCurrentConversationSession: async (
        autoCompactionRequest: ConversationAutoCompactionRequest,
      ): Promise<ConversationAutoCompactionResult> => {
        const autoCompactionResult = await input.assistantConversationRunner.autoCompactConversationSession(autoCompactionRequest);
        const autoCompactionDecision = autoCompactionResult.decision;
        logCliDiagnosticEvent(input.diagnosticLogger, "conversation_session.auto_compaction_decided", {
          conversationSessionId: activeConversationSessionId,
          shouldCompact: autoCompactionDecision.shouldCompact,
          reason: autoCompactionDecision.reason,
          selectedModelId: autoCompactionDecision.selectedModelId,
          contextTokensUsed: autoCompactionDecision.contextTokensUsed,
          contextWindowTokenCapacity: autoCompactionDecision.contextWindowTokenCapacity ?? null,
          contextCompactionTriggerTokenCount: autoCompactionDecision.contextCompactionTriggerTokenCount ?? null,
          contextUsageRatio: autoCompactionDecision.contextUsageRatio ?? null,
          reservedTokenCount: autoCompactionDecision.reservedTokenCount ?? null,
          thresholdRatio: autoCompactionDecision.thresholdRatio ?? null,
          triggerKind: autoCompactionDecision.triggerKind ?? null,
          sessionEntryCountAfterLatestCompactionSummary:
            autoCompactionDecision.sessionEntryCountAfterLatestCompactionSummary,
        });
        if (!autoCompactionResult.didCompact) {
          return autoCompactionResult;
        }

        logCliDiagnosticEvent(input.diagnosticLogger, "conversation_session.auto_compacted", {
          conversationSessionId: activeConversationSessionId,
          conversationSessionEntryCount: autoCompactionResult.conversationSessionEntries.length,
          contextTokensUsed: autoCompactionDecision.contextTokensUsed,
          contextCompactionTriggerTokenCount: autoCompactionDecision.contextCompactionTriggerTokenCount ?? null,
          reservedTokenCount: autoCompactionDecision.reservedTokenCount ?? null,
          thresholdRatio: autoCompactionDecision.thresholdRatio ?? null,
          triggerKind: autoCompactionDecision.triggerKind ?? null,
        });
        return autoCompactionResult;
      },
      onConversationSessionModelSelectionChanged: (modelSelection: ConversationSessionModelSelection) => {
        activeConversationSessionModelSelection = modelSelection;
        input.conversationSessionStore.saveActiveConversationSessionModelSelection(modelSelection);
        logCliDiagnosticEvent(input.diagnosticLogger, "conversation_session.model_selection_saved", {
          conversationSessionId: activeConversationSessionId,
          selectedModelId: modelSelection.selectedModelId,
          selectedModelDefaultReasoningEffort: modelSelection.selectedModelDefaultReasoningEffort ?? null,
          selectedReasoningEffort: modelSelection.selectedReasoningEffort ?? null,
        });
      },
    },
    readActiveConversationSessionModelSelection: () => activeConversationSessionModelSelection,
  };
}
