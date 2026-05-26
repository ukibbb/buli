import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  WorkspaceSkillCatalog,
  parseSkillMarkdown,
  runSkillToolCall,
} from "../src/index.ts";

async function writeSkillFile(input: {
  rootPath: string;
  relativeSkillDirectoryPath: string;
  name: string;
  description?: string | undefined;
  instructionText: string;
}): Promise<string> {
  const skillDirectoryPath = join(input.rootPath, "skills", input.relativeSkillDirectoryPath);
  await mkdir(skillDirectoryPath, { recursive: true });
  const skillInstructionFilePath = join(skillDirectoryPath, "SKILL.md");
  await writeFile(
    skillInstructionFilePath,
    [
      "---",
      `name: ${input.name}`,
      ...(input.description !== undefined ? [`description: ${input.description}`] : []),
      "---",
      "",
      input.instructionText,
    ].join("\n"),
    "utf8",
  );
  return skillInstructionFilePath;
}

test("parseSkillMarkdown reads minimal frontmatter and rejects invalid skill names", () => {
  expect(parseSkillMarkdown("---\nname: code-review\ndescription: Review changes\n---\nUse review workflow.\n")).toEqual({
    name: "code-review",
    description: "Review changes",
    instructionText: "Use review workflow.",
  });
  expect(parseSkillMarkdown("---\nname: Code Review\n---\nInvalid because names are command-safe.\n")).toBeUndefined();
  expect(parseSkillMarkdown("No frontmatter\n")).toBeUndefined();
});

test("WorkspaceSkillCatalog discovers requested roots and lets disk skills override built-ins", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-skill-catalog-workspace-"));
  const homeDirectoryPath = await mkdtemp(join(tmpdir(), "buli-skill-catalog-home-"));
  const workspaceBuliSkillPath = await writeSkillFile({
    rootPath: join(workspaceRootPath, ".buli"),
    relativeSkillDirectoryPath: "nested/review/deep",
    name: "workspace-review",
    description: "Review workspace changes",
    instructionText: "Workspace review instructions.",
  });
  const homeBuliSkillPath = await writeSkillFile({
    rootPath: join(homeDirectoryPath, ".buli"),
    relativeSkillDirectoryPath: "personal",
    name: "home-skill",
    instructionText: "Home skill instructions.",
  });
  const agentsSkillPath = await writeSkillFile({
    rootPath: join(workspaceRootPath, ".agents"),
    relativeSkillDirectoryPath: "agent",
    name: "agent-skill",
    description: "Agent skill",
    instructionText: "Agent skill instructions.",
  });
  const claudeOverrideSkillPath = await writeSkillFile({
    rootPath: join(workspaceRootPath, ".claude"),
    relativeSkillDirectoryPath: "override",
    name: "codebase-orientation",
    description: "Disk override for the built-in orientation skill",
    instructionText: "Disk orientation instructions.",
  });
  await writeSkillFile({
    rootPath: join(workspaceRootPath, ".buli"),
    relativeSkillDirectoryPath: "invalid",
    name: "Invalid Name",
    instructionText: "This invalid command name should be ignored.",
  });

  const skillCatalog = new WorkspaceSkillCatalog({ workspaceRootPath, homeDirectoryPath });
  const availableSkills = await skillCatalog.listAvailableSkills();

  expect(availableSkills.map((availableSkill) => availableSkill.name)).toContain("workspace-review");
  expect(availableSkills.map((availableSkill) => availableSkill.name)).toContain("home-skill");
  expect(availableSkills.map((availableSkill) => availableSkill.name)).toContain("agent-skill");
  expect(availableSkills.map((availableSkill) => availableSkill.name)).not.toContain("Invalid Name");
  expect(await skillCatalog.loadSkillByName("workspace-review")).toMatchObject({
    name: "workspace-review",
    description: "Review workspace changes",
    sourceKind: "buli",
    instructionFilePath: workspaceBuliSkillPath,
    instructionText: "Workspace review instructions.",
  });
  expect(await skillCatalog.loadSkillByName("home-skill")).toMatchObject({
    name: "home-skill",
    sourceKind: "buli",
    instructionFilePath: homeBuliSkillPath,
  });
  expect(await skillCatalog.loadSkillByName("agent-skill")).toMatchObject({
    name: "agent-skill",
    sourceKind: "agents",
    instructionFilePath: agentsSkillPath,
  });
  expect(await skillCatalog.loadSkillByName("codebase-orientation")).toMatchObject({
    name: "codebase-orientation",
    sourceKind: "claude",
    instructionFilePath: claudeOverrideSkillPath,
    instructionText: "Disk orientation instructions.",
  });
});

test("runSkillToolCall returns model-facing skill content and typed skill detail", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-skill-tool-"));
  const instructionFilePath = await writeSkillFile({
    rootPath: join(workspaceRootPath, ".buli"),
    relativeSkillDirectoryPath: "review",
    name: "code-review",
    description: "Review code changes",
    instructionText: "Always inspect tests before judging the change.",
  });
  const skillCatalog = new WorkspaceSkillCatalog({ workspaceRootPath, homeDirectoryPath: workspaceRootPath });

  const toolCallOutcome = await runSkillToolCall({
    skillCatalog,
    skillToolCallRequest: { toolName: "skill", skillName: "code-review" },
  });

  expect(toolCallOutcome).toMatchObject({
    outcomeKind: "completed",
    toolCallDetail: {
      toolName: "skill",
      skillName: "code-review",
      skillDescription: "Review code changes",
      skillSourceKind: "buli",
      skillInstructionFilePath: instructionFilePath,
    },
  });
  expect(toolCallOutcome.toolResultText).toContain('<skill_content name="code-review">');
  expect(toolCallOutcome.toolResultText).toContain("Always inspect tests before judging the change.");
});

test("runSkillToolCall returns an actionable failure when a skill is missing", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-missing-skill-tool-"));
  await writeSkillFile({
    rootPath: join(workspaceRootPath, ".buli"),
    relativeSkillDirectoryPath: "review",
    name: "code-review",
    instructionText: "Review instructions.",
  });
  const skillCatalog = new WorkspaceSkillCatalog({ workspaceRootPath, homeDirectoryPath: workspaceRootPath });

  const toolCallOutcome = await runSkillToolCall({
    skillCatalog,
    skillToolCallRequest: { toolName: "skill", skillName: "missing-skill" },
  });

  expect(toolCallOutcome).toMatchObject({
    outcomeKind: "failed",
    toolCallDetail: { toolName: "skill", skillName: "missing-skill" },
  });
  expect(toolCallOutcome.toolResultText).toContain('Skill failed: Skill "missing-skill" not found.');
  expect(toolCallOutcome.toolResultText).toContain("code-review");
});
