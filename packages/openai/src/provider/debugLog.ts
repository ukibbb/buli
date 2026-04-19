import { appendFile } from "node:fs/promises";
import { join } from "node:path";

const ENABLED_DEBUG_VALUES = new Set(["1", "true", "yes", "on"]);

export function isOpenAiDebugLoggingEnabled(): boolean {
  const rawValue = process.env.BULI_OPENAI_DEBUG_LOG;
  return rawValue ? ENABLED_DEBUG_VALUES.has(rawValue.trim().toLowerCase()) : false;
}

export async function writeOpenAiDebugLog(title: string, payload: unknown): Promise<void> {
  if (!isOpenAiDebugLoggingEnabled()) {
    return;
  }

  const markdownEntry = createMarkdownLogEntry(title, payload);
  console.log(markdownEntry.trimEnd());
  await appendFile(join(process.cwd(), "logs.md"), markdownEntry, "utf8");
}

function createMarkdownLogEntry(title: string, payload: unknown): string {
  const timestamp = new Date().toISOString();
  const serializedPayload = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return [`## ${timestamp} ${title}`, "", "```text", serializedPayload ?? String(payload), "```", ""].join("\n");
}
