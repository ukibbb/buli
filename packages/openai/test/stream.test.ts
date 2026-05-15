import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

async function collectParsedEvents(response: Response) {
  const parsedEvents = [];
  for await (const parsedEvent of parseOpenAiStream(response)) {
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
  const toolCallCases = [
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
      argumentsText: '{"pattern":"ToolCallRequest","path":"packages","include":"*.ts"}',
      expectedToolCallRequest: {
        toolName: "grep",
        regexPattern: "ToolCallRequest",
        searchPath: "packages",
        includeGlobPattern: "*.ts",
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
      toolName: "write",
      argumentsText: '{"filePath":"src/generated.ts","content":""}',
      expectedToolCallRequest: {
        toolName: "write",
        writeTargetPath: "src/generated.ts",
        fileContent: "",
      },
    },
    {
      toolName: "explore",
      argumentsText: '{"description":"map runtime","prompt":"Inspect engine runtime flow."}',
      expectedToolCallRequest: {
        toolName: "explore",
        explorationDescription: "map runtime",
        explorationPrompt: "Inspect engine runtime flow.",
      },
    },
  ] as const;

  for (const toolCallCase of toolCallCases) {
    const escapedArgumentsText = toolCallCase.argumentsText.replaceAll('"', '\\"');
    const response = new Response(
      [
        `data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"${toolCallCase.toolName}","arguments":""}}\n\n`,
        `data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"${escapedArgumentsText}"}\n\n`,
        `data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_1","name":"${toolCallCase.toolName}","arguments":"${escapedArgumentsText}"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n`,
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

test("createOpenAiToolDefinitions instructs inspection through typed tools", () => {
  const openAiToolDefinitions = createOpenAiToolDefinitions();
  const bashToolDefinition = openAiToolDefinitions.find((toolDefinition) => toolDefinition.name === "bash");
  const readToolDefinition = openAiToolDefinitions.find((toolDefinition) => toolDefinition.name === "read");
  const globToolDefinition = openAiToolDefinitions.find((toolDefinition) => toolDefinition.name === "glob");
  const grepToolDefinition = openAiToolDefinitions.find((toolDefinition) => toolDefinition.name === "grep");
  const editToolDefinition = openAiToolDefinitions.find((toolDefinition) => toolDefinition.name === "edit");
  const writeToolDefinition = openAiToolDefinitions.find((toolDefinition) => toolDefinition.name === "write");
  const exploreToolDefinition = openAiToolDefinitions.find((toolDefinition) => toolDefinition.name === "explore");

  expect(bashToolDefinition?.description).toContain("Do not use bash for simple file reads");
  expect(readToolDefinition?.description).toContain("Use this instead of bash for known files and directories");
  expect(globToolDefinition?.description).toContain("Use this instead of bash for file discovery");
  expect(grepToolDefinition?.description).toContain("Use this instead of bash for text search");
  expect(editToolDefinition?.description).toContain("requires approval before applying the edit");
  expect(writeToolDefinition?.description).toContain("requires approval before writing");
  expect(exploreToolDefinition?.description).toContain("read-only Explorer subagent");
});

test("createOpenAiToolDefinitions can restrict tools for Explorer turns", () => {
  const explorerToolDefinitions = createOpenAiToolDefinitions({ availableToolNames: ["read", "glob", "grep"] });

  expect(explorerToolDefinitions.map((toolDefinition) => toolDefinition.name)).toEqual(["read", "glob", "grep"]);
});

test("parseOpenAiStream rejects malformed typed tool JSON arguments clearly", async () => {
  const response = new Response(
    [
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"read","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{not-json"}\n\n',
      'data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_1","name":"read","arguments":"{not-json"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  await expect(collectParsedEvents(response)).rejects.toThrow("OpenAI function call for read has malformed JSON arguments");
});

test("parseOpenAiStream rejects malformed typed tool argument fields clearly", async () => {
  const response = new Response(
    [
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"read","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"filePath\\":\\"README.md\\",\\"offset\\":\\"2\\",\\"limit\\":null}"}\n\n',
      'data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_1","name":"read","arguments":"{\\"filePath\\":\\"README.md\\",\\"offset\\":\\"2\\",\\"limit\\":null}"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  await expect(collectParsedEvents(response)).rejects.toThrow(
    "OpenAI function call for read has invalid positive integer argument: offset",
  );
});

test("parseOpenAiStream rejects unsupported tool names clearly", async () => {
  const response = new Response(
    [
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"task","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{}"}\n\n',
      'data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_1","name":"task","arguments":"{}"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  await expect(collectParsedEvents(response)).rejects.toThrow("Unsupported tool requested by OpenAI: task");
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
    expiresAt: Date.now() + 60_000,
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
      parallel_tool_calls: false,
      reasoning: { summary: "auto" },
      stream: true,
    });
    expect(requestBody.tools?.map((toolDefinition) => toolDefinition.name)).toEqual(["bash", "read", "glob", "grep", "edit", "write", "explore"]);
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
    expiresAt: Date.now() + 60_000,
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
    expiresAt: Date.now() + 60_000,
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
      "tool_call_requested",
      "text_chunk",
      "completed",
    ]);
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
    expiresAt: Date.now() + 60_000,
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
