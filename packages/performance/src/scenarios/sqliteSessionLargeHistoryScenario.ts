import { rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { BuliDiagnosticLogEvent, ConversationSessionEntry } from "@buli/contracts";
import { SqliteConversationSessionStore } from "../../../../apps/cli/src/conversationSession/sqlite/sqliteConversationSessionStore.ts";
import {
  createBytesMetric,
  createCountMetric,
  createDurationMetric,
  measureDurationMs,
  type PerformanceScenario,
} from "../model/performanceScenario.ts";

const largeSessionEntryCount = 1_000;

export const sqliteSessionLargeHistoryScenario: PerformanceScenario = {
  scenarioName: "sqlite-session-large-history",
  description: "Measures SQLite append, active metadata load, full entry load, list, and session switch for a large persisted session.",
  defaultWarmupCount: 1,
  defaultRepeatCount: 3,
  async runIteration(input) {
    const scenarioDirectoryPath = join(input.runOutputDirectoryPath, "sqlite-session-large-history", `iteration-${input.iterationIndex}`);
    await rm(scenarioDirectoryPath, { recursive: true, force: true });
    const databasePath = join(scenarioDirectoryPath, "session-store.sqlite");
    const workspaceRootPath = join(scenarioDirectoryPath, "workspace");
    const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
    const conversationSessionEntries = createLargeConversationSessionEntries(largeSessionEntryCount);
    const conversationSessionStore = new SqliteConversationSessionStore({
      databasePath,
      workspaceRootPath,
      createSessionId: createSequentialIdFactory("session"),
      createSessionEntryId: createSequentialIdFactory("entry"),
      nowMs: createIncrementingNowMs(),
      diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
    });

    const heapUsedBeforeScenario = process.memoryUsage().heapUsed;
    const appendEntries = await measureDurationMs(() => {
      for (const conversationSessionEntry of conversationSessionEntries) {
        conversationSessionStore.appendConversationSessionEntry(conversationSessionEntry);
      }
    });
    const firstConversationSessionId = conversationSessionStore.loadActiveConversationSessionMetadata().sessionId;
    conversationSessionStore.startNewConversationSession();
    const listSessions = await measureDurationMs(() => conversationSessionStore.listConversationSessions());
    const switchActiveSession = await measureDurationMs(() =>
      conversationSessionStore.switchActiveConversationSession(firstConversationSessionId)
    );
    conversationSessionStore.close();

    const reloadedConversationSessionStore = new SqliteConversationSessionStore({
      databasePath,
      workspaceRootPath,
      diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
    });
    const loadActiveMetadata = await measureDurationMs(() => reloadedConversationSessionStore.loadActiveConversationSessionMetadata());
    const loadConversationSessionEntries = await measureDurationMs(() =>
      reloadedConversationSessionStore.loadConversationSessionEntries(firstConversationSessionId)
    );
    reloadedConversationSessionStore.close();
    const heapUsedAfterScenario = process.memoryUsage().heapUsed;
    const databaseSizeBytes = (await stat(databasePath)).size;

    return {
      iterationLabel: `${input.isWarmup ? "warmup" : "repeat"}-${input.iterationIndex}`,
      diagnosticEvents,
      metrics: [
        createDurationMetric({
          metricName: "sqlite_session_large_history.append_entries.duration_ms",
          durationMs: appendEntries.durationMs,
          budget: { warnAbove: 2_000, failAbove: 5_000 },
        }),
        createDurationMetric({
          metricName: "sqlite_session_large_history.load_active_metadata.duration_ms",
          durationMs: loadActiveMetadata.durationMs,
          budget: { warnAbove: 20, failAbove: 100 },
        }),
        createDurationMetric({
          metricName: "sqlite_session_large_history.load_entries.duration_ms",
          durationMs: loadConversationSessionEntries.durationMs,
          budget: { warnAbove: 200, failAbove: 750 },
        }),
        createDurationMetric({
          metricName: "sqlite_session_large_history.list_sessions.duration_ms",
          durationMs: listSessions.durationMs,
          budget: { warnAbove: 20, failAbove: 100 },
        }),
        createDurationMetric({
          metricName: "sqlite_session_large_history.switch_session.duration_ms",
          durationMs: switchActiveSession.durationMs,
          budget: { warnAbove: 200, failAbove: 750 },
        }),
        createCountMetric({
          metricName: "sqlite_session_large_history.entry_count",
          count: largeSessionEntryCount,
          lowerIsBetter: false,
        }),
        createCountMetric({
          metricName: "sqlite_session_large_history.loaded_entry_count",
          count: loadConversationSessionEntries.measuredValue.length,
          lowerIsBetter: false,
        }),
        createBytesMetric({
          metricName: "sqlite_session_large_history.database_size_bytes",
          bytes: databaseSizeBytes,
          lowerIsBetter: false,
        }),
        createBytesMetric({
          metricName: "sqlite_session_large_history.heap_used_delta_bytes",
          bytes: Math.max(0, heapUsedAfterScenario - heapUsedBeforeScenario),
          budget: { warnAbove: 20_000_000, failAbove: 50_000_000 },
        }),
      ],
    };
  },
};

function createLargeConversationSessionEntries(entryCount: number): readonly ConversationSessionEntry[] {
  return Array.from({ length: entryCount }, (_value, entryIndex): ConversationSessionEntry => {
    if (entryIndex % 2 === 0) {
      return {
        entryKind: "user_prompt",
        promptText: `Investigate stored session entry ${entryIndex}`,
        modelFacingPromptText: `Investigate stored session entry ${entryIndex}`,
      };
    }

    return {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: `Completed stored answer ${entryIndex}. ${"details ".repeat(40)}`,
    };
  });
}

function createSequentialIdFactory(prefix: string): () => string {
  let nextId = 0;
  return () => {
    nextId += 1;
    return `${prefix}-${nextId}`;
  };
}

function createIncrementingNowMs(): () => number {
  let nowMs = 1_000;
  return () => {
    nowMs += 1;
    return nowMs;
  };
}
