import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { writeBuliProfileRunReport } from "./reportBuliProfileRun.ts";

type ManualBuliProfileCliOptions = Readonly<{
  outputDirectoryPath: string;
  profileFilePath: string;
  reportOutputPath: string | undefined;
  sampleIntervalMs: number;
  shouldWriteReport: boolean;
  shouldCollectBunProfiles: boolean;
  buliCliArgs: readonly string[];
}>;

type ManualBuliProfileCliParseResult =
  | Readonly<{ status: "ready"; options: ManualBuliProfileCliOptions }>
  | Readonly<{ status: "help"; output: string }>
  | Readonly<{ status: "error"; output: string }>;

const defaultManualProfileSampleIntervalMs = 250;

export async function runManualBuliProfile(input: ManualBuliProfileCliOptions): Promise<number> {
  await mkdir(input.outputDirectoryPath, { recursive: true });
  const childExitCode = await runBuliCliWithProfileEnvironment(input);
  const profileJsonlFileWasWritten = await fileExists(input.profileFilePath);
  if (shouldGenerateManualBuliProfileReport({
    shouldWriteReport: input.shouldWriteReport,
    profileJsonlFileWasWritten,
  })) {
    const reportOutputPath = input.reportOutputPath ?? join(input.outputDirectoryPath, "profile-report.md");
    await writeBuliProfileRunReport({
      profileFilePath: input.profileFilePath,
      outputPath: reportOutputPath,
    });
    console.log(`Wrote Buli profile report to ${reportOutputPath}`);
  } else if (input.shouldWriteReport) {
    console.warn(`Skipped Buli profile report because ${input.profileFilePath} was not written.`);
  }

  if (profileJsonlFileWasWritten) {
    console.log(`Wrote Buli profile JSONL to ${input.profileFilePath}`);
  } else {
    console.warn(`Buli profile JSONL was not written to ${input.profileFilePath}.`);
  }
  return resolveManualBuliProfileExitCode({ childExitCode, profileJsonlFileWasWritten });
}

export function shouldGenerateManualBuliProfileReport(input: Readonly<{
  shouldWriteReport: boolean;
  profileJsonlFileWasWritten: boolean;
}>): boolean {
  return input.shouldWriteReport && input.profileJsonlFileWasWritten;
}

export function resolveManualBuliProfileExitCode(input: Readonly<{
  childExitCode: number;
  profileJsonlFileWasWritten: boolean;
}>): number {
  if (!input.profileJsonlFileWasWritten) {
    return input.childExitCode === 0 ? 1 : input.childExitCode;
  }

  return input.childExitCode;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function runBuliCliWithProfileEnvironment(input: ManualBuliProfileCliOptions): Promise<number> {
  const childProcess = spawn(process.execPath, createManualBuliProfileRuntimeArgs(input), {
    env: {
      ...process.env,
      BULI_PROFILE_FILE: input.profileFilePath,
      BULI_PROFILE_SAMPLE_MS: String(input.sampleIntervalMs),
    },
    stdio: "inherit",
  });

  return new Promise<number>((resolve, reject) => {
    childProcess.once("error", reject);
    childProcess.once("close", (exitCode, signal) => {
      if (signal) {
        resolve(1);
        return;
      }

      resolve(exitCode ?? 1);
    });
  });
}

export function createManualBuliProfileRuntimeArgs(input: Pick<
  ManualBuliProfileCliOptions,
  "buliCliArgs" | "outputDirectoryPath" | "shouldCollectBunProfiles"
>): readonly string[] {
  return [
    ...(input.shouldCollectBunProfiles
      ? [
          "--cpu-prof",
          "--cpu-prof-md",
          `--cpu-prof-dir=${input.outputDirectoryPath}`,
          "--cpu-prof-name=manual.cpuprofile",
          "--heap-prof",
          "--heap-prof-md",
          `--heap-prof-dir=${input.outputDirectoryPath}`,
          "--heap-prof-name=manual.heapsnapshot",
        ]
      : []),
    "apps/cli/src/cli.ts",
    ...input.buliCliArgs,
  ];
}

function parseManualBuliProfileCliOptions(args: readonly string[]): ManualBuliProfileCliParseResult {
  if (args.includes("--help") || args.includes("-h")) {
    return { status: "help", output: formatManualProfileUsage() };
  }

  const separatorIndex = args.indexOf("--");
  const wrapperArgs = separatorIndex === -1 ? args : args.slice(0, separatorIndex);
  const buliCliArgs = separatorIndex === -1 ? [] : args.slice(separatorIndex + 1);
  const outputDirectoryPath = readStringOption(wrapperArgs, "--output-dir") ?? createDefaultManualProfileOutputDirectoryPath();
  const profileFilePath = readStringOption(wrapperArgs, "--profile-file") ?? join(outputDirectoryPath, "profile.jsonl");
  const sampleIntervalResolution = readPositiveIntegerOption(wrapperArgs, "--sample-ms");
  if (sampleIntervalResolution.status === "invalid") {
    return { status: "error", output: "Invalid --sample-ms. Use a positive integer." };
  }

  return {
    status: "ready",
    options: {
      outputDirectoryPath,
      profileFilePath,
      reportOutputPath: readStringOption(wrapperArgs, "--report-output"),
      sampleIntervalMs: sampleIntervalResolution.value ?? defaultManualProfileSampleIntervalMs,
      shouldWriteReport: !wrapperArgs.includes("--no-report"),
      shouldCollectBunProfiles: wrapperArgs.includes("--with-bun-profiles"),
      buliCliArgs,
    },
  };
}

async function main(args: readonly string[]): Promise<void> {
  const cliOptions = parseManualBuliProfileCliOptions(args);
  if (cliOptions.status === "help") {
    console.log(cliOptions.output);
    return;
  }
  if (cliOptions.status === "error") {
    console.error(cliOptions.output);
    console.error(formatManualProfileUsage());
    process.exitCode = 1;
    return;
  }

  process.exitCode = await runManualBuliProfile(cliOptions.options);
}

function formatManualProfileUsage(): string {
  return [
    "Usage: bun run profile:manual -- [--output-dir <dir>] [--profile-file <profile.jsonl>] [--sample-ms <n>] [--report-output <profile-report.md>] [--no-report] [-- <buli args>]",
    "Add --with-bun-profiles to also write Bun CPU and heap artifacts into the output directory.",
    "Example: bun run profile:manual -- --output-dir profile-runs/manual --sample-ms 250",
  ].join("\n");
}

function readStringOption(args: readonly string[], optionName: string): string | undefined {
  const optionIndex = args.indexOf(optionName);
  if (optionIndex === -1) {
    return undefined;
  }

  const optionValue = args[optionIndex + 1];
  if (!optionValue || optionValue.startsWith("--")) {
    return undefined;
  }

  return optionValue;
}

function readPositiveIntegerOption(
  args: readonly string[],
  optionName: string,
): Readonly<{ status: "valid"; value: number | undefined }> | Readonly<{ status: "invalid" }> {
  const optionValue = readStringOption(args, optionName);
  if (optionValue === undefined) {
    return { status: "valid", value: undefined };
  }

  const numericOptionValue = Number(optionValue);
  if (!Number.isInteger(numericOptionValue) || numericOptionValue < 1) {
    return { status: "invalid" };
  }

  return { status: "valid", value: numericOptionValue };
}

function createDefaultManualProfileOutputDirectoryPath(): string {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  return join(process.cwd(), "profile-runs", `manual-${timestamp}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
