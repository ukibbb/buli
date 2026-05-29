import { z } from "zod";

export const MAX_WORKFLOW_HANDOFF_TEXT_LENGTH = 4_000;
export const MAX_WORKFLOW_HANDOFF_LIST_ITEM_COUNT = 50;
export const MAX_WORKFLOW_HANDOFF_FILE_COUNT = 100;
export const MAX_WORKFLOW_HANDOFF_VERIFICATION_COMMAND_COUNT = 20;

const WorkflowHandoffTextSchema = z.string().min(1).max(MAX_WORKFLOW_HANDOFF_TEXT_LENGTH);
const WorkflowHandoffTextListSchema = z.array(WorkflowHandoffTextSchema).max(MAX_WORKFLOW_HANDOFF_LIST_ITEM_COUNT);

export const WorkflowHandoffKindSchema = z.enum(["understanding", "plan", "implementation"]);

export const WorkflowHandoffEvidenceReferenceSchema = z
  .object({
    evidenceKind: z.enum(["source_code", "test", "documentation", "runtime_output", "tool_result", "user_decision"]),
    referenceText: WorkflowHandoffTextSchema,
    summary: WorkflowHandoffTextSchema,
  })
  .strict();

export const WorkflowHandoffFileOperationSchema = z
  .object({
    filePath: WorkflowHandoffTextSchema,
    operationKind: z.enum(["add", "update", "delete", "rename", "inspect"]),
    reason: WorkflowHandoffTextSchema,
  })
  .strict();

export const WorkflowHandoffVerificationCommandSchema = z
  .object({
    command: WorkflowHandoffTextSchema,
    reason: WorkflowHandoffTextSchema,
  })
  .strict();

export const WorkflowHandoffFileChangeSchema = z
  .object({
    filePath: WorkflowHandoffTextSchema,
    changeSummary: WorkflowHandoffTextSchema,
  })
  .strict();

export const WorkflowHandoffVerificationResultSchema = z
  .object({
    command: WorkflowHandoffTextSchema,
    outcomeKind: z.enum(["passed", "failed", "not_run"]),
    summary: WorkflowHandoffTextSchema,
  })
  .strict();

export const UnderstandingWorkflowHandoffSchema = z
  .object({
    handoffKind: z.literal("understanding"),
    userGoal: WorkflowHandoffTextSchema,
    currentUnderstanding: WorkflowHandoffTextSchema,
    importantFindings: WorkflowHandoffTextListSchema,
    evidenceReferences: z.array(WorkflowHandoffEvidenceReferenceSchema).max(MAX_WORKFLOW_HANDOFF_LIST_ITEM_COUNT),
    constraints: WorkflowHandoffTextListSchema,
    openQuestions: WorkflowHandoffTextListSchema,
    recommendedNextStep: WorkflowHandoffTextSchema,
  })
  .strict();

export const PlanWorkflowHandoffSchema = z
  .object({
    handoffKind: z.literal("plan"),
    agreedGoal: WorkflowHandoffTextSchema,
    currentStateSummary: WorkflowHandoffTextSchema,
    chosenApproach: WorkflowHandoffTextSchema,
    targetFiles: z.array(WorkflowHandoffFileOperationSchema).max(MAX_WORKFLOW_HANDOFF_FILE_COUNT),
    implementationSteps: WorkflowHandoffTextListSchema,
    verificationCommands: z.array(WorkflowHandoffVerificationCommandSchema).max(MAX_WORKFLOW_HANDOFF_VERIFICATION_COMMAND_COUNT),
    risks: WorkflowHandoffTextListSchema,
    isReadyForImplementation: z.boolean(),
    requiredPreApplyReads: WorkflowHandoffTextListSchema,
  })
  .strict();

export const ImplementationWorkflowHandoffSchema = z
  .object({
    handoffKind: z.literal("implementation"),
    implementedOutcome: WorkflowHandoffTextSchema,
    changedFiles: z.array(WorkflowHandoffFileChangeSchema).max(MAX_WORKFLOW_HANDOFF_FILE_COUNT),
    verificationResults: z.array(WorkflowHandoffVerificationResultSchema).max(MAX_WORKFLOW_HANDOFF_VERIFICATION_COMMAND_COUNT),
    remainingIssues: WorkflowHandoffTextListSchema,
    recommendedNextStep: WorkflowHandoffTextSchema,
  })
  .strict();

export const WorkflowHandoffSchema = z.discriminatedUnion("handoffKind", [
  UnderstandingWorkflowHandoffSchema,
  PlanWorkflowHandoffSchema,
  ImplementationWorkflowHandoffSchema,
]);

export type WorkflowHandoffKind = z.infer<typeof WorkflowHandoffKindSchema>;
export type WorkflowHandoffEvidenceReference = z.infer<typeof WorkflowHandoffEvidenceReferenceSchema>;
export type WorkflowHandoffFileOperation = z.infer<typeof WorkflowHandoffFileOperationSchema>;
export type WorkflowHandoffVerificationCommand = z.infer<typeof WorkflowHandoffVerificationCommandSchema>;
export type WorkflowHandoffFileChange = z.infer<typeof WorkflowHandoffFileChangeSchema>;
export type WorkflowHandoffVerificationResult = z.infer<typeof WorkflowHandoffVerificationResultSchema>;
export type UnderstandingWorkflowHandoff = z.infer<typeof UnderstandingWorkflowHandoffSchema>;
export type PlanWorkflowHandoff = z.infer<typeof PlanWorkflowHandoffSchema>;
export type ImplementationWorkflowHandoff = z.infer<typeof ImplementationWorkflowHandoffSchema>;
export type WorkflowHandoff = z.infer<typeof WorkflowHandoffSchema>;

export function summarizeWorkflowHandoff(workflowHandoff: WorkflowHandoff): string {
  if (workflowHandoff.handoffKind === "understanding") {
    return workflowHandoff.userGoal;
  }
  if (workflowHandoff.handoffKind === "plan") {
    return workflowHandoff.agreedGoal;
  }

  return workflowHandoff.implementedOutcome;
}
