import { Buffer } from "node:buffer";
import { closeSync, openSync, readFileSync, readSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  ConversationSessionHeaderRecordSchema,
  ConversationSessionJsonLineRecordSchema,
  ConversationSessionSettingsRecordSchema,
  type ConversationSessionEntryRecord,
  type ConversationSessionHeaderRecord,
  type ConversationSessionJsonLineRecord,
  type ConversationSessionSettingsRecord,
} from "@buli/contracts";
import { writeConversationSessionTextFileAtomically } from "./conversationSessionFileWrite.ts";

export type ConversationSessionClockMilliseconds = () => number;

export type LoadedConversationSessionJsonlFile = {
  filePath: string;
  headerRecord: ConversationSessionHeaderRecord;
  settingsRecords: ConversationSessionSettingsRecord[];
  entryRecords: ConversationSessionEntryRecord[];
};

export type ConversationSessionEntryRecordMetadata = {
  sessionEntryId: string;
  parentSessionEntryId: string | null;
  recordedAtMs: number;
  userPromptTitle: string | undefined;
};

export type LoadedConversationSessionJsonlFileMetadata = {
  filePath: string;
  headerRecord: ConversationSessionHeaderRecord;
  entryRecords: ConversationSessionEntryRecordMetadata[];
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
    settingsRecords: conversationSessionRecords.filter(isConversationSessionSettingsRecord),
    entryRecords: conversationSessionRecords.filter(isConversationSessionEntryRecord),
  };
}

export function loadConversationSessionFileHeaderRecord(input: { filePath: string }): ConversationSessionHeaderRecord {
  const rawConversationSessionHeaderLineText = readFirstNonEmptyTextFileLine(input.filePath);
  if (!rawConversationSessionHeaderLineText) {
    throw new Error(`Conversation session file has no header: ${input.filePath}`);
  }

  return parseConversationSessionHeaderRecord(rawConversationSessionHeaderLineText);
}

export function loadRecoverableConversationSessionFileMetadata(input: {
  filePath: string;
  nowMs: ConversationSessionClockMilliseconds;
}): LoadedConversationSessionJsonlFileMetadata {
  const rawConversationSessionJsonlText = readFileSync(input.filePath, "utf8");
  const rawConversationSessionJsonLines = splitConversationSessionJsonlTextIntoRecordLines(rawConversationSessionJsonlText);
  const validRawConversationSessionJsonLines: string[] = [];
  const entryRecords: ConversationSessionEntryRecordMetadata[] = [];
  let headerRecord: ConversationSessionHeaderRecord | undefined;

  for (let rawJsonLineIndex = 0; rawJsonLineIndex < rawConversationSessionJsonLines.length; rawJsonLineIndex += 1) {
    const rawJsonLineText = rawConversationSessionJsonLines[rawJsonLineIndex]!;
    if (rawJsonLineText.trim().length === 0) {
      continue;
    }

    try {
      if (!headerRecord) {
        headerRecord = parseConversationSessionHeaderRecord(rawJsonLineText);
      } else if (isConversationSessionSettingsRawJsonLine(rawJsonLineText)) {
        parseConversationSessionSettingsRecord(rawJsonLineText);
      } else {
        entryRecords.push(parseConversationSessionEntryRecordMetadata(rawJsonLineText));
      }
      validRawConversationSessionJsonLines.push(rawJsonLineText);
    } catch (error) {
      if (!headerRecord) {
        throw error;
      }

      quarantineConversationSessionCorruptRawSuffix({
        filePath: input.filePath,
        rawConversationSessionJsonLines,
        firstCorruptLineIndex: rawJsonLineIndex,
        validRawConversationSessionJsonLines,
        corruptionExplanation: error instanceof Error ? error.message : String(error),
        nowMs: input.nowMs,
      });
      return {
        filePath: input.filePath,
        headerRecord,
        entryRecords,
      };
    }
  }

  if (!headerRecord) {
    throw new Error(`Conversation session file has no header: ${input.filePath}`);
  }

  return {
    filePath: input.filePath,
    headerRecord,
    entryRecords,
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

function readFirstNonEmptyTextFileLine(filePath: string): string | undefined {
  const fileDescriptor = openSync(filePath, "r");
  try {
    const readBuffer = Buffer.alloc(4096);
    let pendingText = "";

    while (true) {
      const bytesRead = readSync(fileDescriptor, readBuffer, 0, readBuffer.length, null);
      if (bytesRead === 0) {
        break;
      }

      pendingText += readBuffer.subarray(0, bytesRead).toString("utf8");
      let lineBreakIndex = pendingText.indexOf("\n");
      while (lineBreakIndex !== -1) {
        const rawLineText = removeTrailingCarriageReturn(pendingText.slice(0, lineBreakIndex));
        if (rawLineText.trim().length > 0) {
          return rawLineText;
        }

        pendingText = pendingText.slice(lineBreakIndex + 1);
        lineBreakIndex = pendingText.indexOf("\n");
      }
    }

    const finalLineText = removeTrailingCarriageReturn(pendingText);
    return finalLineText.trim().length > 0 ? finalLineText : undefined;
  } finally {
    closeSync(fileDescriptor);
  }
}

function removeTrailingCarriageReturn(rawLineText: string): string {
  return rawLineText.endsWith("\r") ? rawLineText.slice(0, -1) : rawLineText;
}

function parseConversationSessionJsonLineRecord(rawJsonLineText: string): ConversationSessionJsonLineRecord {
  return ConversationSessionJsonLineRecordSchema.parse(JSON.parse(rawJsonLineText) as unknown);
}

function parseConversationSessionHeaderRecord(rawJsonLineText: string): ConversationSessionHeaderRecord {
  return ConversationSessionHeaderRecordSchema.parse(JSON.parse(rawJsonLineText) as unknown);
}

function parseConversationSessionSettingsRecord(rawJsonLineText: string): ConversationSessionSettingsRecord {
  return ConversationSessionSettingsRecordSchema.parse(JSON.parse(rawJsonLineText) as unknown);
}

function isConversationSessionSettingsRawJsonLine(rawJsonLineText: string): boolean {
  return readStringPropertyFromRawJson({
    rawJsonText: rawJsonLineText,
    propertyName: "recordKind",
    startIndex: 0,
  }) === "conversation_session_settings";
}

function parseConversationSessionEntryRecordMetadata(rawJsonLineText: string): ConversationSessionEntryRecordMetadata {
  assertCompleteConversationSessionJsonLine(rawJsonLineText);
  const conversationSessionEntryValueStartIndex = findJsonPropertyValueStartIndex({
    rawJsonText: rawJsonLineText,
    propertyName: "conversationSessionEntry",
  });
  if (conversationSessionEntryValueStartIndex === undefined) {
    throw new Error("Conversation session entry record has no conversationSessionEntry property");
  }

  const parsedEntryRecordMetadata = JSON.parse(
    `${rawJsonLineText.slice(0, conversationSessionEntryValueStartIndex)}null}`,
  ) as unknown;
  if (!isRecord(parsedEntryRecordMetadata)) {
    throw new Error("Conversation session entry record metadata is not an object");
  }

  const recordKind = parsedEntryRecordMetadata["recordKind"];
  if (recordKind !== "conversation_entry") {
    throw new Error("Conversation session entry record has invalid recordKind");
  }

  return {
    sessionEntryId: readRequiredNonEmptyStringProperty(parsedEntryRecordMetadata, "sessionEntryId"),
    parentSessionEntryId: readRequiredNullableNonEmptyStringProperty(parsedEntryRecordMetadata, "parentSessionEntryId"),
    recordedAtMs: readRequiredNonnegativeIntegerProperty(parsedEntryRecordMetadata, "recordedAtMs"),
    userPromptTitle: readConversationSessionEntryUserPromptTitle({
      rawJsonLineText,
      conversationSessionEntryValueStartIndex,
    }),
  };
}

function assertCompleteConversationSessionJsonLine(rawJsonLineText: string): void {
  const expectedJsonClosingCharacters: string[] = [];
  let hasStartedRootObject = false;
  let hasCompletedRootObject = false;
  let isInsideString = false;
  let isPreviousCharacterEscape = false;

  for (let currentIndex = 0; currentIndex < rawJsonLineText.length; currentIndex += 1) {
    const currentCharacter = rawJsonLineText[currentIndex]!;

    if (!hasStartedRootObject) {
      if (/\s/.test(currentCharacter)) {
        continue;
      }
      if (currentCharacter !== "{") {
        throw new Error("Conversation session JSON line must start with an object");
      }
      hasStartedRootObject = true;
      expectedJsonClosingCharacters.push("}");
      continue;
    }

    if (hasCompletedRootObject) {
      if (!/\s/.test(currentCharacter)) {
        throw new Error("Conversation session JSON line has trailing content");
      }
      continue;
    }

    if (isInsideString) {
      if (isPreviousCharacterEscape) {
        isPreviousCharacterEscape = false;
        continue;
      }
      if (currentCharacter === "\\") {
        isPreviousCharacterEscape = true;
        continue;
      }
      if (currentCharacter === '"') {
        isInsideString = false;
      }
      continue;
    }

    if (currentCharacter === '"') {
      isInsideString = true;
      continue;
    }
    if (currentCharacter === "{") {
      expectedJsonClosingCharacters.push("}");
      continue;
    }
    if (currentCharacter === "[") {
      expectedJsonClosingCharacters.push("]");
      continue;
    }
    if (currentCharacter === "}" || currentCharacter === "]") {
      const expectedJsonClosingCharacter = expectedJsonClosingCharacters.pop();
      if (expectedJsonClosingCharacter !== currentCharacter) {
        throw new Error("Conversation session JSON line has mismatched brackets");
      }
      hasCompletedRootObject = expectedJsonClosingCharacters.length === 0;
    }
  }

  if (!hasStartedRootObject || isInsideString || isPreviousCharacterEscape || expectedJsonClosingCharacters.length > 0) {
    throw new Error("Conversation session JSON line is incomplete");
  }
}

function quarantineConversationSessionCorruptSuffix(input: {
  filePath: string;
  rawConversationSessionJsonLines: readonly string[];
  firstCorruptLineIndex: number;
  validConversationSessionRecords: readonly ConversationSessionJsonLineRecord[];
  corruptionExplanation: string;
  nowMs: ConversationSessionClockMilliseconds;
}): void {
  quarantineConversationSessionCorruptRawSuffix({
    filePath: input.filePath,
    rawConversationSessionJsonLines: input.rawConversationSessionJsonLines,
    firstCorruptLineIndex: input.firstCorruptLineIndex,
    validRawConversationSessionJsonLines: input.validConversationSessionRecords.map((record) => JSON.stringify(record)),
    corruptionExplanation: input.corruptionExplanation,
    nowMs: input.nowMs,
  });
}

function quarantineConversationSessionCorruptRawSuffix(input: {
  filePath: string;
  rawConversationSessionJsonLines: readonly string[];
  firstCorruptLineIndex: number;
  validRawConversationSessionJsonLines: readonly string[];
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
    text: `${input.validRawConversationSessionJsonLines.join("\n")}\n`,
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

function isConversationSessionSettingsRecord(
  conversationSessionJsonLineRecord: ConversationSessionJsonLineRecord,
): conversationSessionJsonLineRecord is ConversationSessionSettingsRecord {
  return conversationSessionJsonLineRecord.recordKind === "conversation_session_settings";
}

function readRequiredNonEmptyStringProperty(record: Record<string, unknown>, propertyName: string): string {
  const value = record[propertyName];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  throw new Error(`Conversation session entry record metadata has invalid ${propertyName}`);
}

function readRequiredNullableNonEmptyStringProperty(record: Record<string, unknown>, propertyName: string): string | null {
  const value = record[propertyName];
  if (value === null) {
    return null;
  }
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  throw new Error(`Conversation session entry record metadata has invalid ${propertyName}`);
}

function readRequiredNonnegativeIntegerProperty(record: Record<string, unknown>, propertyName: string): number {
  const value = record[propertyName];
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  throw new Error(`Conversation session entry record metadata has invalid ${propertyName}`);
}

function readConversationSessionEntryUserPromptTitle(input: {
  rawJsonLineText: string;
  conversationSessionEntryValueStartIndex: number;
}): string | undefined {
  const entryKind = readStringPropertyFromRawJson({
    rawJsonText: input.rawJsonLineText,
    propertyName: "entryKind",
    startIndex: input.conversationSessionEntryValueStartIndex,
  });
  if (entryKind !== "user_prompt") {
    return undefined;
  }

  return readStringPropertyFromRawJson({
    rawJsonText: input.rawJsonLineText,
    propertyName: "promptText",
    startIndex: input.conversationSessionEntryValueStartIndex,
  });
}

function readStringPropertyFromRawJson(input: {
  rawJsonText: string;
  propertyName: string;
  startIndex: number;
}): string | undefined {
  const valueStartIndex = findJsonPropertyValueStartIndex(input);
  if (valueStartIndex === undefined || input.rawJsonText[valueStartIndex] !== '"') {
    return undefined;
  }

  const valueEndIndex = findJsonStringEndIndex(input.rawJsonText, valueStartIndex);
  if (valueEndIndex === undefined) {
    return undefined;
  }

  const parsedValue = JSON.parse(input.rawJsonText.slice(valueStartIndex, valueEndIndex + 1)) as unknown;
  return typeof parsedValue === "string" ? parsedValue : undefined;
}

function findJsonPropertyValueStartIndex(input: {
  rawJsonText: string;
  propertyName: string;
  startIndex?: number;
}): number | undefined {
  const propertyNameToken = JSON.stringify(input.propertyName);
  let searchIndex = input.startIndex ?? 0;

  while (searchIndex < input.rawJsonText.length) {
    const propertyNameIndex = input.rawJsonText.indexOf(propertyNameToken, searchIndex);
    if (propertyNameIndex === -1) {
      return undefined;
    }

    const separatorIndex = skipJsonWhitespace(input.rawJsonText, propertyNameIndex + propertyNameToken.length);
    if (input.rawJsonText[separatorIndex] === ":") {
      return skipJsonWhitespace(input.rawJsonText, separatorIndex + 1);
    }

    searchIndex = propertyNameIndex + propertyNameToken.length;
  }

  return undefined;
}

function skipJsonWhitespace(rawJsonText: string, startIndex: number): number {
  let currentIndex = startIndex;
  while (/\s/.test(rawJsonText[currentIndex] ?? "")) {
    currentIndex += 1;
  }
  return currentIndex;
}

function findJsonStringEndIndex(rawJsonText: string, stringStartIndex: number): number | undefined {
  let isPreviousCharacterEscape = false;
  for (let currentIndex = stringStartIndex + 1; currentIndex < rawJsonText.length; currentIndex += 1) {
    const currentCharacter = rawJsonText[currentIndex];
    if (isPreviousCharacterEscape) {
      isPreviousCharacterEscape = false;
      continue;
    }
    if (currentCharacter === "\\") {
      isPreviousCharacterEscape = true;
      continue;
    }
    if (currentCharacter === '"') {
      return currentIndex;
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
