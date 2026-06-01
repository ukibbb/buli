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
import { buildRelevantBuliStickyNotesContextText } from "./readOnlyToolEvidenceNotebook.ts";
import { resolveAvailableToolNamesForAssistantOperatingMode } from "./assistantOperatingModePolicy.ts";
import { buildAssistantWorkflowHandoffPromptBlock } from "./assistantWorkflowHandoffContext.ts";
import type { AssistantProviderModelPromptProfile } from "./assistantProviderModelPromptProfile.ts";
import { logEngineDiagnosticEvent } from "./runtimeDiagnostics.ts";
import { RuntimeConversationTurnSessionRecorder } from "./runtimeConversationTurnSessionRecorder.ts";
import { formatUserSelectedSkillPromptForModel, type WorkspaceSkillCatalog } from "./skills/skillCatalog.ts";

export type StartedRuntimeConversationTurn = {
  providerConversationTurn: ProviderConversationTurn;
  modelFacingPromptTextForAcceptedTurn: string;
  projectInstructionSnapshotsForAcceptedTurn: readonly ProjectInstructionSnapshot[];
  buliStickyNotesContextTextForAcceptedTurn?: string | undefined;
};

export async function startAcceptedRuntimeConversationTurn(input: {
  conversationTurnInput: ConversationTurnRequest;
  assistantOperatingMode: AssistantOperatingMode;
  conversationTurnProvider: ConversationTurnProvider;
  assistantProviderModelPromptProfile: AssistantProviderModelPromptProfile;
  conversationHistory: InMemoryConversationHistory;
  workspaceRootPath: string;
  promptContextBrowseRootPath: string;
  promptContextStartingDirectoryPath: string;
  projectInstructionTracker: ProjectInstructionTracker;
  skillCatalog: WorkspaceSkillCatalog;
  promptCacheKey?: string | undefined;
  availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
  abortSignal: AbortSignal;
  conversationTurnSessionRecorder: RuntimeConversationTurnSessionRecorder;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): Promise<StartedRuntimeConversationTurn> {
  input.throwIfConversationTurnInterrupted();
  const modelFacingPromptTextForAcceptedTurn = await buildModelFacingPromptTextForAcceptedTurn({
    conversationTurnInput: input.conversationTurnInput,
    promptContextBrowseRootPath: input.promptContextBrowseRootPath,
    promptContextStartingDirectoryPath: input.promptContextStartingDirectoryPath,
    skillCatalog: input.skillCatalog,
    abortSignal: input.abortSignal,
  });
  input.throwIfConversationTurnInterrupted();
  logEngineDiagnosticEvent(input.diagnosticLogger, "conversation_turn.prompt_context_expanded", {
    conversationTurnId: input.conversationTurnInput.conversationTurnId ?? null,
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
  const effectiveToolAvailability = resolveAvailableToolNamesForAssistantOperatingMode({
    assistantOperatingMode: input.assistantOperatingMode,
    requestedAvailableToolNames: input.availableToolNames,
  });
  const availableSkillsForAcceptedTurn = effectiveToolAvailability.availableToolNames?.includes("skill")
    ? await input.skillCatalog.listAvailableSkills()
    : [];
  input.throwIfConversationTurnInterrupted();
  input.conversationTurnSessionRecorder.appendAcceptedUserPromptSessionEntry(
    modelFacingPromptTextForAcceptedTurn,
    projectInstructionSnapshotsForAcceptedTurn,
  );
  const buliStickyNotesContextText = buildRelevantBuliStickyNotesContextText({
    conversationSessionEntries: input.conversationHistory.listConversationSessionEntries(),
    currentUserPromptText: input.conversationTurnInput.userPromptText,
    maximumNoteCount: input.assistantProviderModelPromptProfile.stickyNotes.maximumRelevantEvidenceNoteCount,
    maximumPromptNoteTextCharacterCount:
      input.assistantProviderModelPromptProfile.stickyNotes.maximumPromptNoteTextCharacterCount,
    maximumObservationTextCharacterCount:
      input.assistantProviderModelPromptProfile.stickyNotes.maximumObservationTextCharacterCount,
  });
  const workflowHandoffContextText = buildAssistantWorkflowHandoffPromptBlock({
    currentAssistantOperatingMode: input.assistantOperatingMode,
    conversationSessionEntries: input.conversationHistory.listConversationSessionEntries(),
    renderingProfile: input.assistantProviderModelPromptProfile.workflowHandoff,
  });

  logEngineDiagnosticEvent(input.diagnosticLogger, "provider_turn.start_requested", {
    conversationTurnId: input.conversationTurnInput.conversationTurnId ?? null,
    selectedModelId: input.conversationTurnInput.selectedModelId,
    selectedReasoningEffort: input.conversationTurnInput.selectedReasoningEffort ?? null,
    conversationSessionEntryCount: input.conversationHistory.listConversationSessionEntries().length,
    modelContextItemCount: input.conversationHistory.listModelContextItems().length,
    assistantOperatingMode: input.assistantOperatingMode,
  });
  const providerConversationTurn = input.conversationTurnProvider.startConversationTurn({
    ...(input.conversationTurnInput.conversationTurnId !== undefined
      ? { conversationTurnId: input.conversationTurnInput.conversationTurnId }
      : {}),
    providerTurnKind: "assistant",
    systemPromptText: buildBuliSystemPrompt({
      workspaceRootPath: input.workspaceRootPath,
      assistantOperatingMode: input.assistantOperatingMode,
      projectInstructionSnapshots: projectInstructionSnapshotsForAcceptedTurn,
      availableSkills: availableSkillsForAcceptedTurn,
      ...(buliStickyNotesContextText ? { buliStickyNotesContextText } : {}),
      workflowHandoffContextText,
      assistantProviderModelPromptProfile: input.assistantProviderModelPromptProfile,
    }),
    conversationSessionEntries: input.conversationHistory.listConversationSessionEntries(),
    selectedModelId: input.conversationTurnInput.selectedModelId,
    ...(input.conversationTurnInput.selectedReasoningEffort
      ? { selectedReasoningEffort: input.conversationTurnInput.selectedReasoningEffort }
      : {}),
    ...(input.promptCacheKey ? { promptCacheKey: input.promptCacheKey } : {}),
    ...effectiveToolAvailability,
    abortSignal: input.abortSignal,
  });
  logEngineDiagnosticEvent(input.diagnosticLogger, "provider_turn.started", {
    conversationTurnId: input.conversationTurnInput.conversationTurnId ?? null,
    selectedModelId: input.conversationTurnInput.selectedModelId,
  });

  return {
    providerConversationTurn,
    modelFacingPromptTextForAcceptedTurn,
    projectInstructionSnapshotsForAcceptedTurn,
    ...(buliStickyNotesContextText ? { buliStickyNotesContextTextForAcceptedTurn: buliStickyNotesContextText } : {}),
  };
}

async function buildModelFacingPromptTextForAcceptedTurn(input: {
  conversationTurnInput: ConversationTurnRequest;
  promptContextBrowseRootPath: string;
  promptContextStartingDirectoryPath: string;
  skillCatalog: WorkspaceSkillCatalog;
  abortSignal: AbortSignal;
}): Promise<string> {
  if (input.conversationTurnInput.modelFacingUserPromptText !== undefined) {
    return input.conversationTurnInput.modelFacingUserPromptText;
  }

  if (input.conversationTurnInput.userSelectedSkillName !== undefined) {
    const userSelectedSkill = await input.skillCatalog.loadSkillByName(input.conversationTurnInput.userSelectedSkillName);
    if (!userSelectedSkill) {
      throw new Error(`Selected skill not found: ${input.conversationTurnInput.userSelectedSkillName}`);
    }

    return formatUserSelectedSkillPromptForModel(userSelectedSkill);
  }

  return buildModelFacingPromptTextFromPromptContextReferences({
    promptText: input.conversationTurnInput.userPromptText,
    promptContextBrowseRootPath: input.promptContextBrowseRootPath,
    promptContextStartingDirectoryPath: input.promptContextStartingDirectoryPath,
    abortSignal: input.abortSignal,
  });
}
