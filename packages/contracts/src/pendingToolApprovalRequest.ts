import { z } from "zod";
import { ToolCallDetailSchema } from "./toolCallDetail.ts";

export const PendingToolApprovalRequestSchema = z
  .object({
    approvalId: z.string().min(1),
    pendingToolCallId: z.string().min(1),
    pendingToolCallDetail: ToolCallDetailSchema,
    riskExplanation: z.string().min(1),
  })
  .strict();

export type PendingToolApprovalRequest = z.infer<typeof PendingToolApprovalRequestSchema>;
