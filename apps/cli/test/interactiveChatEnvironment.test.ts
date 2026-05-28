import { expect, test } from "bun:test";
import { resolveInteractiveChatBashToolApprovalMode } from "../src/interactiveChat/interactiveChatEnvironment.ts";

test("interactive chat uses trusted bash approval by default", () => {
  const resolvedBashToolApprovalMode = resolveInteractiveChatBashToolApprovalMode({
    requestedBashToolApprovalMode: undefined,
    environment: {},
  });

  expect(resolvedBashToolApprovalMode).toBe("trusted");
});

test("interactive chat lets the bash approval environment variable override the default", () => {
  const resolvedBashToolApprovalMode = resolveInteractiveChatBashToolApprovalMode({
    requestedBashToolApprovalMode: undefined,
    environment: { BULI_BASH_APPROVAL_MODE: "risk_based" },
  });

  expect(resolvedBashToolApprovalMode).toBe("risk_based");
});

test("interactive chat lets explicit bash approval input override the environment", () => {
  const resolvedBashToolApprovalMode = resolveInteractiveChatBashToolApprovalMode({
    requestedBashToolApprovalMode: "risk_based",
    environment: { BULI_BASH_APPROVAL_MODE: "trusted" },
  });

  expect(resolvedBashToolApprovalMode).toBe("risk_based");
});
