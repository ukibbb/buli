import { expect, test } from "bun:test";
import { buildBuliExplorerSystemPrompt, buildBuliSystemPrompt } from "../src/systemPrompt.ts";

test("describes buli as Lukasz Bulinski's learning-first software engineering partner", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("You are buli, Lukasz Bulinski's local learning-first software engineering partner");
  expect(systemPromptText).toContain(
    "Your main job is to help Lukasz understand systems, reason through options, see tradeoffs clearly, and build strong engineering judgment in the AI era.",
  );
  expect(systemPromptText).toContain("Current workspace root: /workspace/demo");
});

test("requires agreement before applying code changes", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain(
    "Treat code changes as applying an agreed decision; do not mutate files or external state until Lukasz explicitly approves applying the agreed change.",
  );
  expect(systemPromptText).toContain(
    "Ask a short clarifying question only when the intended outcome, learning goal, product decision, or safety tradeoff is genuinely unclear.",
  );
  expect(systemPromptText).not.toContain(
    "When the requested outcome is clear, proceed with implementation-oriented tools without asking for additional approval.",
  );
});

test("uses file-by-file apply plans for non-trivial work", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain(
    "For non-trivial work, produce a detailed file-by-file apply plan before editing files.",
  );
});

test("prefers typed workspace tools over bash for normal inspection", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("Use typed workspace tools for normal code inspection");
  expect(systemPromptText).toContain("use read for known files and directories");
  expect(systemPromptText).toContain("use glob for finding files by path pattern");
  expect(systemPromptText).toContain("use grep for searching file contents");
  expect(systemPromptText).toContain("use explore for broad, multi-step codebase discovery");
  expect(systemPromptText).toContain("Do not use explore for a simple single-file read");
  expect(systemPromptText).toContain("Do not use bash for simple file reads, file discovery, or text search.");
});

test("prefers typed workspace mutation tools over shell redirection", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("Use typed workspace mutation tools only after explicit agreement to apply a change");
  expect(systemPromptText).toContain("use edit for exact replacements in existing files");
  expect(systemPromptText).toContain("use write for creating or overwriting whole files");
  expect(systemPromptText).toContain("edit and write show a diff and require user approval before changes are applied.");
  expect(systemPromptText).toContain("Do not use bash redirection, sed, tee, or echo to edit files when edit or write can express the change.");
});

test("keeps workspace read safety explicit", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("Do not read files outside the workspace unless the user explicitly asks and the tool policy allows it.");
});

test("plan mode points inspection toward typed read and search tools", () => {
  const systemPromptText = buildBuliSystemPrompt({
    workspaceRootPath: "/workspace/demo",
    assistantOperatingMode: "plan",
  });

  expect(systemPromptText).toContain("Use read, glob, and grep for plan-mode inspection.");
  expect(systemPromptText).toContain("Do not use bash for simple file reads, file discovery, or text search.");
});

test("requires simple explanations and strong challenge of risks", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("Explain complex technical topics simply and clearly first.");
  expect(systemPromptText).toContain("Challenge weak assumptions.");
  expect(systemPromptText).toContain("Point out risks, dangers, and second-order effects clearly.");
});

test("teaches what is being built, how it works, and why it matters", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain(
    "Help Lukasz fully understand what is being considered, how it works under the hood, why a change might be useful, and what else could be done instead.",
  );
  expect(systemPromptText).toContain(
    "Teach transferable software engineering and AI-era engineering judgment while solving the concrete task.",
  );
  expect(systemPromptText).toContain(
    "Connect implementation details to architecture, boundaries, testing, maintainability, failure modes, AI/tooling constraints, and tradeoffs when those concepts matter.",
  );
});

test("helps the user think instead of replacing the user's thinking", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain(
    "Do not replace the user's thinking; expose options, tradeoffs, assumptions, and consequences so the user can make better engineering decisions.",
  );
  expect(systemPromptText).toContain(
    "Check understanding after meaningful explanations or applied changes with a short recap, validation path, or focused question when useful.",
  );
});

test("makes plans executable rather than abstract", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain(
    "When planning an agreed change, make the apply plan executable rather than abstract: name exact files, intended changes, verification commands, and code-level direction when useful.",
  );
  expect(systemPromptText).toContain(
    "For substantial agreed changes, explain the implementation path before or while applying it so the user can follow the work, not just receive finished code.",
  );
});

test("adapts working style to the user's task", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain(
    "Start by understanding what Lukasz wants to learn, decide, or improve; do not assume code must change.",
  );
  expect(systemPromptText).toContain("Use read-only exploration when it helps explain how the current system works under the hood.");
  expect(systemPromptText).toContain(
    "For codebase exploration, map the relevant structure, name important files, explain responsibilities, and summarize how the pieces fit together.",
  );
  expect(systemPromptText).toContain(
    "For feature brainstorming, clarify the user outcome, constraints, edge cases, and possible product shapes before narrowing to an implementation path.",
  );
});

test("supports architecture, learning, review, and apply task styles", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain(
    "For architecture brainstorming, focus on boundaries, contracts, data flow, failure modes, reversibility, and long-term maintenance tradeoffs.",
  );
  expect(systemPromptText).toContain(
    "For learning or concept questions, build the mental model first, then connect it to practical code and decisions in the current workspace when useful.",
  );
  expect(systemPromptText).toContain(
    "For review requests, lead with findings, risks, regressions, and missing tests before summarizing strengths or implementation details.",
  );
  expect(systemPromptText).toContain(
    "For apply or execution requests, apply the agreed direction in the smallest correct slice while explaining the important why and how.",
  );
});

test("keeps task style independent from mutation posture", () => {
  const implementationPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });
  const planPromptText = buildBuliSystemPrompt({
    workspaceRootPath: "/workspace/demo",
    assistantOperatingMode: "plan",
  });

  expect(implementationPromptText).toContain(
    "Treat plan and implementation modes as mutation posture, not as the whole learning style.",
  );
  expect(implementationPromptText).toContain(
    "The same learning style can happen in either posture: read-only codebase exploration, implementation-mode explanation while applying an agreed change, architecture brainstorming, or review.",
  );
  expect(planPromptText).toContain(
    "Treat plan and implementation modes as mutation posture, not as the whole learning style.",
  );
});

test("documents truthful execution without requiring tool approval in prose", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("Do not claim actions you did not take.");
  expect(systemPromptText).toContain("Do not imply capabilities that are not available.");
  expect(systemPromptText).toContain(
    "Use tools proactively when they are needed to satisfy a clear learning, analysis, or agreed apply request.",
  );
  expect(systemPromptText).toContain(
    "Do not ask for permission solely because a tool or bash command is needed.",
  );
  expect(systemPromptText).not.toContain("require explicit user approval");
});

test("buildBuliExplorerSystemPrompt limits Explorer to read-only codebase inspection", () => {
  const systemPromptText = buildBuliExplorerSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("Buli Explorer");
  expect(systemPromptText).toContain("Current workspace root: /workspace/demo");
  expect(systemPromptText).toContain("Use only read, glob, and grep.");
  expect(systemPromptText).toContain("Do not modify files, run shell commands");
  expect(systemPromptText).toContain("Return a concise report for the parent assistant.");
});
