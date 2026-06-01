import {
  findLatestVisibleCompletedAssistantOperatingMode,
  findLatestVisibleWorkflowHandoffCheckpoint,
  type AssistantOperatingMode,
  type ConversationSessionEntry,
  type ImplementationWorkflowHandoff,
  type PlanWorkflowHandoff,
  type UnderstandingWorkflowHandoff,
  type WorkflowHandoff,
} from "@buli/contracts";
import { escapeModelFacingXmlAttributeValue, escapeModelFacingXmlText } from "./modelFacingXmlEscaping.ts";
import type { AssistantWorkflowHandoffPromptRenderingProfile } from "./assistantProviderModelPromptProfile.ts";

const DEFAULT_ASSISTANT_WORKFLOW_HANDOFF_PROMPT_RENDERING_PROFILE = {
  renderingDetail: "full",
} as const satisfies AssistantWorkflowHandoffPromptRenderingProfile;

export type AssistantWorkflowHandoffContext = {
  currentAssistantOperatingMode: AssistantOperatingMode;
  latestCompletedAssistantOperatingMode?: AssistantOperatingMode | undefined;
  latestUnderstandingWorkflowHandoff?: UnderstandingWorkflowHandoff | undefined;
  latestPlanWorkflowHandoff?: PlanWorkflowHandoff | undefined;
  latestImplementationWorkflowHandoff?: ImplementationWorkflowHandoff | undefined;
};

export function buildAssistantWorkflowHandoffContext(input: {
  currentAssistantOperatingMode: AssistantOperatingMode;
  conversationSessionEntries: readonly ConversationSessionEntry[];
}): AssistantWorkflowHandoffContext {
  const latestCompletedAssistantOperatingMode = findLatestVisibleCompletedAssistantOperatingMode(input.conversationSessionEntries);
  const latestVisibleWorkflowHandoffCheckpoint = findLatestVisibleWorkflowHandoffCheckpoint(input.conversationSessionEntries);
  return {
    currentAssistantOperatingMode: input.currentAssistantOperatingMode,
    ...(latestCompletedAssistantOperatingMode !== undefined
      ? { latestCompletedAssistantOperatingMode }
      : {}),
    ...latestVisibleWorkflowHandoffCheckpoint,
  };
}

export function buildAssistantWorkflowHandoffPromptBlock(input: {
  currentAssistantOperatingMode: AssistantOperatingMode;
  conversationSessionEntries: readonly ConversationSessionEntry[];
  renderingProfile?: AssistantWorkflowHandoffPromptRenderingProfile | undefined;
}): string {
  return formatAssistantWorkflowHandoffContextPromptBlock(
    buildAssistantWorkflowHandoffContext(input),
    input.renderingProfile,
  );
}

export function formatAssistantWorkflowHandoffContextPromptBlock(
  workflowHandoffContext: AssistantWorkflowHandoffContext,
  renderingProfile: AssistantWorkflowHandoffPromptRenderingProfile =
    DEFAULT_ASSISTANT_WORKFLOW_HANDOFF_PROMPT_RENDERING_PROFILE,
): string {
  return [
    "Workflow handoff system:",
    "- Workflow order is guidance, not a hard runtime gate: any mode may start.",
    "- Use the record_workflow_handoff tool to save a durable typed artifact when this turn establishes useful understanding, a concrete plan, or an implementation result.",
    "- Match handoff kind to the current mode: understand -> understanding, plan -> plan, implementation -> implementation.",
    "- Treat the latest relevant handoff as context, not as unquestionable truth. If the user changed direction, say so and update the handoff.",
    "- If the expected previous handoff is missing, recover safely instead of pretending it exists.",
    "<workflow_handoff_context>",
    `  <current_mode>${workflowHandoffContext.currentAssistantOperatingMode}</current_mode>`,
    workflowHandoffContext.latestCompletedAssistantOperatingMode
      ? `  <latest_completed_assistant_mode>${workflowHandoffContext.latestCompletedAssistantOperatingMode}</latest_completed_assistant_mode>`
      : "  <latest_completed_assistant_mode>none</latest_completed_assistant_mode>",
    ...formatExpectedHandoffGuidanceLines(workflowHandoffContext),
    ...formatWorkflowHandoffSectionLines(
      "latest_understanding_handoff",
      workflowHandoffContext.latestUnderstandingWorkflowHandoff,
      renderingProfile,
    ),
    ...formatWorkflowHandoffSectionLines("latest_plan_handoff", workflowHandoffContext.latestPlanWorkflowHandoff, renderingProfile),
    ...formatWorkflowHandoffSectionLines(
      "latest_implementation_handoff",
      workflowHandoffContext.latestImplementationWorkflowHandoff,
      renderingProfile,
    ),
    "</workflow_handoff_context>",
  ].join("\n");
}

function formatExpectedHandoffGuidanceLines(workflowHandoffContext: AssistantWorkflowHandoffContext): string[] {
  if (workflowHandoffContext.currentAssistantOperatingMode === "understand") {
    return [
      "  <current_mode_guidance>Understand mode may use prior handoffs for continuity, but its main job is to clarify what is known, unknown, and worth planning next.</current_mode_guidance>",
    ];
  }
  if (workflowHandoffContext.currentAssistantOperatingMode === "plan") {
    return [workflowHandoffContext.latestUnderstandingWorkflowHandoff
      ? "  <current_mode_guidance>Use the latest understanding handoff as planning input unless the user's new request changes the goal.</current_mode_guidance>"
      : "  <current_mode_guidance>No understanding handoff is available. Gather only the missing context needed before making a concrete plan.</current_mode_guidance>"];
  }

  return [workflowHandoffContext.latestPlanWorkflowHandoff
    ? "  <current_mode_guidance>Use the latest plan handoff as the implementation contract unless the user's new request changes or rejects that plan.</current_mode_guidance>"
    : "  <current_mode_guidance>No plan handoff is available. For non-trivial changes, produce or request the minimal plan/approval needed before mutating files.</current_mode_guidance>"];
}

function formatWorkflowHandoffSectionLines(
  sectionName: string,
  workflowHandoff: WorkflowHandoff | undefined,
  renderingProfile: AssistantWorkflowHandoffPromptRenderingProfile,
): string[] {
  if (!workflowHandoff) {
    return [`  <${sectionName}>missing</${sectionName}>`];
  }

  return [
    `  <${sectionName} kind="${workflowHandoff.handoffKind}">`,
    ...formatWorkflowHandoffSummaryLines(workflowHandoff, renderingProfile).map((summaryLine) => `    ${summaryLine}`),
    `  </${sectionName}>`,
  ];
}

function formatWorkflowHandoffSummaryLines(
  workflowHandoff: WorkflowHandoff,
  renderingProfile: AssistantWorkflowHandoffPromptRenderingProfile,
): string[] {
  if (workflowHandoff.handoffKind === "understanding") {
    return [
      `<user_goal>${formatWorkflowHandoffText(workflowHandoff.userGoal, renderingProfile)}</user_goal>`,
      `<current_understanding>${formatWorkflowHandoffText(workflowHandoff.currentUnderstanding, renderingProfile)}</current_understanding>`,
      ...formatTextListLines("important_findings", workflowHandoff.importantFindings, renderingProfile),
      ...formatTextListLines("constraints", workflowHandoff.constraints, renderingProfile),
      ...formatTextListLines("open_questions", workflowHandoff.openQuestions, renderingProfile),
      `<recommended_next_step>${formatWorkflowHandoffText(workflowHandoff.recommendedNextStep, renderingProfile)}</recommended_next_step>`,
    ];
  }
  if (workflowHandoff.handoffKind === "plan") {
    return [
      `<agreed_goal>${formatWorkflowHandoffText(workflowHandoff.agreedGoal, renderingProfile)}</agreed_goal>`,
      `<current_state_summary>${formatWorkflowHandoffText(workflowHandoff.currentStateSummary, renderingProfile)}</current_state_summary>`,
      `<chosen_approach>${formatWorkflowHandoffText(workflowHandoff.chosenApproach, renderingProfile)}</chosen_approach>`,
      `<ready_for_implementation>${workflowHandoff.isReadyForImplementation}</ready_for_implementation>`,
      ...formatFileOperationLines(workflowHandoff.targetFiles, renderingProfile),
      ...formatTextListLines("implementation_steps", workflowHandoff.implementationSteps, renderingProfile),
      ...formatVerificationCommandLines(workflowHandoff.verificationCommands, renderingProfile),
      ...formatTextListLines("risks", workflowHandoff.risks, renderingProfile),
      ...formatTextListLines("required_pre_apply_reads", workflowHandoff.requiredPreApplyReads, renderingProfile),
    ];
  }

  return [
    `<implemented_outcome>${formatWorkflowHandoffText(workflowHandoff.implementedOutcome, renderingProfile)}</implemented_outcome>`,
    ...formatFileChangeLines(workflowHandoff.changedFiles, renderingProfile),
    ...formatVerificationResultLines(workflowHandoff.verificationResults, renderingProfile),
    ...formatTextListLines("remaining_issues", workflowHandoff.remainingIssues, renderingProfile),
    `<recommended_next_step>${formatWorkflowHandoffText(workflowHandoff.recommendedNextStep, renderingProfile)}</recommended_next_step>`,
  ];
}

function formatTextListLines(
  listName: string,
  listItems: readonly string[],
  renderingProfile: AssistantWorkflowHandoffPromptRenderingProfile,
): string[] {
  if (listItems.length === 0) {
    return [`<${listName}></${listName}>`];
  }

  const visibleListItems = limitWorkflowHandoffListItems(listItems, renderingProfile);

  return [
    `<${listName}>`,
    ...visibleListItems.map((listItem) => `  <item>${formatWorkflowHandoffText(listItem, renderingProfile)}</item>`),
    `</${listName}>`,
  ];
}

function formatFileOperationLines(
  fileOperations: readonly PlanWorkflowHandoff["targetFiles"][number][],
  renderingProfile: AssistantWorkflowHandoffPromptRenderingProfile,
): string[] {
  if (fileOperations.length === 0) {
    return ["<target_files></target_files>"];
  }

  const visibleFileOperations = limitWorkflowHandoffListItems(fileOperations, renderingProfile);

  return [
    "<target_files>",
    ...visibleFileOperations.map((fileOperation) =>
      `  <file operation="${fileOperation.operationKind}" path="${escapeModelFacingXmlAttributeValue(fileOperation.filePath)}">${formatWorkflowHandoffText(fileOperation.reason, renderingProfile)}</file>`
    ),
    "</target_files>",
  ];
}

function formatVerificationCommandLines(
  verificationCommands: readonly PlanWorkflowHandoff["verificationCommands"][number][],
  renderingProfile: AssistantWorkflowHandoffPromptRenderingProfile,
): string[] {
  if (verificationCommands.length === 0) {
    return ["<verification_commands></verification_commands>"];
  }

  const visibleVerificationCommands = limitWorkflowHandoffListItems(verificationCommands, renderingProfile);

  return [
    "<verification_commands>",
    ...visibleVerificationCommands.map((verificationCommand) =>
      `  <command reason="${escapeModelFacingXmlAttributeValue(formatWorkflowHandoffRawText(verificationCommand.reason, renderingProfile))}">${formatWorkflowHandoffText(verificationCommand.command, renderingProfile)}</command>`
    ),
    "</verification_commands>",
  ];
}

function formatFileChangeLines(
  fileChanges: readonly ImplementationWorkflowHandoff["changedFiles"][number][],
  renderingProfile: AssistantWorkflowHandoffPromptRenderingProfile,
): string[] {
  if (fileChanges.length === 0) {
    return ["<changed_files></changed_files>"];
  }

  const visibleFileChanges = limitWorkflowHandoffListItems(fileChanges, renderingProfile);

  return [
    "<changed_files>",
    ...visibleFileChanges.map((fileChange) =>
      `  <file path="${escapeModelFacingXmlAttributeValue(fileChange.filePath)}">${formatWorkflowHandoffText(fileChange.changeSummary, renderingProfile)}</file>`
    ),
    "</changed_files>",
  ];
}

function formatVerificationResultLines(
  verificationResults: readonly ImplementationWorkflowHandoff["verificationResults"][number][],
  renderingProfile: AssistantWorkflowHandoffPromptRenderingProfile,
): string[] {
  if (verificationResults.length === 0) {
    return ["<verification_results></verification_results>"];
  }

  const visibleVerificationResults = limitWorkflowHandoffListItems(verificationResults, renderingProfile);

  return [
    "<verification_results>",
    ...visibleVerificationResults.map((verificationResult) =>
      `  <result outcome="${verificationResult.outcomeKind}" command="${escapeModelFacingXmlAttributeValue(formatWorkflowHandoffRawText(verificationResult.command, renderingProfile))}">${formatWorkflowHandoffText(verificationResult.summary, renderingProfile)}</result>`
    ),
    "</verification_results>",
  ];
}

function limitWorkflowHandoffListItems<ListItem>(
  listItems: readonly ListItem[],
  renderingProfile: AssistantWorkflowHandoffPromptRenderingProfile,
): readonly ListItem[] {
  if (renderingProfile.renderingDetail !== "compact" || renderingProfile.maximumListItemCount === undefined) {
    return listItems;
  }

  return listItems.slice(0, Math.max(0, renderingProfile.maximumListItemCount));
}

function formatWorkflowHandoffText(
  text: string,
  renderingProfile: AssistantWorkflowHandoffPromptRenderingProfile,
): string {
  return escapeModelFacingXmlText(formatWorkflowHandoffRawText(text, renderingProfile));
}

function formatWorkflowHandoffRawText(
  text: string,
  renderingProfile: AssistantWorkflowHandoffPromptRenderingProfile,
): string {
  if (renderingProfile.renderingDetail !== "compact" || renderingProfile.maximumTextCharacterCount === undefined) {
    return text;
  }

  return truncateOneLine(text, renderingProfile.maximumTextCharacterCount);
}

function truncateOneLine(text: string, maximumLength: number): string {
  const oneLineText = text.trim().replace(/\s+/g, " ");
  if (oneLineText.length <= maximumLength) {
    return oneLineText;
  }

  return `${oneLineText.slice(0, Math.max(0, maximumLength - 1))}…`;
}
