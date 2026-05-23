import { expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
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

test("buildModelFacingPromptTextFromPromptContextReferences resolves multi-level parent paths outside the browse root", async () => {
  const desktopRootPath = await mkdtemp(join(tmpdir(), "buli-multilevel-parent-prompt-"));
  const repositoryPath = join(desktopRootPath, "workspaces", "client", "repo");
  const sharedFilePath = join(desktopRootPath, "shared.md");
  await mkdir(repositoryPath, { recursive: true });
  await writeFile(sharedFilePath, "multi-level outside root", "utf8");
  const realSharedFilePath = await realpath(sharedFilePath);

  await expect(
    buildModelFacingPromptTextFromPromptContextReferences({
      promptText: "Inspect @../../../shared.md",
      promptContextBrowseRootPath: repositoryPath,
    }),
  ).resolves.toContain(`<context_file path="${toPortablePath(realSharedFilePath)}">\nmulti-level outside root\n</context_file>`);
});

test("buildModelFacingPromptTextFromPromptContextReferences resolves absolute paths outside the browse root", async () => {
  const desktopRootPath = await mkdtemp(join(tmpdir(), "buli-absolute-prompt-"));
  const repositoryPath = join(desktopRootPath, "repo");
  const externalFilePath = join(desktopRootPath, "external.md");
  await mkdir(repositoryPath);
  await writeFile(externalFilePath, "absolute outside root", "utf8");
  const realExternalFilePath = await realpath(externalFilePath);

  await expect(
    buildModelFacingPromptTextFromPromptContextReferences({
      promptText: `Inspect @${toPortablePath(realExternalFilePath)}`,
      promptContextBrowseRootPath: repositoryPath,
    }),
  ).resolves.toContain(`<context_file path="${toPortablePath(realExternalFilePath)}">\nabsolute outside root\n</context_file>`);
});

test("buildModelFacingPromptTextFromPromptContextReferences resolves quoted absolute paths with spaces", async () => {
  const desktopRootPath = await mkdtemp(join(tmpdir(), "buli-quoted-absolute-prompt-"));
  const repositoryPath = join(desktopRootPath, "repo");
  const externalDirectoryPath = join(desktopRootPath, "External Notes");
  const externalFilePath = join(externalDirectoryPath, "project context.md");
  await mkdir(repositoryPath);
  await mkdir(externalDirectoryPath);
  await writeFile(externalFilePath, "quoted outside root", "utf8");
  const realExternalFilePath = await realpath(externalFilePath);

  await expect(
    buildModelFacingPromptTextFromPromptContextReferences({
      promptText: `Inspect @"${toPortablePath(realExternalFilePath)}"`,
      promptContextBrowseRootPath: repositoryPath,
    }),
  ).resolves.toContain(`<context_file path="${toPortablePath(realExternalFilePath)}">\nquoted outside root\n</context_file>`);
});

test("buildModelFacingPromptTextFromPromptContextReferences rejects symbolic-link references", async () => {
  const desktopRootPath = await mkdtemp(join(tmpdir(), "buli-symlink-prompt-"));
  const targetFilePath = join(desktopRootPath, "target.txt");
  const linkedFilePath = join(desktopRootPath, "linked.txt");
  await writeFile(targetFilePath, "linked target", "utf8");
  await symlink(targetFilePath, linkedFilePath);

  const modelFacingPromptText = await buildModelFacingPromptTextFromPromptContextReferences({
    promptText: "Inspect @linked.txt",
    promptContextBrowseRootPath: desktopRootPath,
  });

  expect(modelFacingPromptText).toContain("<context_reference_error reference=\"@linked.txt\">");
  expect(modelFacingPromptText).toContain("Symbolic links are not allowed as prompt-context references.");
  expect(modelFacingPromptText).not.toContain("linked target");
});
