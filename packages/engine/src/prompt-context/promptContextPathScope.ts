import { realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";

export type PromptContextPathScope = {
  promptContextBrowseRootPath: string;
  promptContextStartingDirectoryPath: string;
};

export async function resolvePromptContextPathScope(input: {
  promptContextBrowseRootPath: string;
  promptContextStartingDirectoryPath?: string;
}): Promise<PromptContextPathScope> {
  const promptContextBrowseRootPath = await realpath(input.promptContextBrowseRootPath);
  const requestedStartingDirectoryPath = input.promptContextStartingDirectoryPath ?? input.promptContextBrowseRootPath;

  try {
    const candidateStartingDirectoryPath = await realpath(requestedStartingDirectoryPath);
    if (isPathInsidePromptContextBrowseRoot(promptContextBrowseRootPath, candidateStartingDirectoryPath)) {
      return {
        promptContextBrowseRootPath,
        promptContextStartingDirectoryPath: candidateStartingDirectoryPath,
      };
    }
  } catch {
    // Fall back to the allowed root when the requested starting directory is unavailable.
  }

  return {
    promptContextBrowseRootPath,
    promptContextStartingDirectoryPath: promptContextBrowseRootPath,
  };
}

export function resolvePromptContextPathFromReference(input: {
  promptContextPathText: string;
  promptContextPathScope: PromptContextPathScope;
}): string {
  if (input.promptContextPathText === "~") {
    return input.promptContextPathScope.promptContextBrowseRootPath;
  }

  if (input.promptContextPathText.startsWith("~/")) {
    return resolve(input.promptContextPathScope.promptContextBrowseRootPath, input.promptContextPathText.slice(2));
  }

  return resolve(input.promptContextPathScope.promptContextStartingDirectoryPath, input.promptContextPathText);
}

export function isPathInsidePromptContextBrowseRoot(promptContextBrowseRootPath: string, candidatePath: string): boolean {
  if (candidatePath === promptContextBrowseRootPath) {
    return true;
  }

  const rootPrefix = promptContextBrowseRootPath.endsWith(sep)
    ? promptContextBrowseRootPath
    : `${promptContextBrowseRootPath}${sep}`;
  return candidatePath.startsWith(rootPrefix);
}

export function buildPromptContextDisplayPathFromAbsolutePath(input: {
  absolutePath: string;
  promptContextStartingDirectoryPath: string;
  isDirectory: boolean;
}): string {
  const displayPath = toPortablePath(input.absolutePath);
  if (!input.isDirectory || displayPath.endsWith("/")) {
    return displayPath;
  }

  return `${displayPath}/`;
}

function toPortablePath(pathText: string): string {
  return pathText.split(sep).join("/");
}
