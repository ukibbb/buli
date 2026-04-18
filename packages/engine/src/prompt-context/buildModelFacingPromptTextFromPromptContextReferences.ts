import { lstat, realpath } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { buildPromptContextDirectorySnapshotText } from "./buildPromptContextDirectorySnapshotText.ts";
import { buildPromptContextFileSnapshotText } from "./buildPromptContextFileSnapshotText.ts";
import { parsePromptContextReferencesFromPromptText } from "./parsePromptContextReferencesFromPromptText.ts";

export async function buildModelFacingPromptTextFromPromptContextReferences(input: {
  promptText: string;
  promptContextBrowseRootPath: string;
}): Promise<string> {
  const parsedPromptContextReferences = parsePromptContextReferencesFromPromptText(input.promptText);
  if (parsedPromptContextReferences.length === 0) {
    return input.promptText;
  }

  const promptContextBlocks: string[] = [];
  const seenPromptContextKeys = new Set<string>();
  const browseRootRealPath = await realpath(input.promptContextBrowseRootPath);

  for (const parsedPromptContextReference of parsedPromptContextReferences) {
    const resolvedPromptContextReference = await resolvePromptContextReference({
      browseRootRealPath,
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
  browseRootRealPath: string;
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
  const candidateAbsolutePath = resolve(input.browseRootRealPath, input.parsedPromptContextReferenceDisplayPath);

  try {
    const candidateRealPath = await realpath(candidateAbsolutePath);
    if (!isPathInsidePromptContextBrowseRoot(input.browseRootRealPath, candidateRealPath)) {
      return {
        kind: "unresolved",
        errorMessage: "The referenced path resolves outside the allowed Desktop prompt-context root.",
      };
    }

    const candidateStats = await lstat(candidateRealPath);
    if (candidateStats.isSymbolicLink()) {
      return {
        kind: "unresolved",
        errorMessage: "Symbolic links are not allowed as prompt-context references.",
      };
    }

    if (!candidateStats.isFile() && !candidateStats.isDirectory()) {
      return {
        kind: "unresolved",
        errorMessage: "Only files and directories can be added to prompt context.",
      };
    }

    const displayPath = toPortableRelativePath(relative(input.browseRootRealPath, candidateRealPath), candidateStats.isDirectory());
    return {
      kind: "resolved",
      absolutePath: candidateRealPath,
      displayPath,
      entryType: candidateStats.isDirectory() ? "directory" : "file",
    };
  } catch {
    return {
      kind: "unresolved",
      errorMessage: "The referenced path does not exist under the allowed Desktop prompt-context root.",
    };
  }
}

function isPathInsidePromptContextBrowseRoot(browseRootRealPath: string, candidateRealPath: string): boolean {
  if (candidateRealPath === browseRootRealPath) {
    return true;
  }

  const rootPrefix = browseRootRealPath.endsWith(sep) ? browseRootRealPath : `${browseRootRealPath}${sep}`;
  return candidateRealPath.startsWith(rootPrefix);
}

function toPortableRelativePath(relativePath: string, isDirectory: boolean): string {
  const portableRelativePath = relativePath.split(sep).join("/");
  if (!isDirectory || portableRelativePath.endsWith("/")) {
    return portableRelativePath;
  }

  return `${portableRelativePath}/`;
}
