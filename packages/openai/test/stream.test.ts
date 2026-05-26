import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ASSISTANT_TOOL_REQUEST_NAMES, ContextWindowOverflowError, MAX_BASH_TOOL_TIMEOUT_MILLISECONDS, type ToolCallRequest } from "@buli/contracts";
import { OpenAiAuthStore } from "../src/auth/store.ts";
import { OpenAiProvider } from "../src/provider/client.ts";
import { parseOpenAiStream } from "../src/provider/stream.ts";
import { createOpenAiToolDefinitions } from "../src/provider/toolDefinitions.ts";

function buildResponseWithSseFixture(fixtureFileName: string): Response {
  const fixtureBytes = readFileSync(resolve(import.meta.dir, "fixtures", fixtureFileName));
  return new Response(new Blob([fixtureBytes]).stream(), {
    headers: { "content-type": "text/event-stream" },
  });
}

function createSseDataFrame(openAiStreamEvent: Record<string, unknown>): string {
  return `data: ${JSON.stringify(openAiStreamEvent)}\n\n`;
}

function createConversationTurnRequest(input: { messageText: string }) {
  return {
    systemPromptText: "You are buli.",
    conversationSessionEntries: [
      {
        entryKind: "user_prompt" as const,
        promptText: input.messageText,
        modelFacingPromptText: input.messageText,
      },
    ],
    selectedModelId: "gpt-5.4",
  };
}

async function collectParsedEvents(response: Response, options?: Parameters<typeof parseOpenAiStream>[1]) {
  const parsedEvents = [];
  for await (const parsedEvent of parseOpenAiStream(response, options)) {
    parsedEvents.push(parsedEvent);
  }
  return parsedEvents;
}

async function collectParsedEventsAndTerminalState(response: Response) {
  const parsedEvents = [];
  const iterator = parseOpenAiStream(response)[Symbol.asyncIterator]();
  while (true) {
    const nextStreamItem = await iterator.next();
    if (nextStreamItem.done) {
      return {
        parsedEvents,
        terminalState: nextStreamItem.value,
      };
    }

    parsedEvents.push(nextStreamItem.value);
  }
}

test("parseOpenAiStream yields text deltas and final usage", async () => {
  const response = new Response(
    [
      'data: {"type":"response.created","response":{"id":"resp_1","created_at":1,"model":"gpt-5.4","service_tier":null}}\n\n',
      'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"Hello"}\n\n',
      'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":" world"}\n\n',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":120,"input_tokens_details":{"cached_tokens":20},"output_tokens":60,"output_tokens_details":{"reasoning_tokens":10},"total_tokens":180}}}\n\n',
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  expect(await collectParsedEvents(response)).toEqual([
    { type: "text_chunk", text: "Hello" },
    { type: "text_chunk", text: " world" },
    {
      type: "completed",
      usage: {
        total: 180,
        input: 100,
        output: 50,
        reasoning: 10,
        cache: { read: 20, write: 0 },
      },
    },
  ]);
});

test("parseOpenAiStream accepts CRLF-delimited SSE frames", async () => {
  const response = new Response(
    [
      'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"Hello"}\r\n\r\n',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":5}}}\r\n\r\n',
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  expect(await collectParsedEvents(response)).toEqual([
    { type: "text_chunk", text: "Hello" },
    {
      type: "completed",
      usage: {
        total: 15,
        input: 10,
        output: 5,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    },
  ]);
});

test("parseOpenAiStream accepts multi-line SSE data frames", async () => {
  const response = new Response(
    [
      'event: response.output_text.delta\n',
      'data: {"type":"response.output_text.delta",\n',
      'data: "item_id":"msg_1","delta":"Hello"}\n\n',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":5}}}\n\n',
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  expect(await collectParsedEvents(response)).toEqual([
    { type: "text_chunk", text: "Hello" },
    {
      type: "completed",
      usage: {
        total: 15,
        input: 10,
        output: 5,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    },
  ]);
});

test("parseOpenAiStream accepts valid SSE streams with a missing content-type", async () => {
  const response = new Response(
    new Blob([
      [
        'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"Hello without header"}\n\n',
        'data: {"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":5}}}\n\n',
      ].join(""),
    ]).stream(),
  );

  expect(response.headers.get("content-type")).toBeNull();
  expect(await collectParsedEvents(response)).toEqual([
    { type: "text_chunk", text: "Hello without header" },
    {
      type: "completed",
      usage: {
        total: 15,
        input: 10,
        output: 5,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    },
  ]);
});

test("parseOpenAiStream rejects non-SSE content types", async () => {
  const response = new Response("<html>not an event stream</html>", {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

  await expect(collectParsedEvents(response)).rejects.toThrow(
    "OpenAI stream response must be text/event-stream, received text/html; charset=utf-8",
  );
});

test("parseOpenAiStream emits incomplete when the response stops early", async () => {
  const response = new Response(
    [
      'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"Partial"}\n\n',
      'data: {"type":"response.incomplete","response":{"incomplete_details":{"reason":"max_output_tokens"},"usage":{"input_tokens":20,"output_tokens":4,"output_tokens_details":{"reasoning_tokens":1},"total_tokens":24}}}\n\n',
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  expect(await collectParsedEvents(response)).toEqual([
    { type: "text_chunk", text: "Partial" },
    {
      type: "incomplete",
      incompleteReason: "max_output_tokens",
      usage: {
        total: 24,
        input: 20,
        output: 3,
        reasoning: 1,
        cache: { read: 0, write: 0 },
      },
    },
  ]);
});

test("parseOpenAiStream re-emits reasoning summary chunks in order", async () => {
  const response = buildResponseWithSseFixture("reasoning-plus-text.sse.txt");
  const emittedEvents = await collectParsedEvents(response);
  const emittedEventTypes = emittedEvents.map((emittedEvent) => emittedEvent.type);
  expect(emittedEventTypes).toContain("reasoning_summary_started");
  expect(emittedEventTypes).toContain("reasoning_summary_text_chunk");
  expect(emittedEventTypes).toContain("reasoning_summary_completed");
});

test("parseOpenAiStream ignores unknown SSE event types and malformed hot delta payloads", async () => {
  const response = new Response(
    [
      'data: {"type":"response.unknown_event","foo":"bar"}\n\n',
      'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":42}\n\n',
      'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"Hello"}\n\n',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":5}}}\n\n',
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  expect(await collectParsedEvents(response)).toEqual([
    {
      type: "text_chunk",
      text: "Hello",
    },
    {
      type: "completed",
      usage: {
        total: 15,
        input: 10,
        output: 5,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    },
  ]);
});

test("parseOpenAiStream fails with stream context when an SSE frame is malformed JSON", async () => {
  const response = new Response("data: {not-json}\n\n", { headers: { "Content-Type": "text/event-stream" } });

  await expect(collectParsedEvents(response)).rejects.toThrow("OpenAI stream returned malformed SSE JSON at frame 1");
});

test("parseOpenAiStream fails when the SSE stream stalls past the idle timeout", async () => {
  const textEncoder = new TextEncoder();
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(textEncoder.encode(createSseDataFrame({
          type: "response.output_text.delta",
          item_id: "msg_1",
          delta: "Partial",
        })));
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  await expect(collectParsedEvents(response, { idleTimeoutMilliseconds: 1 })).rejects.toThrow(
    "OpenAI stream stalled for 1ms without receiving data",
  );
});

test("parseOpenAiStream rejects an oversized delimited SSE frame", async () => {
  const response = new Response(
    createSseDataFrame({
      type: "response.output_text.delta",
      item_id: "msg_1",
      delta: "x".repeat(1_048_577),
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  await expect(collectParsedEvents(response)).rejects.toThrow("OpenAI stream SSE frame exceeded 1048576 characters");
});

test("parseOpenAiStream rejects an oversized unterminated SSE frame", async () => {
  const response = new Response(`data: ${"x".repeat(1_048_577)}`, {
    headers: { "Content-Type": "text/event-stream" },
  });

  await expect(collectParsedEvents(response)).rejects.toThrow("OpenAI stream SSE frame exceeded 1048576 characters");
});

test("parseOpenAiStream emits reasoning_summary_completed before the first non-reasoning text chunk", async () => {
  const response = new Response(
    [
      'data: {"type":"response.reasoning_summary_text.delta","item_id":"r_1","delta":"Thinking"}\n\n',
      'data: {"type":"response.reasoning_summary_text.done","item_id":"r_1"}\n\n',
      'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"Answer"}\n\n',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":5}}}\n\n',
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  expect((await collectParsedEvents(response)).map((emittedEvent) => emittedEvent.type)).toEqual([
    "reasoning_summary_started",
    "reasoning_summary_text_chunk",
    "reasoning_summary_completed",
    "text_chunk",
    "completed",
  ]);
});

test("parseOpenAiStream emits reasoning lifecycle for reasoning items without summary text", async () => {
  const response = new Response(
    [
      createSseDataFrame({
        type: "response.output_item.added",
        output_index: 0,
        item: { type: "reasoning", id: "rs_1", summary: [], encrypted_content: "encrypted-reasoning" },
      }),
      createSseDataFrame({
        type: "response.output_item.done",
        output_index: 0,
        item: { type: "reasoning", id: "rs_1", summary: [], encrypted_content: "encrypted-reasoning" },
      }),
      createSseDataFrame({
        type: "response.completed",
        response: { usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } },
      }),
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  expect((await collectParsedEvents(response)).map((emittedEvent) => emittedEvent.type)).toEqual([
    "reasoning_summary_started",
    "reasoning_summary_completed",
    "completed",
  ]);
});

test("parseOpenAiStream ignores reasoning deltas with invalid summary indexes", async () => {
  const response = new Response(
    [
      createSseDataFrame({
        type: "response.reasoning_summary_text.delta",
        item_id: "rs_1",
        summary_index: -1,
        delta: "invalid",
      }),
      createSseDataFrame({
        type: "response.reasoning_summary_text.delta",
        item_id: "rs_1",
        summary_index: 1.5,
        delta: "invalid",
      }),
      createSseDataFrame({
        type: "response.completed",
        response: { usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } },
      }),
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  expect(await collectParsedEvents(response)).toEqual([
    {
      type: "completed",
      usage: {
        total: 15,
        input: 10,
        output: 5,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    },
  ]);
});

test("parseOpenAiStream preserves streamed reasoning summary text for tool-call replay", async () => {
  const response = new Response(
    [
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"reasoning","id":"rs_1","summary":[],"encrypted_content":"encrypted-reasoning"}}\n\n',
      'data: {"type":"response.reasoning_summary_part.added","item_id":"rs_1","summary_index":0}\n\n',
      'data: {"type":"response.reasoning_summary_text.delta","item_id":"rs_1","summary_index":0,"delta":"I should "}\n\n',
      'data: {"type":"response.reasoning_summary_text.delta","item_id":"rs_1","summary_index":0,"delta":"inspect first."}\n\n',
      'data: {"type":"response.reasoning_summary_text.done","item_id":"rs_1","summary_index":0}\n\n',
      'data: {"type":"response.output_item.added","output_index":1,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"bash","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}"}\n\n',
      'data: {"type":"response.completed","response":{"output":[{"type":"reasoning","id":"rs_1","summary":[],"encrypted_content":"encrypted-reasoning"},{"id":"fc_1","type":"function_call","call_id":"call_1","name":"bash","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  const { parsedEvents, terminalState } = await collectParsedEventsAndTerminalState(response);

  expect(parsedEvents.map((parsedEvent) => parsedEvent.type)).toEqual([
    "reasoning_summary_started",
    "reasoning_summary_text_chunk",
    "reasoning_summary_text_chunk",
    "reasoning_summary_completed",
    "tool_call_requested",
  ]);
  expect(terminalState).toMatchObject({
    terminalKind: "tool_call_requested",
    responseOutputItems: [
      {
        type: "reasoning",
        id: "rs_1",
        encrypted_content: "encrypted-reasoning",
        summary: [{ type: "summary_text", text: "I should inspect first." }],
      },
      {
        id: "fc_1",
        type: "function_call",
        call_id: "call_1",
        name: "bash",
        arguments: '{"command":"pwd","description":"Print working directory"}',
      },
    ],
  });
});

test("parseOpenAiStream preserves reasoning deltas received before output_item.added", async () => {
  const response = new Response(
    [
      createSseDataFrame({
        type: "response.reasoning_summary_text.delta",
        item_id: "rs_1",
        summary_index: 0,
        delta: "I should ",
      }),
      createSseDataFrame({
        type: "response.reasoning_summary_text.delta",
        item_id: "rs_1",
        summary_index: 0,
        delta: "inspect first.",
      }),
      createSseDataFrame({
        type: "response.output_item.added",
        output_index: 0,
        item: { type: "reasoning", id: "rs_1", summary: [], encrypted_content: "encrypted-reasoning" },
      }),
      createSseDataFrame({
        type: "response.output_item.added",
        output_index: 1,
        item: { type: "function_call", id: "fc_1", call_id: "call_1", name: "bash", arguments: "" },
      }),
      createSseDataFrame({
        type: "response.function_call_arguments.done",
        item_id: "fc_1",
        arguments: '{"command":"pwd","description":"Print working directory"}',
      }),
      createSseDataFrame({
        type: "response.completed",
        response: {
          output: [
            {
              id: "fc_1",
              type: "function_call",
              call_id: "call_1",
              name: "bash",
              arguments: '{"command":"pwd","description":"Print working directory"}',
            },
          ],
          usage: { input_tokens: 10, output_tokens: 0, total_tokens: 10 },
        },
      }),
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  const { parsedEvents, terminalState } = await collectParsedEventsAndTerminalState(response);

  expect(parsedEvents.map((parsedEvent) => parsedEvent.type)).toEqual([
    "reasoning_summary_started",
    "reasoning_summary_text_chunk",
    "reasoning_summary_text_chunk",
    "reasoning_summary_completed",
    "tool_call_requested",
  ]);
  expect(terminalState).toMatchObject({
    terminalKind: "tool_call_requested",
    responseOutputItems: [
      {
        type: "reasoning",
        id: "rs_1",
        encrypted_content: "encrypted-reasoning",
        summary: [{ type: "summary_text", text: "I should inspect first." }],
      },
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "bash",
        arguments: '{"command":"pwd","description":"Print working directory"}',
      },
    ],
  });
});

test("parseOpenAiStream emits tool_call_requested only once when arguments.done and output_item.done both make the call ready", async () => {
  const response = new Response(
    [
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"bash","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}"}\n\n',
      'data: {"type":"response.output_item.done","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"bash","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}"}}\n\n',
      'data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_1","name":"bash","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  expect(await collectParsedEvents(response)).toEqual([
    {
      type: "tool_call_requested",
      toolCallId: "call_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "pwd",
        commandDescription: "Print working directory",
      },
    },
  ]);
});

test("parseOpenAiStream throws when a terminal completed event has malformed usage", async () => {
  const response = new Response(
    'data: {"type":"response.completed","response":{"usage":{"input_tokens":"oops"}}}\n\n',
    { headers: { "Content-Type": "text/event-stream" } },
  );

  await expect(collectParsedEvents(response)).rejects.toThrow();
});

test("parseOpenAiStream emits tool_call_requested and returns a tool-request terminal state", async () => {
  const response = new Response(
    [
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"bash","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}"}\n\n',
      'data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_1","name":"bash","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  const emittedEvents = [];
  const iterator = parseOpenAiStream(response)[Symbol.asyncIterator]();
  while (true) {
    const nextStreamItem = await iterator.next();
    if (nextStreamItem.done) {
      expect(nextStreamItem.value).toEqual({
        terminalKind: "tool_call_requested",
        toolCallId: "call_1",
        toolCallRequest: {
          toolName: "bash",
          shellCommand: "pwd",
          commandDescription: "Print working directory",
        },
        responseOutputItems: [
          {
            id: "fc_1",
            type: "function_call",
            call_id: "call_1",
            name: "bash",
            arguments: '{"command":"pwd","description":"Print working directory"}',
          },
        ],
        usage: { total: 10, input: 10, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      });
      break;
    }

    emittedEvents.push(nextStreamItem.value);
  }

  expect(emittedEvents).toEqual([
    {
      type: "tool_call_requested",
      toolCallId: "call_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "pwd",
        commandDescription: "Print working directory",
      },
    },
  ]);
});

test("parseOpenAiStream emits an ordered batch for same-step function calls", async () => {
  const response = new Response(
    [
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_read_1","name":"read","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"filePath\\":\\"README.md\\"}"}\n\n',
      'data: {"type":"response.output_item.added","output_index":1,"item":{"type":"function_call","id":"fc_2","call_id":"call_grep_1","name":"grep","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_2","arguments":"{\\"pattern\\":\\"ToolCallRequest\\",\\"path\\":\\"packages\\"}"}\n\n',
      'data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_read_1","name":"read","arguments":"{\\"filePath\\":\\"README.md\\"}"},{"id":"fc_2","type":"function_call","call_id":"call_grep_1","name":"grep","arguments":"{\\"pattern\\":\\"ToolCallRequest\\",\\"path\\":\\"packages\\"}"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  const { parsedEvents, terminalState } = await collectParsedEventsAndTerminalState(response);

  expect(parsedEvents).toEqual([
    {
      type: "tool_call_requested",
      toolCallId: "call_read_1",
      toolCallRequest: {
        toolName: "read",
        readTargetPath: "README.md",
      },
    },
    {
      type: "tool_call_requested",
      toolCallId: "call_grep_1",
      toolCallRequest: {
        toolName: "grep",
        regexPattern: "ToolCallRequest",
        searchPath: "packages",
      },
    },
  ]);
  expect(terminalState).toMatchObject({
    terminalKind: "tool_calls_requested",
    requestedToolCalls: [
      { toolCallId: "call_read_1", toolCallRequest: { toolName: "read", readTargetPath: "README.md" } },
      {
        toolCallId: "call_grep_1",
        toolCallRequest: { toolName: "grep", regexPattern: "ToolCallRequest", searchPath: "packages" },
      },
    ],
  });
});

test("parseOpenAiStream accepts nullable bash function arguments", async () => {
  const response = new Response(
    [
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"bash","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\",\\"workdir\\":null,\\"timeout\\":null}"}\n\n',
      'data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_1","name":"bash","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\",\\"workdir\\":null,\\"timeout\\":null}"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  const emittedEvents = [];
  for await (const emittedEvent of parseOpenAiStream(response)) {
    emittedEvents.push(emittedEvent);
  }

  expect(emittedEvents).toEqual([
    {
      type: "tool_call_requested",
      toolCallId: "call_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "pwd",
        commandDescription: "Print working directory",
      },
    },
  ]);
});

test("parseOpenAiStream parses typed coding tool calls", async () => {
  const toolCallCases: Array<{
    toolName: ToolCallRequest["toolName"];
    argumentsText: string;
    expectedToolCallRequest: ToolCallRequest;
  }> = [
    {
      toolName: "read",
      argumentsText: '{"filePath":"README.md","offset":2,"limit":5}',
      expectedToolCallRequest: {
        toolName: "read",
        readTargetPath: "README.md",
        offsetLineNumber: 2,
        maximumLineCount: 5,
      },
    },
    {
      toolName: "read_many",
      argumentsText: '{"targets":[{"filePath":"README.md","offset":2,"limit":5},{"filePath":"packages/openai/src/provider/toolDefinitions.ts","offset":null,"limit":null}]}',
      expectedToolCallRequest: {
        toolName: "read_many",
        readTargets: [
          {
            readTargetPath: "README.md",
            offsetLineNumber: 2,
            maximumLineCount: 5,
          },
          {
            readTargetPath: "packages/openai/src/provider/toolDefinitions.ts",
          },
        ],
      },
    },
    {
      toolName: "search_many",
      argumentsText: '{"searches":[{"searchKind":"glob","pattern":"**/*.ts","path":"packages","include":null,"contextLineCount":null},{"searchKind":"grep","pattern":"ToolCallRequest","path":"packages","include":"*.ts","contextLineCount":2}]}',
      expectedToolCallRequest: {
        toolName: "search_many",
        searches: [
          {
            searchKind: "glob",
            globPattern: "**/*.ts",
            searchDirectoryPath: "packages",
          },
          {
            searchKind: "grep",
            regexPattern: "ToolCallRequest",
            searchPath: "packages",
            includeGlobPattern: "*.ts",
            contextLineCount: 2,
          },
        ],
      },
    },
    {
      toolName: "glob",
      argumentsText: '{"pattern":"**/*.ts","path":"packages"}',
      expectedToolCallRequest: {
        toolName: "glob",
        globPattern: "**/*.ts",
        searchDirectoryPath: "packages",
      },
    },
    {
      toolName: "grep",
      argumentsText: '{"pattern":"ToolCallRequest","path":"packages","include":"*.ts","contextLineCount":2}',
      expectedToolCallRequest: {
        toolName: "grep",
        regexPattern: "ToolCallRequest",
        searchPath: "packages",
        includeGlobPattern: "*.ts",
        contextLineCount: 2,
      },
    },
    {
      toolName: "edit",
      argumentsText: '{"filePath":"src/app.ts","oldString":"old","newString":""}',
      expectedToolCallRequest: {
        toolName: "edit",
        editTargetPath: "src/app.ts",
        oldString: "old",
        newString: "",
      },
    },
    {
      toolName: "edit_many",
      argumentsText: '{"edits":[{"filePath":"src/app.ts","oldString":"old","newString":"new","replaceAll":true}]}',
      expectedToolCallRequest: {
        toolName: "edit_many",
        edits: [
          {
            editTargetPath: "src/app.ts",
            oldString: "old",
            newString: "new",
            replaceAll: true,
          },
        ],
      },
    },
    {
      toolName: "patch",
      argumentsText: JSON.stringify({ patchText: "*** Begin Patch\n*** Update File: README.md\n@@\n-old\n+new\n*** End Patch" }),
      expectedToolCallRequest: {
        toolName: "patch",
        patchText: "*** Begin Patch\n*** Update File: README.md\n@@\n-old\n+new\n*** End Patch",
      },
    },
    {
      toolName: "patch_many",
      argumentsText: JSON.stringify({ patchText: "*** Begin Patch\n*** Add File: generated.txt\n+new\n*** End Patch" }),
      expectedToolCallRequest: {
        toolName: "patch_many",
        patchText: "*** Begin Patch\n*** Add File: generated.txt\n+new\n*** End Patch",
      },
    },
    {
      toolName: "write",
      argumentsText: '{"filePath":"src/generated.ts","content":""}',
      expectedToolCallRequest: {
        toolName: "write",
        writeTargetPath: "src/generated.ts",
        fileContent: "",
      },
    },
    {
      toolName: "task",
      argumentsText: '{"subagent":"explore","description":"map runtime","prompt":"Inspect engine runtime flow."}',
      expectedToolCallRequest: {
        toolName: "task",
        subagentName: "explore",
        subagentDescription: "map runtime",
        subagentPrompt: "Inspect engine runtime flow.",
      },
    },
    {
      toolName: "skill",
      argumentsText: '{"skillName":"code-review"}',
      expectedToolCallRequest: {
        toolName: "skill",
        skillName: "code-review",
      },
    },
  ];

  for (const toolCallCase of toolCallCases) {
    const eventArgumentsText = JSON.stringify(toolCallCase.argumentsText);
    const response = new Response(
      [
        `data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"${toolCallCase.toolName}","arguments":""}}\n\n`,
        `data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":${eventArgumentsText}}\n\n`,
        `data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_1","name":"${toolCallCase.toolName}","arguments":${eventArgumentsText}}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n`,
      ].join(""),
      { headers: { "Content-Type": "text/event-stream" } },
    );

    expect(await collectParsedEvents(response)).toEqual([
      {
        type: "tool_call_requested",
        toolCallId: "call_1",
        toolCallRequest: toolCallCase.expectedToolCallRequest,
      },
    ]);
  }
});

test("parseOpenAiStream reports patch requests with invalid section counts", async () => {
  const invalidPatchArgumentsText = JSON.stringify({
    patchText: "*** Begin Patch\n*** Update File: one.txt\n@@\n-old\n+new\n*** Update File: two.txt\n@@\n-old\n+new\n*** End Patch",
  });
  const response = new Response(
    [
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"patch","arguments":""}}\n\n',
      `data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":${JSON.stringify(invalidPatchArgumentsText)}}\n\n`,
      `data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_1","name":"patch","arguments":${JSON.stringify(invalidPatchArgumentsText)}}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n`,
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  const { terminalState } = await collectParsedEventsAndTerminalState(response);

  expect(terminalState).toMatchObject({
    terminalKind: "provider_function_calls_requested",
    providerFunctionCallIntents: [
      {
        intentKind: "invalid_function_call",
        functionCallId: "call_1",
        functionName: "patch",
        invalidCallExplanation: expect.stringContaining("exactly one file section"),
      },
    ],
  });
});

test("createOpenAiToolDefinitions instructs inspection through typed tools", () => {
  const openAiToolDefinitions = createOpenAiToolDefinitions();
  const bashToolDefinition = openAiToolDefinitions.find((toolDefinition) => toolDefinition.name === "bash");
  const readToolDefinition = openAiToolDefinitions.find((toolDefinition) => toolDefinition.name === "read");
  const readManyToolDefinition = openAiToolDefinitions.find((toolDefinition) => toolDefinition.name === "read_many");
  const searchManyToolDefinition = openAiToolDefinitions.find((toolDefinition) => toolDefinition.name === "search_many");
  const globToolDefinition = openAiToolDefinitions.find((toolDefinition) => toolDefinition.name === "glob");
  const grepToolDefinition = openAiToolDefinitions.find((toolDefinition) => toolDefinition.name === "grep");
  const editToolDefinition = openAiToolDefinitions.find((toolDefinition) => toolDefinition.name === "edit");
  const editManyToolDefinition = openAiToolDefinitions.find((toolDefinition) => toolDefinition.name === "edit_many");
  const patchToolDefinition = openAiToolDefinitions.find((toolDefinition) => toolDefinition.name === "patch");
  const patchManyToolDefinition = openAiToolDefinitions.find((toolDefinition) => toolDefinition.name === "patch_many");
  const writeToolDefinition = openAiToolDefinitions.find((toolDefinition) => toolDefinition.name === "write");
  const taskToolDefinition = openAiToolDefinitions.find((toolDefinition) => toolDefinition.name === "task");
  const skillToolDefinition = openAiToolDefinitions.find((toolDefinition) => toolDefinition.name === "skill");

  expect(bashToolDefinition?.description).toContain("Do not use bash for simple file reads");
  expect(readToolDefinition?.description).toContain("Use this only for exact paths already evidenced");
  expect(readToolDefinition?.description).toContain("Do not read paths inferred from imports, symbols, filenames, likely extensions, or project conventions");
  expect(readToolDefinition?.description).toContain("discover uncertain paths with search_many, glob, or grep first");
  expect(readToolDefinition?.description).toContain("Do not guess offsets");
  expect(readToolDefinition?.description).toContain("continue only from line counts returned by previous reads");
  expect(readManyToolDefinition?.description).toContain("Read multiple files or directories");
  expect(readManyToolDefinition?.description).toContain("several exact paths are already evidenced");
  expect(readManyToolDefinition?.description).toContain("one larger independent read_many batch");
  expect(readManyToolDefinition?.parameters.properties["targets"]?.minItems).toBe(1);
  expect(searchManyToolDefinition?.description).toContain("Run multiple independent glob and grep searches");
  expect(searchManyToolDefinition?.description).toContain("contextLineCount");
  expect(searchManyToolDefinition?.description).toContain("one larger independent search_many batch");
  expect(searchManyToolDefinition?.parameters.properties["searches"]?.minItems).toBe(1);
  expect(globToolDefinition?.description).toContain("Use this instead of bash for file discovery");
  expect(globToolDefinition?.parameters.properties["path"]?.description).toContain("Single directory");
  expect(globToolDefinition?.parameters.properties["path"]?.description).toContain("Do not pass multiple paths");
  expect(grepToolDefinition?.description).toContain("Use this instead of bash for text search");
  expect(grepToolDefinition?.description).toContain("contextLineCount");
  expect(grepToolDefinition?.parameters.properties["path"]?.description).toContain("Single file or directory");
  expect(grepToolDefinition?.parameters.properties["path"]?.description).toContain("Do not pass multiple paths");
  expect(grepToolDefinition?.parameters.properties["contextLineCount"]?.maximum).toBe(5);
  expect(editToolDefinition?.description).toContain("requires approval before applying the edit");
  expect(editManyToolDefinition?.description).toContain("Prefer this over several edit calls");
  expect(editManyToolDefinition?.parameters.properties["edits"]?.minItems).toBe(1);
  expect(patchToolDefinition?.description).toContain("exactly one file section");
  expect(patchManyToolDefinition?.description).toContain("multi-file changes");
  expect(writeToolDefinition?.description).toContain("requires approval before writing");
  const openAiToolDefinitionNames: string[] = openAiToolDefinitions.map((toolDefinition) => toolDefinition.name);
  expect(openAiToolDefinitionNames).not.toContain("explore");
  expect(taskToolDefinition?.description).toContain("Launch a built-in Buli subagent");
  expect(taskToolDefinition?.description).toContain("request multiple task calls in the same response");
  expect(taskToolDefinition?.description).toContain("instead of one oversized generic prompt");
  expect(taskToolDefinition?.description).toContain("focused scope, exact known paths or patterns");
  expect(taskToolDefinition?.description).toContain("expected concise report shape");
  expect(taskToolDefinition?.description).toContain("Currently available subagent: explore");
  expect(skillToolDefinition?.description).toContain("lazy-load the full markdown instructions");
  expect(skillToolDefinition?.parameters.properties["skillName"]?.pattern).toBe("^[a-z0-9]+(?:-[a-z0-9]+)*$");
  expect(bashToolDefinition?.parameters.properties["timeout"]?.minimum).toBe(1);
  expect(bashToolDefinition?.parameters.properties["timeout"]?.maximum).toBe(MAX_BASH_TOOL_TIMEOUT_MILLISECONDS);
  expect(readToolDefinition?.parameters.properties["offset"]?.minimum).toBe(1);
  expect(readToolDefinition?.parameters.properties["limit"]?.minimum).toBe(1);
});

test("parseOpenAiStream reports typed tool calls that violate shared contracts as invalid function calls", async () => {
  const response = new Response(
    [
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"bash","arguments":""}}\n\n',
      `data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"command\\":\\"sleep 999\\",\\"description\\":\\"Sleep too long\\",\\"timeout\\":${MAX_BASH_TOOL_TIMEOUT_MILLISECONDS + 1}}"}\n\n`,
      `data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_1","name":"bash","arguments":"{\\"command\\":\\"sleep 999\\",\\"description\\":\\"Sleep too long\\",\\"timeout\\":${MAX_BASH_TOOL_TIMEOUT_MILLISECONDS + 1}}"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n`,
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  const { terminalState } = await collectParsedEventsAndTerminalState(response);

  expect(terminalState).toMatchObject({
    terminalKind: "provider_function_calls_requested",
    providerFunctionCallIntents: [
      {
        intentKind: "invalid_function_call",
        functionCallId: "call_1",
        functionName: "bash",
        invalidCallExplanation: expect.stringContaining(
          "OpenAI function call for bash violates Buli tool contract: timeoutMilliseconds",
        ),
      },
    ],
  });
});

test("createOpenAiToolDefinitions can restrict tools for Explorer turns", () => {
  const explorerToolDefinitions = createOpenAiToolDefinitions({
    availableToolNames: ["read", "read_many", "search_many", "glob", "grep"],
  });

  expect(explorerToolDefinitions.map((toolDefinition) => toolDefinition.name)).toEqual(["read", "read_many", "search_many", "glob", "grep"]);
});

test("parseOpenAiStream reports malformed typed tool JSON arguments as invalid function calls", async () => {
  const response = new Response(
    [
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"read","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{not-json"}\n\n',
      'data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_1","name":"read","arguments":"{not-json"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  const { parsedEvents, terminalState } = await collectParsedEventsAndTerminalState(response);

  expect(parsedEvents).toEqual([]);
  expect(terminalState).toMatchObject({
    terminalKind: "provider_function_calls_requested",
    providerFunctionCallIntents: [
      {
        intentKind: "invalid_function_call",
        functionCallId: "call_1",
        functionName: "read",
        invalidCallExplanation: expect.stringContaining("OpenAI function call for read has malformed JSON arguments"),
      },
    ],
  });
});

test("parseOpenAiStream reports malformed typed tool argument fields as invalid function calls", async () => {
  const response = new Response(
    [
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"read","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"filePath\\":\\"README.md\\",\\"offset\\":\\"2\\",\\"limit\\":null}"}\n\n',
      'data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_1","name":"read","arguments":"{\\"filePath\\":\\"README.md\\",\\"offset\\":\\"2\\",\\"limit\\":null}"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  const { terminalState } = await collectParsedEventsAndTerminalState(response);

  expect(terminalState).toMatchObject({
    terminalKind: "provider_function_calls_requested",
    providerFunctionCallIntents: [
      {
        intentKind: "invalid_function_call",
        functionCallId: "call_1",
        functionName: "read",
        invalidCallExplanation: "OpenAI function call for read has invalid positive integer argument: offset",
      },
    ],
  });
});

test("parseOpenAiStream reports unsupported tool names as invalid function calls", async () => {
  const response = new Response(
    [
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"explore","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{}"}\n\n',
      'data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_1","name":"explore","arguments":"{}"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  const { terminalState } = await collectParsedEventsAndTerminalState(response);

  expect(terminalState).toMatchObject({
    terminalKind: "provider_function_calls_requested",
    providerFunctionCallIntents: [
      {
        intentKind: "invalid_function_call",
        functionCallId: "call_1",
        functionName: "explore",
        invalidCallExplanation: "Unsupported function requested by OpenAI: explore",
      },
    ],
  });
});

test("parseOpenAiStream repairs tool-turn output when response.completed omits the function_call item", async () => {
  const response = new Response(
    [
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"message","id":"msg_1","role":"assistant","status":"completed","content":[{"type":"output_text","text":"I will inspect the docs first."}]}}\n\n',
      'data: {"type":"response.output_item.added","output_index":1,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"bash","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}"}\n\n',
      'data: {"type":"response.completed","response":{"output":[{"type":"message","id":"msg_1","role":"assistant","status":"completed","content":[{"type":"output_text","text":"I will inspect the docs first."}]}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  const { parsedEvents, terminalState } = await collectParsedEventsAndTerminalState(response);

  expect(parsedEvents).toEqual([
    {
      type: "text_chunk",
      text: "I will inspect the docs first.",
    },
    {
      type: "tool_call_requested",
      toolCallId: "call_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "pwd",
        commandDescription: "Print working directory",
      },
    },
  ]);
  expect(terminalState).toEqual({
    terminalKind: "tool_call_requested",
    toolCallId: "call_1",
    toolCallRequest: {
      toolName: "bash",
      shellCommand: "pwd",
      commandDescription: "Print working directory",
    },
    responseOutputItems: [
      {
        type: "message",
        id: "msg_1",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: "I will inspect the docs first." }],
      },
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "bash",
        arguments: '{"command":"pwd","description":"Print working directory"}',
      },
    ],
    usage: { total: 10, input: 10, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  });
});

test("parseOpenAiStream preserves function_call arguments from output_item.added when terminal output omits the call", async () => {
  const response = new Response(
    [
      createSseDataFrame({
        type: "response.output_item.added",
        output_index: 0,
        item: {
          type: "function_call",
          id: "fc_1",
          call_id: "call_1",
          name: "bash",
          arguments: '{"command":"pwd","description":"Print working directory"}',
        },
      }),
      createSseDataFrame({
        type: "response.completed",
        response: { output: [], usage: { input_tokens: 10, output_tokens: 0, total_tokens: 10 } },
      }),
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  const { parsedEvents, terminalState } = await collectParsedEventsAndTerminalState(response);

  expect(parsedEvents).toEqual([
    {
      type: "tool_call_requested",
      toolCallId: "call_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "pwd",
        commandDescription: "Print working directory",
      },
    },
  ]);
  expect(terminalState).toEqual({
    terminalKind: "tool_call_requested",
    toolCallId: "call_1",
    toolCallRequest: {
      toolName: "bash",
      shellCommand: "pwd",
      commandDescription: "Print working directory",
    },
    responseOutputItems: [
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "bash",
        arguments: '{"command":"pwd","description":"Print working directory"}',
      },
    ],
    usage: { total: 10, input: 10, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  });
});

test("parseOpenAiStream repairs weakened function_call arguments from response.completed output", async () => {
  const response = new Response(
    [
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"bash","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}"}\n\n',
      'data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_1","name":"bash","arguments":"","status":"completed"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  const { terminalState } = await collectParsedEventsAndTerminalState(response);

  expect(terminalState).toEqual({
    terminalKind: "tool_call_requested",
    toolCallId: "call_1",
    toolCallRequest: {
      toolName: "bash",
      shellCommand: "pwd",
      commandDescription: "Print working directory",
    },
    responseOutputItems: [
      {
        id: "fc_1",
        type: "function_call",
        call_id: "call_1",
        name: "bash",
        arguments: '{"command":"pwd","description":"Print working directory"}',
        status: "completed",
      },
    ],
    usage: { total: 10, input: 10, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  });
});

test("parseOpenAiStream preserves terminal function_call metadata while repairing arguments", async () => {
  const response = new Response(
    [
      createSseDataFrame({
        type: "response.output_item.added",
        output_index: 0,
        item: {
          type: "function_call",
          id: "fc_1",
          call_id: "call_1",
          name: "bash",
          arguments: "",
          status: "in_progress",
        },
      }),
      createSseDataFrame({
        type: "response.function_call_arguments.done",
        item_id: "fc_1",
        arguments: '{"command":"pwd","description":"Print working directory"}',
      }),
      createSseDataFrame({
        type: "response.completed",
        response: {
          output: [
            {
              id: "fc_1",
              type: "function_call",
              call_id: "call_1",
              name: "bash",
              arguments: "",
              status: "completed",
            },
          ],
          usage: { input_tokens: 10, output_tokens: 0, total_tokens: 10 },
        },
      }),
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  const { terminalState } = await collectParsedEventsAndTerminalState(response);

  expect(terminalState).toMatchObject({
    terminalKind: "tool_call_requested",
    responseOutputItems: [
      {
        id: "fc_1",
        type: "function_call",
        call_id: "call_1",
        name: "bash",
        arguments: '{"command":"pwd","description":"Print working directory"}',
        status: "completed",
      },
    ],
  });
});

test("parseOpenAiStream preserves streamed assistant text deltas for tool-call replay", async () => {
  const response = new Response(
    [
      createSseDataFrame({
        type: "response.output_text.delta",
        output_index: 0,
        item_id: "msg_1",
        content_index: 0,
        delta: "I will ",
      }),
      createSseDataFrame({
        type: "response.output_text.delta",
        output_index: 0,
        item_id: "msg_1",
        content_index: 0,
        delta: "inspect first.",
      }),
      createSseDataFrame({
        type: "response.output_item.added",
        output_index: 1,
        item: { type: "function_call", id: "fc_1", call_id: "call_1", name: "bash", arguments: "" },
      }),
      createSseDataFrame({
        type: "response.function_call_arguments.done",
        item_id: "fc_1",
        arguments: '{"command":"pwd","description":"Print working directory"}',
      }),
      createSseDataFrame({
        type: "response.completed",
        response: {
          output: [
            {
              id: "fc_1",
              type: "function_call",
              call_id: "call_1",
              name: "bash",
              arguments: '{"command":"pwd","description":"Print working directory"}',
            },
          ],
          usage: { input_tokens: 10, output_tokens: 0, total_tokens: 10 },
        },
      }),
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  const { parsedEvents, terminalState } = await collectParsedEventsAndTerminalState(response);

  expect(parsedEvents).toEqual([
    { type: "text_chunk", text: "I will " },
    { type: "text_chunk", text: "inspect first." },
    {
      type: "tool_call_requested",
      toolCallId: "call_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "pwd",
        commandDescription: "Print working directory",
      },
    },
  ]);
  expect(terminalState).toMatchObject({
    terminalKind: "tool_call_requested",
    responseOutputItems: [
      {
        type: "message",
        id: "msg_1",
        role: "assistant",
        content: [{ type: "output_text", text: "I will inspect first." }],
      },
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "bash",
        arguments: '{"command":"pwd","description":"Print working directory"}',
      },
    ],
  });
});

test("parseOpenAiStream rejects response.failed with the OpenAI failure message", async () => {
  const response = new Response(
    createSseDataFrame({
      type: "response.failed",
      response: {
        error: {
          code: "server_error",
          message: "The model failed while generating the response.",
        },
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  await expect(collectParsedEvents(response)).rejects.toThrow(
    "OpenAI response failed: The model failed while generating the response. | code=server_error",
  );
});

test("parseOpenAiStream classifies response.failed context window overflow", async () => {
  const response = new Response(
    createSseDataFrame({
      type: "response.failed",
      response: {
        error: {
          code: "context_length_exceeded",
          message: "Your input exceeds the context window of this model.",
        },
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  await expect(collectParsedEvents(response)).rejects.toThrow(ContextWindowOverflowError);
});

test("parseOpenAiStream redacts and caps response.failed messages", async () => {
  const response = new Response(
    createSseDataFrame({
      type: "response.failed",
      response: {
        error: {
          code: "server_error",
          message: `proxy echoed Bearer secret-token and access_token=abc123 ${"x".repeat(600)}`,
        },
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  let thrownError: unknown;
  try {
    await collectParsedEvents(response);
  } catch (error) {
    thrownError = error;
  }

  expect(thrownError).toBeInstanceOf(Error);
  const errorMessage = thrownError instanceof Error ? thrownError.message : String(thrownError);
  expect(errorMessage).toMatch(
    /OpenAI response failed: proxy echoed Bearer \[REDACTED\] and access_token=\[REDACTED\].*chars omitted.*code=server_error/,
  );
  expect(errorMessage).not.toContain("secret-token");
  expect(errorMessage).not.toContain("abc123");
});

test("parseOpenAiStream redacts generic error events", async () => {
  const response = new Response(
    createSseDataFrame({
      type: "error",
      message: "proxy echoed refresh_token=refresh123",
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  let thrownError: unknown;
  try {
    await collectParsedEvents(response);
  } catch (error) {
    thrownError = error;
  }

  expect(thrownError).toBeInstanceOf(Error);
  const errorMessage = thrownError instanceof Error ? thrownError.message : String(thrownError);
  expect(errorMessage).toBe("proxy echoed refresh_token=[REDACTED]");
  expect(errorMessage).not.toContain("refresh123");
});

test("parseOpenAiStream tolerates generic error events without a top-level message", async () => {
  const response = new Response(
    createSseDataFrame({
      type: "error",
      error: { code: "server_error", message: "nested stream failure" },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  await expect(collectParsedEvents(response)).rejects.toThrow("nested stream failure | code=server_error");
});

test("parseOpenAiStream preserves streamed function_call argument deltas when terminal output omits the function_call", async () => {
  const response = new Response(
    [
      createSseDataFrame({
        type: "response.output_item.added",
        output_index: 0,
        item: { type: "function_call", id: "fc_1", call_id: "call_1", name: "bash", arguments: "" },
      }),
      createSseDataFrame({
        type: "response.function_call_arguments.delta",
        item_id: "fc_1",
        delta: '{"command":"pw',
      }),
      createSseDataFrame({
        type: "response.function_call_arguments.delta",
        item_id: "fc_1",
        delta: 'd","description":"Print working directory"}',
      }),
      createSseDataFrame({
        type: "response.completed",
        response: { output: [], usage: { input_tokens: 10, output_tokens: 0, total_tokens: 10 } },
      }),
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  const { parsedEvents, terminalState } = await collectParsedEventsAndTerminalState(response);

  expect(parsedEvents).toEqual([
    {
      type: "tool_call_requested",
      toolCallId: "call_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "pwd",
        commandDescription: "Print working directory",
      },
    },
  ]);
  expect(terminalState).toEqual({
    terminalKind: "tool_call_requested",
    toolCallId: "call_1",
    toolCallRequest: {
      toolName: "bash",
      shellCommand: "pwd",
      commandDescription: "Print working directory",
    },
    responseOutputItems: [
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "bash",
        arguments: '{"command":"pwd","description":"Print working directory"}',
      },
    ],
    usage: { total: 10, input: 10, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  });
});

test("parseOpenAiStream preserves function_call argument deltas received before output_item.added", async () => {
  const response = new Response(
    [
      createSseDataFrame({
        type: "response.function_call_arguments.delta",
        item_id: "fc_1",
        delta: '{"command":"pw',
      }),
      createSseDataFrame({
        type: "response.function_call_arguments.delta",
        item_id: "fc_1",
        delta: 'd","description":"Print working directory"}',
      }),
      createSseDataFrame({
        type: "response.output_item.added",
        output_index: 0,
        item: { type: "function_call", id: "fc_1", call_id: "call_1", name: "bash", arguments: "" },
      }),
      createSseDataFrame({
        type: "response.completed",
        response: { output: [], usage: { input_tokens: 10, output_tokens: 0, total_tokens: 10 } },
      }),
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  const { parsedEvents, terminalState } = await collectParsedEventsAndTerminalState(response);

  expect(parsedEvents).toEqual([
    {
      type: "tool_call_requested",
      toolCallId: "call_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "pwd",
        commandDescription: "Print working directory",
      },
    },
  ]);
  expect(terminalState).toMatchObject({
    terminalKind: "tool_call_requested",
    responseOutputItems: [
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "bash",
        arguments: '{"command":"pwd","description":"Print working directory"}',
      },
    ],
  });
});

test("parseOpenAiStream preserves function_call arguments.done received before output_item.added", async () => {
  const response = new Response(
    [
      createSseDataFrame({
        type: "response.function_call_arguments.done",
        item_id: "fc_1",
        arguments: '{"command":"pwd","description":"Print working directory"}',
      }),
      createSseDataFrame({
        type: "response.output_item.added",
        output_index: 0,
        item: { type: "function_call", id: "fc_1", call_id: "call_1", name: "bash", arguments: "" },
      }),
      createSseDataFrame({
        type: "response.completed",
        response: { output: [], usage: { input_tokens: 10, output_tokens: 0, total_tokens: 10 } },
      }),
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  const { parsedEvents, terminalState } = await collectParsedEventsAndTerminalState(response);

  expect(parsedEvents).toEqual([
    {
      type: "tool_call_requested",
      toolCallId: "call_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "pwd",
        commandDescription: "Print working directory",
      },
    },
  ]);
  expect(terminalState).toMatchObject({
    terminalKind: "tool_call_requested",
    responseOutputItems: [
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "bash",
        arguments: '{"command":"pwd","description":"Print working directory"}',
      },
    ],
  });
});

test("parseOpenAiStream rejects terminal function_call arguments that change after early tool emission", async () => {
  const response = new Response(
    [
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"bash","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"command\\":\\"p\\",\\"description\\":\\"Partial command\\"}"}\n\n',
      'data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_1","name":"bash","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}","status":"completed"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  await expect(collectParsedEventsAndTerminalState(response)).rejects.toThrow(
    "OpenAI response changed function call call_1 after it was emitted.",
  );
});

test("parseOpenAiStream repairs tracked function_call items from output_item.done without output_index", async () => {
  const response = new Response(
    [
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"bash","arguments":""}}\n\n',
      'data: {"type":"response.output_item.done","item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"bash","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}","status":"completed"}}\n\n',
      'data: {"type":"response.completed","response":{"output":[],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  const { terminalState } = await collectParsedEventsAndTerminalState(response);

  expect(terminalState).toEqual({
    terminalKind: "tool_call_requested",
    toolCallId: "call_1",
    toolCallRequest: {
      toolName: "bash",
      shellCommand: "pwd",
      commandDescription: "Print working directory",
    },
    responseOutputItems: [
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "bash",
        arguments: '{"command":"pwd","description":"Print working directory"}',
        status: "completed",
      },
    ],
    usage: { total: 10, input: 10, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  });
});

test("parseOpenAiStream repairs tool-turn output when response.incomplete omits the function_call item", async () => {
  const response = new Response(
    [
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"bash","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}"}\n\n',
      'data: {"type":"response.incomplete","response":{"incomplete_details":{"reason":"max_output_tokens"},"output":[],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  const { terminalState } = await collectParsedEventsAndTerminalState(response);

  expect(terminalState).toEqual({
    terminalKind: "tool_call_requested",
    toolCallId: "call_1",
    toolCallRequest: {
      toolName: "bash",
      shellCommand: "pwd",
      commandDescription: "Print working directory",
    },
    responseOutputItems: [
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "bash",
        arguments: '{"command":"pwd","description":"Print working directory"}',
      },
    ],
    usage: { total: 10, input: 10, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  });
});

test("OpenAiProvider sends auth headers and streams assistant response provider events", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-openai-stream-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 600_000,
    accountId: "acct_123",
  });

  const requests: Array<{ headers: Headers; body: string }> = [];
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push({
        headers: new Headers(request.headers as Record<string, string>),
        body,
      });

      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write('data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"Hello from server"}\n\n');
      response.write(
        'data: {"type":"response.completed","response":{"usage":{"input_tokens":90,"input_tokens_details":{"cached_tokens":10},"output_tokens":45,"output_tokens_details":{"reasoning_tokens":5},"total_tokens":135}}}\n\n',
      );
      response.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("stream test server address unavailable");
  }

  try {
    const provider = new OpenAiProvider({ endpoint: `http://127.0.0.1:${address.port}`, store });
    const providerTurn = provider.startConversationTurn(createConversationTurnRequest({ messageText: "Say hello" }));
    const emittedEvents = [];
    for await (const emittedEvent of providerTurn.streamProviderEvents()) {
      emittedEvents.push(emittedEvent);
    }

    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer access-token");
    expect(requests[0]?.headers.get("chatgpt-account-id")).toBe("acct_123");
    const requestBody = JSON.parse(requests[0]?.body ?? "{}") as {
      tools?: Array<{ name?: string }>;
    };
    expect(requestBody).toMatchObject({
      model: "gpt-5.4",
      instructions: "You are buli.",
      store: false,
      include: ["reasoning.encrypted_content"],
      input: [
        {
          role: "user",
          content: "Say hello",
        },
      ],
      parallel_tool_calls: true,
      reasoning: { summary: "auto" },
      stream: true,
    });
    expect(requestBody.tools?.map((toolDefinition) => toolDefinition.name)).toEqual([...ASSISTANT_TOOL_REQUEST_NAMES]);
    expect(emittedEvents).toEqual([
      { type: "text_chunk", text: "Hello from server" },
      {
        type: "completed",
        usage: {
          total: 135,
          input: 80,
          output: 40,
          reasoning: 5,
          cache: { read: 10, write: 0 },
        },
        contextWindowUsage: {
          total: 135,
          input: 80,
          output: 40,
          reasoning: 5,
          cache: { read: 10, write: 0 },
        },
      },
    ]);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test("OpenAiProvider includes reasoning effort when one is selected", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-openai-stream-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 600_000,
  });

  const requests: string[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push(body);

      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write('data: {"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":5}}}\n\n');
      response.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("stream test server address unavailable");
  }

  try {
    const provider = new OpenAiProvider({ endpoint: `http://127.0.0.1:${address.port}`, store });
    const providerTurn = provider.startConversationTurn({
      systemPromptText: "You are buli.",
      conversationSessionEntries: [
        {
          entryKind: "user_prompt",
          promptText: "Think harder",
          modelFacingPromptText: "Think harder",
        },
      ],
      selectedModelId: "gpt-5.4",
      selectedReasoningEffort: "high",
    });
    for await (const _event of providerTurn.streamProviderEvents()) {
      // Consume the turn stream to capture the request body.
    }

    expect(JSON.parse(requests[0] ?? "{}")).toMatchObject({
      instructions: "You are buli.",
      include: ["reasoning.encrypted_content"],
      reasoning: { effort: "high" },
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test("OpenAiProvider continues the same turn after function_call_output", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-openai-stream-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 600_000,
  });

  const requests: string[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push(body);
      response.writeHead(200, { "Content-Type": "text/event-stream" });

      if (requests.length === 1) {
        response.write(
          'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"reasoning","id":"rs_1","summary":[],"encrypted_content":"encrypted-reasoning"}}\n\n',
        );
        response.write(
          'data: {"type":"response.output_item.added","output_index":1,"item":{"type":"message","id":"msg_1","role":"assistant","status":"completed","content":[{"type":"output_text","text":"Running pwd first."}]}}\n\n',
        );
        response.write(
          'data: {"type":"response.output_item.added","output_index":2,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"bash","arguments":""}}\n\n',
        );
        response.write(
          'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}"}\n\n',
        );
        response.write(
          'data: {"type":"response.completed","response":{"output":[{"type":"reasoning","id":"rs_1","summary":[],"encrypted_content":"encrypted-reasoning"},{"type":"message","id":"msg_1","role":"assistant","status":"completed","content":[{"type":"output_text","text":"Running pwd first."}]},{"id":"fc_1","type":"function_call","call_id":"call_1","name":"bash","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}","status":"completed"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
        );
      } else {
        response.write('data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"Done"}\n\n');
        response.write('data: {"type":"response.completed","response":{"usage":{"input_tokens":20,"output_tokens":4,"total_tokens":24}}}\n\n');
      }

      response.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("stream test server address unavailable");
  }

  try {
    const provider = new OpenAiProvider({ endpoint: `http://127.0.0.1:${address.port}`, store });
    const providerTurn = provider.startConversationTurn(createConversationTurnRequest({ messageText: "Run pwd" }));
    const emittedEvents = [];
    for await (const emittedEvent of providerTurn.streamProviderEvents()) {
      emittedEvents.push(emittedEvent);
      if (emittedEvent.type === "tool_call_requested") {
        await providerTurn.submitToolResult({
          toolCallId: emittedEvent.toolCallId,
          toolResultText: "Command: pwd\nWorking directory: /tmp\nExit code: 0",
        });
      }
    }

    expect(emittedEvents.map((emittedEvent) => emittedEvent.type)).toEqual([
      "reasoning_summary_started",
      "reasoning_summary_completed",
      "text_chunk",
      "tool_call_requested",
      "text_chunk",
      "completed",
    ]);
    expect(emittedEvents[2]).toEqual({ type: "text_chunk", text: "Running pwd first." });
    expect(JSON.parse(requests[1] ?? "{}")).toMatchObject({
      input: [
        {
          role: "user",
          content: "Run pwd",
        },
        {
          type: "reasoning",
          id: "rs_1",
          encrypted_content: "encrypted-reasoning",
          summary: [],
        },
        {
          role: "assistant",
          content: "Running pwd first.",
        },
        {
          id: "fc_1",
          type: "function_call",
          call_id: "call_1",
          name: "bash",
          arguments: '{"command":"pwd","description":"Print working directory"}',
        },
        {
          type: "function_call_output",
          call_id: "call_1",
          output: "Command: pwd\nWorking directory: /tmp\nExit code: 0",
        },
      ],
      include: ["reasoning.encrypted_content"],
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test("OpenAiProvider includes backend error details when the request fails", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-openai-stream-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 600_000,
  });

  const server = createServer((_request, response) => {
    response.writeHead(400, {
      "Content-Type": "text/plain; charset=utf-8",
      "x-request-id": "req_123",
    });
    response.end("input must be a message array");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("stream test server address unavailable");
  }

  try {
    const provider = new OpenAiProvider({ endpoint: `http://127.0.0.1:${address.port}`, store });
    const providerTurn = provider.startConversationTurn(createConversationTurnRequest({ messageText: "Say hello" }));
    await expect(
      (async () => {
        for await (const _event of providerTurn.streamProviderEvents()) {
          // This turn should fail before any events are emitted.
        }
      })(),
    ).rejects.toThrow("OpenAI stream request failed: 400 | input must be a message array | request_id=req_123");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});
