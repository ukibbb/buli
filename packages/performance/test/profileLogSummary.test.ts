import { expect, test } from "bun:test";
import { parseBuliProfileJsonl } from "../src/profileLog/readBuliProfileJsonl.ts";
import { summarizeBuliProfileRun } from "../src/profileLog/summarizeBuliProfileRun.ts";

test("parseBuliProfileJsonl reads profile events and summary highlights durations and samples", () => {
  const profileEvents = parseBuliProfileJsonl([
    JSON.stringify({ type: "profile_started", atMs: 1_000, profileFilePath: "profile.jsonl", sampleIntervalMs: 250 }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_010,
      subsystem: "engine",
      eventName: "prompt_context.candidates_loaded",
      fields: { durationMs: 12, scannedEntryCount: 100 },
    }),
    JSON.stringify({
      type: "diagnostic_event",
      atMs: 1_020,
      subsystem: "engine",
      eventName: "prompt_context.candidates_loaded",
      fields: { durationMs: 4, scannedEntryCount: 100 },
    }),
    JSON.stringify({
      type: "process_sample",
      atMs: 1_030,
      rssBytes: 200,
      heapTotalBytes: 100,
      heapUsedBytes: 80,
      externalBytes: 4,
      arrayBuffersBytes: 2,
      cpuUserMicros: 10,
      cpuSystemMicros: 5,
      eventLoopUtilization: 0.5,
      eventLoopDelayMeanMs: 1,
      eventLoopDelayMaxMs: 7,
      eventLoopDelayP95Ms: 6,
    }),
    JSON.stringify({ type: "profile_stopped", atMs: 1_050, profileFilePath: "profile.jsonl", sampleIntervalMs: 250 }),
  ].join("\n"));

  expect(profileEvents).toHaveLength(5);
  expect(summarizeBuliProfileRun(profileEvents)).toEqual({
    profileStartedAtMs: 1_000,
    profileStoppedAtMs: 1_050,
    elapsedMs: 50,
    diagnosticEventCounts: [{ eventKey: "engine:prompt_context.candidates_loaded", count: 2 }],
    diagnosticDurationSummaries: [
      {
        eventKey: "engine:prompt_context.candidates_loaded",
        count: 2,
        maxDurationMs: 12,
        meanDurationMs: 8,
      },
    ],
    processSampleCount: 1,
    maxRssBytes: 200,
    maxHeapUsedBytes: 80,
    maxEventLoopDelayMs: 7,
    maxEventLoopUtilization: 0.5,
  });
});

test("parseBuliProfileJsonl rejects unknown event shapes", () => {
  expect(() => parseBuliProfileJsonl('{"type":"unknown","atMs":1}\n')).toThrow("Invalid Buli profile event at line 1.");
});
