import { expect, test } from "bun:test";
import type { ConversationSessionEntry } from "@buli/contracts";
import {
  buildRelevantBuliStickyNotesContextText,
  listReadOnlyToolEvidenceNotes,
} from "../src/readOnlyToolEvidenceNotebook.ts";

test("listReadOnlyToolEvidenceNotes records task purpose question source and explicit direct observation", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    createUserPromptEntry("Plan tool-call memory between turns"),
    {
      entryKind: "tool_call",
      toolCallId: "call_read_replay",
      toolCallRequest: {
        toolName: "read",
        readTargetPath: "packages/openai/src/provider/request.ts",
        offsetLineNumber: 148,
        maximumLineCount: 18,
        inspectionQuestion: "Where are completed OpenAI tool outputs replayed into future requests?",
      },
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_read_replay",
      toolCallDetail: {
        toolName: "read",
        readFilePath: "packages/openai/src/provider/request.ts",
        returnedLineCount: 2,
        previewLines: [
          { lineNumber: 148, lineText: "openAiInputItems.push(createUserMessageInputItem(conversationSessionTurn.userPromptEntry));" },
          { lineNumber: 149, lineText: "openAiInputItems.push(...providerTurnReplay.inputItems);" },
        ],
      },
      toolResultText: "148: openAiInputItems.push(createUserMessageInputItem(conversationSessionTurn.userPromptEntry));\n149: openAiInputItems.push(...providerTurnReplay.inputItems);",
    },
    createCompletedAssistantMessageEntry("Historical replay is the next target."),
  ];

  const evidenceNotes = listReadOnlyToolEvidenceNotes({ conversationSessionEntries });

  expect(evidenceNotes).toHaveLength(1);
  expect(evidenceNotes[0]).toMatchObject({
    originUserPromptText: "Plan tool-call memory between turns",
    inspectionQuestion: "Where are completed OpenAI tool outputs replayed into future requests?",
    sourceDescription: "read packages/openai/src/provider/request.ts lines 148-149",
    priorToolCallId: "call_read_replay",
    freshness: "fresh",
  });
  expect(evidenceNotes[0]?.observedSummary).toContain("returned lines 148-149");
  expect(evidenceNotes[0]?.observedSummary).toContain("2 lines");
  expect(evidenceNotes[0]?.observedSummary).toContain("direct preview lines 148:");
});

test("buildRelevantBuliStickyNotesContextText formats matching notes as explicit evidence blocks and omits unrelated notes", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    ...createCompletedReadTurn({
      promptText: "Investigate OpenAI replay growth",
      toolCallId: "call_replay",
      filePath: "packages/openai/src/provider/request.ts",
      inspectionQuestion: "Where is providerTurnReplay projected into requests?",
      lineText: "providerTurnReplay input items are appended to OpenAI requests",
      assistantMessageText: "Replay projection is in request.ts.",
    }),
    ...createCompletedReadTurn({
      promptText: "Investigate TUI rendering",
      toolCallId: "call_tui",
      filePath: "packages/tui/src/ChatScreen.tsx",
      inspectionQuestion: "Where are transcript rows rendered?",
      lineText: "render visible transcript rows",
      assistantMessageText: "TUI rows render in ChatScreen.",
    }),
  ];

  const buliStickyNotesContextText = buildRelevantBuliStickyNotesContextText({
    conversationSessionEntries,
    currentUserPromptText: "Can we optimize providerTurnReplay request growth?",
  });

  expect(buliStickyNotesContextText).toContain("BuliStickyNotes:\nPurpose-aware evidence notes from prior turns:");
  expect(buliStickyNotesContextText).toContain([
    "Evidence 1:",
    "- Prior user task: \"Investigate OpenAI replay growth\"",
    "- Inspection question: \"Where is providerTurnReplay projected into requests?\"",
    "- What was inspected: read packages/openai/src/provider/request.ts line 1 via call_replay",
    "- What was found directly: returned line 1; 1 line; direct preview lines 1: providerTurnReplay input items are appended to OpenAI requests",
    "- Freshness: fresh. Re-read the source before relying on details.",
  ].join("\n"));
  expect(buliStickyNotesContextText).not.toContain("Where are transcript rows rendered?");
});

test("buildRelevantBuliStickyNotesContextText carries previous task notes for short continuation prompts", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    ...createCompletedReadTurn({
      promptText: "Investigate OpenAI replay growth",
      toolCallId: "call_replay",
      filePath: "packages/openai/src/provider/request.ts",
      inspectionQuestion: "Where is providerTurnReplay projected into requests?",
      lineText: "providerTurnReplay input items are appended to OpenAI requests",
      assistantMessageText: "Replay projection is in request.ts.",
    }),
  ];

  const buliStickyNotesContextText = buildRelevantBuliStickyNotesContextText({
    conversationSessionEntries,
    currentUserPromptText: "plan it",
  });

  expect(buliStickyNotesContextText).toContain("BuliStickyNotes:");
  expect(buliStickyNotesContextText).toContain("- Prior user task: \"Investigate OpenAI replay growth\"");
  expect(buliStickyNotesContextText).toContain("- What was found directly:");
  expect(buliStickyNotesContextText).toContain("Use these as source pointers, not active memory");
});

test("buildRelevantBuliStickyNotesContextText honors profile-style note count and truncation limits", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    ...createCompletedReadTurn({
      promptText: "Investigate provider request projection first",
      toolCallId: "call_projection_first",
      filePath: "packages/openai/src/provider/request.ts",
      inspectionQuestion: "Where is provider request projection assembled before the first provider turn starts?",
      lineText: "provider request projection first note has a deliberately long observation preview for truncation",
      assistantMessageText: "First projection note.",
    }),
    ...createCompletedReadTurn({
      promptText: "Investigate provider request projection second",
      toolCallId: "call_projection_second",
      filePath: "packages/openai/src/provider/request.ts",
      inspectionQuestion: "Where is provider request projection assembled before the second provider turn starts?",
      lineText: "provider request projection second note has a deliberately long observation preview for truncation",
      assistantMessageText: "Second projection note.",
    }),
  ];

  const buliStickyNotesContextText = buildRelevantBuliStickyNotesContextText({
    conversationSessionEntries,
    currentUserPromptText: "Continue provider request projection work",
    maximumNoteCount: 1,
    maximumPromptNoteTextCharacterCount: 48,
    maximumObservationTextCharacterCount: 54,
  });

  const evidenceBlockHeaders = buliStickyNotesContextText?.split("\n").filter((line) => line.startsWith("Evidence ")) ?? [];
  expect(evidenceBlockHeaders).toHaveLength(1);
  expect(buliStickyNotesContextText).toContain("via call_projection_second");
  expect(buliStickyNotesContextText).not.toContain("via call_projection_first");
  expect(buliStickyNotesContextText).toContain("…");
  expect(buliStickyNotesContextText).not.toContain(
    "Where is provider request projection assembled before the second provider turn starts?",
  );
});

test("listReadOnlyToolEvidenceNotes records grep source scope and first direct matches", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    createUserPromptEntry("Investigate providerTurnReplay search evidence"),
    {
      entryKind: "tool_call",
      toolCallId: "call_grep_replay",
      toolCallRequest: {
        toolName: "grep",
        regexPattern: "providerTurnReplay",
        searchPath: "packages/openai",
        includeGlobPattern: "**/*.ts",
        contextLineCount: 2,
        inspectionQuestion: "Where does providerTurnReplay appear in OpenAI request code?",
      },
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_grep_replay",
      toolCallDetail: {
        toolName: "grep",
        searchPattern: "providerTurnReplay",
        matchedFileCount: 1,
        totalMatchCount: 3,
        returnedMatchHitCount: 2,
        contextLineCount: 2,
        matchHits: [
          {
            matchFilePath: "packages/openai/src/provider/request.ts",
            matchLineNumber: 90,
            matchSnippet: "providerTurnReplay.inputItems",
          },
          {
            matchFilePath: "packages/openai/src/provider/request.ts",
            matchLineNumber: 118,
            matchSnippet: "createProviderTurnReplay(providerTurnReplay)",
          },
        ],
      },
      toolResultText: "packages/openai/src/provider/request.ts:90: providerTurnReplay.inputItems",
    },
    createCompletedAssistantMessageEntry("providerTurnReplay appears in request projection."),
  ];

  const evidenceNotes = listReadOnlyToolEvidenceNotes({ conversationSessionEntries });

  expect(evidenceNotes).toHaveLength(1);
  expect(evidenceNotes[0]).toMatchObject({
    sourceDescription: "grep \"providerTurnReplay\" in packages/openai include **/*.ts context 2",
    inspectionQuestion: "Where does providerTurnReplay appear in OpenAI request code?",
  });
  expect(evidenceNotes[0]?.observedSummary).toContain("3 total matches");
  expect(evidenceNotes[0]?.observedSummary).toContain("1 matched file");
  expect(evidenceNotes[0]?.observedSummary).toContain("2 returned matches");
  expect(evidenceNotes[0]?.observedSummary).toContain("first matches packages/openai/src/provider/request.ts:90: providerTurnReplay.inputItems");
});

test("listReadOnlyToolEvidenceNotes summarizes locate_codebase_symbols first exact location from direct result text", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    createUserPromptEntry("Investigate sticky note notebook symbols"),
    {
      entryKind: "tool_call",
      toolCallId: "call_locate_notebook",
      toolCallRequest: {
        toolName: "locate_codebase_symbols",
        symbolNames: ["buildRelevantBuliStickyNotesContextText"],
        filePaths: ["packages/engine/src/readOnlyToolEvidenceNotebook.ts"],
      },
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_locate_notebook",
      toolCallDetail: {
        toolName: "locate_codebase_symbols",
        symbolNames: ["buildRelevantBuliStickyNotesContextText"],
        filePaths: ["packages/engine/src/readOnlyToolEvidenceNotebook.ts"],
        locatedSymbolCount: 1,
        notFoundSymbolCount: 0,
        ambiguousSymbolNameCount: 0,
        verificationReadCount: 1,
      },
      toolResultText: [
        "<codebase_symbol_locations>",
        "<symbol_results>",
        "<symbol_result name=\"buildRelevantBuliStickyNotesContextText\" status=\"resolved\" location_count=\"1\">",
        "<location file=\"packages/engine/src/readOnlyToolEvidenceNotebook.ts\" name=\"buildRelevantBuliStickyNotesContextText\" kind=\"function\" exported=\"true\" lines=\"119-143\">",
        "<verification_read file=\"packages/engine/src/readOnlyToolEvidenceNotebook.ts\" offset_line=\"119\" line_count=\"25\" reason=\"Verify exact definition of buildRelevantBuliStickyNotesContextText\" />",
        "</location>",
        "</symbol_result>",
        "</symbol_results>",
        "</codebase_symbol_locations>",
      ].join("\n"),
    },
    createCompletedAssistantMessageEntry("The notebook builder is the primary symbol."),
  ];

  const evidenceNotes = listReadOnlyToolEvidenceNotes({ conversationSessionEntries });

  expect(evidenceNotes).toHaveLength(1);
  expect(evidenceNotes[0]?.sourceDescription).toBe(
    "locate_codebase_symbols symbols \"buildRelevantBuliStickyNotesContextText\"; files \"packages/engine/src/readOnlyToolEvidenceNotebook.ts\"",
  );
  expect(evidenceNotes[0]?.observedSummary).toContain("1 located symbol definition");
  expect(evidenceNotes[0]?.observedSummary).toContain("1 verification read");
  expect(evidenceNotes[0]?.observedSummary).toContain("first location buildRelevantBuliStickyNotesContextText");
  expect(evidenceNotes[0]?.observedSummary).toContain("source packages/engine/src/readOnlyToolEvidenceNotebook.ts lines 119-143");
  expect(evidenceNotes[0]?.observedSummary).toContain("verification read same file offset 119 count 25");
});

test("listReadOnlyToolEvidenceNotes keeps locate_codebase_symbols count summary when result text has no parseable match", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    createUserPromptEntry("Investigate missing symbols"),
    {
      entryKind: "tool_call",
      toolCallId: "call_locate_missing",
      toolCallRequest: {
        toolName: "locate_codebase_symbols",
        symbolNames: ["MissingSymbol"],
      },
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_locate_missing",
      toolCallDetail: {
        toolName: "locate_codebase_symbols",
        symbolNames: ["MissingSymbol"],
        locatedSymbolCount: 0,
        notFoundSymbolCount: 1,
        ambiguousSymbolNameCount: 0,
        verificationReadCount: 0,
      },
      toolResultText: "<codebase_symbol_locations><symbol_result name=\"MissingSymbol\" status=\"not_found\" location_count=\"0\" /></codebase_symbol_locations>",
    },
    createCompletedAssistantMessageEntry("No symbol was found."),
  ];

  const evidenceNotes = listReadOnlyToolEvidenceNotes({ conversationSessionEntries });

  expect(evidenceNotes).toHaveLength(1);
  expect(evidenceNotes[0]?.observedSummary).toBe("0 located symbol definitions; 1 not-found symbol name; 0 ambiguous symbol names; 0 verification reads");
});

test("listReadOnlyToolEvidenceNotes removes stale notes after a changed file patch", () => {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    ...createCompletedReadTurn({
      promptText: "Investigate OpenAI replay growth",
      toolCallId: "call_replay",
      filePath: "packages/openai/src/provider/request.ts",
      inspectionQuestion: "Where is providerTurnReplay projected into requests?",
      lineText: "providerTurnReplay input items are appended to OpenAI requests",
      assistantMessageText: "Replay projection is in request.ts.",
    }),
    {
      entryKind: "workspace_patch",
      workspacePatch: {
        workspacePatchId: "patch_1",
        toolCallId: "call_patch_1",
        capturedAtMs: 1,
        baselineSnapshotHash: "before",
        resultingSnapshotHash: "after",
        changedFileCount: 1,
        addedLineCount: 1,
        removedLineCount: 1,
        changedFiles: [
          {
            filePath: "packages/openai/src/provider/request.ts",
            changeKind: "modified",
            addedLineCount: 1,
            removedLineCount: 1,
          },
        ],
      },
    },
  ];

  expect(listReadOnlyToolEvidenceNotes({ conversationSessionEntries })).toEqual([]);
});

function createCompletedReadTurn(input: {
  promptText: string;
  toolCallId: string;
  filePath: string;
  inspectionQuestion: string;
  lineText: string;
  assistantMessageText: string;
}): ConversationSessionEntry[] {
  return [
    createUserPromptEntry(input.promptText),
    {
      entryKind: "tool_call",
      toolCallId: input.toolCallId,
      toolCallRequest: {
        toolName: "read",
        readTargetPath: input.filePath,
        offsetLineNumber: 1,
        maximumLineCount: 1,
        inspectionQuestion: input.inspectionQuestion,
      },
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: input.toolCallId,
      toolCallDetail: {
        toolName: "read",
        readFilePath: input.filePath,
        returnedLineCount: 1,
        previewLines: [{ lineNumber: 1, lineText: input.lineText }],
      },
      toolResultText: `1: ${input.lineText}`,
    },
    createCompletedAssistantMessageEntry(input.assistantMessageText),
  ];
}

function createUserPromptEntry(promptText: string): ConversationSessionEntry {
  return {
    entryKind: "user_prompt",
    promptText,
    modelFacingPromptText: promptText,
  };
}

function createCompletedAssistantMessageEntry(assistantMessageText: string): ConversationSessionEntry {
  return {
    entryKind: "assistant_message",
    assistantMessageStatus: "completed",
    assistantMessageText,
  };
}
