import { readFile } from "node:fs/promises";

const DEFAULT_MAXIMUM_PROMPT_CONTEXT_FILE_CHARACTER_COUNT = 16_000;

export async function buildPromptContextFileSnapshotText(input: {
  absoluteFilePath: string;
  displayPath: string;
  maximumCharacterCount?: number;
}): Promise<string> {
  const fileContents = await readFile(input.absoluteFilePath, "utf8");
  const maximumCharacterCount = input.maximumCharacterCount ?? DEFAULT_MAXIMUM_PROMPT_CONTEXT_FILE_CHARACTER_COUNT;
  const wasTrimmed = fileContents.length > maximumCharacterCount;
  const visibleFileContents = wasTrimmed ? fileContents.slice(0, maximumCharacterCount) : fileContents;
  const truncationNotice = wasTrimmed
    ? `\n[truncated to ${maximumCharacterCount.toLocaleString("en-US")} characters]`
    : "";

  return `<context_file path="${input.displayPath}">\n${visibleFileContents}${truncationNotice}\n</context_file>`;
}
