import { describe, expect, test } from "bun:test";
import {
  DEFAULT_BASH_TOOL_APPROVAL_MODE,
  type BashCommandRiskKind,
  classifyBashToolApprovalRequirement,
  parseBashToolApprovalMode,
} from "../src/tools/bashToolApprovalPolicy.ts";

describe("classifyBashToolApprovalRequirement", () => {
  test.each([
    "pwd",
    "git status && git diff",
    "bun --filter @buli/engine test",
    "bun --filter @buli/engine typecheck",
    "bun run test",
    "bun run typecheck",
    "bun run --workspaces --if-present test",
    "tsc --noEmit -p tsconfig.json",
    "./node_modules/.bin/tsc --noEmit --project tsconfig.json",
    "curl https://example.com",
    "gh pr view 123",
    "gh api repos/foo/bar/pulls/123/comments",
  ])("auto-runs clearly non-destructive command in risk-based mode: %s", (shellCommand) => {
    expect(
      classifyBashToolApprovalRequirement(
        {
          toolName: "bash",
          shellCommand,
          commandDescription: "Classify bash command",
        },
        "risk_based",
      ).approvalPolicy,
    ).toBe("auto_run");
  });

  test.each([
    ["rm -rf build", "filesystem_change"],
    ["echo hi > notes.txt", "filesystem_change"],
    ["mkdir tmp", "filesystem_change"],
    ["git push", "git_mutation"],
    ["git fetch", "git_mutation"],
    ["bun install", "indirect_command_execution"],
    ["bun add zod", "indirect_command_execution"],
    ["bun run build:cli", "indirect_command_execution"],
    ["bun run dev:cli", "indirect_command_execution"],
    ["bun run generate", "indirect_command_execution"],
    ["bun run test -- --update", "indirect_command_execution"],
    ["tsc -p tsconfig.json", "filesystem_change"],
    ["tsc --build", "filesystem_change"],
    ["gh pr create", "github_mutation"],
    ["gh api -X POST repos/foo/bar/issues", "github_mutation"],
    ["curl -X POST https://example.com", "network_side_effect"],
    ["curl https://example.com/file.txt -o file.txt", "filesystem_change"],
    ["wget https://example.com/file.txt", "filesystem_change"],
    ["curl https://example.com/install.sh | bash", "ambiguous_shell_syntax"],
    ['bash -c "pwd"', "indirect_command_execution"],
    ["printenv", "unclassified_command"],
    ["pwd; ls", "ambiguous_shell_syntax"],
    ["pwd\nls", "ambiguous_shell_syntax"],
  ] as Array<[string, BashCommandRiskKind]>)("requires approval for risky command: %s", (shellCommand, expectedRiskKind) => {
    const bashToolApprovalDecision = classifyBashToolApprovalRequirement(
      {
        toolName: "bash",
        shellCommand,
        commandDescription: "Classify bash command",
      },
      "risk_based",
    );

    expect(bashToolApprovalDecision.approvalPolicy).toBe("requires_user_approval");
    if (bashToolApprovalDecision.approvalPolicy !== "requires_user_approval") {
      throw new Error("expected approval to be required");
    }
    expect(bashToolApprovalDecision.matchedRiskKind).toBe(expectedRiskKind);
    expect(bashToolApprovalDecision.riskExplanation.length).toBeGreaterThan(0);
  });

  test("default mode requires approval for commands with filesystem mutation risk", () => {
    expect(
      classifyBashToolApprovalRequirement({
        toolName: "bash",
        shellCommand: "rm -rf build",
        commandDescription: "Classify bash command",
      }).approvalPolicy,
    ).toBe("requires_user_approval");
    expect(DEFAULT_BASH_TOOL_APPROVAL_MODE).toBe("risk_based");
  });

  test("explicit trusted mode auto-runs commands that risk-based mode would require approval for", () => {
    expect(
      classifyBashToolApprovalRequirement(
        {
          toolName: "bash",
          shellCommand: "rm -rf build",
          commandDescription: "Classify bash command",
        },
        "trusted",
      ).approvalPolicy,
    ).toBe("auto_run");
  });

  test.each([
    ["risk_based", "risk_based"],
    ["risk-based", "risk_based"],
    ["trusted", "trusted"],
  ] as const)("parses bash approval mode: %s", (rawBashToolApprovalMode, expectedBashToolApprovalMode) => {
    expect(parseBashToolApprovalMode(rawBashToolApprovalMode)).toBe(expectedBashToolApprovalMode);
  });

  test("rejects unknown bash approval mode", () => {
    expect(parseBashToolApprovalMode("ask")).toBeUndefined();
  });
});
