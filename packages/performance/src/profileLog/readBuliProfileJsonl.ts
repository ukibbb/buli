import { readFile } from "node:fs/promises";
import type { BuliDiagnosticLogEvent } from "@buli/contracts";

type ProfileEventFields = Readonly<Record<string, string | number | boolean | null | readonly (string | number | boolean | null)[]>>;

export type ProfileLifecycleEvent = Readonly<{
  type: "profile_started" | "profile_stopped";
  atMs: number;
  profileFilePath: string;
  sampleIntervalMs: number;
}>;

export type ProfileDiagnosticEvent = Readonly<{
  type: "diagnostic_event";
  atMs: number;
  subsystem: BuliDiagnosticLogEvent["subsystem"];
  eventName: string;
  fields?: ProfileEventFields | undefined;
}>;

export type ProfileProcessSampleEvent = Readonly<{
  type: "process_sample";
  atMs: number;
  activeConversationTurnId?: string | null | undefined;
  activeConversationTurnCount?: number | undefined;
  sampleDurationMs?: number | undefined;
  rssBytes: number;
  heapTotalBytes: number;
  heapUsedBytes: number;
  externalBytes: number;
  arrayBuffersBytes: number;
  cpuUserMicros: number;
  cpuSystemMicros: number;
  cpuUserDeltaMicros?: number | undefined;
  cpuSystemDeltaMicros?: number | undefined;
  eventLoopUtilization: number;
  eventLoopDelayMeanMs: number;
  eventLoopDelayMaxMs: number;
  eventLoopDelayP95Ms: number;
}>;

export type ProfileLoggerSummaryEvent = Readonly<{
  type: "profile_logger_summary";
  atMs: number;
  profileFilePath: string;
  sampleIntervalMs: number;
  recordedEventCount: number;
  writtenEventCount: number;
  failedWriteEventCount: number;
  flushCount: number;
  failedFlushCount: number;
  bytesWritten: number;
  bufferedEventCount: number;
  maxBufferedEventCount: number;
  totalFlushDurationMs: number;
  maxFlushDurationMs: number;
  hasActiveFlush: boolean;
}>;

export type BuliProfileJsonlEvent = ProfileLifecycleEvent | ProfileDiagnosticEvent | ProfileProcessSampleEvent | ProfileLoggerSummaryEvent;

export async function readBuliProfileJsonl(profileJsonlFilePath: string): Promise<readonly BuliProfileJsonlEvent[]> {
  return parseBuliProfileJsonl(await readFile(profileJsonlFilePath, "utf8"));
}

export function parseBuliProfileJsonl(profileJsonlText: string): readonly BuliProfileJsonlEvent[] {
  const profileEvents: BuliProfileJsonlEvent[] = [];
  for (const [lineIndex, profileLine] of profileJsonlText.split("\n").entries()) {
    if (profileLine.trim().length === 0) {
      continue;
    }

    const parsedProfileEvent: unknown = JSON.parse(profileLine);
    if (!isBuliProfileJsonlEvent(parsedProfileEvent)) {
      throw new Error(`Invalid Buli profile event at line ${lineIndex + 1}.`);
    }
    profileEvents.push(parsedProfileEvent);
  }

  return profileEvents;
}

function isBuliProfileJsonlEvent(value: unknown): value is BuliProfileJsonlEvent {
  if (!isRecord(value) || typeof value["type"] !== "string" || typeof value["atMs"] !== "number") {
    return false;
  }

  switch (value["type"]) {
    case "profile_started":
    case "profile_stopped":
      return typeof value["profileFilePath"] === "string" && typeof value["sampleIntervalMs"] === "number";
    case "diagnostic_event":
      return typeof value["subsystem"] === "string" && typeof value["eventName"] === "string";
    case "process_sample":
      return [
        "rssBytes",
        "heapTotalBytes",
        "heapUsedBytes",
        "externalBytes",
        "arrayBuffersBytes",
        "cpuUserMicros",
        "cpuSystemMicros",
        "eventLoopUtilization",
        "eventLoopDelayMeanMs",
        "eventLoopDelayMaxMs",
        "eventLoopDelayP95Ms",
      ].every((fieldName) => typeof value[fieldName] === "number");
    case "profile_logger_summary":
      return typeof value["profileFilePath"] === "string" &&
        typeof value["sampleIntervalMs"] === "number" &&
        typeof value["recordedEventCount"] === "number" &&
        typeof value["writtenEventCount"] === "number" &&
        typeof value["failedWriteEventCount"] === "number" &&
        typeof value["flushCount"] === "number" &&
        typeof value["failedFlushCount"] === "number" &&
        typeof value["bytesWritten"] === "number" &&
        typeof value["bufferedEventCount"] === "number" &&
        typeof value["maxBufferedEventCount"] === "number" &&
        typeof value["totalFlushDurationMs"] === "number" &&
        typeof value["maxFlushDurationMs"] === "number" &&
        typeof value["hasActiveFlush"] === "boolean";
    default:
      return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
