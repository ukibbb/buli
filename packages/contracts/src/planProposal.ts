// A plan proposal is the assistant asking the user to approve an ordered list
// of intended steps before execution. Statuses let the UI reflect live
// progress once a plan moves from proposal to execution.
import { z } from "zod";

export const PlanStepStatusSchema = z.enum(["pending", "in_progress", "completed"]);
export type PlanStepStatus = z.infer<typeof PlanStepStatusSchema>;

export const PlanStepSchema = z
  .object({
    stepIndex: z.number().int().nonnegative(),
    stepTitle: z.string().min(1),
    stepDetail: z.string().optional(),
    stepStatus: PlanStepStatusSchema,
  })
  .strict();
export type PlanStep = z.infer<typeof PlanStepSchema>;
