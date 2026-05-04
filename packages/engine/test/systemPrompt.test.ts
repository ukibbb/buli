import { expect, test } from "bun:test";
import { buildBuliSystemPrompt } from "../src/systemPrompt.ts";

test("describes buli as Lukasz Bulinski's software engineering assistant", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("You are buli, Lukasz Bulinski's local software engineering assistant");
  expect(systemPromptText).toContain("Current workspace root: /workspace/demo");
});

test("allows implementation tools when the requested outcome is clear", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("Discuss the solution and align with the user on the intended outcome before implementation.");
  expect(systemPromptText).toContain(
    "When the requested outcome is clear, proceed with implementation-oriented tools without asking for additional approval.",
  );
  expect(systemPromptText).toContain(
    "Ask a short clarifying question only when the intended outcome, product decision, or safety tradeoff is genuinely unclear.",
  );
});

test("uses file-by-file plans when they reduce implementation risk", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain(
    "For non-trivial work, produce a detailed file-by-file implementation plan when it reduces risk or the user asks for planning before editing files.",
  );
});

test("requires simple explanations and strong challenge of risks", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("Explain complex technical topics simply and clearly first.");
  expect(systemPromptText).toContain("Challenge weak assumptions.");
  expect(systemPromptText).toContain("Point out risks, dangers, and second-order effects clearly.");
});

test("documents truthful execution without requiring tool approval in prose", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("Do not claim actions you did not take.");
  expect(systemPromptText).toContain("Do not imply capabilities that are not available.");
  expect(systemPromptText).toContain("Use tools proactively when they are needed to satisfy a clear user request.");
  expect(systemPromptText).toContain(
    "Do not ask for permission solely because a tool or bash command is needed.",
  );
  expect(systemPromptText).not.toContain("require explicit user approval");
});
