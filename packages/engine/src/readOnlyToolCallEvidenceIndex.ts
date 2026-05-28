import {
  listModelVisibleConversationSessionEntries,
  type ConversationSessionEntry,
  type GlobToolCallRequest,
  type GrepToolCallRequest,
  type QueryCodebaseKnowledgeToolCallRequest,
  type ReadManyToolCallTarget,
  type ReadToolCallRequest,
  type SearchManyToolCallSearch,
  type ToolCallDetail,
  type ToolCallGlobDetail,
  type ToolCallGrepDetail,
  type ToolCallQueryCodebaseKnowledgeDetail,
  type ToolCallReadDetail,
  type WorkspaceInspectionToolCallRequest,
} from "@buli/contracts";
import { escapeModelFacingXmlText } from "./modelFacingXmlEscaping.ts";

const DUPLICATE_READ_ONLY_TOOL_RESULT_TAG = "duplicate_read_only_tool_result";
const DEFAULT_EVIDENCE_LEDGER_LINE_LIMIT = 20;

type ToolCallConversationSessionEntry = Extract<ConversationSessionEntry, { entryKind: "tool_call" }>;
type CompletedToolResultConversationSessionEntry = Extract<ConversationSessionEntry, { entryKind: "completed_tool_result" }>;
type ToolResultConversationSessionEntry = Extract<
  ConversationSessionEntry,
  { entryKind: "completed_tool_result" | "failed_tool_result" | "denied_tool_result" }
>;
type WorkspacePatchConversationSessionEntry = Extract<ConversationSessionEntry, { entryKind: "workspace_patch" }>;

type ToolResultMutationEvidence =
  | {
    readonly mutationKind: "none";
  }
  | {
    readonly mutationKind: "known_paths";
    readonly changedFilePaths: readonly string[];
  }
  | {
    readonly mutationKind: "unknown_paths";
  };

export type ReusableReadToolEvidence = {
  readonly evidenceKind: "read";
  readonly evidenceKey: string;
  readonly priorToolCallId: string;
  readonly toolCallDetail: ToolCallReadDetail;
  readonly readFilePath: string;
  readonly evidenceDescription: string;
};

export type ReusableSearchToolEvidence = {
  readonly evidenceKind: "search";
  readonly evidenceKey: string;
  readonly priorToolCallId: string;
  readonly toolCallDetail: ToolCallGlobDetail | ToolCallGrepDetail;
  readonly evidenceDescription: string;
};

export type ReusableCodebaseKnowledgeQueryEvidence = {
  readonly evidenceKind: "codebase_knowledge_query";
  readonly evidenceKey: string;
  readonly priorToolCallId: string;
  readonly toolCallDetail: ToolCallQueryCodebaseKnowledgeDetail;
  readonly evidenceDescription: string;
};

export type ReusableReadOnlyToolEvidence =
  | ReusableReadToolEvidence
  | ReusableSearchToolEvidence
  | ReusableCodebaseKnowledgeQueryEvidence;

export class ReadOnlyToolCallEvidenceIndex {
  private readonly readEvidenceByKey: ReadonlyMap<string, ReusableReadToolEvidence>;
  private readonly searchEvidenceByKey: ReadonlyMap<string, ReusableSearchToolEvidence>;
  private readonly codebaseKnowledgeQueryEvidenceByKey: ReadonlyMap<string, ReusableCodebaseKnowledgeQueryEvidence>;

  constructor(input?: {
    readEvidenceByKey?: ReadonlyMap<string, ReusableReadToolEvidence> | undefined;
    searchEvidenceByKey?: ReadonlyMap<string, ReusableSearchToolEvidence> | undefined;
    codebaseKnowledgeQueryEvidenceByKey?: ReadonlyMap<string, ReusableCodebaseKnowledgeQueryEvidence> | undefined;
  }) {
    this.readEvidenceByKey = input?.readEvidenceByKey ?? new Map();
    this.searchEvidenceByKey = input?.searchEvidenceByKey ?? new Map();
    this.codebaseKnowledgeQueryEvidenceByKey = input?.codebaseKnowledgeQueryEvidenceByKey ?? new Map();
  }

  findReusableToolCallEvidence(
    toolCallRequest: WorkspaceInspectionToolCallRequest,
  ): ReusableReadOnlyToolEvidence | undefined {
    if (toolCallRequest.toolName === "read") {
      return this.findReusableReadToolCallEvidence(toolCallRequest);
    }

    if (toolCallRequest.toolName === "glob") {
      return this.findReusableGlobToolCallEvidence(toolCallRequest);
    }

    if (toolCallRequest.toolName === "grep") {
      return this.findReusableGrepToolCallEvidence(toolCallRequest);
    }

    if (toolCallRequest.toolName === "query_codebase_knowledge") {
      return this.findReusableQueryCodebaseKnowledgeToolCallEvidence(toolCallRequest);
    }

    return undefined;
  }

  findReusableReadToolCallEvidence(readToolCallRequest: ReadToolCallRequest): ReusableReadToolEvidence | undefined {
    return this.readEvidenceByKey.get(createReadToolCallEvidenceKey(readToolCallRequest));
  }

  findReusableReadManyTargetEvidence(readManyToolCallTarget: ReadManyToolCallTarget): ReusableReadToolEvidence | undefined {
    return this.readEvidenceByKey.get(createReadManyTargetEvidenceKey(readManyToolCallTarget));
  }

  findReusableGlobToolCallEvidence(globToolCallRequest: GlobToolCallRequest): ReusableSearchToolEvidence | undefined {
    return this.searchEvidenceByKey.get(createGlobToolCallEvidenceKey(globToolCallRequest));
  }

  findReusableGrepToolCallEvidence(grepToolCallRequest: GrepToolCallRequest): ReusableSearchToolEvidence | undefined {
    return this.searchEvidenceByKey.get(createGrepToolCallEvidenceKey(grepToolCallRequest));
  }

  findReusableSearchManySearchEvidence(searchManyToolCallSearch: SearchManyToolCallSearch): ReusableSearchToolEvidence | undefined {
    return this.searchEvidenceByKey.get(createSearchManySearchEvidenceKey(searchManyToolCallSearch));
  }

  findReusableQueryCodebaseKnowledgeToolCallEvidence(
    queryCodebaseKnowledgeToolCallRequest: QueryCodebaseKnowledgeToolCallRequest,
  ): ReusableCodebaseKnowledgeQueryEvidence | undefined {
    return this.codebaseKnowledgeQueryEvidenceByKey.get(
      createQueryCodebaseKnowledgeToolCallEvidenceKey(queryCodebaseKnowledgeToolCallRequest),
    );
  }

  listEvidenceLedgerLines(maximumLineCount = DEFAULT_EVIDENCE_LEDGER_LINE_LIMIT): string[] {
    const evidenceLedgerLines: string[] = [];
    for (const reusableReadToolEvidence of this.readEvidenceByKey.values()) {
      evidenceLedgerLines.push(`- ${reusableReadToolEvidence.evidenceDescription} via ${reusableReadToolEvidence.priorToolCallId}`);
      if (evidenceLedgerLines.length >= maximumLineCount) {
        return evidenceLedgerLines;
      }
    }

    for (const reusableSearchToolEvidence of this.searchEvidenceByKey.values()) {
      evidenceLedgerLines.push(`- ${reusableSearchToolEvidence.evidenceDescription} via ${reusableSearchToolEvidence.priorToolCallId}`);
      if (evidenceLedgerLines.length >= maximumLineCount) {
        return evidenceLedgerLines;
      }
    }

    for (const reusableCodebaseKnowledgeQueryEvidence of this.codebaseKnowledgeQueryEvidenceByKey.values()) {
      evidenceLedgerLines.push(
        `- ${reusableCodebaseKnowledgeQueryEvidence.evidenceDescription} via ${reusableCodebaseKnowledgeQueryEvidence.priorToolCallId}`,
      );
      if (evidenceLedgerLines.length >= maximumLineCount) {
        return evidenceLedgerLines;
      }
    }

    return evidenceLedgerLines;
  }

  hasEvidence(): boolean {
    return this.readEvidenceByKey.size > 0 || this.searchEvidenceByKey.size > 0 ||
      this.codebaseKnowledgeQueryEvidenceByKey.size > 0;
  }
}

export function buildReadOnlyToolCallEvidenceIndex(input: {
  conversationSessionEntries: readonly ConversationSessionEntry[];
}): ReadOnlyToolCallEvidenceIndex {
  const visibleConversationSessionEntries = listModelVisibleConversationSessionEntries(input.conversationSessionEntries);
  const toolCallEntryByToolCallId = new Map<string, ToolCallConversationSessionEntry>();
  const readEvidenceByKey = new Map<string, ReusableReadToolEvidence>();
  const searchEvidenceByKey = new Map<string, ReusableSearchToolEvidence>();
  const codebaseKnowledgeQueryEvidenceByKey = new Map<string, ReusableCodebaseKnowledgeQueryEvidence>();

  for (const conversationSessionEntry of visibleConversationSessionEntries) {
    if (conversationSessionEntry.entryKind === "tool_call") {
      toolCallEntryByToolCallId.set(conversationSessionEntry.toolCallId, conversationSessionEntry);
      continue;
    }

    if (conversationSessionEntry.entryKind === "workspace_patch") {
      invalidateEvidenceAfterWorkspacePatch({
        workspacePatchEntry: conversationSessionEntry,
        readEvidenceByKey,
        searchEvidenceByKey,
        codebaseKnowledgeQueryEvidenceByKey,
      });
      continue;
    }

    if (isToolResultConversationSessionEntry(conversationSessionEntry)) {
      invalidateEvidenceAfterMutatingToolResult({
        toolResultEntry: conversationSessionEntry,
        readEvidenceByKey,
        searchEvidenceByKey,
        codebaseKnowledgeQueryEvidenceByKey,
      });
    }

    if (conversationSessionEntry.entryKind !== "completed_tool_result") {
      continue;
    }

    if (isDuplicateReadOnlyToolResultText(conversationSessionEntry.toolResultText)) {
      continue;
    }

    const toolCallEntry = toolCallEntryByToolCallId.get(conversationSessionEntry.toolCallId);
    if (!toolCallEntry) {
      continue;
    }

    recordCompletedReadOnlyToolEvidence({
      toolCallEntry,
      toolResultEntry: conversationSessionEntry,
      readEvidenceByKey,
      searchEvidenceByKey,
      codebaseKnowledgeQueryEvidenceByKey,
    });
  }

  return new ReadOnlyToolCallEvidenceIndex({ readEvidenceByKey, searchEvidenceByKey, codebaseKnowledgeQueryEvidenceByKey });
}

function isToolResultConversationSessionEntry(
  conversationSessionEntry: ConversationSessionEntry,
): conversationSessionEntry is ToolResultConversationSessionEntry {
  return conversationSessionEntry.entryKind === "completed_tool_result" ||
    conversationSessionEntry.entryKind === "failed_tool_result" ||
    conversationSessionEntry.entryKind === "denied_tool_result";
}

export function createDuplicateReadOnlyToolResultText(reusableEvidence: ReusableReadOnlyToolEvidence): string {
  return [
    `<${DUPLICATE_READ_ONLY_TOOL_RESULT_TAG}>`,
    "<status>completed</status>",
    `<toolName>${escapeModelFacingXmlText(reusableEvidence.toolCallDetail.toolName)}</toolName>`,
    `<previousToolCallId>${escapeModelFacingXmlText(reusableEvidence.priorToolCallId)}</previousToolCallId>`,
    `<evidence>${escapeModelFacingXmlText(reusableEvidence.evidenceDescription)}</evidence>`,
    "<note>The same read-only result is already visible in the conversation context. Use that prior result; this duplicate call was not re-executed.</note>",
    `</${DUPLICATE_READ_ONLY_TOOL_RESULT_TAG}>`,
  ].join("\n");
}

export function buildReadOnlyToolEvidenceLedgerText(input: {
  conversationSessionEntries: readonly ConversationSessionEntry[];
  maximumLineCount?: number | undefined;
}): string | undefined {
  const readOnlyToolCallEvidenceIndex = buildReadOnlyToolCallEvidenceIndex({
    conversationSessionEntries: input.conversationSessionEntries,
  });
  const evidenceLedgerLines = readOnlyToolCallEvidenceIndex.listEvidenceLedgerLines(
    input.maximumLineCount ?? DEFAULT_EVIDENCE_LEDGER_LINE_LIMIT,
  );
  if (evidenceLedgerLines.length === 0) {
    return undefined;
  }

  return [
    "Read-only evidence already visible in this conversation:",
    ...evidenceLedgerLines,
    "Do not request the same read-only evidence again unless a mutation made it stale or you need a different path, range, or query.",
  ].join("\n");
}

export function isDuplicateReadOnlyToolResultText(toolResultText: string): boolean {
  return toolResultText.includes(`<${DUPLICATE_READ_ONLY_TOOL_RESULT_TAG}>`);
}

export function createReadToolCallEvidenceKey(readToolCallRequest: ReadToolCallRequest): string {
  return JSON.stringify([
    "read",
    readToolCallRequest.readTargetPath,
    readToolCallRequest.offsetLineNumber ?? null,
    readToolCallRequest.maximumLineCount ?? null,
  ]);
}

export function createReadManyTargetEvidenceKey(readManyToolCallTarget: ReadManyToolCallTarget): string {
  return JSON.stringify([
    "read",
    readManyToolCallTarget.readTargetPath,
    readManyToolCallTarget.offsetLineNumber ?? null,
    readManyToolCallTarget.maximumLineCount ?? null,
  ]);
}

export function createGlobToolCallEvidenceKey(globToolCallRequest: GlobToolCallRequest): string {
  return JSON.stringify([
    "glob",
    globToolCallRequest.globPattern,
    globToolCallRequest.searchDirectoryPath ?? null,
  ]);
}

export function createGrepToolCallEvidenceKey(grepToolCallRequest: GrepToolCallRequest): string {
  return JSON.stringify([
    "grep",
    grepToolCallRequest.regexPattern,
    grepToolCallRequest.searchPath ?? null,
    grepToolCallRequest.includeGlobPattern ?? null,
    grepToolCallRequest.contextLineCount ?? null,
  ]);
}

export function createSearchManySearchEvidenceKey(searchManyToolCallSearch: SearchManyToolCallSearch): string {
  if (searchManyToolCallSearch.searchKind === "glob") {
    return createGlobToolCallEvidenceKey({
      toolName: "glob",
      globPattern: searchManyToolCallSearch.globPattern,
      ...(searchManyToolCallSearch.searchDirectoryPath !== undefined
        ? { searchDirectoryPath: searchManyToolCallSearch.searchDirectoryPath }
        : {}),
    });
  }

  return createGrepToolCallEvidenceKey({
    toolName: "grep",
    regexPattern: searchManyToolCallSearch.regexPattern,
    ...(searchManyToolCallSearch.searchPath !== undefined ? { searchPath: searchManyToolCallSearch.searchPath } : {}),
    ...(searchManyToolCallSearch.includeGlobPattern !== undefined
      ? { includeGlobPattern: searchManyToolCallSearch.includeGlobPattern }
      : {}),
    ...(searchManyToolCallSearch.contextLineCount !== undefined
      ? { contextLineCount: searchManyToolCallSearch.contextLineCount }
      : {}),
  });
}

export function createQueryCodebaseKnowledgeToolCallEvidenceKey(
  queryCodebaseKnowledgeToolCallRequest: QueryCodebaseKnowledgeToolCallRequest,
): string {
  return JSON.stringify([
    "query_codebase_knowledge",
    normalizeCodebaseKnowledgeQueryText(queryCodebaseKnowledgeToolCallRequest.codebaseProblemDescription),
    normalizeCodebaseKnowledgeQueryHints(queryCodebaseKnowledgeToolCallRequest.knownRelevantFilePaths),
    normalizeCodebaseKnowledgeQueryHints(queryCodebaseKnowledgeToolCallRequest.knownRelevantSymbolNames),
    queryCodebaseKnowledgeToolCallRequest.maximumKnowledgeResultCount ?? null,
  ]);
}

function recordCompletedReadOnlyToolEvidence(input: {
  toolCallEntry: ToolCallConversationSessionEntry;
  toolResultEntry: CompletedToolResultConversationSessionEntry;
  readEvidenceByKey: Map<string, ReusableReadToolEvidence>;
  searchEvidenceByKey: Map<string, ReusableSearchToolEvidence>;
  codebaseKnowledgeQueryEvidenceByKey: Map<string, ReusableCodebaseKnowledgeQueryEvidence>;
}): void {
  const toolCallRequest = input.toolCallEntry.toolCallRequest;
  const toolCallDetail = input.toolResultEntry.toolCallDetail;
  if (toolCallRequest.toolName === "read" && toolCallDetail.toolName === "read") {
    input.readEvidenceByKey.set(
      createReadToolCallEvidenceKey(toolCallRequest),
      createReusableReadToolEvidence({
        evidenceKey: createReadToolCallEvidenceKey(toolCallRequest),
        priorToolCallId: input.toolCallEntry.toolCallId,
        toolCallDetail,
      }),
    );
    return;
  }

  if (toolCallRequest.toolName === "read_many" && toolCallDetail.toolName === "read_many") {
    recordCompletedReadManyToolEvidence({
      toolCallId: input.toolCallEntry.toolCallId,
      readTargets: toolCallRequest.readTargets,
      toolCallDetail,
      readEvidenceByKey: input.readEvidenceByKey,
    });
    return;
  }

  if (toolCallRequest.toolName === "glob" && toolCallDetail.toolName === "glob") {
    input.searchEvidenceByKey.set(
      createGlobToolCallEvidenceKey(toolCallRequest),
      createReusableSearchToolEvidence({
        evidenceKey: createGlobToolCallEvidenceKey(toolCallRequest),
        priorToolCallId: input.toolCallEntry.toolCallId,
        toolCallDetail,
        evidenceDescription: describeGlobEvidence(toolCallRequest.globPattern, toolCallRequest.searchDirectoryPath),
      }),
    );
    return;
  }

  if (toolCallRequest.toolName === "grep" && toolCallDetail.toolName === "grep") {
    input.searchEvidenceByKey.set(
      createGrepToolCallEvidenceKey(toolCallRequest),
      createReusableSearchToolEvidence({
        evidenceKey: createGrepToolCallEvidenceKey(toolCallRequest),
        priorToolCallId: input.toolCallEntry.toolCallId,
        toolCallDetail,
        evidenceDescription: describeGrepEvidence(toolCallRequest),
      }),
    );
    return;
  }

  if (toolCallRequest.toolName === "search_many" && toolCallDetail.toolName === "search_many") {
    recordCompletedSearchManyToolEvidence({
      toolCallId: input.toolCallEntry.toolCallId,
      searches: toolCallRequest.searches,
      toolCallDetail,
      searchEvidenceByKey: input.searchEvidenceByKey,
    });
    return;
  }

  if (toolCallRequest.toolName === "query_codebase_knowledge" && toolCallDetail.toolName === "query_codebase_knowledge") {
    const evidenceKey = createQueryCodebaseKnowledgeToolCallEvidenceKey(toolCallRequest);
    input.codebaseKnowledgeQueryEvidenceByKey.set(
      evidenceKey,
      createReusableCodebaseKnowledgeQueryEvidence({
        evidenceKey,
        priorToolCallId: input.toolCallEntry.toolCallId,
        toolCallRequest,
        toolCallDetail,
      }),
    );
  }
}

function recordCompletedReadManyToolEvidence(input: {
  toolCallId: string;
  readTargets: readonly ReadManyToolCallTarget[];
  toolCallDetail: Extract<ToolCallDetail, { toolName: "read_many" }>;
  readEvidenceByKey: Map<string, ReusableReadToolEvidence>;
}): void {
  for (const [readTargetIndex, readTarget] of input.readTargets.entries()) {
    const readResult = input.toolCallDetail.readResults?.[readTargetIndex];
    if (readResult?.readStatus !== "completed") {
      continue;
    }

    const evidenceKey = createReadManyTargetEvidenceKey(readTarget);
    input.readEvidenceByKey.set(
      evidenceKey,
      createReusableReadToolEvidence({
        evidenceKey,
        priorToolCallId: input.toolCallId,
        toolCallDetail: readResult.readDetail,
      }),
    );
  }
}

function recordCompletedSearchManyToolEvidence(input: {
  toolCallId: string;
  searches: readonly SearchManyToolCallSearch[];
  toolCallDetail: Extract<ToolCallDetail, { toolName: "search_many" }>;
  searchEvidenceByKey: Map<string, ReusableSearchToolEvidence>;
}): void {
  for (const [searchIndex, search] of input.searches.entries()) {
    const searchResult = input.toolCallDetail.searchResults?.[searchIndex];
    if (searchResult?.searchStatus !== "completed") {
      continue;
    }

    const evidenceKey = createSearchManySearchEvidenceKey(search);
    input.searchEvidenceByKey.set(
      evidenceKey,
      createReusableSearchToolEvidence({
        evidenceKey,
        priorToolCallId: input.toolCallId,
        toolCallDetail: searchResult.searchDetail,
        evidenceDescription: describeSearchManySearchEvidence(search),
      }),
    );
  }
}

function createReusableReadToolEvidence(input: {
  evidenceKey: string;
  priorToolCallId: string;
  toolCallDetail: ToolCallReadDetail;
}): ReusableReadToolEvidence {
  return {
    evidenceKind: "read",
    evidenceKey: input.evidenceKey,
    priorToolCallId: input.priorToolCallId,
    toolCallDetail: input.toolCallDetail,
    readFilePath: input.toolCallDetail.readFilePath,
    evidenceDescription: describeReadEvidence(input.toolCallDetail),
  };
}

function createReusableSearchToolEvidence(input: {
  evidenceKey: string;
  priorToolCallId: string;
  toolCallDetail: ToolCallGlobDetail | ToolCallGrepDetail;
  evidenceDescription: string;
}): ReusableSearchToolEvidence {
  return {
    evidenceKind: "search",
    evidenceKey: input.evidenceKey,
    priorToolCallId: input.priorToolCallId,
    toolCallDetail: input.toolCallDetail,
    evidenceDescription: input.evidenceDescription,
  };
}

function createReusableCodebaseKnowledgeQueryEvidence(input: {
  evidenceKey: string;
  priorToolCallId: string;
  toolCallRequest: QueryCodebaseKnowledgeToolCallRequest;
  toolCallDetail: ToolCallQueryCodebaseKnowledgeDetail;
}): ReusableCodebaseKnowledgeQueryEvidence {
  return {
    evidenceKind: "codebase_knowledge_query",
    evidenceKey: input.evidenceKey,
    priorToolCallId: input.priorToolCallId,
    toolCallDetail: input.toolCallDetail,
    evidenceDescription: describeCodebaseKnowledgeQueryEvidence(input.toolCallRequest),
  };
}

function invalidateEvidenceAfterWorkspacePatch(input: {
  workspacePatchEntry: WorkspacePatchConversationSessionEntry;
  readEvidenceByKey: Map<string, ReusableReadToolEvidence>;
  searchEvidenceByKey: Map<string, ReusableSearchToolEvidence>;
  codebaseKnowledgeQueryEvidenceByKey: Map<string, ReusableCodebaseKnowledgeQueryEvidence>;
}): void {
  if (input.workspacePatchEntry.workspacePatch.changedFiles.length === 0) {
    return;
  }

  for (const [readEvidenceKey, readEvidence] of input.readEvidenceByKey) {
    if (isReadEvidenceTouchedByWorkspacePatch(readEvidence, input.workspacePatchEntry)) {
      input.readEvidenceByKey.delete(readEvidenceKey);
    }
  }

  input.searchEvidenceByKey.clear();
  input.codebaseKnowledgeQueryEvidenceByKey.clear();
}

function invalidateEvidenceAfterMutatingToolResult(input: {
  toolResultEntry: ToolResultConversationSessionEntry;
  readEvidenceByKey: Map<string, ReusableReadToolEvidence>;
  searchEvidenceByKey: Map<string, ReusableSearchToolEvidence>;
  codebaseKnowledgeQueryEvidenceByKey: Map<string, ReusableCodebaseKnowledgeQueryEvidence>;
}): void {
  if (input.toolResultEntry.entryKind === "denied_tool_result") {
    return;
  }

  const mutationEvidence = describeToolResultMutationEvidence(input.toolResultEntry.toolCallDetail);
  if (mutationEvidence.mutationKind === "none") {
    return;
  }

  if (mutationEvidence.mutationKind === "unknown_paths") {
    input.readEvidenceByKey.clear();
    input.searchEvidenceByKey.clear();
    input.codebaseKnowledgeQueryEvidenceByKey.clear();
    return;
  }

  if (mutationEvidence.changedFilePaths.length === 0) {
    return;
  }

  for (const [readEvidenceKey, readEvidence] of input.readEvidenceByKey) {
    if (
      mutationEvidence.changedFilePaths.some((changedFilePath) =>
        isWorkspacePathSameOrDescendant({
          candidatePath: changedFilePath,
          ancestorOrExactPath: readEvidence.readFilePath,
        })
      )
    ) {
      input.readEvidenceByKey.delete(readEvidenceKey);
    }
  }

  input.searchEvidenceByKey.clear();
  input.codebaseKnowledgeQueryEvidenceByKey.clear();
}

function describeToolResultMutationEvidence(toolCallDetail: ToolCallDetail): ToolResultMutationEvidence {
  if (toolCallDetail.toolName === "edit") {
    return { mutationKind: "known_paths", changedFilePaths: [toolCallDetail.editedFilePath] };
  }

  if (toolCallDetail.toolName === "write") {
    return { mutationKind: "known_paths", changedFilePaths: [toolCallDetail.writtenFilePath] };
  }

  if (
    toolCallDetail.toolName === "edit_many" ||
    toolCallDetail.toolName === "patch" ||
    toolCallDetail.toolName === "patch_many"
  ) {
    return toolCallDetail.changedFiles
      ? { mutationKind: "known_paths", changedFilePaths: toolCallDetail.changedFiles.map((changedFile) => changedFile.filePath) }
      : { mutationKind: "unknown_paths" };
  }

  if (toolCallDetail.toolName === "bash") {
    return { mutationKind: "unknown_paths" };
  }

  return { mutationKind: "none" };
}

function isReadEvidenceTouchedByWorkspacePatch(
  readEvidence: ReusableReadToolEvidence,
  workspacePatchEntry: WorkspacePatchConversationSessionEntry,
): boolean {
  return workspacePatchEntry.workspacePatch.changedFiles.some((changedFile) =>
    isWorkspacePathSameOrDescendant({
      candidatePath: changedFile.filePath,
      ancestorOrExactPath: readEvidence.readFilePath,
    })
  );
}

function isWorkspacePathSameOrDescendant(input: {
  candidatePath: string;
  ancestorOrExactPath: string;
}): boolean {
  const normalizedAncestorPath = input.ancestorOrExactPath.replace(/\/+$/, "");
  if (normalizedAncestorPath === ".") {
    return true;
  }

  return input.candidatePath === normalizedAncestorPath || input.candidatePath.startsWith(`${normalizedAncestorPath}/`);
}

function describeReadEvidence(toolCallDetail: ToolCallReadDetail): string {
  const returnedLineRangeText = formatReturnedReadLineRange(toolCallDetail);
  return returnedLineRangeText
    ? `read ${toolCallDetail.readFilePath} ${returnedLineRangeText}`
    : `read ${toolCallDetail.readFilePath}`;
}

function formatReturnedReadLineRange(toolCallDetail: ToolCallReadDetail): string | undefined {
  const firstPreviewLine = toolCallDetail.previewLines?.[0];
  if (!firstPreviewLine || toolCallDetail.returnedLineCount === undefined) {
    return undefined;
  }

  if (toolCallDetail.returnedLineCount <= 1) {
    return `line ${firstPreviewLine.lineNumber}`;
  }

  return `lines ${firstPreviewLine.lineNumber}-${firstPreviewLine.lineNumber + toolCallDetail.returnedLineCount - 1}`;
}

function describeGlobEvidence(globPattern: string, searchDirectoryPath: string | undefined): string {
  return `glob ${globPattern}${searchDirectoryPath !== undefined ? ` in ${searchDirectoryPath}` : ""}`;
}

function describeGrepEvidence(grepToolCallRequest: GrepToolCallRequest): string {
  return [
    `grep ${grepToolCallRequest.regexPattern}`,
    ...(grepToolCallRequest.searchPath !== undefined ? [`in ${grepToolCallRequest.searchPath}`] : []),
    ...(grepToolCallRequest.includeGlobPattern !== undefined ? [`include ${grepToolCallRequest.includeGlobPattern}`] : []),
    ...(grepToolCallRequest.contextLineCount !== undefined ? [`context ${grepToolCallRequest.contextLineCount}`] : []),
  ].join(" ");
}

function describeSearchManySearchEvidence(searchManyToolCallSearch: SearchManyToolCallSearch): string {
  if (searchManyToolCallSearch.searchKind === "glob") {
    return describeGlobEvidence(searchManyToolCallSearch.globPattern, searchManyToolCallSearch.searchDirectoryPath);
  }

  return describeGrepEvidence({
    toolName: "grep",
    regexPattern: searchManyToolCallSearch.regexPattern,
    ...(searchManyToolCallSearch.searchPath !== undefined ? { searchPath: searchManyToolCallSearch.searchPath } : {}),
    ...(searchManyToolCallSearch.includeGlobPattern !== undefined
      ? { includeGlobPattern: searchManyToolCallSearch.includeGlobPattern }
      : {}),
    ...(searchManyToolCallSearch.contextLineCount !== undefined
      ? { contextLineCount: searchManyToolCallSearch.contextLineCount }
      : {}),
  });
}

function describeCodebaseKnowledgeQueryEvidence(
  queryCodebaseKnowledgeToolCallRequest: QueryCodebaseKnowledgeToolCallRequest,
): string {
  return [
    `query_codebase_knowledge ${quoteEvidenceText(normalizeCodebaseKnowledgeQueryText(queryCodebaseKnowledgeToolCallRequest.codebaseProblemDescription))}`,
    ...describeCodebaseKnowledgeQueryHintEvidence("files", queryCodebaseKnowledgeToolCallRequest.knownRelevantFilePaths),
    ...describeCodebaseKnowledgeQueryHintEvidence("symbols", queryCodebaseKnowledgeToolCallRequest.knownRelevantSymbolNames),
    ...(queryCodebaseKnowledgeToolCallRequest.maximumKnowledgeResultCount !== undefined
      ? [`max ${queryCodebaseKnowledgeToolCallRequest.maximumKnowledgeResultCount}`]
      : []),
  ].join(" ");
}

function describeCodebaseKnowledgeQueryHintEvidence(
  hintKindLabel: string,
  hintValues: readonly string[] | undefined,
): string[] {
  const normalizedHintValues = normalizeCodebaseKnowledgeQueryHints(hintValues);
  return normalizedHintValues.length > 0 ? [`${hintKindLabel} ${normalizedHintValues.join(",")}`] : [];
}

function normalizeCodebaseKnowledgeQueryText(queryText: string): string {
  return queryText.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeCodebaseKnowledgeQueryHints(hintValues: readonly string[] | undefined): string[] {
  if (!hintValues || hintValues.length === 0) {
    return [];
  }

  return [...new Set(hintValues.map((hintValue) => hintValue.trim()).filter((hintValue) => hintValue.length > 0))].sort();
}

function quoteEvidenceText(evidenceText: string): string {
  return JSON.stringify(evidenceText);
}
