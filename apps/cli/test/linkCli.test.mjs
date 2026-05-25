import { expect, test } from "bun:test";
import { lstat, mkdtemp, readlink, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getBunGlobalBin, replaceOwnedBuliSymlink } from "../../../scripts/link-cli.mjs";

test("getBunGlobalBin returns Bun's reported global bin directory", () => {
  const directoryPath = join(tmpdir(), "buli-global-bin");

  const globalBinPath = getBunGlobalBin({
    spawnSync: () => ({ status: 0, stdout: `${directoryPath}\n`, stderr: "" }),
  });

  expect(globalBinPath).toBe(directoryPath);
});

test("getBunGlobalBin falls back to BUN_INSTALL bin for a fresh Bun install", () => {
  const bunInstallPath = join(tmpdir(), "buli-bun-install");

  const globalBinPath = getBunGlobalBin({
    bunExecutablePath: undefined,
    environment: { BUN_INSTALL: bunInstallPath },
    spawnSync: () => ({
      status: 1,
      stdout: "",
      stderr: 'error: No package.json was found for directory "~/.bun/install/global"',
    }),
  });

  expect(globalBinPath).toBe(join(bunInstallPath, "bin"));
});

test("getBunGlobalBin falls back to the running Bun executable directory", () => {
  const bunExecutablePath = join(tmpdir(), "buli-bun", "bin", "bun");

  const globalBinPath = getBunGlobalBin({
    bunExecutablePath,
    environment: {},
    spawnSync: () => ({ status: 1, stdout: "", stderr: "failed" }),
  });

  expect(globalBinPath).toBe(join(tmpdir(), "buli-bun", "bin"));
});

test("getBunGlobalBin falls back to HOME when BUN_INSTALL is missing", () => {
  const homePath = join(tmpdir(), "buli-home");

  const globalBinPath = getBunGlobalBin({
    bunExecutablePath: undefined,
    environment: { HOME: homePath },
    spawnSync: () => ({ status: 1, stdout: "", stderr: "failed" }),
  });

  expect(globalBinPath).toBe(join(homePath, ".bun", "bin"));
});

test("getBunGlobalBin reports the Bun error when no fallback path exists", () => {
  expect(() => getBunGlobalBin({
    bunExecutablePath: undefined,
    environment: {},
    spawnSync: () => ({ status: 1, stdout: "", stderr: "failed to resolve global bin" }),
  })).toThrow("failed to resolve global bin");
});

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
