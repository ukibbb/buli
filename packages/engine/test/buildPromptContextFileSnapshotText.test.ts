import { expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPromptContextFileSnapshotText } from "../src/index.ts";

test("buildPromptContextFileSnapshotText wraps file contents in a context_file block", async () => {
  const tempDirectoryPath = await mkdtemp(join(tmpdir(), "buli-file-snapshot-"));
  const filePath = join(tempDirectoryPath, "notes.txt");
  await writeFile(filePath, "alpha\nbeta\n", "utf8");

  await expect(
    buildPromptContextFileSnapshotText({
      absoluteFilePath: filePath,
      displayPath: "notes.txt",
    }),
  ).resolves.toBe(`<context_file path="notes.txt">\nalpha\nbeta\n\n</context_file>`);
});
