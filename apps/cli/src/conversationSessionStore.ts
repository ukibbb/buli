import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import {
  ConversationSessionSnapshotSchema,
  type ConversationSessionEntry,
  type ConversationSessionEntryRecord,
  type ConversationSessionHeaderRecord,
  type ConversationSessionSnapshot,
  type ConversationSessionSummary,
} from "@buli/contracts";
import {
  loadRecoverableConversationSessionFile,
  type LoadedConversationSessionJsonlFile,
} from "./conversationSessionJsonlFile.ts";
import {
  runWithExclusiveConversationSessionFileWriteLock,
  writeConversationSessionTextFileAtomically,
} from "./conversationSessionFileWrite.ts";

export type ActiveConversationSession = {
  sessionId: string;
  filePath: string;
  conversationSessionEntries: readonly ConversationSessionEntry[];
};

export type ConversationSessionStore = {
  readonly filePath?: string;
  readonly promptCacheKey?: string;
  loadActiveConversationSession(): ActiveConversationSession;
  loadConversationSessionEntries(): readonly ConversationSessionEntry[];
  appendConversationSessionEntry(conversationSessionEntry: ConversationSessionEntry): void;
  saveConversationSessionEntries(conversationSessionEntries: readonly ConversationSessionEntry[]): void;
  startNewConversationSession(): ActiveConversationSession;
  listConversationSessions(): readonly ConversationSessionSummary[];
  switchActiveConversationSession(sessionId: string): ActiveConversationSession;
};

type ConversationSessionIdFactory = () => string;
type ConversationSessionEntryIdFactory = () => string;
type ClockMilliseconds = () => number;

export function defaultConversationSessionFilePath(input: { workspaceRootPath?: string } = {}): string {
  const workspaceRootPath = resolve(input.workspaceRootPath ?? process.cwd());
  return join(
    homedir(),
    ".buli",
    "conversation-sessions",
    `${createWorkspaceSessionFileNamePrefix(workspaceRootPath)}-${createWorkspaceSessionHash(workspaceRootPath)}.json`,
  );
}

export function defaultConversationSessionWorkspaceDirectoryPath(input: { workspaceRootPath?: string } = {}): string {
  const workspaceRootPath = resolve(input.workspaceRootPath ?? process.cwd());
  return join(
    homedir(),
    ".buli",
    "conversation-sessions",
    `${createWorkspaceSessionFileNamePrefix(workspaceRootPath)}-${createWorkspaceSessionHash(workspaceRootPath)}`,
  );
}

export class FileConversationSessionStore implements ConversationSessionStore {
  readonly filePath: string;
  readonly promptCacheKey: string;
  readonly workspaceRootPath: string;
  readonly sessionWorkspaceDirectoryPath: string;
  readonly sessionsDirectoryPath: string;
  readonly activeConversationSessionPointerFilePath: string;
  readonly conversationSessionWriteLockFilePath: string;
  readonly createSessionId: ConversationSessionIdFactory;
  readonly createSessionEntryId: ConversationSessionEntryIdFactory;
  readonly nowMs: ClockMilliseconds;

  constructor(input: {
    filePath?: string;
    workspaceRootPath?: string;
    sessionWorkspaceDirectoryPath?: string;
    createSessionId?: ConversationSessionIdFactory;
    createSessionEntryId?: ConversationSessionEntryIdFactory;
    nowMs?: ClockMilliseconds;
  } = {}) {
    const workspaceRootPath = resolve(input.workspaceRootPath ?? process.cwd());
    this.workspaceRootPath = workspaceRootPath;
    this.filePath = input.filePath ?? defaultConversationSessionFilePath({ workspaceRootPath });
    this.sessionWorkspaceDirectoryPath = input.sessionWorkspaceDirectoryPath ?? createDefaultSessionWorkspaceDirectoryPath({
      legacyConversationSessionFilePath: this.filePath,
      workspaceRootPath,
    });
    this.sessionsDirectoryPath = join(this.sessionWorkspaceDirectoryPath, "sessions");
    this.activeConversationSessionPointerFilePath = join(this.sessionWorkspaceDirectoryPath, "active-session.json");
    this.conversationSessionWriteLockFilePath = join(this.sessionWorkspaceDirectoryPath, "session-store.lock");
    this.promptCacheKey = `buli:${createWorkspaceSessionHash(workspaceRootPath)}`;
    this.createSessionId = input.createSessionId ?? randomUUID;
    this.createSessionEntryId = input.createSessionEntryId ?? (() => randomUUID().slice(0, 12));
    this.nowMs = input.nowMs ?? (() => Date.now());
  }

  loadActiveConversationSession(): ActiveConversationSession {
    return this.runWithConversationSessionWriteLock(() => this.loadActiveConversationSessionWithoutLock());
  }

  loadConversationSessionEntries(): readonly ConversationSessionEntry[] {
    return this.loadActiveConversationSession().conversationSessionEntries;
  }

  appendConversationSessionEntry(conversationSessionEntry: ConversationSessionEntry): void {
    this.runWithConversationSessionWriteLock(() => {
      const activeConversationSession = this.loadActiveConversationSessionWithoutLock();
      const activeConversationSessionFile = loadRecoverableConversationSessionFile({
        filePath: activeConversationSession.filePath,
        nowMs: this.nowMs,
      });
      const parentSessionEntryId = activeConversationSessionFile.entryRecords.at(-1)?.sessionEntryId ?? null;
      const conversationSessionEntryRecord: ConversationSessionEntryRecord = {
        recordKind: "conversation_entry",
        sessionEntryId: this.createSessionEntryId(),
        parentSessionEntryId,
        recordedAtMs: this.nowMs(),
        conversationSessionEntry,
      };

      appendFileSync(activeConversationSession.filePath, `${JSON.stringify(conversationSessionEntryRecord)}\n`, "utf8");
    });
  }

  saveConversationSessionEntries(conversationSessionEntries: readonly ConversationSessionEntry[]): void {
    this.runWithConversationSessionWriteLock(() => {
      const persistedConversationSessionSnapshot: ConversationSessionSnapshot = ConversationSessionSnapshotSchema.parse({
        schemaVersion: 1,
        conversationSessionEntries,
      });

      writeConversationSessionTextFileAtomically({
        filePath: this.filePath,
        text: JSON.stringify(persistedConversationSessionSnapshot, null, 2) + "\n",
      });
    });
  }

  startNewConversationSession(): ActiveConversationSession {
    return this.runWithConversationSessionWriteLock(() => this.startNewConversationSessionWithoutLock());
  }

  listConversationSessions(): readonly ConversationSessionSummary[] {
    return this.runWithConversationSessionWriteLock(() =>
      this.listConversationSessionsWithFilePaths().map((conversationSession) => conversationSession.summary),
    );
  }

  switchActiveConversationSession(sessionId: string): ActiveConversationSession {
    return this.runWithConversationSessionWriteLock(() => {
      const conversationSessionFilePath = this.findConversationSessionFilePathById(sessionId);
      if (!conversationSessionFilePath) {
        throw new Error(`Conversation session not found: ${sessionId}`);
      }

      return this.loadActiveConversationSessionFromFile(conversationSessionFilePath);
    });
  }

  private runWithConversationSessionWriteLock<T>(writeConversationSessionFiles: () => T): T {
    return runWithExclusiveConversationSessionFileWriteLock(
      { lockFilePath: this.conversationSessionWriteLockFilePath },
      writeConversationSessionFiles,
    );
  }

  private loadActiveConversationSessionWithoutLock(): ActiveConversationSession {
    this.ensureSessionDirectoriesExist();

    const activeSessionFilePath = this.findConversationSessionFilePathById(this.readActiveConversationSessionId());
    if (activeSessionFilePath) {
      return this.loadActiveConversationSessionFromFile(activeSessionFilePath);
    }

    if (this.listConversationSessionFiles().length === 0) {
      const migratedConversationSession = this.importLegacySnapshotIfPresent();
      if (migratedConversationSession) {
        return migratedConversationSession;
      }
    }

    const mostRecentlyUpdatedSessionFilePath = this.listConversationSessionsWithFilePaths()[0]?.filePath;
    if (mostRecentlyUpdatedSessionFilePath) {
      return this.loadActiveConversationSessionFromFile(mostRecentlyUpdatedSessionFilePath);
    }

    return this.startNewConversationSessionWithoutLock();
  }

  private startNewConversationSessionWithoutLock(): ActiveConversationSession {
    this.ensureSessionDirectoriesExist();
    const sessionId = this.createSessionId();
    const createdAtMs = this.nowMs();
    const sessionFilePath = this.createConversationSessionFilePath({ sessionId, createdAtMs });
    const headerRecord: ConversationSessionHeaderRecord = {
      recordKind: "conversation_session",
      schemaVersion: 1,
      sessionId,
      workspaceRootPath: this.workspaceRootPath,
      createdAtMs,
    };

    writeConversationSessionTextFileAtomically({ filePath: sessionFilePath, text: `${JSON.stringify(headerRecord)}\n` });
    this.writeActiveConversationSessionId(sessionId);
    return {
      sessionId,
      filePath: sessionFilePath,
      conversationSessionEntries: [],
    };
  }

  private ensureSessionDirectoriesExist(): void {
    mkdirSync(this.sessionsDirectoryPath, { recursive: true });
  }

  private readActiveConversationSessionId(): string | undefined {
    if (!existsSync(this.activeConversationSessionPointerFilePath)) {
      return undefined;
    }

    const parsedPointer = JSON.parse(readFileSync(this.activeConversationSessionPointerFilePath, "utf8")) as unknown;
    if (!isRecord(parsedPointer)) {
      return undefined;
    }

    const activeConversationSessionId = parsedPointer.activeConversationSessionId;
    return typeof activeConversationSessionId === "string" && activeConversationSessionId.length > 0
      ? activeConversationSessionId
      : undefined;
  }

  private writeActiveConversationSessionId(sessionId: string): void {
    writeConversationSessionTextFileAtomically({
      filePath: this.activeConversationSessionPointerFilePath,
      text: JSON.stringify({ activeConversationSessionId: sessionId }, null, 2) + "\n",
    });
  }

  private loadActiveConversationSessionFromFile(filePath: string): ActiveConversationSession {
    const conversationSessionFile = loadRecoverableConversationSessionFile({ filePath, nowMs: this.nowMs });
    this.writeActiveConversationSessionId(conversationSessionFile.headerRecord.sessionId);
    return {
      sessionId: conversationSessionFile.headerRecord.sessionId,
      filePath,
      conversationSessionEntries: listActiveConversationSessionEntryRecords(conversationSessionFile.entryRecords).map(
        (entryRecord) => entryRecord.conversationSessionEntry,
      ),
    };
  }

  private importLegacySnapshotIfPresent(): ActiveConversationSession | undefined {
    if (!existsSync(this.filePath)) {
      return undefined;
    }

    const legacyConversationSessionSnapshot = ConversationSessionSnapshotSchema.parse(
      JSON.parse(readFileSync(this.filePath, "utf8")) as unknown,
    );
    if (legacyConversationSessionSnapshot.conversationSessionEntries.length === 0) {
      return undefined;
    }

    const sessionId = this.createSessionId();
    const createdAtMs = this.nowMs();
    const sessionFilePath = this.createConversationSessionFilePath({ sessionId, createdAtMs });
    const headerRecord: ConversationSessionHeaderRecord = {
      recordKind: "conversation_session",
      schemaVersion: 1,
      sessionId,
      workspaceRootPath: this.workspaceRootPath,
      createdAtMs,
    };
    let parentSessionEntryId: string | null = null;
    const conversationSessionEntryRecords = legacyConversationSessionSnapshot.conversationSessionEntries.map(
      (conversationSessionEntry): ConversationSessionEntryRecord => {
        const sessionEntryId = this.createSessionEntryId();
        const entryRecord: ConversationSessionEntryRecord = {
          recordKind: "conversation_entry",
          sessionEntryId,
          parentSessionEntryId,
          recordedAtMs: this.nowMs(),
          conversationSessionEntry,
        };
        parentSessionEntryId = sessionEntryId;
        return entryRecord;
      },
    );

    writeConversationSessionTextFileAtomically({
      filePath: sessionFilePath,
      text: [headerRecord, ...conversationSessionEntryRecords].map((record) => JSON.stringify(record)).join("\n") + "\n",
    });
    this.writeActiveConversationSessionId(sessionId);
    return {
      sessionId,
      filePath: sessionFilePath,
      conversationSessionEntries: legacyConversationSessionSnapshot.conversationSessionEntries,
    };
  }

  private listConversationSessionsWithFilePaths(): readonly { filePath: string; summary: ConversationSessionSummary }[] {
    return this.listConversationSessionFiles()
      .map((filePath) => {
        const conversationSessionFile = loadRecoverableConversationSessionFile({ filePath, nowMs: this.nowMs });
        return {
          filePath,
          summary: summarizeConversationSessionFile(conversationSessionFile),
        };
      })
      .toSorted((left, right) => right.summary.updatedAtMs - left.summary.updatedAtMs);
  }

  private listConversationSessionFiles(): string[] {
    this.ensureSessionDirectoriesExist();
    return readdirSync(this.sessionsDirectoryPath)
      .filter((fileName) => fileName.endsWith(".jsonl"))
      .map((fileName) => join(this.sessionsDirectoryPath, fileName));
  }

  private findConversationSessionFilePathById(sessionId: string | undefined): string | undefined {
    if (!sessionId) {
      return undefined;
    }

    return this.listConversationSessionFiles().find(
      (filePath) => loadRecoverableConversationSessionFile({ filePath, nowMs: this.nowMs }).headerRecord.sessionId === sessionId,
    );
  }

  private createConversationSessionFilePath(input: { sessionId: string; createdAtMs: number }): string {
    const safeSessionId = input.sessionId.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "session";
    const safeTimestamp = new Date(input.createdAtMs).toISOString().replace(/[:.]/g, "-");
    return join(this.sessionsDirectoryPath, `${safeTimestamp}-${safeSessionId}.jsonl`);
  }
}

function summarizeConversationSessionFile(conversationSessionFile: LoadedConversationSessionJsonlFile): ConversationSessionSummary {
  const activeConversationSessionEntryRecords = listActiveConversationSessionEntryRecords(conversationSessionFile.entryRecords);
  const firstUserPromptEntry = activeConversationSessionEntryRecords.find(
    (entryRecord) => entryRecord.conversationSessionEntry.entryKind === "user_prompt",
  );
  const title = firstUserPromptEntry?.conversationSessionEntry.entryKind === "user_prompt"
    ? firstUserPromptEntry.conversationSessionEntry.promptText.trim() || "New session"
    : "New session";

  return {
    sessionId: conversationSessionFile.headerRecord.sessionId,
    title,
    createdAtMs: conversationSessionFile.headerRecord.createdAtMs,
    updatedAtMs: activeConversationSessionEntryRecords.at(-1)?.recordedAtMs ?? conversationSessionFile.headerRecord.createdAtMs,
    conversationSessionEntryCount: activeConversationSessionEntryRecords.length,
  };
}

function listActiveConversationSessionEntryRecords(
  conversationSessionEntryRecords: readonly ConversationSessionEntryRecord[],
): ConversationSessionEntryRecord[] {
  const leafEntryRecord = conversationSessionEntryRecords.at(-1);
  if (!leafEntryRecord) {
    return [];
  }

  const entryRecordById = new Map(
    conversationSessionEntryRecords.map((entryRecord) => [entryRecord.sessionEntryId, entryRecord] as const),
  );
  const activeEntryRecords: ConversationSessionEntryRecord[] = [];
  let currentEntryRecord: ConversationSessionEntryRecord | undefined = leafEntryRecord;
  while (currentEntryRecord) {
    activeEntryRecords.unshift(currentEntryRecord);
    currentEntryRecord = currentEntryRecord.parentSessionEntryId
      ? entryRecordById.get(currentEntryRecord.parentSessionEntryId)
      : undefined;
  }

  return activeEntryRecords;
}

function createDefaultSessionWorkspaceDirectoryPath(input: {
  legacyConversationSessionFilePath: string;
  workspaceRootPath: string;
}): string {
  const defaultLegacyConversationSessionFilePath = defaultConversationSessionFilePath({ workspaceRootPath: input.workspaceRootPath });
  if (resolve(input.legacyConversationSessionFilePath) === resolve(defaultLegacyConversationSessionFilePath)) {
    return defaultConversationSessionWorkspaceDirectoryPath({ workspaceRootPath: input.workspaceRootPath });
  }

  return join(dirname(input.legacyConversationSessionFilePath), basename(input.legacyConversationSessionFilePath, ".json"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createWorkspaceSessionHash(workspaceRootPath: string): string {
  return createHash("sha256").update(resolve(workspaceRootPath)).digest("hex").slice(0, 16);
}

function createWorkspaceSessionFileNamePrefix(workspaceRootPath: string): string {
  const workspaceFolderName = basename(resolve(workspaceRootPath)).trim();
  const safeWorkspaceFolderName = workspaceFolderName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return safeWorkspaceFolderName || "workspace";
}
