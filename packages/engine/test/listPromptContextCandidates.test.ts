import { expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { determinePromptContextQueryLoadStrategy, listPromptContextCandidates } from "../src/index.ts";

test("determinePromptContextQueryLoadStrategy keeps path-like queries immediate and fuzzy queries debounced", () => {
  expect(determinePromptContextQueryLoadStrategy("")).toBe("browse_current_directory");
  expect(determinePromptContextQueryLoadStrategy("src/components/")).toBe("path_query");
  expect(determinePromptContextQueryLoadStrategy("../sha")).toBe("path_query");
  expect(determinePromptContextQueryLoadStrategy("notes")).toBe("fuzzy_query");
});

function toPortablePath(pathText: string): string {
  return pathText.replaceAll("\\", "/");
}

test("listPromptContextCandidates returns top-level Desktop entries when the query is empty", async () => {
  const desktopRootPath = await mkdtemp(join(tmpdir(), "buli-prompt-context-candidates-"));
  const projectsDirectoryPath = join(desktopRootPath, "Projects");
  const notesFilePath = join(desktopRootPath, "notes.txt");
  await mkdir(projectsDirectoryPath);
  await writeFile(notesFilePath, "hi", "utf8");
  const realProjectsDirectoryPath = await realpath(projectsDirectoryPath);
  const realNotesFilePath = await realpath(notesFilePath);

  await expect(
    listPromptContextCandidates({
      promptContextBrowseRootPath: desktopRootPath,
      promptContextQueryText: "",
    }),
  ).resolves.toEqual([
    {
      kind: "directory",
      displayPath: `${toPortablePath(realProjectsDirectoryPath)}/`,
      promptReferenceText: `@${toPortablePath(realProjectsDirectoryPath)}/`,
    },
    {
      kind: "file",
      displayPath: toPortablePath(realNotesFilePath),
      promptReferenceText: `@${toPortablePath(realNotesFilePath)}`,
    },
  ]);
});

test("listPromptContextCandidates searches descendants and quotes paths with spaces", async () => {
  const desktopRootPath = await mkdtemp(join(tmpdir(), "buli-prompt-context-search-"));
  const spacedDirectoryPath = join(desktopRootPath, "My Folder");
  const todoListFilePath = join(spacedDirectoryPath, "todo list.txt");
  await mkdir(spacedDirectoryPath);
  await writeFile(todoListFilePath, "hi", "utf8");
  const realTodoListFilePath = await realpath(todoListFilePath);

  await expect(
    listPromptContextCandidates({
      promptContextBrowseRootPath: desktopRootPath,
      promptContextQueryText: '"todo',
    }),
  ).resolves.toEqual([
    {
      kind: "file",
      displayPath: toPortablePath(realTodoListFilePath),
      promptReferenceText: `@"${toPortablePath(realTodoListFilePath)}"`,
    },
  ]);
});

test("listPromptContextCandidates finds sibling project files from a parent browse root", async () => {
  const projectsRootPath = await mkdtemp(join(tmpdir(), "buli-prompt-context-sibling-"));
  const currentProjectPath = join(projectsRootPath, "buli");
  const siblingProjectPath = join(projectsRootPath, "novibe.space");
  await mkdir(currentProjectPath);
  await mkdir(siblingProjectPath);
  await Promise.all([
    writeFile(join(currentProjectPath, "alpha.txt"), "ignored", "utf8"),
    writeFile(join(currentProjectPath, "beta.txt"), "ignored", "utf8"),
    writeFile(join(currentProjectPath, "gamma.txt"), "ignored", "utf8"),
    writeFile(join(currentProjectPath, "delta.txt"), "ignored", "utf8"),
    writeFile(join(currentProjectPath, "epsilon.txt"), "ignored", "utf8"),
    writeFile(join(siblingProjectPath, "VISION.md"), "vision", "utf8"),
    writeFile(join(siblingProjectPath, "VISION_LEARNING_AGENTS.md"), "agents", "utf8"),
  ]);
  const realVisionFilePath = await realpath(join(siblingProjectPath, "VISION.md"));
  const realVisionLearningAgentsFilePath = await realpath(join(siblingProjectPath, "VISION_LEARNING_AGENTS.md"));

  await expect(
    listPromptContextCandidates({
      promptContextBrowseRootPath: projectsRootPath,
      promptContextStartingDirectoryPath: currentProjectPath,
      promptContextQueryText: "VISION",
      maximumSearchEntryCount: 4,
    }),
  ).resolves.toEqual([
    {
      kind: "file",
      displayPath: toPortablePath(realVisionFilePath),
      promptReferenceText: `@${toPortablePath(realVisionFilePath)}`,
    },
    {
      kind: "file",
      displayPath: toPortablePath(realVisionLearningAgentsFilePath),
      promptReferenceText: `@${toPortablePath(realVisionLearningAgentsFilePath)}`,
    },
  ]);
});

test("listPromptContextCandidates skips generated dependency trees during fuzzy search", async () => {
  const projectRootPath = await mkdtemp(join(tmpdir(), "buli-prompt-context-ignored-"));
  const dependencyTreePath = join(projectRootPath, "node_modules", "large-package");
  const sourceDirectoryPath = join(projectRootPath, "src");
  await mkdir(dependencyTreePath, { recursive: true });
  await mkdir(sourceDirectoryPath);
  await Promise.all([
    writeFile(join(dependencyTreePath, "alpha.txt"), "ignored", "utf8"),
    writeFile(join(dependencyTreePath, "beta.txt"), "ignored", "utf8"),
    writeFile(join(dependencyTreePath, "gamma.txt"), "ignored", "utf8"),
    writeFile(join(sourceDirectoryPath, "needle.txt"), "found", "utf8"),
  ]);
  const realNeedleFilePath = await realpath(join(sourceDirectoryPath, "needle.txt"));

  await expect(
    listPromptContextCandidates({
      promptContextBrowseRootPath: projectRootPath,
      promptContextQueryText: "needle",
      maximumSearchEntryCount: 3,
    }),
  ).resolves.toEqual([
    {
      kind: "file",
      displayPath: toPortablePath(realNeedleFilePath),
      promptReferenceText: `@${toPortablePath(realNeedleFilePath)}`,
    },
  ]);
});

test("listPromptContextCandidates starts from the configured directory and allows parent traversal within the root", async () => {
  const homeRootPath = await mkdtemp(join(tmpdir(), "buli-prompt-context-scope-"));
  const repositoryPath = join(homeRootPath, "repo");
  const appsDirectoryPath = join(repositoryPath, "apps");
  const sharedDirectoryPath = join(homeRootPath, "shared");
  await mkdir(join(repositoryPath, "apps"), { recursive: true });
  await mkdir(join(homeRootPath, "shared"));
  const realAppsDirectoryPath = await realpath(appsDirectoryPath);
  const realSharedDirectoryPath = await realpath(sharedDirectoryPath);

  await expect(
    listPromptContextCandidates({
      promptContextBrowseRootPath: homeRootPath,
      promptContextStartingDirectoryPath: repositoryPath,
      promptContextQueryText: "",
    }),
  ).resolves.toEqual([
    {
      kind: "directory",
      displayPath: `${toPortablePath(realAppsDirectoryPath)}/`,
      promptReferenceText: `@${toPortablePath(realAppsDirectoryPath)}/`,
    },
  ]);

  await expect(
    listPromptContextCandidates({
      promptContextBrowseRootPath: homeRootPath,
      promptContextStartingDirectoryPath: repositoryPath,
      promptContextQueryText: "../sh",
    }),
  ).resolves.toEqual([
    {
      kind: "directory",
      displayPath: `${toPortablePath(realSharedDirectoryPath)}/`,
      promptReferenceText: `@${toPortablePath(realSharedDirectoryPath)}/`,
    },
  ]);
});
