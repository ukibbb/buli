import {
  isWorkspaceInspectionToolCallRequest,
  listModelVisibleConversationSessionEntries,
  type ConversationSessionEntry,
  type LocateCodebaseSymbolsToolCallRequest,
  type ToolCallDetail,
  type ToolCallGlobDetail,
  type ToolCallGrepDetail,
  type ToolCallLocateCodebaseSymbolsDetail,
  type ToolCallReadDetail,
  type WorkspaceInspectionToolCallRequest,
} from "@buli/contracts";
import { isDuplicateReadOnlyToolResultText } from "./readOnlyToolCallCoalescing.ts";

export const DEFAULT_RELEVANT_EVIDENCE_NOTE_LIMIT = 8;
export const DEFAULT_BULI_STICKY_NOTES_PROMPT_NOTE_TEXT_CHARACTER_COUNT = 220;
export const DEFAULT_BULI_STICKY_NOTES_OBSERVATION_TEXT_CHARACTER_COUNT = 260;

type ToolCallConversationSessionEntry = Extract<ConversationSessionEntry, { entryKind: "tool_call" }>;
type UserPromptConversationSessionEntry = Extract<ConversationSessionEntry, { entryKind: "user_prompt" }>;
type CompletedToolResultConversationSessionEntry = Extract<ConversationSessionEntry, { entryKind: "completed_tool_result" }>;
type ToolResultConversationSessionEntry = Extract<
  ConversationSessionEntry,
  { entryKind: "completed_tool_result" | "failed_tool_result" | "denied_tool_result" }
>;
type WorkspacePatchConversationSessionEntry = Extract<ConversationSessionEntry, { entryKind: "workspace_patch" }>;

type EvidenceNoteSourceKind = "read" | "search" | "knowledge";

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

export type ReadOnlyToolEvidenceNote = {
  readonly sourceKind: EvidenceNoteSourceKind;
  readonly priorToolCallId: string;
  readonly originUserPromptText: string;
  readonly inspectionQuestion: string;
  readonly sourceDescription: string;
  readonly observedSummary: string;
  readonly freshness: "fresh" | "possibly_stale";
  readonly readFilePath?: string | undefined;
};

export function listReadOnlyToolEvidenceNotes(input: {
  conversationSessionEntries: readonly ConversationSessionEntry[];
}): ReadOnlyToolEvidenceNote[] {
  const visibleConversationSessionEntries = listModelVisibleConversationSessionEntries(input.conversationSessionEntries);
  const toolCallEntryByToolCallId = new Map<string, ToolCallConversationSessionEntry>();
  let currentUserPromptEntry: UserPromptConversationSessionEntry | undefined;
  let evidenceNotes: ReadOnlyToolEvidenceNote[] = [];

  for (const conversationSessionEntry of visibleConversationSessionEntries) {
    if (conversationSessionEntry.entryKind === "conversation_compaction_summary") {
      currentUserPromptEntry = undefined;
      toolCallEntryByToolCallId.clear();
      evidenceNotes = [];
      continue;
    }

    if (conversationSessionEntry.entryKind === "user_prompt") {
      currentUserPromptEntry = conversationSessionEntry;
      toolCallEntryByToolCallId.clear();
      continue;
    }

    if (conversationSessionEntry.entryKind === "workspace_patch") {
      evidenceNotes = invalidateEvidenceNotesAfterWorkspacePatch(evidenceNotes, conversationSessionEntry);
      continue;
    }

    if (!currentUserPromptEntry) {
      continue;
    }

    if (conversationSessionEntry.entryKind === "tool_call") {
      toolCallEntryByToolCallId.set(conversationSessionEntry.toolCallId, conversationSessionEntry);
      continue;
    }

    if (isToolResultConversationSessionEntry(conversationSessionEntry)) {
      evidenceNotes = invalidateEvidenceNotesAfterMutatingToolResult(evidenceNotes, conversationSessionEntry);
    }

    if (conversationSessionEntry.entryKind !== "completed_tool_result") {
      continue;
    }

    if (isDuplicateReadOnlyToolResultText(conversationSessionEntry.toolResultText)) {
      continue;
    }

    const toolCallEntry = toolCallEntryByToolCallId.get(conversationSessionEntry.toolCallId);
    if (!toolCallEntry || !isWorkspaceInspectionToolCallRequest(toolCallEntry.toolCallRequest)) {
      continue;
    }

    const evidenceNote = createReadOnlyToolEvidenceNote({
      originUserPromptEntry: currentUserPromptEntry,
      toolCallEntry,
      toolResultEntry: conversationSessionEntry,
    });
    if (evidenceNote) {
      evidenceNotes.push(evidenceNote);
    }
  }

  return evidenceNotes;
}

export function buildRelevantBuliStickyNotesContextText(input: {
  conversationSessionEntries: readonly ConversationSessionEntry[];
  currentUserPromptText: string;
  maximumNoteCount?: number | undefined;
  maximumPromptNoteTextCharacterCount?: number | undefined;
  maximumObservationTextCharacterCount?: number | undefined;
}): string | undefined {
  const evidenceNotes = listReadOnlyToolEvidenceNotes({
    conversationSessionEntries: input.conversationSessionEntries,
  });
  const relevantEvidenceNotes = selectRelevantEvidenceNotes({
    evidenceNotes,
    currentUserPromptText: input.currentUserPromptText,
    maximumNoteCount: input.maximumNoteCount ?? DEFAULT_RELEVANT_EVIDENCE_NOTE_LIMIT,
  });

  if (relevantEvidenceNotes.length === 0) {
    return undefined;
  }

  return [
    "BuliStickyNotes:",
    "Purpose-aware evidence notes from prior turns:",
    ...relevantEvidenceNotes.map((evidenceNote) =>
      formatBuliStickyNotesEvidenceLine(evidenceNote, {
        maximumPromptNoteTextCharacterCount: input.maximumPromptNoteTextCharacterCount ??
          DEFAULT_BULI_STICKY_NOTES_PROMPT_NOTE_TEXT_CHARACTER_COUNT,
        maximumObservationTextCharacterCount: input.maximumObservationTextCharacterCount ??
          DEFAULT_BULI_STICKY_NOTES_OBSERVATION_TEXT_CHARACTER_COUNT,
      })
    ),
    "Use these as source pointers, not active memory. Re-read sources before relying on details; ignore notes that do not fit the current task.",
  ].join("\n");
}

function selectRelevantEvidenceNotes(input: {
  evidenceNotes: readonly ReadOnlyToolEvidenceNote[];
  currentUserPromptText: string;
  maximumNoteCount: number;
}): ReadOnlyToolEvidenceNote[] {
  if (input.evidenceNotes.length === 0 || input.maximumNoteCount <= 0) {
    return [];
  }

  if (isShortContinuationPrompt(input.currentUserPromptText)) {
    const latestOriginUserPromptText = input.evidenceNotes.at(-1)?.originUserPromptText;
    return latestOriginUserPromptText
      ? input.evidenceNotes
        .filter((evidenceNote) => evidenceNote.originUserPromptText === latestOriginUserPromptText)
        .slice(-input.maximumNoteCount)
      : [];
  }

  const currentPromptTokens = extractSearchTokens(input.currentUserPromptText);
  if (currentPromptTokens.size === 0) {
    return [];
  }

  return input.evidenceNotes
    .map((evidenceNote, evidenceNoteIndex) => ({
      evidenceNote,
      evidenceNoteIndex,
      relevanceScore: scoreEvidenceNoteRelevance(evidenceNote, currentPromptTokens),
    }))
    .filter((scoredEvidenceNote) => scoredEvidenceNote.relevanceScore > 0)
    .sort((left, right) =>
      right.relevanceScore - left.relevanceScore || right.evidenceNoteIndex - left.evidenceNoteIndex
    )
    .slice(0, input.maximumNoteCount)
    .sort((left, right) => left.evidenceNoteIndex - right.evidenceNoteIndex)
    .map((scoredEvidenceNote) => scoredEvidenceNote.evidenceNote);
}

function scoreEvidenceNoteRelevance(
  evidenceNote: ReadOnlyToolEvidenceNote,
  currentPromptTokens: ReadonlySet<string>,
): number {
  const evidenceNoteTokens = extractSearchTokens([
    evidenceNote.originUserPromptText,
    evidenceNote.inspectionQuestion,
    evidenceNote.sourceDescription,
    evidenceNote.observedSummary,
  ].join("\n"));
  let relevanceScore = 0;
  for (const currentPromptToken of currentPromptTokens) {
    if (evidenceNoteTokens.has(currentPromptToken)) {
      relevanceScore += currentPromptToken.includes("/") || currentPromptToken.includes(".") ? 3 : 1;
    }
  }

  return relevanceScore;
}

function createReadOnlyToolEvidenceNote(input: {
  originUserPromptEntry: UserPromptConversationSessionEntry;
  toolCallEntry: ToolCallConversationSessionEntry;
  toolResultEntry: CompletedToolResultConversationSessionEntry;
}): ReadOnlyToolEvidenceNote | undefined {
  const toolCallRequest = input.toolCallEntry.toolCallRequest;
  if (!isWorkspaceInspectionToolCallRequest(toolCallRequest)) {
    return undefined;
  }

  const baseEvidenceNoteFields = {
    priorToolCallId: input.toolCallEntry.toolCallId,
    originUserPromptText: input.originUserPromptEntry.promptText,
    inspectionQuestion: resolveInspectionQuestion(toolCallRequest, input.originUserPromptEntry.promptText),
    freshness: "fresh" as const,
  };

  if (toolCallRequest.toolName === "read" && input.toolResultEntry.toolCallDetail.toolName === "read") {
    return {
      ...baseEvidenceNoteFields,
      sourceKind: "read",
      readFilePath: input.toolResultEntry.toolCallDetail.readFilePath,
      sourceDescription: describeReadSource(input.toolResultEntry.toolCallDetail),
      observedSummary: summarizeReadObservation(input.toolResultEntry.toolCallDetail, input.toolResultEntry.toolResultText),
    };
  }

  if (toolCallRequest.toolName === "glob" && input.toolResultEntry.toolCallDetail.toolName === "glob") {
    return {
      ...baseEvidenceNoteFields,
      sourceKind: "search",
      sourceDescription: describeGlobSource(input.toolResultEntry.toolCallDetail),
      observedSummary: summarizeGlobObservation(input.toolResultEntry.toolCallDetail),
    };
  }

  if (toolCallRequest.toolName === "grep" && input.toolResultEntry.toolCallDetail.toolName === "grep") {
    return {
      ...baseEvidenceNoteFields,
      sourceKind: "search",
      sourceDescription: describeGrepSource(input.toolResultEntry.toolCallDetail),
      observedSummary: summarizeGrepObservation(input.toolResultEntry.toolCallDetail),
    };
  }

  if (toolCallRequest.toolName === "locate_codebase_symbols" && input.toolResultEntry.toolCallDetail.toolName === "locate_codebase_symbols") {
    return {
      ...baseEvidenceNoteFields,
      sourceKind: "knowledge",
      sourceDescription: describeCodebaseKnowledgeSource(toolCallRequest),
      observedSummary: summarizeCodebaseKnowledgeObservation(input.toolResultEntry.toolCallDetail),
    };
  }

  return undefined;
}

function formatBuliStickyNotesEvidenceLine(
  evidenceNote: ReadOnlyToolEvidenceNote,
  renderingLimits: {
    maximumPromptNoteTextCharacterCount: number;
    maximumObservationTextCharacterCount: number;
  },
): string {
  return [
    `- Prior task: ${quoteNoteText(evidenceNote.originUserPromptText, renderingLimits.maximumPromptNoteTextCharacterCount)};`,
    `question: ${quoteNoteText(evidenceNote.inspectionQuestion, renderingLimits.maximumPromptNoteTextCharacterCount)};`,
    `source: ${truncateOneLine(evidenceNote.sourceDescription, renderingLimits.maximumPromptNoteTextCharacterCount)} via ${evidenceNote.priorToolCallId};`,
    `observed: ${truncateOneLine(evidenceNote.observedSummary, renderingLimits.maximumObservationTextCharacterCount)};`,
    `freshness: ${evidenceNote.freshness}.`,
  ].join(" ");
}

function resolveInspectionQuestion(
  toolCallRequest: WorkspaceInspectionToolCallRequest,
  originUserPromptText: string,
): string {
  if (toolCallRequest.toolName === "locate_codebase_symbols") {
    return `Located ${[...(toolCallRequest.symbolNames ?? []), ...(toolCallRequest.filePaths ?? [])].join(", ")}`;
  }

  if ("inspectionQuestion" in toolCallRequest && toolCallRequest.inspectionQuestion) {
    return toolCallRequest.inspectionQuestion;
  }

  return `Evidence inspected for prior task: ${truncateOneLine(originUserPromptText, 160)}`;
}

function summarizeReadObservation(toolCallDetail: ToolCallReadDetail, toolResultText: string): string {
  const returnedLineRangeText = formatReturnedReadLineRange(toolCallDetail);
  const previewLineText = toolCallDetail.previewLines
    ?.slice(0, 2)
    .map((previewLine) => `${previewLine.lineNumber}: ${previewLine.lineText}`)
    .join(" | ");
  return compactSentenceParts([
    returnedLineRangeText ? `returned ${returnedLineRangeText}` : undefined,
    toolCallDetail.returnedLineCount !== undefined ? `${toolCallDetail.returnedLineCount} lines` : undefined,
    previewLineText ? `preview ${previewLineText}` : `excerpt ${createToolResultTextExcerpt(toolResultText)}`,
  ]);
}

function summarizeGlobObservation(toolCallDetail: ToolCallGlobDetail): string {
  return compactSentenceParts([
    toolCallDetail.matchedPathCount !== undefined ? `${toolCallDetail.matchedPathCount} matched paths` : undefined,
    toolCallDetail.returnedPathCount !== undefined ? `${toolCallDetail.returnedPathCount} returned paths` : undefined,
    toolCallDetail.matchedPaths && toolCallDetail.matchedPaths.length > 0
      ? `examples ${toolCallDetail.matchedPaths.slice(0, 3).join(", ")}`
      : undefined,
  ]);
}

function summarizeGrepObservation(toolCallDetail: ToolCallGrepDetail): string {
  return compactSentenceParts([
    toolCallDetail.totalMatchCount !== undefined ? `${toolCallDetail.totalMatchCount} total matches` : undefined,
    toolCallDetail.matchedFileCount !== undefined ? `${toolCallDetail.matchedFileCount} matched files` : undefined,
    toolCallDetail.matchHits && toolCallDetail.matchHits.length > 0
      ? `examples ${toolCallDetail.matchHits.slice(0, 2).map((matchHit) =>
        `${matchHit.matchFilePath}:${matchHit.matchLineNumber}: ${matchHit.matchSnippet}`
      ).join(" | ")}`
      : undefined,
  ]);
}

function summarizeCodebaseKnowledgeObservation(toolCallDetail: ToolCallLocateCodebaseSymbolsDetail): string {
  return compactSentenceParts([
    toolCallDetail.matchedKnowledgeCount !== undefined ? `${toolCallDetail.matchedKnowledgeCount} knowledge matches` : undefined,
    toolCallDetail.recommendedReadCount !== undefined ? `${toolCallDetail.recommendedReadCount} recommended reads` : undefined,
  ]);
}

function compactSentenceParts(parts: readonly (string | undefined)[]): string {
  const compactedParts = parts.filter((part): part is string => part !== undefined && part.trim().length > 0);
  return compactedParts.length > 0
    ? truncateOneLine(compactedParts.join("; "), DEFAULT_BULI_STICKY_NOTES_OBSERVATION_TEXT_CHARACTER_COUNT)
    : "completed inspection";
}

function describeReadSource(toolCallDetail: ToolCallReadDetail): string {
  const returnedLineRangeText = formatReturnedReadLineRange(toolCallDetail);
  return returnedLineRangeText ? `read ${toolCallDetail.readFilePath} ${returnedLineRangeText}` : `read ${toolCallDetail.readFilePath}`;
}

function describeGlobSource(toolCallDetail: ToolCallGlobDetail): string {
  return `glob ${toolCallDetail.globPattern}${toolCallDetail.searchDirectoryPath !== undefined ? ` in ${toolCallDetail.searchDirectoryPath}` : ""}`;
}

function describeGrepSource(toolCallDetail: ToolCallGrepDetail): string {
  return `grep ${toolCallDetail.searchPattern}${toolCallDetail.contextLineCount !== undefined ? ` context ${toolCallDetail.contextLineCount}` : ""}`;
}

function describeCodebaseKnowledgeSource(toolCallRequest: LocateCodebaseSymbolsToolCallRequest): string {
  return `locate_codebase_symbols ${quoteNoteText(
    [...(toolCallRequest.symbolNames ?? []), ...(toolCallRequest.filePaths ?? [])].join(", "),
    DEFAULT_BULI_STICKY_NOTES_PROMPT_NOTE_TEXT_CHARACTER_COUNT,
  )}`;
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

function createToolResultTextExcerpt(toolResultText: string): string {
  return truncateOneLine(toolResultText.split("\n").slice(0, 2).join(" | "), 180);
}

function invalidateEvidenceNotesAfterWorkspacePatch(
  evidenceNotes: readonly ReadOnlyToolEvidenceNote[],
  workspacePatchEntry: WorkspacePatchConversationSessionEntry,
): ReadOnlyToolEvidenceNote[] {
  return invalidateEvidenceNotesAfterChangedPaths(
    evidenceNotes,
    workspacePatchEntry.workspacePatch.changedFiles.map((changedFile) => changedFile.filePath),
  );
}

function invalidateEvidenceNotesAfterMutatingToolResult(
  evidenceNotes: readonly ReadOnlyToolEvidenceNote[],
  toolResultEntry: ToolResultConversationSessionEntry,
): ReadOnlyToolEvidenceNote[] {
  const mutationEvidence = describeToolResultMutationEvidence(toolResultEntry.toolCallDetail);
  if (mutationEvidence.mutationKind === "none") {
    return [...evidenceNotes];
  }

  if (mutationEvidence.mutationKind === "unknown_paths") {
    return [];
  }

  return invalidateEvidenceNotesAfterChangedPaths(evidenceNotes, mutationEvidence.changedFilePaths);
}

function invalidateEvidenceNotesAfterChangedPaths(
  evidenceNotes: readonly ReadOnlyToolEvidenceNote[],
  changedFilePaths: readonly string[],
): ReadOnlyToolEvidenceNote[] {
  if (changedFilePaths.length === 0) {
    return [...evidenceNotes];
  }

  return evidenceNotes.filter((evidenceNote) => {
    const readFilePath = evidenceNote.readFilePath;
    if (evidenceNote.sourceKind !== "read" || !readFilePath) {
      return false;
    }

    return !changedFilePaths.some((changedFilePath) =>
      isWorkspacePathSameOrDescendant({
        candidatePath: changedFilePath,
        ancestorOrExactPath: readFilePath,
      })
    );
  });
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

function isWorkspacePathSameOrDescendant(input: {
  candidatePath: string;
  ancestorOrExactPath: string;
}): boolean {
  const normalizedCandidatePath = normalizeWorkspacePath(input.candidatePath);
  const normalizedAncestorOrExactPath = normalizeWorkspacePath(input.ancestorOrExactPath);
  return normalizedCandidatePath === normalizedAncestorOrExactPath ||
    normalizedCandidatePath.startsWith(`${normalizedAncestorOrExactPath}/`);
}

function normalizeWorkspacePath(workspacePath: string): string {
  return workspacePath.replace(/^\.\//, "").replace(/\/+$/, "");
}

function isToolResultConversationSessionEntry(
  conversationSessionEntry: ConversationSessionEntry,
): conversationSessionEntry is ToolResultConversationSessionEntry {
  return conversationSessionEntry.entryKind === "completed_tool_result" ||
    conversationSessionEntry.entryKind === "failed_tool_result" ||
    conversationSessionEntry.entryKind === "denied_tool_result";
}

function isShortContinuationPrompt(promptText: string): boolean {
  const normalizedPromptText = promptText.trim().toLowerCase().replace(/[.!?]+$/g, "");
  return /^(yes|yeah|yep|ok|okay|continue|go on|go ahead|go for it|execute|do it|apply it|plan it|sounds good|proceed)$/.test(
    normalizedPromptText,
  );
}

function extractSearchTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const match of text.toLowerCase().matchAll(/[a-z0-9_./-]+/g)) {
    const token = match[0];
    if (token.length >= 3) {
      tokens.add(token);
    }
  }

  return tokens;
}

function quoteNoteText(noteText: string, maximumPromptNoteTextCharacterCount: number): string {
  return JSON.stringify(truncateOneLine(noteText, maximumPromptNoteTextCharacterCount));
}

function truncateOneLine(text: string, maximumLength: number): string {
  const oneLineText = text.trim().replace(/\s+/g, " ");
  if (oneLineText.length <= maximumLength) {
    return oneLineText;
  }

  return `${oneLineText.slice(0, Math.max(0, maximumLength - 1))}…`;
}
