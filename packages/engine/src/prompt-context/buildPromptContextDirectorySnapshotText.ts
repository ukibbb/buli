import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { escapeModelFacingXmlAttributeValue, escapeModelFacingXmlText } from "../modelFacingXmlEscaping.ts";

const DEFAULT_MAXIMUM_PROMPT_CONTEXT_DIRECTORY_DEPTH = 4;
const DEFAULT_MAXIMUM_PROMPT_CONTEXT_DIRECTORY_ENTRY_COUNT = 200;
const DEFAULT_MAXIMUM_PROMPT_CONTEXT_DIRECTORY_CHARACTER_COUNT = 12_000;

export async function buildPromptContextDirectorySnapshotText(input: {
  absoluteDirectoryPath: string;
  displayPath: string;
  maximumDepth?: number;
  maximumEntryCount?: number;
  maximumCharacterCount?: number;
  abortSignal?: AbortSignal;
}): Promise<string> {
  const visibleDirectoryLines: string[] = [];
  const maximumDepth = input.maximumDepth ?? DEFAULT_MAXIMUM_PROMPT_CONTEXT_DIRECTORY_DEPTH;
  const maximumEntryCount = input.maximumEntryCount ?? DEFAULT_MAXIMUM_PROMPT_CONTEXT_DIRECTORY_ENTRY_COUNT;
  const maximumCharacterCount = input.maximumCharacterCount ?? DEFAULT_MAXIMUM_PROMPT_CONTEXT_DIRECTORY_CHARACTER_COUNT;
  let writtenEntryCount = 0;
  let stoppedBecauseOfLimits = false;

  async function visitDirectory(absoluteDirectoryPath: string, depth: number): Promise<void> {
    throwIfPromptContextExpansionAborted(input.abortSignal);
    if (stoppedBecauseOfLimits || depth > maximumDepth) {
      stoppedBecauseOfLimits = true;
      return;
    }

    const directoryEntries = await readdir(absoluteDirectoryPath, { withFileTypes: true });
    throwIfPromptContextExpansionAborted(input.abortSignal);
    directoryEntries.sort((leftDirectoryEntry, rightDirectoryEntry) => {
      if (leftDirectoryEntry.isDirectory() !== rightDirectoryEntry.isDirectory()) {
        return leftDirectoryEntry.isDirectory() ? -1 : 1;
      }

      return leftDirectoryEntry.name.localeCompare(rightDirectoryEntry.name);
    });

    for (const directoryEntry of directoryEntries) {
      throwIfPromptContextExpansionAborted(input.abortSignal);
      if (stoppedBecauseOfLimits) {
        return;
      }

      if (directoryEntry.isSymbolicLink()) {
        continue;
      }

      const linePrefix = `${"  ".repeat(depth)}- `;
      const lineText = `${linePrefix}${escapeModelFacingXmlText(directoryEntry.name)}${directoryEntry.isDirectory() ? "/" : ""}`;
      visibleDirectoryLines.push(lineText);
      writtenEntryCount += 1;

      const serializedDirectoryTree = visibleDirectoryLines.join("\n");
      if (writtenEntryCount >= maximumEntryCount || serializedDirectoryTree.length > maximumCharacterCount) {
        stoppedBecauseOfLimits = true;
        return;
      }

      if (directoryEntry.isDirectory()) {
        await visitDirectory(join(absoluteDirectoryPath, directoryEntry.name), depth + 1);
      }
    }
  }

  await visitDirectory(input.absoluteDirectoryPath, 0);
  if (stoppedBecauseOfLimits) {
    visibleDirectoryLines.push("- ... truncated");
  }

  return `<context_directory path="${escapeModelFacingXmlAttributeValue(input.displayPath)}">\n${visibleDirectoryLines.join("\n")}\n</context_directory>`;
}

function throwIfPromptContextExpansionAborted(abortSignal: AbortSignal | undefined): void {
  if (abortSignal?.aborted) {
    throw new Error("Prompt context expansion interrupted");
  }
}
