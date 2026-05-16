import { readFile } from "node:fs/promises";
import { escapeModelFacingXmlAttributeValue, escapeModelFacingXmlText } from "../modelFacingXmlEscaping.ts";

const DEFAULT_MAXIMUM_PROMPT_CONTEXT_FILE_CHARACTER_COUNT = 16_000;

export async function buildPromptContextFileSnapshotText(input: {
  absoluteFilePath: string;
  displayPath: string;
  maximumCharacterCount?: number;
  abortSignal?: AbortSignal;
}): Promise<string> {
  throwIfPromptContextExpansionAborted(input.abortSignal);
  const fileContents = await readFile(input.absoluteFilePath, {
    encoding: "utf8",
    ...(input.abortSignal ? { signal: input.abortSignal } : {}),
  });
  throwIfPromptContextExpansionAborted(input.abortSignal);
  const maximumCharacterCount = input.maximumCharacterCount ?? DEFAULT_MAXIMUM_PROMPT_CONTEXT_FILE_CHARACTER_COUNT;
  const wasTrimmed = fileContents.length > maximumCharacterCount;
  const visibleFileContents = wasTrimmed ? fileContents.slice(0, maximumCharacterCount) : fileContents;
  const truncationNotice = wasTrimmed
    ? `\n[truncated to ${maximumCharacterCount.toLocaleString("en-US")} characters]`
    : "";

  return `<context_file path="${escapeModelFacingXmlAttributeValue(input.displayPath)}">\n${escapeModelFacingXmlText(visibleFileContents)}${truncationNotice}\n</context_file>`;
}

function throwIfPromptContextExpansionAborted(abortSignal: AbortSignal | undefined): void {
  if (abortSignal?.aborted) {
    throw new Error("Prompt context expansion interrupted");
  }
}
