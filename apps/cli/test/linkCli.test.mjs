import { expect, test } from "bun:test";
import { lstat, mkdtemp, readlink, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { replaceOwnedBuliSymlink } from "../../../scripts/link-cli.mjs";

test("replaceOwnedBuliSymlink creates a missing command symlink", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-link-cli-missing-"));
  const linkPath = join(directoryPath, "buli");
  const targetPath = join(directoryPath, "buli-test.sh");
  await writeFile(targetPath, "#!/usr/bin/env bash\n", "utf8");

  await replaceOwnedBuliSymlink({ linkPath, targetPath });

  expect(await readlink(linkPath)).toBe(targetPath);
});

test("replaceOwnedBuliSymlink replaces a command symlink owned by this repo", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-link-cli-owned-"));
  const linkPath = join(directoryPath, "buli");
  const targetPath = join(directoryPath, "buli-test.sh");
  await writeFile(targetPath, "#!/usr/bin/env bash\n", "utf8");
  await symlink(targetPath, linkPath);

  await replaceOwnedBuliSymlink({ linkPath, targetPath });

  expect(await readlink(linkPath)).toBe(targetPath);
});

test("replaceOwnedBuliSymlink refuses to replace a regular command file", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-link-cli-file-"));
  const linkPath = join(directoryPath, "buli");
  const targetPath = join(directoryPath, "buli-test.sh");
  await writeFile(linkPath, "existing command\n", "utf8");
  await writeFile(targetPath, "#!/usr/bin/env bash\n", "utf8");

  await expect(replaceOwnedBuliSymlink({ linkPath, targetPath })).rejects.toThrow("not a symlink");
  expect((await lstat(linkPath)).isFile()).toBe(true);
});

test("replaceOwnedBuliSymlink refuses to replace a symlink owned by another command", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-link-cli-other-symlink-"));
  const linkPath = join(directoryPath, "buli");
  const targetPath = join(directoryPath, "buli-test.sh");
  const otherTargetPath = join(directoryPath, "other-buli");
  await writeFile(targetPath, "#!/usr/bin/env bash\n", "utf8");
  await writeFile(otherTargetPath, "#!/usr/bin/env bash\n", "utf8");
  await symlink(otherTargetPath, linkPath);

  await expect(replaceOwnedBuliSymlink({ linkPath, targetPath })).rejects.toThrow("points to");
  expect(await readlink(linkPath)).toBe(otherTargetPath);
});
