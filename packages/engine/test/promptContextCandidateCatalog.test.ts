import { expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PromptContextCandidateCatalog } from "../src/index.ts";

function toPortablePath(pathText: string): string {
  return pathText.replaceAll("\\", "/");
}

test("PromptContextCandidateCatalog reuses a fuzzy recursive snapshot within TTL and refreshes it after expiry", async () => {
  const promptContextBrowseRootPath = await mkdtemp(join(tmpdir(), "buli-prompt-context-catalog-"));
  const firstNotesFilePath = join(promptContextBrowseRootPath, "notes-a.txt");
  const secondNotesFilePath = join(promptContextBrowseRootPath, "notes-b.txt");
  await writeFile(firstNotesFilePath, "a", "utf8");
  const realFirstNotesFilePath = await realpath(firstNotesFilePath);

  let nowMs = 1_000;
  const promptContextCandidateCatalog = new PromptContextCandidateCatalog({
    promptContextBrowseRootPath,
    promptContextStartingDirectoryPath: promptContextBrowseRootPath,
    recursiveSnapshotTimeToLiveMs: 2_000,
    nowMs: () => nowMs,
  });

  expect(await promptContextCandidateCatalog.listPromptContextCandidates("notes")).toEqual([
    {
      kind: "file",
      displayPath: toPortablePath(realFirstNotesFilePath),
      promptReferenceText: `@${toPortablePath(realFirstNotesFilePath)}`,
    },
  ]);

  await writeFile(secondNotesFilePath, "b", "utf8");
  const realSecondNotesFilePath = await realpath(secondNotesFilePath);

  expect(await promptContextCandidateCatalog.listPromptContextCandidates("notes")).toEqual([
    {
      kind: "file",
      displayPath: toPortablePath(realFirstNotesFilePath),
      promptReferenceText: `@${toPortablePath(realFirstNotesFilePath)}`,
    },
  ]);

  nowMs += 2_001;

  expect(await promptContextCandidateCatalog.listPromptContextCandidates("notes")).toEqual([
    {
      kind: "file",
      displayPath: toPortablePath(realFirstNotesFilePath),
      promptReferenceText: `@${toPortablePath(realFirstNotesFilePath)}`,
    },
    {
      kind: "file",
      displayPath: toPortablePath(realSecondNotesFilePath),
      promptReferenceText: `@${toPortablePath(realSecondNotesFilePath)}`,
    },
  ]);
});

test("PromptContextCandidateCatalog bypasses the fuzzy cache for path and current-directory queries", async () => {
  const promptContextBrowseRootPath = await mkdtemp(join(tmpdir(), "buli-prompt-context-catalog-bypass-"));
  const srcDirectoryPath = join(promptContextBrowseRootPath, "src");
  await mkdir(srcDirectoryPath);
  const firstSourceFilePath = join(srcDirectoryPath, "first.ts");
  await writeFile(firstSourceFilePath, "export const first = 1;", "utf8");
  const realFirstSourceFilePath = await realpath(firstSourceFilePath);

  let nowMs = 2_000;
  const promptContextCandidateCatalog = new PromptContextCandidateCatalog({
    promptContextBrowseRootPath,
    promptContextStartingDirectoryPath: promptContextBrowseRootPath,
    recursiveSnapshotTimeToLiveMs: 10_000,
    nowMs: () => nowMs,
  });

  expect(await promptContextCandidateCatalog.listPromptContextCandidates("first")).toEqual([
    {
      kind: "file",
      displayPath: toPortablePath(realFirstSourceFilePath),
      promptReferenceText: `@${toPortablePath(realFirstSourceFilePath)}`,
    },
  ]);

  const secondSourceFilePath = join(srcDirectoryPath, "second.ts");
  const rootNotesFilePath = join(promptContextBrowseRootPath, "notes.txt");
  await writeFile(secondSourceFilePath, "export const second = 2;", "utf8");
  await writeFile(rootNotesFilePath, "note", "utf8");
  const realSecondSourceFilePath = await realpath(secondSourceFilePath);
  const realRootNotesFilePath = await realpath(rootNotesFilePath);

  expect(await promptContextCandidateCatalog.listPromptContextCandidates("src/")).toEqual([
    {
      kind: "file",
      displayPath: toPortablePath(realFirstSourceFilePath),
      promptReferenceText: `@${toPortablePath(realFirstSourceFilePath)}`,
    },
    {
      kind: "file",
      displayPath: toPortablePath(realSecondSourceFilePath),
      promptReferenceText: `@${toPortablePath(realSecondSourceFilePath)}`,
    },
  ]);

  expect(await promptContextCandidateCatalog.listPromptContextCandidates("")).toEqual(
    expect.arrayContaining([
      {
        kind: "file",
        displayPath: toPortablePath(realRootNotesFilePath),
        promptReferenceText: `@${toPortablePath(realRootNotesFilePath)}`,
      },
    ]),
  );
});
