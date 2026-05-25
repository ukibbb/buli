import { expect, test } from "bun:test";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  combineBuliDiagnosticLoggers,
  installBuliProfileLogger,
  type BuliProfileEvent,
} from "../src/profiling/buliProfileLogger.ts";

async function readPermissionBits(filePath: string): Promise<number> {
  return (await stat(filePath)).mode & 0o777;
}

function parseProfileEvents(profileText: string): BuliProfileEvent[] {
  return profileText.trim().split("\n").map((profileEventLine) => JSON.parse(profileEventLine) as BuliProfileEvent);
}

test("installBuliProfileLogger is disabled when no profile file is configured", async () => {
  const installation = installBuliProfileLogger({ environment: {} });

  expect(installation.diagnosticLogger).toBeUndefined();
  expect(installation.profileFilePath).toBeUndefined();
  await installation.dispose();
});

test("installBuliProfileLogger writes diagnostic events and process samples as buffered JSONL", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-profile-logger-"));
  const profileDirectoryPath = join(directoryPath, "profile");
  const profileFilePath = join(profileDirectoryPath, "profile.jsonl");
  const installation = installBuliProfileLogger({
    environment: {
      BULI_PROFILE_FILE: profileFilePath,
      BULI_PROFILE_SAMPLE_MS: "10000",
    },
  });

  installation.diagnosticLogger?.({
    subsystem: "engine",
    eventName: "conversation_turn.accepted",
    fields: {
      selectedModelId: "gpt-5.4",
      conversationSessionEntryCount: 3,
    },
  });
  await installation.dispose();

  const profileEvents = parseProfileEvents(await readFile(profileFilePath, "utf8"));
  expect(profileEvents[0]).toMatchObject({
    type: "profile_started",
    profileFilePath,
    sampleIntervalMs: 10000,
  });
  expect(profileEvents).toContainEqual(expect.objectContaining({
    type: "diagnostic_event",
    subsystem: "engine",
    eventName: "conversation_turn.accepted",
    fields: {
      selectedModelId: "gpt-5.4",
      conversationSessionEntryCount: 3,
    },
  }));
  expect(profileEvents).toContainEqual(expect.objectContaining({
    type: "process_sample",
  }));
  expect(profileEvents.at(-1)).toMatchObject({
    type: "profile_stopped",
    profileFilePath,
    sampleIntervalMs: 10000,
  });
  await expect(readPermissionBits(profileDirectoryPath)).resolves.toBe(0o700);
  await expect(readPermissionBits(profileFilePath)).resolves.toBe(0o600);
});

test("combineBuliDiagnosticLoggers forwards events to every configured logger", () => {
  const receivedEventNames: string[] = [];
  const combinedLogger = combineBuliDiagnosticLoggers([
    undefined,
    (event) => receivedEventNames.push(`first:${event.eventName}`),
    (event) => receivedEventNames.push(`second:${event.eventName}`),
  ]);

  combinedLogger?.({ subsystem: "cli", eventName: "interactive_chat.starting" });

  expect(receivedEventNames).toEqual([
    "first:interactive_chat.starting",
    "second:interactive_chat.starting",
  ]);
});
