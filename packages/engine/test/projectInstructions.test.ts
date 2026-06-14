import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverProjectInstructionFiles, ProjectInstructionTracker } from "../src/index.ts";

test("discoverProjectInstructionFiles loads workspace instructions from root to target directory", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-project-instructions-"));
  await mkdir(join(workspaceRootPath, "src", "feature"), { recursive: true });
  await writeFile(join(workspaceRootPath, "AGENTS.md"), "- Root convention.\n", "utf8");
  await writeFile(join(workspaceRootPath, "BULI.md"), "- Buli-specific root convention.\n", "utf8");
  await writeFile(join(workspaceRootPath, "src", "AGENTS.md"), "- Source convention.\n", "utf8");
  await writeFile(join(workspaceRootPath, "src", "feature", "CLAUDE.md"), "- Feature convention.\n", "utf8");
  await writeFile(join(workspaceRootPath, "src", "feature", "BULI.md"), "- Buli-specific feature convention.\n", "utf8");

  const projectInstructionFiles = await discoverProjectInstructionFiles({
    workspaceRootPath,
    targetDirectoryPath: join(workspaceRootPath, "src", "feature"),
  });

  expect(projectInstructionFiles.map((projectInstructionFile) => projectInstructionFile.displayPath)).toEqual([
    "AGENTS.md",
    "BULI.md",
    "src/AGENTS.md",
    "src/feature/CLAUDE.md",
    "src/feature/BULI.md",
  ]);
  expect(projectInstructionFiles.map((projectInstructionFile) => projectInstructionFile.instructionText)).toEqual([
    "- Root convention.\n",
    "- Buli-specific root convention.\n",
    "- Source convention.\n",
    "- Feature convention.\n",
    "- Buli-specific feature convention.\n",
  ]);
  expect(projectInstructionFiles.every((projectInstructionFile) => projectInstructionFile.contentHash.length > 0)).toBe(true);
});

test("ProjectInstructionTracker returns only newly discovered nested instructions", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-project-instruction-tracker-"));
  await mkdir(join(workspaceRootPath, "src"));
  await writeFile(join(workspaceRootPath, "AGENTS.md"), "- Root convention.\n", "utf8");
  await writeFile(join(workspaceRootPath, "src", "BULI.md"), "- Buli-specific source convention.\n", "utf8");
  const projectInstructionTracker = new ProjectInstructionTracker({ workspaceRootPath });

  await projectInstructionTracker.loadProjectInstructionsForDirectory({ targetDirectoryPath: workspaceRootPath });
  const newProjectInstructionFiles = await projectInstructionTracker.discoverNewProjectInstructionsForDirectory({
    targetDirectoryPath: join(workspaceRootPath, "src"),
  });

  expect(newProjectInstructionFiles.map((projectInstructionFile) => projectInstructionFile.displayPath)).toEqual([
    "src/BULI.md",
  ]);
  expect(projectInstructionTracker.listProjectInstructionFiles().map((projectInstructionFile) => projectInstructionFile.displayPath)).toEqual([
    "AGENTS.md",
    "src/BULI.md",
  ]);
});
