import { expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  TypeScriptWorkspaceFileSearchBackend,
  TypeScriptWorkspaceTextFileLineWindowReader,
} from "../src/index.ts";

test("TypeScriptWorkspaceFileSearchBackend lists files through the native-ready boundary", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-workspace-search-boundary-"));
  await mkdir(join(workspaceRootPath, "src"));
  await writeFile(join(workspaceRootPath, "src", "app.ts"), "export const app = true;\n", "utf8");
  await writeFile(join(workspaceRootPath, "README.md"), "# Project\n", "utf8");

  const result = await new TypeScriptWorkspaceFileSearchBackend().listWorkspaceFiles({
    workspaceRootPath,
    searchRootPath: workspaceRootPath,
    includeGlobPattern: "**/*.ts",
  });

  expect(result.wasTruncated).toBe(false);
  expect(result.files.map((file) => file.displayPath)).toEqual(["src/app.ts"]);
});

test("TypeScriptWorkspaceTextFileLineWindowReader reads bounded line windows through the native-ready boundary", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-read-window-boundary-"));
  const filePath = join(workspaceRootPath, "large.txt");
  await writeFile(filePath, ["one", "two", "three", "four"].join("\n"), "utf8");

  const result = await new TypeScriptWorkspaceTextFileLineWindowReader().readWorkspaceTextFileLineWindow({
    absoluteFilePath: filePath,
    offsetLineNumber: 2,
    maximumLineCount: 2,
  });

  expect(result.visibleFileLines).toEqual([{ lineText: "two" }, { lineText: "three" }]);
  expect(result.totalLineCount).toBeUndefined();
  expect(result.wasLineCountTruncated).toBe(true);
});
