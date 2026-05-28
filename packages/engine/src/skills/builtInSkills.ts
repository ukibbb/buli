import type { ToolCallSkillSourceKind } from "@buli/contracts";

export type BuiltInSkillDefinition = {
  name: string;
  description: string;
  sourceKind: Extract<ToolCallSkillSourceKind, "built_in">;
  instructionText: string;
};

export const BUILT_IN_SKILLS = [
  {
    name: "codebase-orientation",
    description: "Use when mapping an unfamiliar codebase, package, feature area, or request flow before explaining or changing it.",
    sourceKind: "built_in",
    instructionText: [
      "# Codebase orientation",
      "",
      "Use this skill when Lukasz asks how a system works, where something lives, or how pieces fit together.",
      "",
      "## Workflow",
      "",
      "1. Start with broad file and text discovery before reading implementation details.",
      "2. Identify the entry points, contracts, state owners, side-effect boundaries, tests, and user-visible behavior.",
      "3. Follow only the dependency chain that can change the answer; stop and state the boundary when more reading would be low value.",
      "4. Explain the flow in plain language first, then name the important files and symbols.",
      "5. Separate verified facts from assumptions and remaining uncertainty.",
    ].join("\n"),
  },
  {
    name: "root-cause-debugging",
    description: "Use when investigating a bug, failing test, flaky behavior, regression, or surprising runtime output.",
    sourceKind: "built_in",
    instructionText: [
      "# Root-cause debugging",
      "",
      "Use this skill when the task is to diagnose why something is broken or surprising.",
      "",
      "## Workflow",
      "",
      "1. Reproduce or inspect the exact observed failure before proposing fixes.",
      "2. Trace from symptom to owner: input, state transition, boundary, persistence, rendering, or external effect.",
      "3. Prefer explaining the invariant that was violated over describing only the stack trace.",
      "4. Fix the root cause in the smallest correct slice, not a workaround that masks the symptom.",
      "5. Add or update a behavior test that would fail before the fix and pass after it.",
    ].join("\n"),
  },
  {
    name: "test-driven-change",
    description: "Use when implementing behavior where a focused failing test can clarify the contract before code changes.",
    sourceKind: "built_in",
    instructionText: [
      "# Test-driven change",
      "",
      "Use this skill when adding or changing behavior that can be verified directly.",
      "",
      "## Workflow",
      "",
      "1. State the behavior contract in one sentence before editing implementation code.",
      "2. Add the smallest meaningful failing test at the boundary that owns the behavior.",
      "3. Prefer real integration tests for persistence, ownership, transaction, and runtime flows.",
      "4. Implement only the code needed to satisfy the behavior and keep the public contract typed.",
      "5. Run the targeted test first, then the smallest relevant typecheck/test suite.",
    ].join("\n"),
  },
  {
    name: "architecture-review",
    description: "Use when reviewing design, boundaries, coupling, ownership, extensibility, or long-term maintainability tradeoffs.",
    sourceKind: "built_in",
    instructionText: [
      "# Architecture review",
      "",
      "Use this skill when evaluating a design or planning a change with meaningful structural tradeoffs.",
      "",
      "## Workflow",
      "",
      "1. Identify the decision being made and the criteria that should shape it.",
      "2. Map responsibilities, data flow, state ownership, and side-effect boundaries.",
      "3. Compare viable options by what each makes easier, harder, riskier, and more reversible.",
      "4. Prefer simple concrete boundaries over abstraction layers that exist only for substitution-on-paper.",
      "5. Recommend one path and explain the consequences clearly enough that Lukasz can disagree intentionally.",
    ].join("\n"),
  },
] as const satisfies readonly BuiltInSkillDefinition[];
