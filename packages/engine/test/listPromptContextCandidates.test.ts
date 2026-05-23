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

test("listPromptContextCandidates resolves multi-level parent path queries outside the browse root", async () => {
  const desktopRootPath = await mkdtemp(join(tmpdir(), "buli-prompt-context-parent-outside-"));
  const repositoryPath = join(desktopRootPath, "workspaces", "client", "repo");
  const sharedFilePath = join(desktopRootPath, "shared-notes.md");
  await mkdir(repositoryPath, { recursive: true });
  await writeFile(sharedFilePath, "shared", "utf8");
  const realSharedFilePath = await realpath(sharedFilePath);

  await expect(
    listPromptContextCandidates({
      promptContextBrowseRootPath: repositoryPath,
      promptContextQueryText: "../../../sha",
    }),
  ).resolves.toEqual([
    {
      kind: "file",
      displayPath: toPortablePath(realSharedFilePath),
      promptReferenceText: `@${toPortablePath(realSharedFilePath)}`,
    },
  ]);
});

test("listPromptContextCandidates resolves quoted absolute path queries outside the browse root", async () => {
  const desktopRootPath = await mkdtemp(join(tmpdir(), "buli-prompt-context-absolute-outside-"));
  const repositoryPath = join(desktopRootPath, "repo");
  const externalDirectoryPath = join(desktopRootPath, "External Notes");
  const targetFilePath = join(externalDirectoryPath, "target note.md");
  await mkdir(repositoryPath);
  await mkdir(externalDirectoryPath);
  await writeFile(targetFilePath, "target", "utf8");
  const realExternalDirectoryPath = await realpath(externalDirectoryPath);
  const realTargetFilePath = await realpath(targetFilePath);

  await expect(
    listPromptContextCandidates({
      promptContextBrowseRootPath: repositoryPath,
      promptContextQueryText: `"${toPortablePath(realExternalDirectoryPath)}/tar`,
    }),
  ).resolves.toEqual([
    {
      kind: "file",
      displayPath: toPortablePath(realTargetFilePath),
      promptReferenceText: `@"${toPortablePath(realTargetFilePath)}"`,
    },
  ]);
});

test("listPromptContextCandidates keeps fuzzy search scoped to the browse root", async () => {
  const desktopRootPath = await mkdtemp(join(tmpdir(), "buli-prompt-context-fuzzy-scope-"));
  const repositoryPath = join(desktopRootPath, "repo");
  const outsideDirectoryPath = join(desktopRootPath, "outside");
  await mkdir(repositoryPath);
  await mkdir(outsideDirectoryPath);
  await writeFile(join(outsideDirectoryPath, "outside-target.md"), "outside", "utf8");

  await expect(
    listPromptContextCandidates({
      promptContextBrowseRootPath: repositoryPath,
      promptContextQueryText: "outside-target",
    }),
  ).resolves.toEqual([]);
});
