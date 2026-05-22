import type {
  AssistantOperatingMode,
  BuliDiagnosticLogger,
  ProviderAvailableToolName,
  ProjectInstructionSnapshot,
} from "@buli/contracts";
import type {
  ConversationTurnProvider,
  ConversationTurnRequest,
  ProviderConversationTurn,
} from "./provider.ts";
import type { InMemoryConversationHistory } from "./conversationHistory.ts";
import { buildBuliSystemPrompt } from "./systemPrompt.ts";
import { buildModelFacingPromptTextFromPromptContextReferences } from "./prompt-context/buildModelFacingPromptTextFromPromptContextReferences.ts";
import { ProjectInstructionTracker, toProjectInstructionSnapshots } from "./projectInstructions.ts";
import { resolveAvailableToolNamesForAssistantOperatingMode } from "./assistantOperatingModePolicy.ts";
import { logEngineDiagnosticEvent } from "./runtimeDiagnostics.ts";
import { RuntimeConversationTurnSessionRecorder } from "./runtimeConversationTurnSessionRecorder.ts";

export type StartedRuntimeConversationTurn = {
  providerConversationTurn: ProviderConversationTurn;
  modelFacingPromptTextForAcceptedTurn: string;
  projectInstructionSnapshotsForAcceptedTurn: readonly ProjectInstructionSnapshot[];
};

export async function startAcceptedRuntimeConversationTurn(input: {
  conversationTurnInput: ConversationTurnRequest;
  assistantOperatingMode: AssistantOperatingMode;
  conversationTurnProvider: ConversationTurnProvider;
  conversationHistory: InMemoryConversationHistory;
  workspaceRootPath: string;
  promptContextBrowseRootPath: string;
  promptContextStartingDirectoryPath: string;
  projectInstructionTracker: ProjectInstructionTracker;
  promptCacheKey?: string | undefined;
  availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
  abortSignal: AbortSignal;
  conversationTurnSessionRecorder: RuntimeConversationTurnSessionRecorder;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): Promise<StartedRuntimeConversationTurn> {
  input.throwIfConversationTurnInterrupted();
  const modelFacingPromptTextForAcceptedTurn = await buildModelFacingPromptTextFromPromptContextReferences({
    promptText: input.conversationTurnInput.userPromptText,
    promptContextBrowseRootPath: input.promptContextBrowseRootPath,
    promptContextStartingDirectoryPath: input.promptContextStartingDirectoryPath,
    abortSignal: input.abortSignal,
  });
  input.throwIfConversationTurnInterrupted();
  logEngineDiagnosticEvent(input.diagnosticLogger, "conversation_turn.prompt_context_expanded", {
    userPromptLength: input.conversationTurnInput.userPromptText.length,
    modelFacingPromptLength: modelFacingPromptTextForAcceptedTurn.length,
    promptContextBrowseRootPath: input.promptContextBrowseRootPath,
    promptContextStartingDirectoryPath: input.promptContextStartingDirectoryPath,
  });
  const projectInstructionSnapshotsForAcceptedTurn = toProjectInstructionSnapshots(
    await input.projectInstructionTracker.loadProjectInstructionsForDirectory({
      targetDirectoryPath: input.workspaceRootPath,
      abortSignal: input.abortSignal,
    }),
  );
  input.throwIfConversationTurnInterrupted();
  input.conversationTurnSessionRecorder.appendAcceptedUserPromptSessionEntry(
    modelFacingPromptTextForAcceptedTurn,
    projectInstructionSnapshotsForAcceptedTurn,
  );

  logEngineDiagnosticEvent(input.diagnosticLogger, "provider_turn.start_requested", {
    selectedModelId: input.conversationTurnInput.selectedModelId,
    selectedReasoningEffort: input.conversationTurnInput.selectedReasoningEffort ?? null,
    conversationSessionEntryCount: input.conversationHistory.listConversationSessionEntries().length,
    modelContextItemCount: input.conversationHistory.listModelContextItems().length,
    assistantOperatingMode: input.assistantOperatingMode,
  });
  const providerConversationTurn = input.conversationTurnProvider.startConversationTurn({
    systemPromptText: buildBuliSystemPrompt({
      workspaceRootPath: input.workspaceRootPath,
      assistantOperatingMode: input.assistantOperatingMode,
      projectInstructionSnapshots: projectInstructionSnapshotsForAcceptedTurn,
    }),
    conversationSessionEntries: input.conversationHistory.listConversationSessionEntries(),
    selectedModelId: input.conversationTurnInput.selectedModelId,
    ...(input.conversationTurnInput.selectedReasoningEffort
      ? { selectedReasoningEffort: input.conversationTurnInput.selectedReasoningEffort }
      : {}),
    ...(input.promptCacheKey ? { promptCacheKey: input.promptCacheKey } : {}),
    ...resolveAvailableToolNamesForAssistantOperatingMode({
      assistantOperatingMode: input.assistantOperatingMode,
      requestedAvailableToolNames: input.availableToolNames,
    }),
    availablePresentationFunctionNames: [],
    abortSignal: input.abortSignal,
  });
  logEngineDiagnosticEvent(input.diagnosticLogger, "provider_turn.started", {
    selectedModelId: input.conversationTurnInput.selectedModelId,
  });

  return {
    providerConversationTurn,
    modelFacingPromptTextForAcceptedTurn,
    projectInstructionSnapshotsForAcceptedTurn,
  };
}
