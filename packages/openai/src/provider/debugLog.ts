import { appendFile, chmod, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const ENABLED_DEBUG_VALUES = new Set(["1", "true", "yes", "on"]);
const privateOpenAiDebugLogDirectoryMode = 0o700;
const privateOpenAiDebugLogFileMode = 0o600;

export type OpenAiDebugLogEnvironment = Readonly<{
  [environmentVariableName: string]: string | undefined;
  BULI_OPENAI_DEBUG_LOG?: string | undefined;
  BULI_OPENAI_DEBUG_LOG_FILE?: string | undefined;
}>;

export function isOpenAiDebugLoggingEnabled(environment: OpenAiDebugLogEnvironment = process.env): boolean {
  const rawValue = environment.BULI_OPENAI_DEBUG_LOG;
  return rawValue ? ENABLED_DEBUG_VALUES.has(rawValue.trim().toLowerCase()) : false;
}

export function resolveOpenAiDebugLogFilePath(environment: OpenAiDebugLogEnvironment = process.env): string {
  const requestedLogFilePath = environment.BULI_OPENAI_DEBUG_LOG_FILE?.trim();
  return requestedLogFilePath || join(homedir(), ".buli", "logs", "openai-debug.md");
}

export async function writeOpenAiDebugLog(
  title: string,
  payload: unknown,
  options: { environment?: OpenAiDebugLogEnvironment } = {},
): Promise<void> {
  const environment = options.environment ?? process.env;
  if (!isOpenAiDebugLoggingEnabled(environment)) {
    return;
  }

  const logFilePath = resolveOpenAiDebugLogFilePath(environment);
  const markdownEntry = createMarkdownLogEntry(title, payload);
  await ensurePrivateOpenAiDebugLogDirectory(dirname(logFilePath));
  await appendFile(logFilePath, markdownEntry, { encoding: "utf8", mode: privateOpenAiDebugLogFileMode });
  await chmod(logFilePath, privateOpenAiDebugLogFileMode);
}

async function ensurePrivateOpenAiDebugLogDirectory(logDirectoryPath: string): Promise<void> {
  await mkdir(logDirectoryPath, { recursive: true, mode: privateOpenAiDebugLogDirectoryMode });
  await chmod(logDirectoryPath, privateOpenAiDebugLogDirectoryMode);
}

function createMarkdownLogEntry(title: string, payload: unknown): string {
  const timestamp = new Date().toISOString();
  const serializedPayload = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return [`## ${timestamp} ${title}`, "", "```text", serializedPayload ?? String(payload), "```", ""].join("\n");
}
