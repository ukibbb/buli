import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listPromptContextCandidates } from "../src/index.ts";

test("listPromptContextCandidates returns top-level Desktop entries when the query is empty", async () => {
  const desktopRootPath = await mkdtemp(join(tmpdir(), "buli-prompt-context-candidates-"));
  await mkdir(join(desktopRootPath, "Projects"));
  await writeFile(join(desktopRootPath, "notes.txt"), "hi", "utf8");

  await expect(
    listPromptContextCandidates({
      promptContextBrowseRootPath: desktopRootPath,
      promptContextQueryText: "",
    }),
  ).resolves.toEqual([
    {
      kind: "directory",
      displayPath: "Projects/",
      promptReferenceText: "@Projects/",
    },
    {
      kind: "file",
      displayPath: "notes.txt",
      promptReferenceText: "@notes.txt",
    },
  ]);
});

test("listPromptContextCandidates searches descendants and quotes paths with spaces", async () => {
  const desktopRootPath = await mkdtemp(join(tmpdir(), "buli-prompt-context-search-"));
  await mkdir(join(desktopRootPath, "My Folder"));
  await writeFile(join(desktopRootPath, "My Folder", "todo list.txt"), "hi", "utf8");

  await expect(
    listPromptContextCandidates({
      promptContextBrowseRootPath: desktopRootPath,
      promptContextQueryText: '"todo',
    }),
  ).resolves.toEqual([
    {
      kind: "file",
      displayPath: "My Folder/todo list.txt",
      promptReferenceText: '@"My Folder/todo list.txt"',
    },
  ]);
});
