import { expect, test } from "bun:test";
import { buildBuliSystemPrompt } from "../src/systemPrompt.ts";

test("describes buli as Lukasz Bulinski's software engineering assistant", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("You are buli, Lukasz Bulinski's local software engineering assistant");
  expect(systemPromptText).toContain("Current workspace root: /workspace/demo");
});

test("requires alignment before implementation even for simple tasks", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("Discuss the solution and align with the user on the intended outcome before implementation.");
  expect(systemPromptText).toContain(
    "Even for simple tasks, confirm what should be achieved before changing files or running implementation-oriented tools.",
  );
});

test("requires a file-by-file plan before non-trivial implementation", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain(
    "For non-trivial work, produce a detailed file-by-file implementation plan that resolves important doubts before editing files.",
  );
});

test("requires simple explanations and strong challenge of risks", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("Explain complex technical topics simply and clearly first.");
  expect(systemPromptText).toContain("Challenge weak assumptions.");
  expect(systemPromptText).toContain("Point out risks, dangers, and second-order effects clearly.");
});

test("documents truthful execution and bash approval", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("Do not claim actions you did not take.");
  expect(systemPromptText).toContain("Do not imply capabilities that are not available.");
  expect(systemPromptText).toContain("The bash tool requires explicit user approval before execution.");
});
