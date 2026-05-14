import type { ToolCallRequest } from "@buli/contracts";

export type RuntimeToolApprovalDecision = "approved" | "denied" | "interrupted";

export type RuntimePendingToolApproval = {
  approvalId: string;
  approvalDecisionPromise: Promise<RuntimeToolApprovalDecision>;
};

export type RuntimePendingToolApprovalInput = {
  toolCallId: string;
  toolCallRequest: ToolCallRequest;
};
