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
