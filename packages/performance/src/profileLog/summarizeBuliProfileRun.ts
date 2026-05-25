import type {
  BuliProfileJsonlEvent,
  ProfileDiagnosticEvent,
  ProfileProcessSampleEvent,
} from "./readBuliProfileJsonl.ts";

export type DiagnosticEventCount = Readonly<{
  eventKey: string;
  count: number;
}>;

export type DiagnosticDurationSummary = Readonly<{
  eventKey: string;
  count: number;
  maxDurationMs: number;
  meanDurationMs: number;
}>;

export type BuliProfileRunSummary = Readonly<{
  profileStartedAtMs: number | undefined;
  profileStoppedAtMs: number | undefined;
  elapsedMs: number | undefined;
  diagnosticEventCounts: readonly DiagnosticEventCount[];
  diagnosticDurationSummaries: readonly DiagnosticDurationSummary[];
  processSampleCount: number;
  maxRssBytes: number | undefined;
  maxHeapUsedBytes: number | undefined;
  maxEventLoopDelayMs: number | undefined;
  maxEventLoopUtilization: number | undefined;
}>;

export function summarizeBuliProfileRun(profileEvents: readonly BuliProfileJsonlEvent[]): BuliProfileRunSummary {
  const startedEvent = profileEvents.find((profileEvent) => profileEvent.type === "profile_started");
  const stoppedEvent = profileEvents.findLast((profileEvent) => profileEvent.type === "profile_stopped");
  const diagnosticEvents = profileEvents.filter((profileEvent): profileEvent is ProfileDiagnosticEvent =>
    profileEvent.type === "diagnostic_event"
  );
  const processSamples = profileEvents.filter((profileEvent): profileEvent is ProfileProcessSampleEvent =>
    profileEvent.type === "process_sample"
  );

  return {
    profileStartedAtMs: startedEvent?.atMs,
    profileStoppedAtMs: stoppedEvent?.atMs,
    elapsedMs: startedEvent && stoppedEvent ? stoppedEvent.atMs - startedEvent.atMs : undefined,
    diagnosticEventCounts: countDiagnosticEvents(diagnosticEvents),
    diagnosticDurationSummaries: summarizeDiagnosticDurations(diagnosticEvents),
    processSampleCount: processSamples.length,
    maxRssBytes: maxNumber(processSamples.map((sample) => sample.rssBytes)),
    maxHeapUsedBytes: maxNumber(processSamples.map((sample) => sample.heapUsedBytes)),
    maxEventLoopDelayMs: maxNumber(processSamples.map((sample) => sample.eventLoopDelayMaxMs)),
    maxEventLoopUtilization: maxNumber(processSamples.map((sample) => sample.eventLoopUtilization)),
  };
}

function countDiagnosticEvents(diagnosticEvents: readonly ProfileDiagnosticEvent[]): readonly DiagnosticEventCount[] {
  const eventCountsByKey = new Map<string, number>();
  for (const diagnosticEvent of diagnosticEvents) {
    const eventKey = createDiagnosticEventKey(diagnosticEvent);
    eventCountsByKey.set(eventKey, (eventCountsByKey.get(eventKey) ?? 0) + 1);
  }

  return [...eventCountsByKey.entries()].map(([eventKey, count]) => ({ eventKey, count })).sort((leftCount, rightCount) =>
    rightCount.count - leftCount.count || leftCount.eventKey.localeCompare(rightCount.eventKey)
  );
}

function summarizeDiagnosticDurations(
  diagnosticEvents: readonly ProfileDiagnosticEvent[],
): readonly DiagnosticDurationSummary[] {
  const durationsByEventKey = new Map<string, number[]>();
  for (const diagnosticEvent of diagnosticEvents) {
    const durationMs = diagnosticEvent.fields?.["durationMs"];
    if (typeof durationMs !== "number") {
      continue;
    }

    const eventKey = createDiagnosticEventKey(diagnosticEvent);
    const durations = durationsByEventKey.get(eventKey) ?? [];
    durations.push(durationMs);
    durationsByEventKey.set(eventKey, durations);
  }

  return [...durationsByEventKey.entries()].map(([eventKey, durations]) => ({
    eventKey,
    count: durations.length,
    maxDurationMs: maxNumber(durations) ?? 0,
    meanDurationMs: durations.reduce((total, durationMs) => total + durationMs, 0) / Math.max(1, durations.length),
  })).sort((leftSummary, rightSummary) =>
    rightSummary.maxDurationMs - leftSummary.maxDurationMs || leftSummary.eventKey.localeCompare(rightSummary.eventKey)
  );
}

function createDiagnosticEventKey(diagnosticEvent: Pick<ProfileDiagnosticEvent, "subsystem" | "eventName">): string {
  return `${diagnosticEvent.subsystem}:${diagnosticEvent.eventName}`;
}

function maxNumber(values: readonly number[]): number | undefined {
  return values.length > 0 ? Math.max(...values) : undefined;
}
