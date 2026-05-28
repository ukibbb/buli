import { readFile, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  createTreeSitterCodebaseStructureIndexer,
  JsonFileCodebaseKnowledgeRepository,
  resolveCodebaseLanguageKindForFilePath,
  type CodebaseKnowledgeQuery,
  type CodebaseKnowledgeQueryResult,
  type CodebaseKnowledgeRecord,
  type CodebaseKnowledgeRepository,
  type CodebaseStructureIndexer,
} from "@buli/codebase-knowledge";
import { listWorkspaceFiles } from "../tools/workspaceFileSearch.ts";
import { formatWorkspaceDisplayPath, resolveWorkspacePath } from "../tools/workspacePath.ts";

const DEFAULT_CODEBASE_KNOWLEDGE_INDEX_FILE_NAME = "codebase-knowledge.json";

export type WorkspaceCodebaseKnowledgeIndex = {
  ensureWorkspaceIndexed(input?: { abortSignal?: AbortSignal | undefined }): Promise<void>;
  queryCodebaseKnowledge(
    query: CodebaseKnowledgeQuery,
    input?: { abortSignal?: AbortSignal | undefined },
  ): Promise<CodebaseKnowledgeQueryResult>;
  refreshChangedFilePaths(input: {
    changedFilePaths: readonly string[];
    abortSignal?: AbortSignal | undefined;
  }): Promise<void>;
};

export class TreeSitterWorkspaceCodebaseKnowledgeIndex implements WorkspaceCodebaseKnowledgeIndex {
  readonly #workspaceRootPath: string;
  readonly #codebaseKnowledgeRepository: CodebaseKnowledgeRepository;
  readonly #createStructureIndexer: () => Promise<CodebaseStructureIndexer>;
  #structureIndexerPromise: Promise<CodebaseStructureIndexer> | undefined;
  #workspaceIndexingPromise: Promise<void> | undefined;
  #hasIndexedWorkspace = false;

  constructor(input: {
    workspaceRootPath: string;
    codebaseKnowledgeRepository: CodebaseKnowledgeRepository;
    createStructureIndexer?: (() => Promise<CodebaseStructureIndexer>) | undefined;
  }) {
    this.#workspaceRootPath = resolve(input.workspaceRootPath);
    this.#codebaseKnowledgeRepository = input.codebaseKnowledgeRepository;
    this.#createStructureIndexer = input.createStructureIndexer ?? createTreeSitterCodebaseStructureIndexer;
  }

  async ensureWorkspaceIndexed(input: { abortSignal?: AbortSignal | undefined } = {}): Promise<void> {
    if (this.#hasIndexedWorkspace) {
      return;
    }
    this.#workspaceIndexingPromise ??= this.#indexWorkspace(input).then(() => {
      this.#hasIndexedWorkspace = true;
    }).finally(() => {
      this.#workspaceIndexingPromise = undefined;
    });

    await waitForWorkspaceIndexingToFinish({
      workspaceIndexingPromise: this.#workspaceIndexingPromise,
      abortSignal: input.abortSignal,
    });
  }

  async queryCodebaseKnowledge(
    query: CodebaseKnowledgeQuery,
    input: { abortSignal?: AbortSignal | undefined } = {},
  ): Promise<CodebaseKnowledgeQueryResult> {
    await this.ensureWorkspaceIndexed(input);
    throwIfCodebaseKnowledgeIndexAborted(input.abortSignal);
    return this.#codebaseKnowledgeRepository.queryRecords(query);
  }

  async refreshChangedFilePaths(input: {
    changedFilePaths: readonly string[];
    abortSignal?: AbortSignal | undefined;
  }): Promise<void> {
    for (const changedFilePath of listUniqueChangedFilePaths(input.changedFilePaths)) {
      throwIfCodebaseKnowledgeIndexAborted(input.abortSignal);
      if (isGeneratedCodebaseKnowledgeIndexPath(changedFilePath)) {
        continue;
      }
      await this.#refreshChangedFilePath({ changedFilePath, abortSignal: input.abortSignal });
    }
  }

  async #indexWorkspace(input: { abortSignal?: AbortSignal | undefined }): Promise<void> {
    const workspaceFiles = await listWorkspaceFiles({
      workspaceRootPath: this.#workspaceRootPath,
      searchRootPath: this.#workspaceRootPath,
      ...(input.abortSignal !== undefined ? { abortSignal: input.abortSignal } : {}),
    });
    const indexedKnowledgeRecords: CodebaseKnowledgeRecord[] = [];

    for (const workspaceFile of workspaceFiles.files) {
      throwIfCodebaseKnowledgeIndexAborted(input.abortSignal);
      if (!shouldIndexWorkspaceFile(workspaceFile.displayPath)) {
        continue;
      }

      indexedKnowledgeRecords.push(...await this.#indexWorkspaceFile({
        absoluteFilePath: workspaceFile.absolutePath,
        displayPath: workspaceFile.displayPath,
        abortSignal: input.abortSignal,
      }));
    }

    await this.#codebaseKnowledgeRepository.replaceAllRecords(indexedKnowledgeRecords);
  }

  async #refreshChangedFilePath(input: {
    changedFilePath: string;
    abortSignal?: AbortSignal | undefined;
  }): Promise<void> {
    const absoluteFilePath = resolveWorkspacePath({
      workspaceRootPath: this.#workspaceRootPath,
      requestedPath: input.changedFilePath,
    });
    const displayPath = formatWorkspaceDisplayPath(this.#workspaceRootPath, absoluteFilePath);
    const fileStats = await lstat(absoluteFilePath).catch((error: unknown) => {
      if (isFileNotFoundError(error)) {
        return undefined;
      }
      throw error;
    });
    if (!fileStats?.isFile() || !shouldIndexWorkspaceFile(displayPath)) {
      await this.#codebaseKnowledgeRepository.markFilePathStale(displayPath);
      return;
    }

    const knowledgeRecords = await this.#indexWorkspaceFile({
      absoluteFilePath,
      displayPath,
      abortSignal: input.abortSignal,
    });
    await this.#codebaseKnowledgeRepository.replaceFileRecords({
      filePath: displayPath,
      records: knowledgeRecords,
    });
  }

  async #indexWorkspaceFile(input: {
    absoluteFilePath: string;
    displayPath: string;
    abortSignal?: AbortSignal | undefined;
  }): Promise<readonly CodebaseKnowledgeRecord[]> {
    const structureIndexer = await this.#loadStructureIndexer();
    throwIfCodebaseKnowledgeIndexAborted(input.abortSignal);
    const fileText = await readFile(input.absoluteFilePath, "utf8");
    throwIfCodebaseKnowledgeIndexAborted(input.abortSignal);
    const indexedFile = await structureIndexer.indexFile({
      filePath: input.displayPath,
      fileText,
    });
    return indexedFile.knowledgeRecords;
  }

  #loadStructureIndexer(): Promise<CodebaseStructureIndexer> {
    this.#structureIndexerPromise ??= this.#createStructureIndexer();
    return this.#structureIndexerPromise;
  }
}

export function createDefaultWorkspaceCodebaseKnowledgeIndex(input: {
  workspaceRootPath: string;
}): WorkspaceCodebaseKnowledgeIndex {
  return new TreeSitterWorkspaceCodebaseKnowledgeIndex({
    workspaceRootPath: input.workspaceRootPath,
    codebaseKnowledgeRepository: new JsonFileCodebaseKnowledgeRepository({
      indexFilePath: defaultWorkspaceCodebaseKnowledgeIndexFilePath({ workspaceRootPath: input.workspaceRootPath }),
    }),
  });
}

export function defaultWorkspaceCodebaseKnowledgeIndexFilePath(input: { workspaceRootPath: string }): string {
  return join(input.workspaceRootPath, ".buli", "index", DEFAULT_CODEBASE_KNOWLEDGE_INDEX_FILE_NAME);
}

function shouldIndexWorkspaceFile(displayPath: string): boolean {
  return resolveCodebaseLanguageKindForFilePath(displayPath) !== undefined && !isGeneratedCodebaseKnowledgeIndexPath(displayPath);
}

async function waitForWorkspaceIndexingToFinish(input: {
  workspaceIndexingPromise: Promise<void>;
  abortSignal?: AbortSignal | undefined;
}): Promise<void> {
  throwIfCodebaseKnowledgeIndexAborted(input.abortSignal);
  if (!input.abortSignal) {
    await input.workspaceIndexingPromise;
    return;
  }
  const abortSignal = input.abortSignal;

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const abortListener = () => {
      abortSignal.removeEventListener("abort", abortListener);
      rejectPromise(new Error("Codebase knowledge indexing interrupted"));
    };
    abortSignal.addEventListener("abort", abortListener, { once: true });
    input.workspaceIndexingPromise.then(
      () => {
        abortSignal.removeEventListener("abort", abortListener);
        resolvePromise();
      },
      (error: unknown) => {
        abortSignal.removeEventListener("abort", abortListener);
        rejectPromise(error);
      },
    );
  });
}

function isGeneratedCodebaseKnowledgeIndexPath(filePath: string): boolean {
  const normalizedFilePath = normalizeWorkspacePath(filePath);
  return normalizedFilePath === ".buli/index/codebase-knowledge.json" ||
    (normalizedFilePath.startsWith(".buli/index/codebase-knowledge.json.") && normalizedFilePath.endsWith(".tmp"));
}

function listUniqueChangedFilePaths(changedFilePaths: readonly string[]): string[] {
  const uniqueChangedFilePaths: string[] = [];
  const observedFilePaths = new Set<string>();
  for (const changedFilePath of changedFilePaths) {
    const normalizedFilePath = normalizeWorkspacePath(changedFilePath);
    if (observedFilePaths.has(normalizedFilePath)) {
      continue;
    }
    observedFilePaths.add(normalizedFilePath);
    uniqueChangedFilePaths.push(changedFilePath);
  }
  return uniqueChangedFilePaths;
}

function normalizeWorkspacePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function throwIfCodebaseKnowledgeIndexAborted(abortSignal: AbortSignal | undefined): void {
  if (abortSignal?.aborted) {
    throw new Error("Codebase knowledge indexing interrupted");
  }
}

function isFileNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
