import { expect, test } from "bun:test";
import type { ProviderStreamEvent } from "@buli/contracts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseAvailableAssistantModelsFromOpenAiResponse } from "../src/provider/models.ts";
import { parseOpenAiStream, type OpenAiResponseStepTerminalState } from "../src/provider/stream.ts";

type ParsedOpenAiStreamFixture = {
  parsedEvents: ProviderStreamEvent[];
  terminalState: OpenAiResponseStepTerminalState;
};

function readOpenAiCassetteFixtureText(fixtureFileName: string): string {
  return readFileSync(resolve(import.meta.dir, "fixtures", fixtureFileName), "utf8");
}

function readOpenAiCassetteJsonFixture(fixtureFileName: string): unknown {
  const parsedJson: unknown = JSON.parse(readOpenAiCassetteFixtureText(fixtureFileName));
  return parsedJson;
}

function createOpenAiCassetteSseResponse(fixtureFileName: string): Response {
  return new Response(new Blob([readOpenAiCassetteFixtureText(fixtureFileName)]).stream(), {
    headers: { "content-type": "text/event-stream" },
  });
}

async function parseOpenAiCassetteSseFixture(fixtureFileName: string): Promise<ParsedOpenAiStreamFixture> {
  const parsedEvents: ProviderStreamEvent[] = [];
  const openAiStreamIterator = parseOpenAiStream(createOpenAiCassetteSseResponse(fixtureFileName))[Symbol.asyncIterator]();

  while (true) {
    const nextStreamItem = await openAiStreamIterator.next();
    if (nextStreamItem.done) {
      return {
        parsedEvents,
        terminalState: nextStreamItem.value,
      };
    }

    parsedEvents.push(nextStreamItem.value);
  }
}

test("OpenAI model-list cassette maps visible API models and ignores provider extras", () => {
  expect(
    parseAvailableAssistantModelsFromOpenAiResponse(
      readOpenAiCassetteJsonFixture("openai-model-list.success.cassette.json"),
    ),
  ).toEqual([
    {
      id: "gpt-5.5",
      displayName: "GPT-5.5",
      defaultReasoningEffort: "high",
      supportedReasoningEfforts: ["minimal", "medium", "high", "xhigh"],
    },
    {
      id: "gpt-5.5-codex",
      displayName: "GPT-5.5 Codex",
      defaultReasoningEffort: "medium",
      supportedReasoningEfforts: ["low", "medium", "high"],
    },
    {
      id: "gpt-4.1-mini",
      displayName: "gpt-4.1-mini",
      supportedReasoningEfforts: [],
    },
  ]);
});

test("OpenAI text-only Responses cassette parses completed stream output", async () => {
  const parsedFixture = await parseOpenAiCassetteSseFixture("openai-responses.text-only.completed.cassette.sse.txt");

  expect(parsedFixture.parsedEvents).toEqual([
    { type: "text_chunk", text: "Hello from a sanitized cassette." },
    {
      type: "completed",
      usage: {
        total: 35,
        input: 20,
        output: 10,
        reasoning: 0,
        cache: { read: 5, write: 0 },
      },
    },
  ]);
  expect(parsedFixture.terminalState).toEqual({ terminalKind: "completed" });
});

test("OpenAI reasoning tool-call Responses cassette parses stream order and terminal tool request", async () => {
  const parsedFixture = await parseOpenAiCassetteSseFixture(
    "openai-responses.reasoning-tool-call.completed.cassette.sse.txt",
  );
  const requestedToolCall = parsedFixture.parsedEvents.find((parsedEvent) => parsedEvent.type === "tool_call_requested");

  expect(parsedFixture.parsedEvents.map((parsedEvent) => parsedEvent.type)).toEqual([
    "reasoning_summary_started",
    "reasoning_summary_text_chunk",
    "reasoning_summary_text_chunk",
    "reasoning_summary_completed",
    "tool_call_requested",
  ]);
  expect(parsedFixture.parsedEvents.flatMap((parsedEvent) =>
    parsedEvent.type === "reasoning_summary_text_chunk" ? [parsedEvent.text] : []
  ).join("")).toBe("Need to inspect a file.");
  expect(requestedToolCall).toEqual({
    type: "tool_call_requested",
    toolCallId: "call_fixture_read",
    toolCallRequest: {
      toolName: "read",
      readTargetPath: "README.md",
      maximumLineCount: 5,
    },
  });
  expect(parsedFixture.terminalState).toMatchObject({
    terminalKind: "tool_call_requested",
    toolCallId: "call_fixture_read",
    toolCallRequest: {
      toolName: "read",
      readTargetPath: "README.md",
      maximumLineCount: 5,
    },
    usage: {
      total: 68,
      input: 50,
      output: 0,
      reasoning: 8,
      cache: { read: 10, write: 0 },
    },
  });
});
