import { fileURLToPath } from "node:url";
import { runCli } from "./main.ts";

// This file is the executable entrypoint. We keep it separate from runCli so
// importing CLI logic in tests does not accidentally print output or exit.
export async function main(args: readonly string[]): Promise<void> {
  try {
    const output = await runCli(args);
    if (output) {
      console.log(output);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  await main(process.argv.slice(2));
}
