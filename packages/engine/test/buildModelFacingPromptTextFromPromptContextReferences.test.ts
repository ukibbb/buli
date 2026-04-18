import { expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildModelFacingPromptTextFromPromptContextReferences } from "../src/index.ts";

function toPortablePath(pathText: string): string {
  return pathText.replaceAll("\\", "/");
}

test("buildModelFacingPromptTextFromPromptContextReferences appends file and directory context blocks", async () => {
  const desktopRootPath = await mkdtemp(join(tmpdir(), "buli-model-facing-prompt-"));
  const projectDirectoryPath = join(desktopRootPath, "project");
  const notesFilePath = join(desktopRootPath, "notes.txt");
  await mkdir(projectDirectoryPath);
  await writeFile(notesFilePath, "todo", "utf8");
  await writeFile(join(projectDirectoryPath, "README.md"), "hello", "utf8");
  const realNotesFilePath = await realpath(notesFilePath);

  await expect(
    buildModelFacingPromptTextFromPromptContextReferences({
      promptText: 'Summarize @notes.txt and inspect @project/',
      promptContextBrowseRootPath: desktopRootPath,
    }),
  ).resolves.toContain(`<context_file path="${toPortablePath(realNotesFilePath)}">\ntodo\n</context_file>`);
});

test("buildModelFacingPromptTextFromPromptContextReferences reports unresolved references", async () => {
  const desktopRootPath = await mkdtemp(join(tmpdir(), "buli-unresolved-prompt-"));

  await expect(
    buildModelFacingPromptTextFromPromptContextReferences({
      promptText: "Inspect @missing.txt",
      promptContextBrowseRootPath: desktopRootPath,
    }),
  ).resolves.toContain("<context_reference_error reference=\"@missing.txt\">");
});

test("buildModelFacingPromptTextFromPromptContextReferences resolves parent paths from the configured starting directory", async () => {
  const homeRootPath = await mkdtemp(join(tmpdir(), "buli-parent-prompt-"));
  const repositoryPath = join(homeRootPath, "repo");
  const sharedFilePath = join(homeRootPath, "shared.txt");
  await mkdir(repositoryPath);
  await writeFile(sharedFilePath, "outside repo", "utf8");
  const realSharedFilePath = await realpath(sharedFilePath);

  await expect(
    buildModelFacingPromptTextFromPromptContextReferences({
      promptText: "Inspect @../shared.txt",
      promptContextBrowseRootPath: homeRootPath,
      promptContextStartingDirectoryPath: repositoryPath,
    }),
  ).resolves.toContain(`<context_file path="${toPortablePath(realSharedFilePath)}">\noutside repo\n</context_file>`);
});
