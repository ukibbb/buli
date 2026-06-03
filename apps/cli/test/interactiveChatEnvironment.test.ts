import { expect, test } from "bun:test";
import {
  resolveInteractiveChatBashToolApprovalMode,
  resolveInteractiveChatTaskSubagentProviderModelSelectionPolicy,
} from "../src/interactiveChat/interactiveChatEnvironment.ts";

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

test("interactive chat leaves task subagent provider model selection unconfigured by default", () => {
  const resolvedPolicy = resolveInteractiveChatTaskSubagentProviderModelSelectionPolicy({
    environment: {},
  });

  expect(resolvedPolicy).toEqual({ status: "resolved" });
});

test("interactive chat resolves task subagent model and reasoning effort environment overrides", () => {
  const resolvedPolicy = resolveInteractiveChatTaskSubagentProviderModelSelectionPolicy({
    environment: {
      BULI_TASK_SUBAGENT_MODEL: " gpt-5.4-mini ",
      BULI_TASK_SUBAGENT_MAX_REASONING_EFFORT: "low",
    },
  });

  expect(resolvedPolicy).toEqual({
    status: "resolved",
    policy: {
      selectedModelIdOverride: "gpt-5.4-mini",
      maximumReasoningEffort: "low",
    },
  });
});

test("interactive chat rejects invalid task subagent reasoning effort environment overrides", () => {
  const resolvedPolicy = resolveInteractiveChatTaskSubagentProviderModelSelectionPolicy({
    environment: { BULI_TASK_SUBAGENT_MAX_REASONING_EFFORT: "too-much" },
  });

  expect(resolvedPolicy).toEqual({ status: "invalid" });
});
