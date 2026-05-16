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
    "For any non-trivial workspace or codebase question, start with code research before teaching, recommending, or planning.",
  );
  expect(systemPromptText).toContain(
    "Use glob and grep to find relevant files, symbols, tests, contracts, configs, and call sites.",
  );
  expect(systemPromptText).toContain("Use read to inspect the files that define the behavior.");
  expect(systemPromptText).toContain(
    "Use explore when the relevant area is broad, unfamiliar, or connected across multiple files.",
  );
  expect(systemPromptText).toContain("Do not answer from memory or assumptions when the workspace can be inspected.");
  expect(systemPromptText).toContain(
    "After research, explain the system in simple language: what happens, where it happens, why it matters, and what choices exist.",
  );
  expect(systemPromptText).toContain(
    "Name the important files inspected and say what remains uncertain when that affects the answer.",
  );
  expect(systemPromptText).toContain(
    "For non-trivial work, produce a detailed file-by-file apply plan before editing files.",
  );
});

test("requires context completeness before workspace conclusions", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("Context completeness:");
  expect(systemPromptText).toContain(
    "Before answering, explaining, planning, or editing a non-trivial workspace question",
  );
  expect(systemPromptText).toContain("directly relevant files and likely tests, contracts, configs, and call sites");
  expect(systemPromptText).toContain(
    "If context is still incomplete, either keep researching or state exactly what was not inspected",
  );
  expect(systemPromptText).toContain("Do not present guesses as findings.");
});

test("includes project instructions below buli's learning-first behavior", () => {
  const systemPromptText = buildBuliSystemPrompt({
    workspaceRootPath: "/workspace/demo",
    projectInstructionSnapshots: [
      {
        fileName: "AGENTS.md",
        displayPath: "AGENTS.md",
        instructionText: "- Prefer integration tests.",
        contentHash: "abc123",
      },
    ],
  });

  expect(systemPromptText).toContain("Project instructions:");
  expect(systemPromptText).toContain("keeping Buli's learning-first agreement-before-apply behavior higher priority");
  expect(systemPromptText).toContain("Instructions from: AGENTS.md");
  expect(systemPromptText).toContain("- Prefer integration tests.");
});

test("prefers typed workspace tools over bash for normal inspection", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("Use typed workspace tools for normal code inspection");
  expect(systemPromptText).toContain("use read for known files and directories");
  expect(systemPromptText).toContain("use glob for finding files by path pattern");
  expect(systemPromptText).toContain("use grep for searching file contents");
  expect(systemPromptText).toContain("use explore for broad, multi-step codebase discovery");
  expect(systemPromptText).toContain(
    "When multiple read, glob, grep, or explore calls are independent, request them together in one tool-call batch so they can run concurrently.",
  );
  expect(systemPromptText).toContain(
    "For broad independent research areas, launch multiple explore calls in the same tool-call batch instead of waiting for one Explorer to finish before starting another.",
  );
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

test("understand mode is read-only and explains before planning", () => {
  const systemPromptText = buildBuliSystemPrompt({
    workspaceRootPath: "/workspace/demo",
    assistantOperatingMode: "understand",
  });

  expect(systemPromptText).toContain("Understand Mode - System Reminder");
  expect(systemPromptText).toContain("Understand mode ACTIVE - you are in READ-ONLY phase");
  expect(systemPromptText).toContain("You may ONLY observe, research, explain, compare options, and clarify understanding.");
  expect(systemPromptText).toContain("help Lukasz understand the system before planning or applying code");
  expect(systemPromptText).toContain("Do not rush to a plan.");
});

test("plan mode points inspection toward typed read and search tools", () => {
  const systemPromptText = buildBuliSystemPrompt({
    workspaceRootPath: "/workspace/demo",
    assistantOperatingMode: "plan",
  });

  expect(systemPromptText).toContain("ANY file edits, modifications, or system changes. Do NOT use sed, tee, echo, cat,");
  expect(systemPromptText).toContain(
    "or ANY other bash command to manipulate files - commands may ONLY read/inspect.",
  );
  expect(systemPromptText).toContain("delegate explore agents to construct a well-formed plan");
  expect(systemPromptText).toContain("Before proposing a plan, gather enough code context to make the plan concrete.");
  expect(systemPromptText).toContain("A good plan should include the goal, key findings from inspected code");
  expect(systemPromptText).toContain("end the plan with proposed code diffs as Markdown diff blocks");
  expect(systemPromptText).toContain("These diffs are proposals only.");
  expect(systemPromptText).toContain("Only Implementation mode may write to files.");
  expect(systemPromptText).toContain("The goal is to present a well researched plan to the user");
});

test("implementation mode reminds the assistant to apply the agreed direction", () => {
  const systemPromptText = buildBuliSystemPrompt({
    workspaceRootPath: "/workspace/demo",
    assistantOperatingMode: "implementation",
  });

  expect(systemPromptText).toContain("Implementation Mode - System Reminder");
  expect(systemPromptText).toContain("Implementation mode ACTIVE - you may apply the agreed direction.");
  expect(systemPromptText).toContain("Keep the work in the smallest correct slice");
  expect(systemPromptText).toContain("inspect affected files, tests, contracts, configs, and important call sites");
  expect(systemPromptText).toContain("verify important behavior");
});

test("requires simple explanations and strong challenge of risks", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("Explain complex technical topics simply and clearly first.");
  expect(systemPromptText).toContain("Challenge weak assumptions.");
  expect(systemPromptText).toContain("Point out risks, dangers, and second-order effects clearly.");
  expect(systemPromptText).toContain("Be concise: remove filler, repeated caveats, and long setup.");
  expect(systemPromptText).toContain(
    "Explain like the user is smart but tired: simple words, concrete examples, no unnecessary jargon.",
  );
  expect(systemPromptText).toContain(
    "For complex topics, start with the plain version first, then add detail only where it helps the decision.",
  );
  expect(systemPromptText).toContain("Keep full technical accuracy; short does not mean vague.");
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
  expect(systemPromptText).toContain(
    "For any non-trivial workspace or codebase question, start with code research before teaching, recommending, or planning.",
  );
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
  const implementationPromptText = buildBuliSystemPrompt({
    workspaceRootPath: "/workspace/demo",
    assistantOperatingMode: "implementation",
  });
  const planPromptText = buildBuliSystemPrompt({
    workspaceRootPath: "/workspace/demo",
    assistantOperatingMode: "plan",
  });
  const understandPromptText = buildBuliSystemPrompt({
    workspaceRootPath: "/workspace/demo",
    assistantOperatingMode: "understand",
  });

  expect(implementationPromptText).toContain(
    "Treat understand, plan, and implementation modes as workflow posture, not as the whole learning style.",
  );
  expect(implementationPromptText).toContain(
    "The same learning style can happen in any posture: understand-mode codebase exploration, plan-mode plan refinement, implementation-mode explanation while applying an agreed change, architecture brainstorming, or review.",
  );
  expect(planPromptText).toContain(
    "Treat understand, plan, and implementation modes as workflow posture, not as the whole learning style.",
  );
  expect(understandPromptText).toContain(
    "Treat understand, plan, and implementation modes as workflow posture, not as the whole learning style.",
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
  expect(systemPromptText).toContain("Map relevant structure, responsibilities, data flow, constraints, and tradeoffs");
  expect(systemPromptText).toContain("Double-check likely related tests, contracts, configs, and call sites");
  expect(systemPromptText).toContain("Use only read, glob, and grep.");
  expect(systemPromptText).toContain(
    "When multiple read, glob, or grep calls are independent, request them together in one tool-call batch so they can run concurrently.",
  );
  expect(systemPromptText).toContain("Do not modify files, run shell commands");
  expect(systemPromptText).toContain("Return a concise report for the parent assistant.");
  expect(systemPromptText).toContain(
    "State which important files were inspected and what relevant context remains uninspected or uncertain.",
  );
});
