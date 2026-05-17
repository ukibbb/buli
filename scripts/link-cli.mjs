import { chmod, lstat, mkdir, readlink, symlink, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const cliRunnerPath = resolve(repoRoot, "buli-test.sh");

export function getBunGlobalBin(input = {}) {
  const spawnSyncImpl = input.spawnSync ?? spawnSync;
  const result = spawnSyncImpl("bun", ["pm", "bin", "-g"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "failed to resolve Bun global bin directory");
  }

  return result.stdout.trim();
}

export async function replaceOwnedBuliSymlink(input) {
  const linkPath = input.linkPath;
  const targetPath = resolve(input.targetPath);
  const expectedExistingTargetPath = resolve(input.expectedExistingTargetPath ?? targetPath);

  try {
    const existingLinkStats = await lstat(linkPath);
    if (!existingLinkStats.isSymbolicLink()) {
      throw new Error(`Refusing to replace existing buli command because it is not a symlink: ${linkPath}`);
    }

    const existingLinkTargetPath = resolve(dirname(linkPath), await readlink(linkPath));
    if (existingLinkTargetPath !== expectedExistingTargetPath) {
      throw new Error(
        `Refusing to replace existing buli command because it points to ${existingLinkTargetPath}, not ${expectedExistingTargetPath}.`,
      );
    }

    await unlink(linkPath);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  await symlink(targetPath, linkPath);
}

export async function linkBuliCli(input = {}) {
  const bunGlobalBin = input.bunGlobalBin ?? getBunGlobalBin({ spawnSync: input.spawnSync });
  const linkPath = resolve(bunGlobalBin, "buli");
  const sourceRunnerPath = resolve(input.cliRunnerPath ?? cliRunnerPath);

  // Link the source runner, not the built bundle. That keeps `buli` pointed at
  // the latest repo code and matches the simpler pi-style development loop.
  await chmod(sourceRunnerPath, 0o755);
  await mkdir(bunGlobalBin, { recursive: true });
  await replaceOwnedBuliSymlink({ linkPath, targetPath: sourceRunnerPath });

  return { bunGlobalBin, linkPath };
}

async function main() {
  const { bunGlobalBin, linkPath } = await linkBuliCli();

  console.log(`Linked buli -> ${linkPath}`);

  if (!process.env.PATH?.split(":").includes(bunGlobalBin)) {
    console.log(`Add ${bunGlobalBin} to your PATH to use the buli command in new shells.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
