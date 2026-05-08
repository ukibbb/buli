import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  ConversationSessionJsonLineRecordSchema,
  type ConversationSessionEntryRecord,
  type ConversationSessionHeaderRecord,
  type ConversationSessionJsonLineRecord,
} from "@buli/contracts";
import { writeConversationSessionTextFileAtomically } from "./conversationSessionFileWrite.ts";

export type ConversationSessionClockMilliseconds = () => number;

export type LoadedConversationSessionJsonlFile = {
  filePath: string;
  headerRecord: ConversationSessionHeaderRecord;
  entryRecords: ConversationSessionEntryRecord[];
};

export function loadRecoverableConversationSessionFile(input: {
  filePath: string;
  nowMs: ConversationSessionClockMilliseconds;
}): LoadedConversationSessionJsonlFile {
  const conversationSessionRecords = loadRecoverableConversationSessionJsonLineRecords(input);
  const headerRecord = conversationSessionRecords[0];
  if (!headerRecord || headerRecord.recordKind !== "conversation_session") {
    throw new Error(`Conversation session file has no header: ${input.filePath}`);
  }

  return {
    filePath: input.filePath,
    headerRecord,
    entryRecords: conversationSessionRecords.filter(isConversationSessionEntryRecord),
  };
}

function loadRecoverableConversationSessionJsonLineRecords(input: {
  filePath: string;
  nowMs: ConversationSessionClockMilliseconds;
}): ConversationSessionJsonLineRecord[] {
  const rawConversationSessionJsonlText = readFileSync(input.filePath, "utf8");
  const rawConversationSessionJsonLines = splitConversationSessionJsonlTextIntoRecordLines(
    rawConversationSessionJsonlText,
  );
  const validConversationSessionRecords: ConversationSessionJsonLineRecord[] = [];

  for (let rawJsonLineIndex = 0; rawJsonLineIndex < rawConversationSessionJsonLines.length; rawJsonLineIndex += 1) {
    const rawJsonLineText = rawConversationSessionJsonLines[rawJsonLineIndex]!;
    if (rawJsonLineText.trim().length === 0) {
      continue;
    }

    try {
      validConversationSessionRecords.push(parseConversationSessionJsonLineRecord(rawJsonLineText));
    } catch (error) {
      if (!validConversationSessionRecords.some((record) => record.recordKind === "conversation_session")) {
        throw error;
      }

      quarantineConversationSessionCorruptSuffix({
        filePath: input.filePath,
        rawConversationSessionJsonLines,
        firstCorruptLineIndex: rawJsonLineIndex,
        validConversationSessionRecords,
        corruptionExplanation: error instanceof Error ? error.message : String(error),
        nowMs: input.nowMs,
      });
      return validConversationSessionRecords;
    }
  }

  return validConversationSessionRecords;
}

function splitConversationSessionJsonlTextIntoRecordLines(rawConversationSessionJsonlText: string): string[] {
  const rawConversationSessionJsonLines = rawConversationSessionJsonlText.split("\n");
  return rawConversationSessionJsonlText.endsWith("\n")
    ? rawConversationSessionJsonLines.slice(0, -1)
    : rawConversationSessionJsonLines;
}

function parseConversationSessionJsonLineRecord(rawJsonLineText: string): ConversationSessionJsonLineRecord {
  return ConversationSessionJsonLineRecordSchema.parse(JSON.parse(rawJsonLineText) as unknown);
}

function quarantineConversationSessionCorruptSuffix(input: {
  filePath: string;
  rawConversationSessionJsonLines: readonly string[];
  firstCorruptLineIndex: number;
  validConversationSessionRecords: readonly ConversationSessionJsonLineRecord[];
  corruptionExplanation: string;
  nowMs: ConversationSessionClockMilliseconds;
}): void {
  const corruptSuffixText = input.rawConversationSessionJsonLines.slice(input.firstCorruptLineIndex).join("\n");
  const corruptTailFilePath = createConversationSessionCorruptTailFilePath({
    filePath: input.filePath,
    quarantinedAtMs: input.nowMs(),
  });
  const corruptTailDiagnosticText = [
    "Conversation session JSONL corrupt suffix quarantine",
    `Source file: ${input.filePath}`,
    `First corrupt line: ${input.firstCorruptLineIndex + 1}`,
    `Reason: ${input.corruptionExplanation}`,
    "",
    corruptSuffixText,
  ].join("\n");

  writeConversationSessionTextFileAtomically({ filePath: corruptTailFilePath, text: corruptTailDiagnosticText });
  writeConversationSessionTextFileAtomically({
    filePath: input.filePath,
    text: `${input.validConversationSessionRecords.map((record) => JSON.stringify(record)).join("\n")}\n`,
  });
}

function createConversationSessionCorruptTailFilePath(input: {
  filePath: string;
  quarantinedAtMs: number;
}): string {
  const safeQuarantinedAtTimestamp = new Date(input.quarantinedAtMs).toISOString().replace(/[:.]/g, "-");
  return join(
    dirname(input.filePath),
    `${basename(input.filePath, ".jsonl")}.corrupt-tail.${safeQuarantinedAtTimestamp}.txt`,
  );
}

function isConversationSessionEntryRecord(
  conversationSessionJsonLineRecord: ConversationSessionJsonLineRecord,
): conversationSessionJsonLineRecord is ConversationSessionEntryRecord {
  return conversationSessionJsonLineRecord.recordKind === "conversation_entry";
}
