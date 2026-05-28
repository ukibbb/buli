import { expect, test } from "bun:test";
import { mkdir, mkdtemp, lstat, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { BuliDiagnosticLogEvent } from "@buli/contracts";
import {
  createCodebaseSourceContentHash,
  CURRENT_CODEBASE_STRUCTURE_MAP_VERSION,
  InMemoryCodebaseKnowledgeRepository,
  resolveCodebaseLanguageKindForFilePath,
  type CodebaseFileKnowledgeRecord,
  type CodebaseKnowledgeRepositorySnapshot,
  type CodebaseKnowledgeRepositoryStartupMetadata,
  type CodebaseStructureFileRecord,
  type CodebaseStructureIndexer,
} from "@buli/codebase-knowledge";
import { TreeSitterWorkspaceCodebaseKnowledgeIndex } from "../src/index.ts";

class RecordingCodebaseStructureIndexer implements CodebaseStructureIndexer {
  readonly indexedFilePaths: string[] = [];

  async indexFile(input: { filePath: string; fileText: string; indexedAtMs?: number | undefined }): Promise<CodebaseStructureFileRecord> {
    this.indexedFilePaths.push(input.filePath);
    const languageId = resolveCodebaseLanguageKindForFilePath(input.filePath);
    if (!languageId) {
      throw new Error(`Unsupported test file path: ${input.filePath}`);
    }
    const contentHash = createCodebaseSourceContentHash(input.fileText);
    const fileRecord: CodebaseFileKnowledgeRecord = {
      recordId: `file:${input.filePath}`,
      recordKind: "file",
      title: input.filePath,
      summary: `${input.filePath} test record`,
      tags: [languageId],
      evidenceRanges: [
        {
          filePath: input.filePath,
          startLineNumber: 1,
          endLineNumber: countSourceLines(input.fileText),
          contentHash,
        },
      ],
      updatedAtMs: input.indexedAtMs ?? 1,
      filePath: input.filePath,
      languageId,
      importedModuleSpecifiers: [],
      importDeclarations: [],
      exportedSymbolNames: [],
      exportDeclarations: [],
      symbolNames: [],
    };

    return {
      filePath: input.filePath,
      languageId,
      contentHash,
      hasSyntaxError: false,
      importedModuleSpecifiers: [],
      importDeclarations: [],
      exportedSymbolNames: [],
      exportDeclarations: [],
      symbols: [],
      knowledgeRecords: [fileRecord],
    };
  }
}

class RecordingCodebaseKnowledgeRepository extends InMemoryCodebaseKnowledgeRepository {
  replaceSnapshotCallCount = 0;
  replaceStartupMetadataCallCount = 0;
  readSnapshotCallCount = 0;

  override async readSnapshot(): Promise<CodebaseKnowledgeRepositorySnapshot> {
    this.readSnapshotCallCount += 1;
    return super.readSnapshot();
  }

  override async replaceStartupMetadata(startupMetadata: CodebaseKnowledgeRepositoryStartupMetadata): Promise<void> {
    this.replaceStartupMetadataCallCount += 1;
    await super.replaceStartupMetadata(startupMetadata);
  }

  override async replaceSnapshot(snapshot: CodebaseKnowledgeRepositorySnapshot): Promise<void> {
    this.replaceSnapshotCallCount += 1;
    await super.replaceSnapshot(snapshot);
  }
}

test("TreeSitterWorkspaceCodebaseKnowledgeIndex skips unchanged files on restart", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-incremental-index-unchanged-"));
  await writeWorkspaceFile(workspaceRootPath, "src/runtime.ts", "export function runRuntime() {}\n");
  const repository = new RecordingCodebaseKnowledgeRepository();
  const firstStructureIndexer = new RecordingCodebaseStructureIndexer();
  const firstDiagnosticEvents: BuliDiagnosticLogEvent[] = [];
  await createWorkspaceCodebaseKnowledgeIndex({
    workspaceRootPath,
    repository,
    structureIndexer: firstStructureIndexer,
    diagnosticEvents: firstDiagnosticEvents,
  })
    .ensureWorkspaceIndexed();

  const secondStructureIndexer = new RecordingCodebaseStructureIndexer();
  const secondDiagnosticEvents: BuliDiagnosticLogEvent[] = [];
  await createWorkspaceCodebaseKnowledgeIndex({
    workspaceRootPath,
    repository,
    structureIndexer: secondStructureIndexer,
    diagnosticEvents: secondDiagnosticEvents,
  })
    .ensureWorkspaceIndexed();

  expect(firstStructureIndexer.indexedFilePaths).toEqual(["src/runtime.ts"]);
  expect(secondStructureIndexer.indexedFilePaths).toEqual([]);
  expect(repository.replaceSnapshotCallCount).toBe(1);
  expect(repository.readSnapshotCallCount).toBe(1);
  expect(readWorkspaceIndexCompletedDiagnostic(firstDiagnosticEvents).fields).toEqual(expect.objectContaining({
    parsedFileCount: 1,
    recordsLoaded: true,
    snapshotWriteSkipped: false,
  }));
  expect(readWorkspaceIndexCompletedDiagnostic(secondDiagnosticEvents).fields).toEqual(expect.objectContaining({
    parsedFileCount: 0,
    recordsLoadDurationMs: 0,
    recordsLoaded: false,
    reusedFromStatsFileCount: 1,
    snapshotWriteDurationMs: 0,
    snapshotWriteSkipped: true,
  }));
});

test("TreeSitterWorkspaceCodebaseKnowledgeIndex reparses only modified files on restart", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-incremental-index-modified-"));
  await writeWorkspaceFile(workspaceRootPath, "src/first.ts", "export function first() {}\n");
  await writeWorkspaceFile(workspaceRootPath, "src/second.ts", "export function second() {}\n");
  const repository = new RecordingCodebaseKnowledgeRepository();
  const firstStructureIndexer = new RecordingCodebaseStructureIndexer();
  await createWorkspaceCodebaseKnowledgeIndex({ workspaceRootPath, repository, structureIndexer: firstStructureIndexer })
    .ensureWorkspaceIndexed();

  await writeWorkspaceFile(workspaceRootPath, "src/first.ts", "export function first() { return 1; }\n");
  const secondStructureIndexer = new RecordingCodebaseStructureIndexer();
  const secondDiagnosticEvents: BuliDiagnosticLogEvent[] = [];
  await createWorkspaceCodebaseKnowledgeIndex({
    workspaceRootPath,
    repository,
    structureIndexer: secondStructureIndexer,
    diagnosticEvents: secondDiagnosticEvents,
  })
    .ensureWorkspaceIndexed();

  expect(firstStructureIndexer.indexedFilePaths).toEqual(["src/first.ts", "src/second.ts"]);
  expect(secondStructureIndexer.indexedFilePaths).toEqual(["src/first.ts"]);
  expect(repository.replaceSnapshotCallCount).toBe(2);
  expect(readWorkspaceIndexCompletedDiagnostic(secondDiagnosticEvents).fields).toEqual(expect.objectContaining({
    parsedFileCount: 1,
    reusedFromStatsFileCount: 1,
    snapshotWriteSkipped: false,
  }));
});

test("TreeSitterWorkspaceCodebaseKnowledgeIndex hashes but does not reparse mtime-only changes", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-incremental-index-mtime-"));
  const runtimeFilePath = join(workspaceRootPath, "src", "runtime.ts");
  await writeWorkspaceFile(workspaceRootPath, "src/runtime.ts", "export function runRuntime() {}\n");
  const repository = new RecordingCodebaseKnowledgeRepository();
  const firstStructureIndexer = new RecordingCodebaseStructureIndexer();
  await createWorkspaceCodebaseKnowledgeIndex({ workspaceRootPath, repository, structureIndexer: firstStructureIndexer })
    .ensureWorkspaceIndexed();
  const previouslyIndexedAtMs = (await repository.readSnapshot()).indexedFiles[0]?.indexedAtMs;
  const readSnapshotCallCountBeforeSecondIndex = repository.readSnapshotCallCount;

  const changedModifiedTime = new Date(Date.now() + 10_000);
  await utimes(runtimeFilePath, changedModifiedTime, changedModifiedTime);
  const changedFileStats = await lstat(runtimeFilePath);
  const secondStructureIndexer = new RecordingCodebaseStructureIndexer();
  const secondDiagnosticEvents: BuliDiagnosticLogEvent[] = [];
  await createWorkspaceCodebaseKnowledgeIndex({
    workspaceRootPath,
    repository,
    structureIndexer: secondStructureIndexer,
    diagnosticEvents: secondDiagnosticEvents,
  })
    .ensureWorkspaceIndexed();
  expect(repository.readSnapshotCallCount).toBe(readSnapshotCallCountBeforeSecondIndex);

  const indexedFileMetadata = (await repository.readSnapshot()).indexedFiles[0];
  expect(firstStructureIndexer.indexedFilePaths).toEqual(["src/runtime.ts"]);
  expect(secondStructureIndexer.indexedFilePaths).toEqual([]);
  expect(repository.replaceSnapshotCallCount).toBe(1);
  expect(repository.replaceStartupMetadataCallCount).toBe(1);
  expect(indexedFileMetadata?.sourceFileModifiedAtMs).toBe(changedFileStats.mtimeMs);
  expect(indexedFileMetadata?.indexedAtMs).toBe(previouslyIndexedAtMs);
  expect(readWorkspaceIndexCompletedDiagnostic(secondDiagnosticEvents).fields).toEqual(expect.objectContaining({
    hashedFileCount: 1,
    reusedAfterHashFileCount: 1,
    parsedFileCount: 0,
    recordsLoadDurationMs: 0,
    recordsLoaded: false,
    snapshotWriteSkipped: false,
  }));
});

test("TreeSitterWorkspaceCodebaseKnowledgeIndex reparses files indexed with an older structure map version", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-incremental-index-map-version-"));
  const sourceFileText = "export function runRuntime() {}\n";
  await writeWorkspaceFile(workspaceRootPath, "src/runtime.ts", sourceFileText);
  const runtimeFileStats = await lstat(join(workspaceRootPath, "src", "runtime.ts"));
  const repository = new RecordingCodebaseKnowledgeRepository();
  const oldContentHash = createCodebaseSourceContentHash(sourceFileText);
  const oldFileRecord: CodebaseFileKnowledgeRecord = {
    recordId: "file:src/runtime.ts",
    recordKind: "file",
    title: "src/runtime.ts",
    summary: "old shallow map",
    tags: ["typescript"],
    evidenceRanges: [
      {
        filePath: "src/runtime.ts",
        startLineNumber: 1,
        endLineNumber: 1,
        contentHash: oldContentHash,
      },
    ],
    updatedAtMs: 1,
    filePath: "src/runtime.ts",
    languageId: "typescript",
    importedModuleSpecifiers: [],
    exportedSymbolNames: ["runRuntime"],
    symbolNames: ["runRuntime"],
  };
  await repository.replaceSnapshot({
    records: [oldFileRecord],
    indexedFiles: [
      {
        filePath: "src/runtime.ts",
        languageId: "typescript",
        sourceFileSizeBytes: runtimeFileStats.size,
        sourceFileModifiedAtMs: runtimeFileStats.mtimeMs,
        contentHash: oldContentHash,
        indexedAtMs: 1,
        recordIds: [oldFileRecord.recordId],
      },
    ],
  });
  repository.replaceSnapshotCallCount = 0;

  const structureIndexer = new RecordingCodebaseStructureIndexer();
  await createWorkspaceCodebaseKnowledgeIndex({ workspaceRootPath, repository, structureIndexer })
    .ensureWorkspaceIndexed();

  const currentIndexedFileMetadata = (await repository.readSnapshot()).indexedFiles[0];
  expect(structureIndexer.indexedFilePaths).toEqual(["src/runtime.ts"]);
  expect(repository.replaceSnapshotCallCount).toBe(1);
  expect(currentIndexedFileMetadata?.structureMapVersion).toBe(CURRENT_CODEBASE_STRUCTURE_MAP_VERSION);
});

test("TreeSitterWorkspaceCodebaseKnowledgeIndex removes deleted indexed files on restart", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-incremental-index-deleted-"));
  await writeWorkspaceFile(workspaceRootPath, "src/runtime.ts", "export function runRuntime() {}\n");
  const repository = new RecordingCodebaseKnowledgeRepository();
  const firstStructureIndexer = new RecordingCodebaseStructureIndexer();
  await createWorkspaceCodebaseKnowledgeIndex({ workspaceRootPath, repository, structureIndexer: firstStructureIndexer })
    .ensureWorkspaceIndexed();

  await rm(join(workspaceRootPath, "src", "runtime.ts"));
  const secondStructureIndexer = new RecordingCodebaseStructureIndexer();
  const secondDiagnosticEvents: BuliDiagnosticLogEvent[] = [];
  await createWorkspaceCodebaseKnowledgeIndex({
    workspaceRootPath,
    repository,
    structureIndexer: secondStructureIndexer,
    diagnosticEvents: secondDiagnosticEvents,
  })
    .ensureWorkspaceIndexed();

  const snapshot = await repository.readSnapshot();
  expect(firstStructureIndexer.indexedFilePaths).toEqual(["src/runtime.ts"]);
  expect(secondStructureIndexer.indexedFilePaths).toEqual([]);
  expect(repository.replaceSnapshotCallCount).toBe(2);
  expect(snapshot.records).toEqual([]);
  expect(snapshot.indexedFiles).toEqual([]);
  expect(readWorkspaceIndexCompletedDiagnostic(secondDiagnosticEvents).fields).toEqual(expect.objectContaining({
    removedIndexedFileCount: 1,
    removedRecordCount: 1,
    snapshotWriteSkipped: false,
  }));
});

function createWorkspaceCodebaseKnowledgeIndex(input: {
  workspaceRootPath: string;
  repository: InMemoryCodebaseKnowledgeRepository;
  structureIndexer: CodebaseStructureIndexer;
  diagnosticEvents?: BuliDiagnosticLogEvent[] | undefined;
}): TreeSitterWorkspaceCodebaseKnowledgeIndex {
  return new TreeSitterWorkspaceCodebaseKnowledgeIndex({
    workspaceRootPath: input.workspaceRootPath,
    codebaseKnowledgeRepository: input.repository,
    createStructureIndexer: async () => input.structureIndexer,
    ...(input.diagnosticEvents ? { diagnosticLogger: (event) => input.diagnosticEvents?.push(event) } : {}),
  });
}

function readWorkspaceIndexCompletedDiagnostic(diagnosticEvents: readonly BuliDiagnosticLogEvent[]): BuliDiagnosticLogEvent {
  const diagnosticEvent = diagnosticEvents.find((event) =>
    event.subsystem === "engine" && event.eventName === "codebase_knowledge.workspace_index_completed"
  );
  if (!diagnosticEvent) {
    throw new Error("Expected codebase knowledge workspace index completion diagnostic event.");
  }
  return diagnosticEvent;
}

async function writeWorkspaceFile(workspaceRootPath: string, displayPath: string, fileText: string): Promise<void> {
  const absoluteFilePath = join(workspaceRootPath, displayPath);
  await mkdir(dirname(absoluteFilePath), { recursive: true });
  await writeFile(absoluteFilePath, fileText, "utf8");
}

function countSourceLines(fileText: string): number {
  return fileText.length === 0 ? 1 : fileText.split(/\r\n|\r|\n/).length;
}
