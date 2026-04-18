import { lstat, realpath } from "node:fs/promises";
import { buildPromptContextDirectorySnapshotText } from "./buildPromptContextDirectorySnapshotText.ts";
import { buildPromptContextFileSnapshotText } from "./buildPromptContextFileSnapshotText.ts";
import { parsePromptContextReferencesFromPromptText } from "./parsePromptContextReferencesFromPromptText.ts";
import {
  buildPromptContextDisplayPathFromAbsolutePath,
  isPathInsidePromptContextBrowseRoot,
  resolvePromptContextPathFromReference,
  resolvePromptContextPathScope,
  type PromptContextPathScope,
} from "./promptContextPathScope.ts";

export async function buildModelFacingPromptTextFromPromptContextReferences(input: {
  promptText: string;
  promptContextBrowseRootPath: string;
  promptContextStartingDirectoryPath?: string;
}): Promise<string> {
  const parsedPromptContextReferences = parsePromptContextReferencesFromPromptText(input.promptText);
  if (parsedPromptContextReferences.length === 0) {
    return input.promptText;
  }

  const promptContextBlocks: string[] = [];
  const seenPromptContextKeys = new Set<string>();
  const promptContextPathScope = await resolvePromptContextPathScope({
    promptContextBrowseRootPath: input.promptContextBrowseRootPath,
    ...(input.promptContextStartingDirectoryPath
      ? { promptContextStartingDirectoryPath: input.promptContextStartingDirectoryPath }
      : {}),
  });

  for (const parsedPromptContextReference of parsedPromptContextReferences) {
    const resolvedPromptContextReference = await resolvePromptContextReference({
      promptContextPathScope,
      parsedPromptContextReferenceDisplayPath: parsedPromptContextReference.displayPath,
    });
    const dedupeKey = resolvedPromptContextReference.kind === "resolved"
      ? resolvedPromptContextReference.absolutePath
      : `unresolved:${parsedPromptContextReference.promptReferenceText}`;
    if (seenPromptContextKeys.has(dedupeKey)) {
      continue;
    }

    seenPromptContextKeys.add(dedupeKey);
    if (resolvedPromptContextReference.kind === "unresolved") {
      promptContextBlocks.push(
        `<context_reference_error reference="${parsedPromptContextReference.promptReferenceText}">\n${resolvedPromptContextReference.errorMessage}\n</context_reference_error>`,
      );
      continue;
    }

    if (resolvedPromptContextReference.entryType === "directory") {
      promptContextBlocks.push(
        await buildPromptContextDirectorySnapshotText({
          absoluteDirectoryPath: resolvedPromptContextReference.absolutePath,
          displayPath: resolvedPromptContextReference.displayPath,
        }),
      );
      continue;
    }

    promptContextBlocks.push(
      await buildPromptContextFileSnapshotText({
        absoluteFilePath: resolvedPromptContextReference.absolutePath,
        displayPath: resolvedPromptContextReference.displayPath,
      }),
    );
  }

  if (promptContextBlocks.length === 0) {
    return input.promptText;
  }

  return `${input.promptText}\n\nAttached prompt context:\n\n${promptContextBlocks.join("\n\n")}`;
}

async function resolvePromptContextReference(input: {
  promptContextPathScope: PromptContextPathScope;
  parsedPromptContextReferenceDisplayPath: string;
}): Promise<
  | {
      kind: "resolved";
      absolutePath: string;
      displayPath: string;
      entryType: "file" | "directory";
    }
  | {
      kind: "unresolved";
      errorMessage: string;
    }
> {
  const candidateAbsolutePath = resolvePromptContextPathFromReference({
    promptContextPathText: input.parsedPromptContextReferenceDisplayPath,
    promptContextPathScope: input.promptContextPathScope,
  });

  try {
    const candidateStats = await lstat(candidateAbsolutePath);
    if (candidateStats.isSymbolicLink()) {
      return {
        kind: "unresolved",
        errorMessage: "Symbolic links are not allowed as prompt-context references.",
      };
    }

    const candidateRealPath = await realpath(candidateAbsolutePath);
    if (!isPathInsidePromptContextBrowseRoot(input.promptContextPathScope.promptContextBrowseRootPath, candidateRealPath)) {
      return {
        kind: "unresolved",
        errorMessage: "The referenced path resolves outside the allowed prompt-context root.",
      };
    }

    if (!candidateStats.isFile() && !candidateStats.isDirectory()) {
      return {
        kind: "unresolved",
        errorMessage: "Only files and directories can be added to prompt context.",
      };
    }

    const displayPath = buildPromptContextDisplayPathFromAbsolutePath({
      absolutePath: candidateRealPath,
      promptContextStartingDirectoryPath: input.promptContextPathScope.promptContextStartingDirectoryPath,
      isDirectory: candidateStats.isDirectory(),
    });
    return {
      kind: "resolved",
      absolutePath: candidateRealPath,
      displayPath,
      entryType: candidateStats.isDirectory() ? "directory" : "file",
    };
  } catch {
    return {
      kind: "unresolved",
      errorMessage: "The referenced path does not exist under the allowed prompt-context root.",
    };
  }
}
