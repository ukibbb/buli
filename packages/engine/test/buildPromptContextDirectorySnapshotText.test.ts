import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPromptContextDirectorySnapshotText } from "../src/index.ts";

test("buildPromptContextDirectorySnapshotText renders a bounded recursive tree", async () => {
  const tempDirectoryPath = await mkdtemp(join(tmpdir(), "buli-directory-snapshot-"));
  await mkdir(join(tempDirectoryPath, "docs"));
  await writeFile(join(tempDirectoryPath, "AGENTS.md"), "rules", "utf8");
  await writeFile(join(tempDirectoryPath, "docs", "V1.md"), "plan", "utf8");

  await expect(
    buildPromptContextDirectorySnapshotText({
      absoluteDirectoryPath: tempDirectoryPath,
      displayPath: "project/",
    }),
  ).resolves.toBe(`<context_directory path="project/">\n- docs/\n  - V1.md\n- AGENTS.md\n</context_directory>`);
});
