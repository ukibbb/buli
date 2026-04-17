import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildModelFacingPromptTextFromPromptContextReferences } from "../src/index.ts";

test("buildModelFacingPromptTextFromPromptContextReferences appends file and directory context blocks", async () => {
  const desktopRootPath = await mkdtemp(join(tmpdir(), "buli-model-facing-prompt-"));
  await mkdir(join(desktopRootPath, "project"));
  await writeFile(join(desktopRootPath, "notes.txt"), "todo", "utf8");
  await writeFile(join(desktopRootPath, "project", "README.md"), "hello", "utf8");

  await expect(
    buildModelFacingPromptTextFromPromptContextReferences({
      promptText: 'Summarize @notes.txt and inspect @project/',
      promptContextBrowseRootPath: desktopRootPath,
    }),
  ).resolves.toContain(`<context_file path="notes.txt">\ntodo\n</context_file>`);
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
