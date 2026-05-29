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
}): string {
  return formatAssistantWorkflowHandoffContextPromptBlock(
    buildAssistantWorkflowHandoffContext(input),
  );
}

export function formatAssistantWorkflowHandoffContextPromptBlock(
  workflowHandoffContext: AssistantWorkflowHandoffContext,
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
    ...formatWorkflowHandoffSectionLines("latest_understanding_handoff", workflowHandoffContext.latestUnderstandingWorkflowHandoff),
    ...formatWorkflowHandoffSectionLines("latest_plan_handoff", workflowHandoffContext.latestPlanWorkflowHandoff),
    ...formatWorkflowHandoffSectionLines("latest_implementation_handoff", workflowHandoffContext.latestImplementationWorkflowHandoff),
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

function formatWorkflowHandoffSectionLines(sectionName: string, workflowHandoff: WorkflowHandoff | undefined): string[] {
  if (!workflowHandoff) {
    return [`  <${sectionName}>missing</${sectionName}>`];
  }

  return [
    `  <${sectionName} kind="${workflowHandoff.handoffKind}">`,
    ...formatWorkflowHandoffSummaryLines(workflowHandoff).map((summaryLine) => `    ${summaryLine}`),
    `  </${sectionName}>`,
  ];
}

function formatWorkflowHandoffSummaryLines(workflowHandoff: WorkflowHandoff): string[] {
  if (workflowHandoff.handoffKind === "understanding") {
    return [
      `<user_goal>${escapeModelFacingXmlText(workflowHandoff.userGoal)}</user_goal>`,
      `<current_understanding>${escapeModelFacingXmlText(workflowHandoff.currentUnderstanding)}</current_understanding>`,
      ...formatTextListLines("important_findings", workflowHandoff.importantFindings),
      ...formatTextListLines("constraints", workflowHandoff.constraints),
      ...formatTextListLines("open_questions", workflowHandoff.openQuestions),
      `<recommended_next_step>${escapeModelFacingXmlText(workflowHandoff.recommendedNextStep)}</recommended_next_step>`,
    ];
  }
  if (workflowHandoff.handoffKind === "plan") {
    return [
      `<agreed_goal>${escapeModelFacingXmlText(workflowHandoff.agreedGoal)}</agreed_goal>`,
      `<current_state_summary>${escapeModelFacingXmlText(workflowHandoff.currentStateSummary)}</current_state_summary>`,
      `<chosen_approach>${escapeModelFacingXmlText(workflowHandoff.chosenApproach)}</chosen_approach>`,
      `<ready_for_implementation>${workflowHandoff.isReadyForImplementation}</ready_for_implementation>`,
      ...formatFileOperationLines(workflowHandoff.targetFiles),
      ...formatTextListLines("implementation_steps", workflowHandoff.implementationSteps),
      ...formatVerificationCommandLines(workflowHandoff.verificationCommands),
      ...formatTextListLines("risks", workflowHandoff.risks),
      ...formatTextListLines("required_pre_apply_reads", workflowHandoff.requiredPreApplyReads),
    ];
  }

  return [
    `<implemented_outcome>${escapeModelFacingXmlText(workflowHandoff.implementedOutcome)}</implemented_outcome>`,
    ...formatFileChangeLines(workflowHandoff.changedFiles),
    ...formatVerificationResultLines(workflowHandoff.verificationResults),
    ...formatTextListLines("remaining_issues", workflowHandoff.remainingIssues),
    `<recommended_next_step>${escapeModelFacingXmlText(workflowHandoff.recommendedNextStep)}</recommended_next_step>`,
  ];
}

function formatTextListLines(listName: string, listItems: readonly string[]): string[] {
  if (listItems.length === 0) {
    return [`<${listName}></${listName}>`];
  }

  return [
    `<${listName}>`,
    ...listItems.map((listItem) => `  <item>${escapeModelFacingXmlText(listItem)}</item>`),
    `</${listName}>`,
  ];
}

function formatFileOperationLines(fileOperations: readonly PlanWorkflowHandoff["targetFiles"][number][]): string[] {
  if (fileOperations.length === 0) {
    return ["<target_files></target_files>"];
  }

  return [
    "<target_files>",
    ...fileOperations.map((fileOperation) =>
      `  <file operation="${fileOperation.operationKind}" path="${escapeModelFacingXmlAttributeValue(fileOperation.filePath)}">${escapeModelFacingXmlText(fileOperation.reason)}</file>`
    ),
    "</target_files>",
  ];
}

function formatVerificationCommandLines(verificationCommands: readonly PlanWorkflowHandoff["verificationCommands"][number][]): string[] {
  if (verificationCommands.length === 0) {
    return ["<verification_commands></verification_commands>"];
  }

  return [
    "<verification_commands>",
    ...verificationCommands.map((verificationCommand) =>
      `  <command reason="${escapeModelFacingXmlAttributeValue(verificationCommand.reason)}">${escapeModelFacingXmlText(verificationCommand.command)}</command>`
    ),
    "</verification_commands>",
  ];
}

function formatFileChangeLines(fileChanges: readonly ImplementationWorkflowHandoff["changedFiles"][number][]): string[] {
  if (fileChanges.length === 0) {
    return ["<changed_files></changed_files>"];
  }

  return [
    "<changed_files>",
    ...fileChanges.map((fileChange) =>
      `  <file path="${escapeModelFacingXmlAttributeValue(fileChange.filePath)}">${escapeModelFacingXmlText(fileChange.changeSummary)}</file>`
    ),
    "</changed_files>",
  ];
}

function formatVerificationResultLines(verificationResults: readonly ImplementationWorkflowHandoff["verificationResults"][number][]): string[] {
  if (verificationResults.length === 0) {
    return ["<verification_results></verification_results>"];
  }

  return [
    "<verification_results>",
    ...verificationResults.map((verificationResult) =>
      `  <result outcome="${verificationResult.outcomeKind}" command="${escapeModelFacingXmlAttributeValue(verificationResult.command)}">${escapeModelFacingXmlText(verificationResult.summary)}</result>`
    ),
    "</verification_results>",
  ];
}
