import { expect, test } from "bun:test";
import { RuntimePendingToolApprovalController } from "../src/runtimePendingToolApprovalController.ts";

const bashToolCallRequest = {
  toolName: "bash" as const,
  shellCommand: "pwd",
  commandDescription: "Print working directory",
};

test("RuntimePendingToolApprovalController resolves approved decisions", async () => {
  const pendingToolApprovalController = new RuntimePendingToolApprovalController({
    createApprovalId: () => "approval-1",
  });

  const pendingToolApproval = pendingToolApprovalController.createPendingToolApproval({
    toolCallId: "call-1",
    toolCallRequest: bashToolCallRequest,
  });

  expect(pendingToolApproval.approvalId).toBe("approval-1");
  expect(pendingToolApprovalController.hasPendingToolApproval()).toBe(true);
  await pendingToolApprovalController.approvePendingToolCall("approval-1");
  await expect(pendingToolApproval.approvalDecisionPromise).resolves.toBe("approved");
  expect(pendingToolApprovalController.hasPendingToolApproval()).toBe(false);
});

test("RuntimePendingToolApprovalController resolves denied decisions", async () => {
  const pendingToolApprovalController = new RuntimePendingToolApprovalController({
    createApprovalId: () => "approval-2",
  });

  const pendingToolApproval = pendingToolApprovalController.createPendingToolApproval({
    toolCallId: "call-2",
    toolCallRequest: bashToolCallRequest,
  });

  await pendingToolApprovalController.denyPendingToolCall("approval-2");

  await expect(pendingToolApproval.approvalDecisionPromise).resolves.toBe("denied");
  expect(pendingToolApprovalController.hasPendingToolApproval()).toBe(false);
});

test("RuntimePendingToolApprovalController rejects mismatched approval ids", async () => {
  const pendingToolApprovalController = new RuntimePendingToolApprovalController({
    createApprovalId: () => "approval-3",
  });
  pendingToolApprovalController.createPendingToolApproval({
    toolCallId: "call-3",
    toolCallRequest: bashToolCallRequest,
  });

  await expect(pendingToolApprovalController.approvePendingToolCall("other-approval")).rejects.toThrow(
    "No pending tool approval matches approvalId=other-approval",
  );
});

test("RuntimePendingToolApprovalController resolves interrupted approvals and clears state", async () => {
  const pendingToolApprovalController = new RuntimePendingToolApprovalController({
    createApprovalId: () => "approval-4",
  });
  const pendingToolApproval = pendingToolApprovalController.createPendingToolApproval({
    toolCallId: "call-4",
    toolCallRequest: bashToolCallRequest,
  });

  pendingToolApprovalController.resolveCurrentPendingToolApprovalAsInterrupted();
  pendingToolApprovalController.clearPendingToolApproval();

  await expect(pendingToolApproval.approvalDecisionPromise).resolves.toBe("interrupted");
  expect(pendingToolApprovalController.hasPendingToolApproval()).toBe(false);
});
