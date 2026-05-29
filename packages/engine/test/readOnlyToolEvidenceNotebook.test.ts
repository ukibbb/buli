import { expect, test } from "bun:test";
import type { ConversationSessionEntry } from "@buli/contracts";
import {
  buildRelevantBuliStickyNotesContextText,
  listReadOnlyToolEvidenceNotes,
} from "../src/readOnlyToolEvidenceNotebook.ts";

test("listReadOnlyToolEvidenceNotes records task purpose question source and compact observation", () => {
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
  expect(evidenceNotes[0]?.observedSummary).toContain("preview 148:");
});

test("buildRelevantBuliStickyNotesContextText includes matching notes and omits unrelated notes", () => {
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
  expect(buliStickyNotesContextText).toContain("Where is providerTurnReplay projected into requests?");
  expect(buliStickyNotesContextText).toContain("packages/openai/src/provider/request.ts");
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
  expect(buliStickyNotesContextText).toContain("Where is providerTurnReplay projected into requests?");
  expect(buliStickyNotesContextText).toContain("Use these as source pointers, not active memory");
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
