import { expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ConversationSessionEntryRecord, ConversationSessionHeaderRecord } from "@buli/contracts";
import { loadRecoverableConversationSessionFile } from "../src/conversationSessionJsonlFile.ts";

test("loadRecoverableConversationSessionFile loads a complete JSONL session", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-jsonl-file-complete-"));
  const conversationSessionFilePath = join(directoryPath, "session.jsonl");
  const headerRecord = createConversationSessionHeaderRecord("session-1");
  const firstEntryRecord = createUserPromptEntryRecord({
    sessionEntryId: "entry-1",
    parentSessionEntryId: null,
    promptText: "First prompt",
  });
  await writeJsonlSessionFile(conversationSessionFilePath, [headerRecord, firstEntryRecord]);

  const loadedConversationSessionFile = loadRecoverableConversationSessionFile({
    filePath: conversationSessionFilePath,
    nowMs: () => Date.UTC(2026, 4, 7, 12, 30, 0),
  });

  expect(loadedConversationSessionFile.headerRecord).toEqual(headerRecord);
  expect(loadedConversationSessionFile.entryRecords).toEqual([firstEntryRecord]);
});

test("loadRecoverableConversationSessionFile recovers valid records before a partial final line", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-jsonl-file-partial-tail-"));
  const conversationSessionFilePath = join(directoryPath, "session.jsonl");
  const headerRecord = createConversationSessionHeaderRecord("session-1");
  const firstEntryRecord = createUserPromptEntryRecord({
    sessionEntryId: "entry-1",
    parentSessionEntryId: null,
    promptText: "First prompt",
  });
  await writeJsonlSessionFile(conversationSessionFilePath, [headerRecord, firstEntryRecord]);
  const validJsonlText = await readFile(conversationSessionFilePath, "utf8");
  await writeFile(
    conversationSessionFilePath,
    `${validJsonlText}{"recordKind":"conversation_entry","sessionEntryId":"partial-tail"`,
    "utf8",
  );

  const loadedConversationSessionFile = loadRecoverableConversationSessionFile({
    filePath: conversationSessionFilePath,
    nowMs: () => Date.UTC(2026, 4, 7, 12, 30, 0),
  });

  expect(loadedConversationSessionFile.entryRecords).toEqual([firstEntryRecord]);
  const sessionFileNames = await readdir(dirname(conversationSessionFilePath));
  const corruptTailFileName = sessionFileNames.find((fileName) => fileName.includes(".corrupt-tail."));
  expect(corruptTailFileName).toContain("2026-05-07T12-30-00-000Z.txt");
  expect(await readFile(conversationSessionFilePath, "utf8")).not.toContain("partial-tail");
  expect(await readFile(join(dirname(conversationSessionFilePath), corruptTailFileName ?? ""), "utf8")).toContain(
    "partial-tail",
  );
});

test("loadRecoverableConversationSessionFile quarantines a corrupt middle suffix", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-jsonl-file-corrupt-middle-"));
  const conversationSessionFilePath = join(directoryPath, "session.jsonl");
  const headerRecord = createConversationSessionHeaderRecord("session-1");
  const firstEntryRecord = createUserPromptEntryRecord({
    sessionEntryId: "entry-1",
    parentSessionEntryId: null,
    promptText: "First prompt",
  });
  const quarantinedEntryRecord: ConversationSessionEntryRecord = {
    recordKind: "conversation_entry",
    sessionEntryId: "entry-2",
    parentSessionEntryId: "entry-1",
    recordedAtMs: 1002,
    conversationSessionEntry: {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "This suffix should not load.",
    },
  };
  await writeFile(
    conversationSessionFilePath,
    [
      JSON.stringify(headerRecord),
      JSON.stringify(firstEntryRecord),
      "{not-json",
      JSON.stringify(quarantinedEntryRecord),
      "",
    ].join("\n"),
    "utf8",
  );

  const loadedConversationSessionFile = loadRecoverableConversationSessionFile({
    filePath: conversationSessionFilePath,
    nowMs: () => Date.UTC(2026, 4, 7, 12, 31, 0),
  });

  expect(loadedConversationSessionFile.entryRecords).toEqual([firstEntryRecord]);
  const sessionFileNames = await readdir(dirname(conversationSessionFilePath));
  const corruptTailFileName = sessionFileNames.find((fileName) => fileName.includes(".corrupt-tail."));
  expect(corruptTailFileName).toContain("2026-05-07T12-31-00-000Z.txt");
  const corruptTailText = await readFile(join(dirname(conversationSessionFilePath), corruptTailFileName ?? ""), "utf8");
  expect(corruptTailText).toContain("{not-json");
  expect(corruptTailText).toContain("This suffix should not load.");
  expect(await readFile(conversationSessionFilePath, "utf8")).not.toContain("This suffix should not load.");
});

function createConversationSessionHeaderRecord(sessionId: string): ConversationSessionHeaderRecord {
  return {
    recordKind: "conversation_session",
    schemaVersion: 1,
    sessionId,
    workspaceRootPath: "/workspace/demo",
    createdAtMs: 1000,
  };
}

function createUserPromptEntryRecord(input: {
  sessionEntryId: string;
  parentSessionEntryId: string | null;
  promptText: string;
}): ConversationSessionEntryRecord {
  return {
    recordKind: "conversation_entry",
    sessionEntryId: input.sessionEntryId,
    parentSessionEntryId: input.parentSessionEntryId,
    recordedAtMs: 1001,
    conversationSessionEntry: {
      entryKind: "user_prompt",
      promptText: input.promptText,
      modelFacingPromptText: input.promptText,
    },
  };
}

async function writeJsonlSessionFile(
  conversationSessionFilePath: string,
  conversationSessionRecords: readonly [ConversationSessionHeaderRecord, ...ConversationSessionEntryRecord[]],
): Promise<void> {
  await writeFile(
    conversationSessionFilePath,
    `${conversationSessionRecords.map((conversationSessionRecord) => JSON.stringify(conversationSessionRecord)).join("\n")}\n`,
    "utf8",
  );
}
