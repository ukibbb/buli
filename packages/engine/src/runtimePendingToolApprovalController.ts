import { randomUUID } from "node:crypto";
import type { BuliDiagnosticLogger } from "@buli/contracts";
import { logEngineDiagnosticEvent } from "./runtimeDiagnostics.ts";
import type {
  RuntimePendingToolApproval,
  RuntimePendingToolApprovalInput,
  RuntimeToolApprovalDecision,
} from "./runtimeToolCallExecution.ts";

type PendingToolApprovalState = {
  approvalId: string;
  toolCallId: string;
  resolveDecision: (decision: RuntimeToolApprovalDecision) => void;
};

export class RuntimePendingToolApprovalController {
  private readonly diagnosticLogger: BuliDiagnosticLogger | undefined;
  private readonly createApprovalId: () => string;
  private currentPendingToolApprovalState: PendingToolApprovalState | undefined;

  constructor(input: {
    diagnosticLogger?: BuliDiagnosticLogger | undefined;
    createApprovalId?: (() => string) | undefined;
  } = {}) {
    this.diagnosticLogger = input.diagnosticLogger;
    this.createApprovalId = input.createApprovalId ?? randomUUID;
  }

  hasPendingToolApproval(): boolean {
    return this.currentPendingToolApprovalState !== undefined;
  }

  async approvePendingToolCall(approvalId: string): Promise<void> {
    this.resolvePendingToolApprovalDecision({ approvalId, decision: "approved" });
  }

  async denyPendingToolCall(approvalId: string): Promise<void> {
    this.resolvePendingToolApprovalDecision({ approvalId, decision: "denied" });
  }

  createPendingToolApproval(input: RuntimePendingToolApprovalInput): RuntimePendingToolApproval {
    const approvalId = this.createApprovalId();
    logEngineDiagnosticEvent(this.diagnosticLogger, "tool_approval.request_created", {
      approvalId,
      toolCallId: input.toolCallId,
      toolName: input.toolCallRequest.toolName,
    });
    const approvalDecisionPromise = new Promise<RuntimeToolApprovalDecision>((resolveDecision) => {
      this.currentPendingToolApprovalState = {
        approvalId,
        toolCallId: input.toolCallId,
        resolveDecision,
      };
    });
    return { approvalId, approvalDecisionPromise };
  }

  resolveCurrentPendingToolApprovalAsInterrupted(): void {
    this.currentPendingToolApprovalState?.resolveDecision("interrupted");
    this.currentPendingToolApprovalState = undefined;
  }

  clearPendingToolApproval(): void {
    this.currentPendingToolApprovalState = undefined;
  }

  private resolvePendingToolApprovalDecision(input: {
    approvalId: string;
    decision: Exclude<RuntimeToolApprovalDecision, "interrupted">;
  }): void {
    if (!this.currentPendingToolApprovalState || this.currentPendingToolApprovalState.approvalId !== input.approvalId) {
      throw new Error(`No pending tool approval matches approvalId=${input.approvalId}`);
    }

    logEngineDiagnosticEvent(this.diagnosticLogger, "tool_approval.decision_received", {
      approvalId: input.approvalId,
      toolCallId: this.currentPendingToolApprovalState.toolCallId,
      decision: input.decision,
    });
    this.currentPendingToolApprovalState.resolveDecision(input.decision);
    this.currentPendingToolApprovalState = undefined;
  }
}
