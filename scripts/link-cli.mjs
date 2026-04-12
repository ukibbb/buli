import { chmod, lstat, mkdir, symlink, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const cliRunnerPath = resolve(repoRoot, "buli-test.sh");

function getBunGlobalBin() {
  const result = spawnSync("bun", ["pm", "bin", "-g"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "failed to resolve Bun global bin directory");
  }

  return result.stdout.trim();
}

async function replaceSymlink(linkPath, targetPath) {
  try {
    await lstat(linkPath);
    await unlink(linkPath);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  await symlink(targetPath, linkPath);
}

async function main() {
  const bunGlobalBin = getBunGlobalBin();
  const linkPath = resolve(bunGlobalBin, "buli");

  // Link the source runner, not the built bundle. That keeps `buli` pointed at
  // the latest repo code and matches the simpler pi-style development loop.
  await chmod(cliRunnerPath, 0o755);
  await mkdir(bunGlobalBin, { recursive: true });
  await replaceSymlink(linkPath, cliRunnerPath);

  console.log(`Linked buli -> ${linkPath}`);

  if (!process.env.PATH?.split(":").includes(bunGlobalBin)) {
    console.log(`Add ${bunGlobalBin} to your PATH to use the buli command in new shells.`);
  }
}

await main();
