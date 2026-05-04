import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  ConversationSessionSnapshotSchema,
  type ConversationSessionEntry,
  type ConversationSessionSnapshot,
} from "@buli/contracts";

export type ConversationSessionStore = {
  readonly filePath?: string;
  loadConversationSessionEntries(): readonly ConversationSessionEntry[];
  saveConversationSessionEntries(conversationSessionEntries: readonly ConversationSessionEntry[]): void;
};

export function defaultConversationSessionFilePath(): string {
  return join(homedir(), ".buli", "conversation-session.json");
}

export class FileConversationSessionStore implements ConversationSessionStore {
  readonly filePath: string;

  constructor(input: { filePath?: string } = {}) {
    this.filePath = input.filePath ?? defaultConversationSessionFilePath();
  }

  loadConversationSessionEntries(): readonly ConversationSessionEntry[] {
    if (!existsSync(this.filePath)) {
      return [];
    }

    const persistedConversationSessionSnapshot = ConversationSessionSnapshotSchema.parse(
      JSON.parse(readFileSync(this.filePath, "utf8")) as unknown,
    );
    return persistedConversationSessionSnapshot.conversationSessionEntries;
  }

  saveConversationSessionEntries(conversationSessionEntries: readonly ConversationSessionEntry[]): void {
    const persistedConversationSessionSnapshot: ConversationSessionSnapshot = ConversationSessionSnapshotSchema.parse({
      schemaVersion: 1,
      conversationSessionEntries,
    });

    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(persistedConversationSessionSnapshot, null, 2) + "\n", "utf8");
  }
}
