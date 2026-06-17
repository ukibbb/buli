/// <reference path="./markdown.d.ts" />
import type { ToolCallSkillSourceKind } from "@buli/contracts";
import codebaseOrientationInstructionText from "./builtInSkillInstructions/codebase-orientation.md" with { type: "text" };
import learnCodebaseInstructionText from "./builtInSkillInstructions/learn-codebase.md" with { type: "text" };
import rootCauseDebuggingInstructionText from "./builtInSkillInstructions/root-cause-debugging.md" with { type: "text" };
import testDrivenChangeInstructionText from "./builtInSkillInstructions/test-driven-change.md" with { type: "text" };
import architectureReviewInstructionText from "./builtInSkillInstructions/architecture-review.md" with { type: "text" };

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
    instructionText: codebaseOrientationInstructionText,
  },
  {
    name: "learn-codebase",
    description: "Use when Lukasz wants to learn, study, resume, or continue learning a source project or codebase over time, or when Lukasz explicitly asks to improve or tune the learn-codebase workflow/skill, using source-evidenced explanations, learning docs, source maps, roadmaps, feature deep dives, and progress tracking.",
    sourceKind: "built_in",
    instructionText: learnCodebaseInstructionText,
  },
  {
    name: "root-cause-debugging",
    description: "Use when investigating a bug, failing test, flaky behavior, regression, or surprising runtime output.",
    sourceKind: "built_in",
    instructionText: rootCauseDebuggingInstructionText,
  },
  {
    name: "test-driven-change",
    description: "Use when implementing behavior where a focused failing test can clarify the contract before code changes.",
    sourceKind: "built_in",
    instructionText: testDrivenChangeInstructionText,
  },
  {
    name: "architecture-review",
    description: "Use when reviewing design, boundaries, coupling, ownership, extensibility, or long-term maintainability tradeoffs.",
    sourceKind: "built_in",
    instructionText: architectureReviewInstructionText,
  },
] as const satisfies readonly BuiltInSkillDefinition[];
