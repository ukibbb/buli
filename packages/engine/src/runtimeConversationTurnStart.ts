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
import type { PrimaryAssistantAgentDefinition } from "./assistantAgentRegistry.ts";
import type { AssistantToolRegistry } from "./assistantToolRegistry.ts";
import { buildBuliSystemPromptForPrimaryAssistantAgent } from "./systemPrompt.ts";
import { buildModelFacingPromptTextFromPromptContextReferences } from "./prompt-context/buildModelFacingPromptTextFromPromptContextReferences.ts";
import { ProjectInstructionTracker, toProjectInstructionSnapshots } from "./projectInstructions.ts";
import { buildRelevantBuliStickyNotesContextText } from "./readOnlyToolEvidenceNotebook.ts";
import { resolveAvailableToolNamesForPrimaryAssistantAgent } from "./assistantOperatingModePolicy.ts";
import { buildAssistantWorkflowHandoffPromptBlock } from "./assistantWorkflowHandoffContext.ts";
import type { AssistantProviderModelPromptProfile, AssistantProviderName } from "./assistantProviderModelPromptProfile.ts";
import type { BuiltInToolDescriptionOverlayResolver } from "./assistantModelOverlay.ts";
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
  primaryAssistantAgent: PrimaryAssistantAgentDefinition;
  assistantProviderName: AssistantProviderName;
  assistantToolRegistry: AssistantToolRegistry;
  builtInToolDescriptionOverlayResolver: BuiltInToolDescriptionOverlayResolver;
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
  const effectiveToolAvailability = resolveAvailableToolNamesForPrimaryAssistantAgent({
    primaryAssistantAgent: input.primaryAssistantAgent,
    requestedAvailableToolNames: input.availableToolNames,
  });
  const effectiveCustomProviderToolDefinitions = input.assistantToolRegistry.resolveProviderToolDefinitionsForTurn({
    availableToolNames: effectiveToolAvailability.availableToolNames,
    turnContext: {
      providerName: input.assistantProviderName,
      selectedModelId: input.conversationTurnInput.selectedModelId,
      ...(input.conversationTurnInput.selectedReasoningEffort !== undefined
        ? { selectedReasoningEffort: input.conversationTurnInput.selectedReasoningEffort }
        : {}),
      assistantTurnKind: "primary_assistant_agent",
      assistantAgentName: input.primaryAssistantAgent.agentName,
    },
  });
  const effectiveBuiltInToolDescriptionOverlays = input.builtInToolDescriptionOverlayResolver({
    providerName: input.assistantProviderName,
    selectedModelId: input.conversationTurnInput.selectedModelId,
    ...(input.conversationTurnInput.selectedReasoningEffort !== undefined
      ? { selectedReasoningEffort: input.conversationTurnInput.selectedReasoningEffort }
      : {}),
    assistantTurnKind: "primary_assistant_agent",
    assistantAgentName: input.primaryAssistantAgent.agentName,
    availableToolNames: effectiveToolAvailability.availableToolNames,
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
    currentPrimaryAssistantAgent: input.primaryAssistantAgent,
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
    systemPromptText: buildBuliSystemPromptForPrimaryAssistantAgent({
      workspaceRootPath: input.workspaceRootPath,
      primaryAssistantAgent: input.primaryAssistantAgent,
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
    ...(effectiveCustomProviderToolDefinitions.length > 0
      ? { availableToolDefinitions: effectiveCustomProviderToolDefinitions }
      : {}),
    ...(effectiveBuiltInToolDescriptionOverlays.length > 0
      ? { builtInToolDescriptionOverlays: effectiveBuiltInToolDescriptionOverlays }
      : {}),
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
