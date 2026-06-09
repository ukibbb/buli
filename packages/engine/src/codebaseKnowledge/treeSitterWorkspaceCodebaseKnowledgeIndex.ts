import type { Stats } from "node:fs";
import { readFile, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { BuliDiagnosticLogger } from "@buli/contracts";
import {
  createCodebaseSourceContentHash,
  createTreeSitterCodebaseStructureIndexer,
  CURRENT_CODEBASE_STRUCTURE_MAP_VERSION,
  JsonFileCodebaseKnowledgeRepository,
  resolveCodebaseLanguageKindForFilePath,
  type CodebaseIndexedFileMetadata,
  type CodebaseKnowledgeRecord,
  type CodebaseKnowledgeRepository,
  type CodebaseKnowledgeRepositorySnapshot,
  type CodebaseSymbolDefinitionLocatorQuery,
  type CodebaseSymbolDefinitionLocatorResult,
  type CodebaseStructureFileRecord,
  type CodebaseStructureIndexer,
  type JsonFileCodebaseKnowledgeRepositoryDiagnosticEvent,
} from "@buli/codebase-knowledge";
import { logEngineDiagnosticEvent } from "../runtimeDiagnostics.ts";
import { listWorkspaceFiles } from "../tools/workspaceFileSearch.ts";
import { formatWorkspaceDisplayPath, resolveWorkspacePath } from "../tools/workspacePath.ts";

const DEFAULT_CODEBASE_KNOWLEDGE_INDEX_FILE_NAME = "codebase-knowledge.json";

type IndexedWorkspaceFile = {
  absoluteFilePath: string;
  displayPath: string;
  languageId: string;
  stats: Stats;
};

type IndexedWorkspaceFileKnowledge = {
  structureFile: CodebaseStructureFileRecord;
  indexedAtMs: number;
  phaseDurations: IndexedWorkspaceFileKnowledgePhaseDurations;
};

type IndexedWorkspaceFileKnowledgePhaseDurations = Readonly<{
  structureIndexerLoadDurationMs: number;
  fileReadDurationMs: number;
  fileIndexDurationMs: number;
}>;

type ParsedIndexedWorkspaceFile = {
  indexedWorkspaceFile: IndexedWorkspaceFile;
  indexedFileKnowledge: IndexedWorkspaceFileKnowledge;
};

type WorkspaceIndexingCounters = {
  scannedFileCount: number;
  indexableFileCount: number;
  reusedFromStatsFileCount: number;
  hashedFileCount: number;
  reusedAfterHashFileCount: number;
  parsedFileCount: number;
  removedIndexedFileCount: number;
  removedRecordCount: number;
};

type CodebaseKnowledgeMemorySnapshot = Readonly<{
  rssBytes: number;
  heapTotalBytes: number;
  heapUsedBytes: number;
  externalBytes: number;
  arrayBuffersBytes: number;
}>;

type CodebaseKnowledgeMemoryDiagnosticFields = Readonly<{
  memoryBeforeRssBytes: number;
  memoryAfterRssBytes: number;
  memoryDeltaRssBytes: number;
  memoryBeforeHeapTotalBytes: number;
  memoryAfterHeapTotalBytes: number;
  memoryDeltaHeapTotalBytes: number;
  memoryBeforeHeapUsedBytes: number;
  memoryAfterHeapUsedBytes: number;
  memoryDeltaHeapUsedBytes: number;
  memoryBeforeExternalBytes: number;
  memoryAfterExternalBytes: number;
  memoryDeltaExternalBytes: number;
  memoryBeforeArrayBuffersBytes: number;
  memoryAfterArrayBuffersBytes: number;
  memoryDeltaArrayBuffersBytes: number;
}>;

type ChangedFileRefreshAction = "replace_file_records" | "remove_file_records";

type ChangedFileRefreshResult = Readonly<{
  changedFilePath: string;
  displayPath: string;
  action: ChangedFileRefreshAction;
  status: string;
  durationMs: number;
  outputRecordCount: number;
}>;

export type WorkspaceCodebaseKnowledgeIndex = {
  ensureWorkspaceIndexed(input?: { abortSignal?: AbortSignal | undefined }): Promise<void>;
  locateSymbolDefinitions(
    query: CodebaseSymbolDefinitionLocatorQuery,
    input?: { abortSignal?: AbortSignal | undefined },
  ): Promise<CodebaseSymbolDefinitionLocatorResult>;
  refreshChangedFilePaths(input: {
    changedFilePaths: readonly string[];
    abortSignal?: AbortSignal | undefined;
  }): Promise<void>;
};

export class TreeSitterWorkspaceCodebaseKnowledgeIndex implements WorkspaceCodebaseKnowledgeIndex {
  readonly #workspaceRootPath: string;
  readonly #codebaseKnowledgeRepository: CodebaseKnowledgeRepository;
  readonly #createStructureIndexer: () => Promise<CodebaseStructureIndexer>;
  readonly #diagnosticLogger: BuliDiagnosticLogger | undefined;
  #structureIndexerPromise: Promise<CodebaseStructureIndexer> | undefined;
  #workspaceIndexingPromise: Promise<void> | undefined;
  #workspaceIndexUpdatePromise: Promise<void> = Promise.resolve();
  #hasIndexedWorkspace = false;

  constructor(input: {
    workspaceRootPath: string;
    codebaseKnowledgeRepository: CodebaseKnowledgeRepository;
    createStructureIndexer?: (() => Promise<CodebaseStructureIndexer>) | undefined;
    diagnosticLogger?: BuliDiagnosticLogger | undefined;
  }) {
    this.#workspaceRootPath = resolve(input.workspaceRootPath);
    this.#codebaseKnowledgeRepository = input.codebaseKnowledgeRepository;
    this.#createStructureIndexer = input.createStructureIndexer ?? createTreeSitterCodebaseStructureIndexer;
    this.#diagnosticLogger = input.diagnosticLogger;
  }

  async ensureWorkspaceIndexed(input: { abortSignal?: AbortSignal | undefined } = {}): Promise<void> {
    if (this.#hasIndexedWorkspace) {
      return;
    }
    this.#workspaceIndexingPromise ??= this.#runExclusiveWorkspaceIndexUpdate(() => this.#indexWorkspace(input)).then(() => {
      this.#hasIndexedWorkspace = true;
    }).finally(() => {
      this.#workspaceIndexingPromise = undefined;
    });

    await waitForWorkspaceIndexingToFinish({
      workspaceIndexingPromise: this.#workspaceIndexingPromise,
      abortSignal: input.abortSignal,
    });
  }

  async locateSymbolDefinitions(
    query: CodebaseSymbolDefinitionLocatorQuery,
    input: { abortSignal?: AbortSignal | undefined } = {},
  ): Promise<CodebaseSymbolDefinitionLocatorResult> {
    await this.ensureWorkspaceIndexed(input);
    throwIfCodebaseKnowledgeIndexAborted(input.abortSignal);
    return this.#codebaseKnowledgeRepository.locateSymbolDefinitions(query);
  }

  async refreshChangedFilePaths(input: {
    changedFilePaths: readonly string[];
    abortSignal?: AbortSignal | undefined;
  }): Promise<void> {
    const refreshStartedAtMs = performance.now();
    const memoryBefore = readCodebaseKnowledgeMemorySnapshot();
    const uniqueChangedFilePaths = listUniqueChangedFilePaths(input.changedFilePaths);
    const refreshResults: ChangedFileRefreshResult[] = [];
    let skippedGeneratedFileCount = 0;
    await this.#runExclusiveWorkspaceIndexUpdate(async () => {
      for (const changedFilePath of uniqueChangedFilePaths) {
        throwIfCodebaseKnowledgeIndexAborted(input.abortSignal);
        if (isGeneratedCodebaseKnowledgeIndexPath(changedFilePath)) {
          skippedGeneratedFileCount += 1;
          continue;
        }
        refreshResults.push(await this.#refreshChangedFilePath({ changedFilePath, abortSignal: input.abortSignal }));
      }
    });
    logEngineDiagnosticEvent(this.#diagnosticLogger, "codebase_knowledge.changed_files_refresh_completed", {
      workspaceRootPath: this.#workspaceRootPath,
      durationMs: performance.now() - refreshStartedAtMs,
      requestedChangedFileCount: input.changedFilePaths.length,
      uniqueChangedFileCount: uniqueChangedFilePaths.length,
      refreshedFileCount: refreshResults.length,
      skippedGeneratedFileCount,
      replacedFileRecordCount: refreshResults.filter((refreshResult) => refreshResult.action === "replace_file_records").length,
      removedFileRecordCount: refreshResults.filter((refreshResult) => refreshResult.action === "remove_file_records").length,
      outputRecordCount: refreshResults.reduce((recordCount, refreshResult) => recordCount + refreshResult.outputRecordCount, 0),
      ...createCodebaseKnowledgeMemoryDiagnosticFields({ memoryBefore, memoryAfter: readCodebaseKnowledgeMemorySnapshot() }),
    });
  }

  async #indexWorkspace(input: { abortSignal?: AbortSignal | undefined }): Promise<void> {
    const indexingStartedAtMs = performance.now();
    const counters = createWorkspaceIndexingCounters();
    const snapshotReadStartedAtMs = performance.now();
    const existingStartupMetadata = await this.#codebaseKnowledgeRepository.readStartupMetadata();
    const snapshotReadDurationMs = performance.now() - snapshotReadStartedAtMs;
    const existingIndexedFileMetadataByPath = createIndexedFileMetadataMap(existingStartupMetadata.indexedFiles);
    const reusedIndexedFileMetadata: CodebaseIndexedFileMetadata[] = [];
    const parsedIndexedFiles: ParsedIndexedWorkspaceFile[] = [];
    const nextIndexedFileMetadataByPath = new Map<string, CodebaseIndexedFileMetadata>();
    const currentIndexableFilePathKeys = new Set<string>();
    const workspaceScanStartedAtMs = performance.now();
    const workspaceFiles = await listWorkspaceFiles({
      workspaceRootPath: this.#workspaceRootPath,
      searchRootPath: this.#workspaceRootPath,
      ...(input.abortSignal !== undefined ? { abortSignal: input.abortSignal } : {}),
    });
    const workspaceScanDurationMs = performance.now() - workspaceScanStartedAtMs;
    counters.scannedFileCount = workspaceFiles.files.length;

    for (const workspaceFile of workspaceFiles.files) {
      throwIfCodebaseKnowledgeIndexAborted(input.abortSignal);
      const languageId = resolveIndexableLanguageIdForWorkspaceFile(workspaceFile.displayPath);
      if (!languageId) {
        continue;
      }
      counters.indexableFileCount += 1;
      const indexedWorkspaceFile: IndexedWorkspaceFile = {
        absoluteFilePath: workspaceFile.absolutePath,
        displayPath: workspaceFile.displayPath,
        languageId,
        stats: workspaceFile.stats,
      };
      currentIndexableFilePathKeys.add(createFilePathKey(indexedWorkspaceFile.displayPath));

      const reusedIndexedFile = await this.#reuseIndexedFileIfUnchanged({
        indexedWorkspaceFile,
        existingMetadata: existingIndexedFileMetadataByPath.get(createFilePathKey(indexedWorkspaceFile.displayPath)),
        counters,
        abortSignal: input.abortSignal,
      });
      if (reusedIndexedFile) {
        reusedIndexedFileMetadata.push(reusedIndexedFile.metadata);
        nextIndexedFileMetadataByPath.set(createFilePathKey(reusedIndexedFile.metadata.filePath), reusedIndexedFile.metadata);
        continue;
      }

      const indexedFileKnowledge = await this.#indexWorkspaceFile({
        indexedWorkspaceFile,
        abortSignal: input.abortSignal,
      });
      counters.parsedFileCount += 1;
      parsedIndexedFiles.push({ indexedWorkspaceFile, indexedFileKnowledge });
      const indexedFileMetadata = createIndexedFileMetadata({ indexedWorkspaceFile, indexedFileKnowledge });
      nextIndexedFileMetadataByPath.set(createFilePathKey(indexedFileMetadata.filePath), indexedFileMetadata);
    }

    const removedRecordCounts = countMissingIndexedFileRecords({
      indexedFiles: existingStartupMetadata.indexedFiles,
      currentIndexableFilePathKeys,
    });
    counters.removedIndexedFileCount = removedRecordCounts.removedIndexedFileCount;
    counters.removedRecordCount = removedRecordCounts.removedRecordCount;
    const snapshotWriteSkipped = shouldSkipWorkspaceSnapshotWrite({
      existingIndexedFileCount: existingStartupMetadata.indexedFiles.length,
      currentIndexableFilePathKeys,
      counters,
    });

    let recordsLoadDurationMs = 0;
    let snapshotWriteDurationMs = 0;
    if (parsedIndexedFiles.length === 0 && counters.removedIndexedFileCount === 0) {
      const nextStartupMetadata = {
        indexedFiles: [...nextIndexedFileMetadataByPath.values()],
      };
      if (!snapshotWriteSkipped) {
        const snapshotWriteStartedAtMs = performance.now();
        await this.#codebaseKnowledgeRepository.replaceStartupMetadata(nextStartupMetadata);
        snapshotWriteDurationMs = performance.now() - snapshotWriteStartedAtMs;
      }

      logEngineDiagnosticEvent(this.#diagnosticLogger, "codebase_knowledge.workspace_index_completed", {
        workspaceRootPath: this.#workspaceRootPath,
        durationMs: performance.now() - indexingStartedAtMs,
        snapshotReadDurationMs,
        recordsLoadDurationMs,
        recordsLoaded: false,
        workspaceScanDurationMs,
        snapshotWriteDurationMs,
        scannedFileCount: counters.scannedFileCount,
        indexableFileCount: counters.indexableFileCount,
        reusedFromStatsFileCount: counters.reusedFromStatsFileCount,
        hashedFileCount: counters.hashedFileCount,
        reusedAfterHashFileCount: counters.reusedAfterHashFileCount,
        parsedFileCount: counters.parsedFileCount,
        removedIndexedFileCount: counters.removedIndexedFileCount,
        removedRecordCount: counters.removedRecordCount,
        outputIndexedFileCount: nextStartupMetadata.indexedFiles.length,
        outputRecordCount: null,
        snapshotWriteSkipped,
      });
      return;
    }

    const recordsLoadStartedAtMs = performance.now();
    const existingSnapshot = await this.#codebaseKnowledgeRepository.readSnapshot();
    recordsLoadDurationMs = performance.now() - recordsLoadStartedAtMs;
    const existingRecordById = createKnowledgeRecordMap(existingSnapshot.records);
    const existingIndexedRecordIds = createIndexedRecordIdSet(existingSnapshot.indexedFiles);
    const nextRecordById = new Map<string, CodebaseKnowledgeRecord>();

    for (const indexedFileMetadata of reusedIndexedFileMetadata) {
      const existingRecords = listExistingRecordsForIndexedFile({ indexedFileMetadata, existingRecordById });
      if (!existingRecords) {
        throw new Error(`Codebase knowledge records are missing for indexed file ${indexedFileMetadata.filePath}.`);
      }
      addIndexedFileKnowledgeToSnapshotMaps({
        records: existingRecords,
        metadata: indexedFileMetadata,
        nextRecordById,
        nextIndexedFileMetadataByPath,
      });
    }

    for (const parsedIndexedFile of parsedIndexedFiles) {
      addIndexedFileKnowledgeToSnapshotMaps({
        records: parsedIndexedFile.indexedFileKnowledge.structureFile.knowledgeRecords,
        metadata: createIndexedFileMetadata(parsedIndexedFile),
        nextRecordById,
        nextIndexedFileMetadataByPath,
      });
    }

    // Records for files no longer indexable are simply not carried into nextRecordById,
    // so deleted files drop out of the snapshot. Their counts were already tallied above.
    preserveNonIndexedRecords({
      existingSnapshot,
      existingIndexedRecordIds,
      nextRecordById,
    });

    const nextSnapshot: CodebaseKnowledgeRepositorySnapshot = {
      records: [...nextRecordById.values()],
      indexedFiles: [...nextIndexedFileMetadataByPath.values()],
    };

    if (!snapshotWriteSkipped) {
      const snapshotWriteStartedAtMs = performance.now();
      await this.#codebaseKnowledgeRepository.replaceSnapshot(nextSnapshot);
      snapshotWriteDurationMs = performance.now() - snapshotWriteStartedAtMs;
    }

    logEngineDiagnosticEvent(this.#diagnosticLogger, "codebase_knowledge.workspace_index_completed", {
      workspaceRootPath: this.#workspaceRootPath,
      durationMs: performance.now() - indexingStartedAtMs,
      snapshotReadDurationMs,
      recordsLoadDurationMs,
      recordsLoaded: true,
      workspaceScanDurationMs,
      snapshotWriteDurationMs,
      scannedFileCount: counters.scannedFileCount,
      indexableFileCount: counters.indexableFileCount,
      reusedFromStatsFileCount: counters.reusedFromStatsFileCount,
      hashedFileCount: counters.hashedFileCount,
      reusedAfterHashFileCount: counters.reusedAfterHashFileCount,
      parsedFileCount: counters.parsedFileCount,
      removedIndexedFileCount: counters.removedIndexedFileCount,
      removedRecordCount: counters.removedRecordCount,
      outputIndexedFileCount: nextSnapshot.indexedFiles.length,
      outputRecordCount: nextSnapshot.records.length,
      snapshotWriteSkipped,
    });
  }

  async #refreshChangedFilePath(input: {
    changedFilePath: string;
    abortSignal?: AbortSignal | undefined;
  }): Promise<ChangedFileRefreshResult> {
    const refreshStartedAtMs = performance.now();
    const memoryBefore = readCodebaseKnowledgeMemorySnapshot();
    const absoluteFilePath = resolveWorkspacePath({
      workspaceRootPath: this.#workspaceRootPath,
      requestedPath: input.changedFilePath,
    });
    const displayPath = formatWorkspaceDisplayPath(this.#workspaceRootPath, absoluteFilePath);
    const lstatStartedAtMs = performance.now();
    const fileStats = await lstat(absoluteFilePath).catch((error: unknown) => {
      if (isFileNotFoundError(error)) {
        return undefined;
      }
      throw error;
    });
    const lstatDurationMs = performance.now() - lstatStartedAtMs;
    const languageId = resolveIndexableLanguageIdForWorkspaceFile(displayPath);
    if (!fileStats?.isFile() || !languageId) {
      const repositoryRemoveStartedAtMs = performance.now();
      await this.#codebaseKnowledgeRepository.removeFileRecords(displayPath);
      const repositoryRemoveDurationMs = performance.now() - repositoryRemoveStartedAtMs;
      const durationMs = performance.now() - refreshStartedAtMs;
      const refreshStatus = !fileStats ? "file_missing" : fileStats.isFile() ? "unsupported_language" : "not_file";
      const refreshResult: ChangedFileRefreshResult = {
        changedFilePath: input.changedFilePath,
        displayPath,
        action: "remove_file_records",
        status: refreshStatus,
        durationMs,
        outputRecordCount: 0,
      };
      logEngineDiagnosticEvent(this.#diagnosticLogger, "codebase_knowledge.changed_file_refresh_completed", {
        workspaceRootPath: this.#workspaceRootPath,
        changedFilePath: input.changedFilePath,
        displayPath,
        action: refreshResult.action,
        status: refreshStatus,
        durationMs,
        lstatDurationMs,
        structureIndexerLoadDurationMs: 0,
        fileReadDurationMs: 0,
        fileIndexDurationMs: 0,
        repositoryReplaceDurationMs: 0,
        repositoryRemoveDurationMs,
        sourceFileSizeBytes: fileStats?.size ?? 0,
        outputRecordCount: 0,
        ...createCodebaseKnowledgeMemoryDiagnosticFields({ memoryBefore, memoryAfter: readCodebaseKnowledgeMemorySnapshot() }),
      });
      return refreshResult;
    }

    const indexedWorkspaceFile: IndexedWorkspaceFile = {
      absoluteFilePath,
      displayPath,
      languageId,
      stats: fileStats,
    };
    const indexedFileKnowledge = await this.#indexWorkspaceFile({
      indexedWorkspaceFile,
      abortSignal: input.abortSignal,
    });
    const repositoryReplaceStartedAtMs = performance.now();
    await this.#codebaseKnowledgeRepository.replaceFileRecords({
      filePath: displayPath,
      records: indexedFileKnowledge.structureFile.knowledgeRecords,
      indexedFileMetadata: createIndexedFileMetadata({ indexedWorkspaceFile, indexedFileKnowledge }),
    });
    const repositoryReplaceDurationMs = performance.now() - repositoryReplaceStartedAtMs;
    const durationMs = performance.now() - refreshStartedAtMs;
    const outputRecordCount = indexedFileKnowledge.structureFile.knowledgeRecords.length;
    const refreshResult: ChangedFileRefreshResult = {
      changedFilePath: input.changedFilePath,
      displayPath,
      action: "replace_file_records",
      status: "indexed",
      durationMs,
      outputRecordCount,
    };
    logEngineDiagnosticEvent(this.#diagnosticLogger, "codebase_knowledge.changed_file_refresh_completed", {
      workspaceRootPath: this.#workspaceRootPath,
      changedFilePath: input.changedFilePath,
      displayPath,
      action: refreshResult.action,
      status: refreshResult.status,
      durationMs,
      lstatDurationMs,
      structureIndexerLoadDurationMs: indexedFileKnowledge.phaseDurations.structureIndexerLoadDurationMs,
      fileReadDurationMs: indexedFileKnowledge.phaseDurations.fileReadDurationMs,
      fileIndexDurationMs: indexedFileKnowledge.phaseDurations.fileIndexDurationMs,
      repositoryReplaceDurationMs,
      repositoryRemoveDurationMs: 0,
      sourceFileSizeBytes: fileStats.size,
      outputRecordCount,
      ...createCodebaseKnowledgeMemoryDiagnosticFields({ memoryBefore, memoryAfter: readCodebaseKnowledgeMemorySnapshot() }),
    });
    return refreshResult;
  }

  async #reuseIndexedFileIfUnchanged(input: {
    indexedWorkspaceFile: IndexedWorkspaceFile;
    existingMetadata: CodebaseIndexedFileMetadata | undefined;
    counters: WorkspaceIndexingCounters;
    abortSignal?: AbortSignal | undefined;
  }): Promise<{ metadata: CodebaseIndexedFileMetadata } | undefined> {
    if (!input.existingMetadata || input.existingMetadata.languageId !== input.indexedWorkspaceFile.languageId) {
      return undefined;
    }

    if (input.existingMetadata.structureMapVersion !== CURRENT_CODEBASE_STRUCTURE_MAP_VERSION) {
      return undefined;
    }

    if (canReuseIndexedFileFromStats({ indexedWorkspaceFile: input.indexedWorkspaceFile, existingMetadata: input.existingMetadata })) {
      input.counters.reusedFromStatsFileCount += 1;
      return { metadata: input.existingMetadata };
    }

    const fileText = await readFile(input.indexedWorkspaceFile.absoluteFilePath, "utf8");
    throwIfCodebaseKnowledgeIndexAborted(input.abortSignal);
    input.counters.hashedFileCount += 1;
    if (createCodebaseSourceContentHash(fileText) !== input.existingMetadata.contentHash) {
      return undefined;
    }
    input.counters.reusedAfterHashFileCount += 1;

    return {
      metadata: {
        ...input.existingMetadata,
        sourceFileSizeBytes: input.indexedWorkspaceFile.stats.size,
        sourceFileModifiedAtMs: input.indexedWorkspaceFile.stats.mtimeMs,
      },
    };
  }

  async #indexWorkspaceFile(input: {
    indexedWorkspaceFile: IndexedWorkspaceFile;
    abortSignal?: AbortSignal | undefined;
  }): Promise<IndexedWorkspaceFileKnowledge> {
    const structureIndexerLoadStartedAtMs = performance.now();
    const structureIndexer = await this.#loadStructureIndexer();
    const structureIndexerLoadDurationMs = performance.now() - structureIndexerLoadStartedAtMs;
    throwIfCodebaseKnowledgeIndexAborted(input.abortSignal);
    const fileReadStartedAtMs = performance.now();
    const fileText = await readFile(input.indexedWorkspaceFile.absoluteFilePath, "utf8");
    const fileReadDurationMs = performance.now() - fileReadStartedAtMs;
    throwIfCodebaseKnowledgeIndexAborted(input.abortSignal);
    const indexedAtMs = Date.now();
    const fileIndexStartedAtMs = performance.now();
    const indexedFile = await structureIndexer.indexFile({
      filePath: input.indexedWorkspaceFile.displayPath,
      fileText,
      indexedAtMs,
    });
    const fileIndexDurationMs = performance.now() - fileIndexStartedAtMs;
    return {
      structureFile: indexedFile,
      indexedAtMs,
      phaseDurations: {
        structureIndexerLoadDurationMs,
        fileReadDurationMs,
        fileIndexDurationMs,
      },
    };
  }

  #loadStructureIndexer(): Promise<CodebaseStructureIndexer> {
    this.#structureIndexerPromise ??= this.#createStructureIndexer();
    return this.#structureIndexerPromise;
  }

  #runExclusiveWorkspaceIndexUpdate<IndexUpdateResult>(operation: () => Promise<IndexUpdateResult>): Promise<IndexUpdateResult> {
    const indexUpdatePromise = this.#workspaceIndexUpdatePromise.then(operation, operation);
    this.#workspaceIndexUpdatePromise = indexUpdatePromise.then(
      () => undefined,
      () => undefined,
    );
    return indexUpdatePromise;
  }
}

export function createDefaultWorkspaceCodebaseKnowledgeIndex(input: {
  workspaceRootPath: string;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): WorkspaceCodebaseKnowledgeIndex {
  return new TreeSitterWorkspaceCodebaseKnowledgeIndex({
    workspaceRootPath: input.workspaceRootPath,
    codebaseKnowledgeRepository: new JsonFileCodebaseKnowledgeRepository({
      indexFilePath: defaultWorkspaceCodebaseKnowledgeIndexFilePath({ workspaceRootPath: input.workspaceRootPath }),
      ...(input.diagnosticLogger
        ? { diagnosticReporter: (diagnosticEvent) => logJsonFileCodebaseKnowledgeRepositoryDiagnosticEvent(input.diagnosticLogger, diagnosticEvent) }
        : {}),
    }),
    ...(input.diagnosticLogger ? { diagnosticLogger: input.diagnosticLogger } : {}),
  });
}

function logJsonFileCodebaseKnowledgeRepositoryDiagnosticEvent(
  diagnosticLogger: BuliDiagnosticLogger | undefined,
  diagnosticEvent: JsonFileCodebaseKnowledgeRepositoryDiagnosticEvent,
): void {
  logEngineDiagnosticEvent(diagnosticLogger, "codebase_knowledge.repository_step_completed", {
    operationName: diagnosticEvent.operationName,
    stepName: diagnosticEvent.stepName,
    storedFileRole: diagnosticEvent.storedFileRole,
    operationStatus: diagnosticEvent.operationStatus,
    durationMs: diagnosticEvent.durationMs,
    memoryBeforeRssBytes: diagnosticEvent.memoryBeforeRssBytes,
    memoryAfterRssBytes: diagnosticEvent.memoryAfterRssBytes,
    memoryDeltaRssBytes: diagnosticEvent.memoryDeltaRssBytes,
    memoryBeforeHeapTotalBytes: diagnosticEvent.memoryBeforeHeapTotalBytes,
    memoryAfterHeapTotalBytes: diagnosticEvent.memoryAfterHeapTotalBytes,
    memoryDeltaHeapTotalBytes: diagnosticEvent.memoryDeltaHeapTotalBytes,
    memoryBeforeHeapUsedBytes: diagnosticEvent.memoryBeforeHeapUsedBytes,
    memoryAfterHeapUsedBytes: diagnosticEvent.memoryAfterHeapUsedBytes,
    memoryDeltaHeapUsedBytes: diagnosticEvent.memoryDeltaHeapUsedBytes,
    memoryBeforeExternalBytes: diagnosticEvent.memoryBeforeExternalBytes,
    memoryAfterExternalBytes: diagnosticEvent.memoryAfterExternalBytes,
    memoryDeltaExternalBytes: diagnosticEvent.memoryDeltaExternalBytes,
    memoryBeforeArrayBuffersBytes: diagnosticEvent.memoryBeforeArrayBuffersBytes,
    memoryAfterArrayBuffersBytes: diagnosticEvent.memoryAfterArrayBuffersBytes,
    memoryDeltaArrayBuffersBytes: diagnosticEvent.memoryDeltaArrayBuffersBytes,
    ...(diagnosticEvent.fileTextByteLength !== undefined ? { fileTextByteLength: diagnosticEvent.fileTextByteLength } : {}),
    ...(diagnosticEvent.serializedJsonByteLength !== undefined ? { serializedJsonByteLength: diagnosticEvent.serializedJsonByteLength } : {}),
    ...(diagnosticEvent.recordCount !== undefined ? { recordCount: diagnosticEvent.recordCount } : {}),
    ...(diagnosticEvent.indexedFileCount !== undefined ? { indexedFileCount: diagnosticEvent.indexedFileCount } : {}),
  });
}

function readCodebaseKnowledgeMemorySnapshot(): CodebaseKnowledgeMemorySnapshot {
  const memoryUsage = process.memoryUsage();
  return {
    rssBytes: memoryUsage.rss,
    heapTotalBytes: memoryUsage.heapTotal,
    heapUsedBytes: memoryUsage.heapUsed,
    externalBytes: memoryUsage.external,
    arrayBuffersBytes: memoryUsage.arrayBuffers,
  };
}

function createCodebaseKnowledgeMemoryDiagnosticFields(input: {
  memoryBefore: CodebaseKnowledgeMemorySnapshot;
  memoryAfter: CodebaseKnowledgeMemorySnapshot;
}): CodebaseKnowledgeMemoryDiagnosticFields {
  return {
    memoryBeforeRssBytes: input.memoryBefore.rssBytes,
    memoryAfterRssBytes: input.memoryAfter.rssBytes,
    memoryDeltaRssBytes: input.memoryAfter.rssBytes - input.memoryBefore.rssBytes,
    memoryBeforeHeapTotalBytes: input.memoryBefore.heapTotalBytes,
    memoryAfterHeapTotalBytes: input.memoryAfter.heapTotalBytes,
    memoryDeltaHeapTotalBytes: input.memoryAfter.heapTotalBytes - input.memoryBefore.heapTotalBytes,
    memoryBeforeHeapUsedBytes: input.memoryBefore.heapUsedBytes,
    memoryAfterHeapUsedBytes: input.memoryAfter.heapUsedBytes,
    memoryDeltaHeapUsedBytes: input.memoryAfter.heapUsedBytes - input.memoryBefore.heapUsedBytes,
    memoryBeforeExternalBytes: input.memoryBefore.externalBytes,
    memoryAfterExternalBytes: input.memoryAfter.externalBytes,
    memoryDeltaExternalBytes: input.memoryAfter.externalBytes - input.memoryBefore.externalBytes,
    memoryBeforeArrayBuffersBytes: input.memoryBefore.arrayBuffersBytes,
    memoryAfterArrayBuffersBytes: input.memoryAfter.arrayBuffersBytes,
    memoryDeltaArrayBuffersBytes: input.memoryAfter.arrayBuffersBytes - input.memoryBefore.arrayBuffersBytes,
  };
}

export function defaultWorkspaceCodebaseKnowledgeIndexFilePath(input: { workspaceRootPath: string }): string {
  return join(input.workspaceRootPath, ".buli", "index", DEFAULT_CODEBASE_KNOWLEDGE_INDEX_FILE_NAME);
}

function resolveIndexableLanguageIdForWorkspaceFile(displayPath: string): string | undefined {
  if (isGeneratedCodebaseKnowledgeIndexPath(displayPath)) {
    return undefined;
  }
  return resolveCodebaseLanguageKindForFilePath(displayPath);
}

function createKnowledgeRecordMap(records: readonly CodebaseKnowledgeRecord[]): ReadonlyMap<string, CodebaseKnowledgeRecord> {
  return new Map(records.map((record) => [record.recordId, record]));
}

function createIndexedFileMetadataMap(
  indexedFiles: readonly CodebaseIndexedFileMetadata[],
): ReadonlyMap<string, CodebaseIndexedFileMetadata> {
  return new Map(indexedFiles.map((indexedFileMetadata) => [createFilePathKey(indexedFileMetadata.filePath), indexedFileMetadata]));
}

function createIndexedRecordIdSet(indexedFiles: readonly CodebaseIndexedFileMetadata[]): ReadonlySet<string> {
  return new Set(indexedFiles.flatMap((indexedFileMetadata) => indexedFileMetadata.recordIds));
}

function createWorkspaceIndexingCounters(): WorkspaceIndexingCounters {
  return {
    scannedFileCount: 0,
    indexableFileCount: 0,
    reusedFromStatsFileCount: 0,
    hashedFileCount: 0,
    reusedAfterHashFileCount: 0,
    parsedFileCount: 0,
    removedIndexedFileCount: 0,
    removedRecordCount: 0,
  };
}

function listExistingRecordsForIndexedFile(input: {
  indexedFileMetadata: CodebaseIndexedFileMetadata;
  existingRecordById: ReadonlyMap<string, CodebaseKnowledgeRecord>;
}): readonly CodebaseKnowledgeRecord[] | undefined {
  const existingRecords: CodebaseKnowledgeRecord[] = [];
  for (const recordId of input.indexedFileMetadata.recordIds) {
    const existingRecord = input.existingRecordById.get(recordId);
    if (!existingRecord) {
      return undefined;
    }
    existingRecords.push(existingRecord);
  }
  return existingRecords;
}

function canReuseIndexedFileFromStats(input: {
  indexedWorkspaceFile: IndexedWorkspaceFile;
  existingMetadata: CodebaseIndexedFileMetadata;
}): boolean {
  return input.indexedWorkspaceFile.stats.size === input.existingMetadata.sourceFileSizeBytes &&
    input.indexedWorkspaceFile.stats.mtimeMs === input.existingMetadata.sourceFileModifiedAtMs;
}

function addIndexedFileKnowledgeToSnapshotMaps(input: {
  records: readonly CodebaseKnowledgeRecord[];
  metadata: CodebaseIndexedFileMetadata;
  nextRecordById: Map<string, CodebaseKnowledgeRecord>;
  nextIndexedFileMetadataByPath: Map<string, CodebaseIndexedFileMetadata>;
}): void {
  for (const record of input.records) {
    input.nextRecordById.set(record.recordId, record);
  }
  input.nextIndexedFileMetadataByPath.set(createFilePathKey(input.metadata.filePath), input.metadata);
}

function createIndexedFileMetadata(input: {
  indexedWorkspaceFile: IndexedWorkspaceFile;
  indexedFileKnowledge: IndexedWorkspaceFileKnowledge;
}): CodebaseIndexedFileMetadata {
  return {
    filePath: input.indexedWorkspaceFile.displayPath,
    languageId: input.indexedFileKnowledge.structureFile.languageId,
    sourceFileSizeBytes: input.indexedWorkspaceFile.stats.size,
    sourceFileModifiedAtMs: input.indexedWorkspaceFile.stats.mtimeMs,
    contentHash: input.indexedFileKnowledge.structureFile.contentHash,
    indexedAtMs: input.indexedFileKnowledge.indexedAtMs,
    recordIds: input.indexedFileKnowledge.structureFile.knowledgeRecords.map((record) => record.recordId),
    structureMapVersion: CURRENT_CODEBASE_STRUCTURE_MAP_VERSION,
  };
}

function countMissingIndexedFileRecords(input: {
  indexedFiles: readonly CodebaseIndexedFileMetadata[];
  currentIndexableFilePathKeys: ReadonlySet<string>;
}): { removedIndexedFileCount: number; removedRecordCount: number } {
  let removedIndexedFileCount = 0;
  let removedRecordCount = 0;
  for (const indexedFileMetadata of input.indexedFiles) {
    if (input.currentIndexableFilePathKeys.has(createFilePathKey(indexedFileMetadata.filePath))) {
      continue;
    }
    removedIndexedFileCount += 1;
    removedRecordCount += indexedFileMetadata.recordIds.length;
  }
  return { removedIndexedFileCount, removedRecordCount };
}

function preserveNonIndexedRecords(input: {
  existingSnapshot: CodebaseKnowledgeRepositorySnapshot;
  existingIndexedRecordIds: ReadonlySet<string>;
  nextRecordById: Map<string, CodebaseKnowledgeRecord>;
}): void {
  for (const existingRecord of input.existingSnapshot.records) {
    if (input.existingIndexedRecordIds.has(existingRecord.recordId) || input.nextRecordById.has(existingRecord.recordId)) {
      continue;
    }
    input.nextRecordById.set(existingRecord.recordId, existingRecord);
  }
}

function shouldSkipWorkspaceSnapshotWrite(input: {
  existingIndexedFileCount: number;
  currentIndexableFilePathKeys: ReadonlySet<string>;
  counters: WorkspaceIndexingCounters;
}): boolean {
  return input.counters.parsedFileCount === 0 &&
    input.counters.hashedFileCount === 0 &&
    input.counters.removedIndexedFileCount === 0 &&
    input.existingIndexedFileCount === input.currentIndexableFilePathKeys.size;
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
  return isGeneratedCodebaseKnowledgeIndexFilePath({
    normalizedFilePath,
    generatedFilePath: ".buli/index/codebase-knowledge.json",
  }) || isGeneratedCodebaseKnowledgeIndexFilePath({
    normalizedFilePath,
    generatedFilePath: ".buli/index/codebase-knowledge.records.json",
  });
}

function isGeneratedCodebaseKnowledgeIndexFilePath(input: { normalizedFilePath: string; generatedFilePath: string }): boolean {
  return input.normalizedFilePath === input.generatedFilePath ||
    (input.normalizedFilePath.startsWith(`${input.generatedFilePath}.`) && input.normalizedFilePath.endsWith(".tmp"));
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

function createFilePathKey(filePath: string): string {
  return normalizeWorkspacePath(filePath);
}

function throwIfCodebaseKnowledgeIndexAborted(abortSignal: AbortSignal | undefined): void {
  if (abortSignal?.aborted) {
    throw new Error("Codebase knowledge indexing interrupted");
  }
}

function isFileNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
