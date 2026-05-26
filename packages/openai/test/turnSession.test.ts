import { expect, test } from "bun:test";
import type { BuliDiagnosticLogEvent, ProviderStreamEvent } from "@buli/contracts";
import { OpenAiRateLimitCoordinator } from "../src/provider/openAiRateLimitCoordinator.ts";
import { OpenAiProviderConversationTurn } from "../src/provider/turnSession.ts";

function createOpenAiStepResponse(eventFrames: readonly string[], headers?: Record<string, string>): Response {
  return new Response(eventFrames.join(""), {
    headers: { "Content-Type": "text/event-stream", ...(headers ?? {}) },
  });
}

function createControlledOpenAiStepResponse(): {
  response: Response;
  enqueueSseFrame: (payload: unknown) => void;
  close: () => void;
} {
  const textEncoder = new TextEncoder();
  let responseStreamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        responseStreamController = controller;
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  return {
    response,
    enqueueSseFrame(payload: unknown): void {
      responseStreamController?.enqueue(textEncoder.encode(createOpenAiSseFrame(payload)));
    },
    close(): void {
      responseStreamController?.close();
    },
  };
}

function createOpenAiErrorResponse(input: {
  status: number;
  message: string;
  headers?: Record<string, string>;
}): Response {
  return new Response(
    JSON.stringify({
      error: {
        message: input.message,
      },
    }),
    {
      status: input.status,
      headers: {
        "content-type": "application/json",
        ...(input.headers ?? {}),
      },
    },
  );
}

function createOpenAiSseFrame(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function createOpenAiReadToolStepResponse(stepNumber: number): Response {
  const responseFunctionCallItemId = `fc_${stepNumber}`;
  const functionCallId = `call_${stepNumber}`;
  const argumentsText = JSON.stringify({ filePath: `file-${stepNumber}.txt` });

  return createOpenAiStepResponse([
    createOpenAiSseFrame({
      type: "response.output_item.added",
      output_index: 0,
      item: {
        type: "function_call",
        id: responseFunctionCallItemId,
        call_id: functionCallId,
        name: "read",
        arguments: "",
      },
    }),
    createOpenAiSseFrame({
      type: "response.function_call_arguments.done",
      item_id: responseFunctionCallItemId,
      arguments: argumentsText,
    }),
    createOpenAiSseFrame({
      type: "response.completed",
      response: {
        output: [{ id: responseFunctionCallItemId, type: "function_call", call_id: functionCallId, name: "read", arguments: argumentsText }],
        usage: { input_tokens: 10, output_tokens: 0, total_tokens: 10 },
      },
    }),
  ]);
}

function createConversationSessionEntries(userPromptText: string) {
  return [
    {
      entryKind: "user_prompt" as const,
      promptText: userPromptText,
      modelFacingPromptText: userPromptText,
    },
  ];
}

function createFetchImpl(queuedResponses: Response[], requestBodies: string[]): typeof fetch {
  const fetchImpl: typeof fetch = Object.assign(
    async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      requestBodies.push(String(init?.body ?? ""));
      const queuedResponse = queuedResponses.shift();
      if (!queuedResponse) {
        throw new Error("No queued OpenAI test response remained");
      }

      return queuedResponse;
    },
    {
      preconnect: fetch.preconnect.bind(fetch),
    },
  );

  return fetchImpl;
}

type QueuedFetchOutcome =
  | { outcomeKind: "response"; response: Response }
  | { outcomeKind: "rejection"; error: unknown };

function createFetchImplWithQueuedOutcomes(queuedOutcomes: QueuedFetchOutcome[], requestBodies: string[]): typeof fetch {
  const fetchImpl: typeof fetch = Object.assign(
    async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      requestBodies.push(String(init?.body ?? ""));
      const queuedOutcome = queuedOutcomes.shift();
      if (!queuedOutcome) {
        throw new Error("No queued OpenAI test fetch outcome remained");
      }

      if (queuedOutcome.outcomeKind === "rejection") {
        throw queuedOutcome.error;
      }

      return queuedOutcome.response;
    },
    {
      preconnect: fetch.preconnect.bind(fetch),
    },
  );

  return fetchImpl;
}

async function collectProviderEvents(providerTurn: OpenAiProviderConversationTurn): Promise<ProviderStreamEvent[]> {
  const providerEvents: ProviderStreamEvent[] = [];
  for await (const providerEvent of providerTurn.streamProviderEvents()) {
    providerEvents.push(providerEvent);
  }

  return providerEvents;
}

async function waitForProviderIteratorResult<IteratorValue>(
  iteratorResult: Promise<IteratorResult<IteratorValue>>,
  timeoutMilliseconds: number,
): Promise<IteratorResult<IteratorValue>> {
  const timeoutResult = Symbol("timeout");
  const settledResult = await Promise.race([
    iteratorResult,
    new Promise<typeof timeoutResult>((resolve) => setTimeout(() => resolve(timeoutResult), timeoutMilliseconds)),
  ]);
  if (settledResult === timeoutResult) {
    throw new Error(`Provider iterator did not yield within ${timeoutMilliseconds}ms`);
  }

  return settledResult;
}

function createSignalRecordingFetchImpl(input: {
  response: Response;
  receivedAbortSignals: Array<AbortSignal | null | undefined>;
}): typeof fetch {
  const fetchImpl: typeof fetch = Object.assign(
    async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      input.receivedAbortSignals.push(init?.signal);
      return input.response;
    },
    {
      preconnect: fetch.preconnect.bind(fetch),
    },
  );

  return fetchImpl;
}

function createAbortablePendingFetchImpl(input: {
  receivedAbortSignals: AbortSignal[];
  requestBodies: string[];
}): typeof fetch {
  const fetchImpl: typeof fetch = Object.assign(
    async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      input.requestBodies.push(String(init?.body ?? ""));
      if (!init?.signal) {
        throw new Error("OpenAI response-step fetch did not receive an abort signal.");
      }

      input.receivedAbortSignals.push(init.signal);
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const abortReason = readAbortSignalReason(init.signal);
          reject(abortReason instanceof Error ? abortReason : new Error("request aborted"));
        }, { once: true });
      });
    },
    {
      preconnect: fetch.preconnect.bind(fetch),
    },
  );

  return fetchImpl;
}

function readAbortSignalReason(abortSignal: AbortSignal | null | undefined): unknown {
  return abortSignal ? (abortSignal as { readonly reason?: unknown }).reason : undefined;
}

test("OpenAiProviderConversationTurn captures replay items for a completed tool turn", async () => {
  const requestBodies: string[] = [];
  const queuedResponses = [
    createOpenAiStepResponse([
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"reasoning","id":"rs_1","summary":[],"encrypted_content":"encrypted-reasoning"}}\n\n',
      'data: {"type":"response.output_item.added","output_index":1,"item":{"type":"message","id":"msg_1","role":"assistant","status":"completed","content":[{"type":"output_text","text":"I will run pwd."}]}}\n\n',
      'data: {"type":"response.output_item.added","output_index":2,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"bash","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}"}\n\n',
      'data: {"type":"response.completed","response":{"output":[{"type":"reasoning","id":"rs_1","summary":[],"encrypted_content":"encrypted-reasoning"},{"type":"message","id":"msg_1","role":"assistant","status":"completed","content":[{"type":"output_text","text":"I will run pwd."}]},{"id":"fc_1","type":"function_call","call_id":"call_1","name":"bash","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}","status":"completed"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
    ]),
    createOpenAiStepResponse([
      'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"Done"}\n\n',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":20,"output_tokens":4,"total_tokens":24}}}\n\n',
    ]),
  ];
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImpl(queuedResponses, requestBodies),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Run pwd"),
    onStepRequestFailed: async () => new Error("unexpected request failure"),
  });

  const emittedEvents: ProviderStreamEvent[] = [];
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
  expect(emittedEvents[2]).toEqual({ type: "text_chunk", text: "I will run pwd." });
  expect(providerTurn.getProviderTurnReplay()).toEqual({
    provider: "openai",
    inputItems: [
      {
        type: "reasoning",
        id: "rs_1",
        encrypted_content: "encrypted-reasoning",
        summary: [],
      },
      {
        type: "function_call",
        id: "fc_1",
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
  });
  expect(JSON.parse(requestBodies[1] ?? "{}")).toMatchObject({
    reasoning: { summary: "auto" },
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
        content: "I will run pwd.",
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
});

test("OpenAiProviderConversationTurn emits turn metadata, request timing, and replay-age diagnostics", async () => {
  const requestBodies: string[] = [];
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const toolResultText = "Command: pwd\nWorking directory: /tmp\nExit code: 0";
  const queuedResponses = [
    createOpenAiStepResponse([
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"bash","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}"}\n\n',
      'data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_1","name":"bash","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
    ]),
    createOpenAiStepResponse([
      'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"Done"}\n\n',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":20,"output_tokens":4,"total_tokens":24}}}\n\n',
    ]),
  ];
  const providerTurn = new OpenAiProviderConversationTurn({
    conversationTurnId: "conversation-turn-1",
    providerTurnKind: "task_subagent",
    parentTaskToolCallId: "call_task_1",
    subagentName: "explore",
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImpl(queuedResponses, requestBodies),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Run pwd"),
    onStepRequestFailed: async () => new Error("unexpected request failure"),
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });

  for await (const emittedEvent of providerTurn.streamProviderEvents()) {
    if (emittedEvent.type === "tool_call_requested") {
      await providerTurn.submitToolResult({
        toolCallId: emittedEvent.toolCallId,
        toolResultText,
      });
    }
  }

  const responseStepSummaries = diagnosticEvents.filter((diagnosticEvent) => diagnosticEvent.eventName === "response_step.summary");
  expect(responseStepSummaries).toHaveLength(2);
  expect(responseStepSummaries[0]?.fields).toMatchObject({
    conversationTurnId: "conversation-turn-1",
    providerTurnKind: "task_subagent",
    parentTaskToolCallId: "call_task_1",
    subagentName: "explore",
    compactionSource: null,
    requestConstructionDurationMs: expect.any(Number),
    requestObjectBuildDurationMs: expect.any(Number),
    requestSerializationDurationMs: expect.any(Number),
    requestInputItemCount: 1,
    requestFunctionCallOutputTextLength: 0,
    requestHistoricalFunctionCallOutputTextLength: 0,
    requestCurrentTurnFunctionCallOutputTextLength: 0,
  });
  expect(responseStepSummaries[1]?.fields).toMatchObject({
    providerTurnKind: "task_subagent",
    requestInputItemCount: 3,
    requestFunctionCallOutputTextLength: toolResultText.length,
    requestHistoricalFunctionCallOutputTextLength: 0,
    requestCurrentTurnFunctionCallOutputTextLength: toolResultText.length,
  });
  expect(diagnosticEvents.find((diagnosticEvent) => diagnosticEvent.eventName === "provider_turn.summary")?.fields).toMatchObject({
    conversationTurnId: "conversation-turn-1",
    providerTurnKind: "task_subagent",
    parentTaskToolCallId: "call_task_1",
    subagentName: "explore",
  });
});

test("OpenAiProviderConversationTurn captures replay items for a completed typed read tool turn", async () => {
  const requestBodies: string[] = [];
  const queuedResponses = [
    createOpenAiStepResponse([
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_read_1","name":"read","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"filePath\\":\\"README.md\\",\\"offset\\":null,\\"limit\\":null}"}\n\n',
      'data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_read_1","name":"read","arguments":"{\\"filePath\\":\\"README.md\\",\\"offset\\":null,\\"limit\\":null}"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
    ]),
    createOpenAiStepResponse([
      'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"Done"}\n\n',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":20,"output_tokens":4,"total_tokens":24}}}\n\n',
    ]),
  ];
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImpl(queuedResponses, requestBodies),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Read README"),
    onStepRequestFailed: async () => new Error("unexpected request failure"),
  });

  const emittedEvents: ProviderStreamEvent[] = [];
  for await (const emittedEvent of providerTurn.streamProviderEvents()) {
    emittedEvents.push(emittedEvent);
    if (emittedEvent.type === "tool_call_requested") {
      await providerTurn.submitToolResult({
        toolCallId: emittedEvent.toolCallId,
        toolResultText: "<path>README.md</path>\n1: # buli",
      });
    }
  }

  expect(emittedEvents[0]).toEqual({
    type: "tool_call_requested",
    toolCallId: "call_read_1",
    toolCallRequest: {
      toolName: "read",
      readTargetPath: "README.md",
    },
  });
  expect(providerTurn.getProviderTurnReplay()).toEqual({
    provider: "openai",
    inputItems: [
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_read_1",
        name: "read",
        arguments: '{"filePath":"README.md","offset":null,"limit":null}',
      },
      {
        type: "function_call_output",
        call_id: "call_read_1",
        output: "<path>README.md</path>\n1: # buli",
      },
    ],
  });
  expect(JSON.parse(requestBodies[1] ?? "{}")).toMatchObject({
    input: [
      { role: "user", content: "Read README" },
      {
        id: "fc_1",
        type: "function_call",
        call_id: "call_read_1",
        name: "read",
        arguments: '{"filePath":"README.md","offset":null,"limit":null}',
      },
      {
        type: "function_call_output",
        call_id: "call_read_1",
        output: "<path>README.md</path>\n1: # buli",
      },
    ],
  });
});

test("OpenAiProviderConversationTurn yields executable tool calls before terminal response completion", async () => {
  const requestBodies: string[] = [];
  const controlledToolStep = createControlledOpenAiStepResponse();
  const queuedResponses = [
    controlledToolStep.response,
    createOpenAiStepResponse([
      createOpenAiSseFrame({ type: "response.output_text.delta", item_id: "msg_1", delta: "Done" }),
      createOpenAiSseFrame({
        type: "response.completed",
        response: { usage: { input_tokens: 20, output_tokens: 4, total_tokens: 24 } },
      }),
    ]),
  ];
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImpl(queuedResponses, requestBodies),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Read README"),
    onStepRequestFailed: async () => new Error("unexpected request failure"),
  });
  const providerEventIterator = providerTurn.streamProviderEvents()[Symbol.asyncIterator]();
  const firstProviderEvent = providerEventIterator.next();

  controlledToolStep.enqueueSseFrame({
    type: "response.output_item.added",
    output_index: 0,
    item: { type: "function_call", id: "fc_1", call_id: "call_read_1", name: "read", arguments: "" },
  });
  controlledToolStep.enqueueSseFrame({
    type: "response.function_call_arguments.done",
    item_id: "fc_1",
    arguments: '{"filePath":"README.md"}',
  });

  await expect(waitForProviderIteratorResult(firstProviderEvent, 100)).resolves.toEqual({
    done: false,
    value: {
      type: "tool_call_requested",
      toolCallId: "call_read_1",
      toolCallRequest: { toolName: "read", readTargetPath: "README.md" },
    },
  });

  await providerTurn.submitToolResult({
    toolCallId: "call_read_1",
    toolResultText: "<path>README.md</path>\n1: # buli",
  });
  controlledToolStep.enqueueSseFrame({
    type: "response.completed",
    response: {
      output: [
        {
          id: "fc_1",
          type: "function_call",
          call_id: "call_read_1",
          name: "read",
          arguments: '{"filePath":"README.md"}',
        },
      ],
      usage: { input_tokens: 10, output_tokens: 0, total_tokens: 10 },
    },
  });
  controlledToolStep.close();

  await expect(providerEventIterator.next()).resolves.toEqual({ done: false, value: { type: "text_chunk", text: "Done" } });
  await expect(providerEventIterator.next()).resolves.toMatchObject({ done: false, value: { type: "completed" } });
  await expect(providerEventIterator.next()).resolves.toEqual({ done: true, value: undefined });
});

test("OpenAiProviderConversationTurn auto-continues after an invalid function call", async () => {
  const requestBodies: string[] = [];
  const queuedResponses = [
    createOpenAiStepResponse([
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_read_1","name":"read","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{not-json"}\n\n',
      'data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_read_1","name":"read","arguments":"{not-json"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
    ]),
    createOpenAiStepResponse([
      'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"Retried with a valid call next."}\n\n',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":20,"output_tokens":6,"total_tokens":26}}}\n\n',
    ]),
  ];
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImpl(queuedResponses, requestBodies),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Read README"),
    onStepRequestFailed: async () => new Error("unexpected request failure"),
  });

  const emittedEvents = await collectProviderEvents(providerTurn);

  expect(emittedEvents.map((emittedEvent) => emittedEvent.type)).toEqual(["text_chunk", "completed"]);
  expect(providerTurn.getProviderTurnReplay()).toEqual({
    provider: "openai",
    inputItems: [
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_read_1",
        name: "read",
        arguments: "{not-json",
      },
      {
        type: "function_call_output",
        call_id: "call_read_1",
        output: expect.stringContaining("Invalid function call: read"),
      },
    ],
  });
  expect(JSON.parse(requestBodies[1] ?? "{}")).toMatchObject({
    input: [
      { role: "user", content: "Read README" },
      {
        id: "fc_1",
        type: "function_call",
        call_id: "call_read_1",
        name: "read",
        arguments: "{not-json",
      },
      {
        type: "function_call_output",
        call_id: "call_read_1",
        output: expect.stringContaining("OpenAI function call for read has malformed JSON arguments"),
      },
    ],
  });
});

test("OpenAiProviderConversationTurn continues with ordered outputs for a batched tool step", async () => {
  const requestBodies: string[] = [];
  const queuedResponses = [
    createOpenAiStepResponse([
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_read_1","name":"read","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"filePath\\":\\"README.md\\"}"}\n\n',
      'data: {"type":"response.output_item.added","output_index":1,"item":{"type":"function_call","id":"fc_2","call_id":"call_grep_1","name":"grep","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_2","arguments":"{\\"pattern\\":\\"ToolCallRequest\\",\\"path\\":\\"packages\\"}"}\n\n',
      'data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_read_1","name":"read","arguments":"{\\"filePath\\":\\"README.md\\"}"},{"id":"fc_2","type":"function_call","call_id":"call_grep_1","name":"grep","arguments":"{\\"pattern\\":\\"ToolCallRequest\\",\\"path\\":\\"packages\\"}"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
    ]),
    createOpenAiStepResponse([
      'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"Done"}\n\n',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":20,"output_tokens":4,"total_tokens":24}}}\n\n',
    ]),
  ];
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImpl(queuedResponses, requestBodies),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Inspect docs"),
    onStepRequestFailed: async () => new Error("unexpected request failure"),
  });

  const emittedEvents: ProviderStreamEvent[] = [];
  for await (const emittedEvent of providerTurn.streamProviderEvents()) {
    emittedEvents.push(emittedEvent);
    if (emittedEvent.type === "tool_call_requested") {
      await providerTurn.submitToolResult({
        toolCallId: emittedEvent.toolCallId,
        toolResultText: emittedEvent.toolCallId === "call_read_1"
          ? "<path>README.md</path>\n1: # buli"
          : "packages/contracts/src/toolCallRequest.ts:64: ToolCallRequestSchema",
      });
    }
    if (emittedEvent.type === "tool_calls_requested") {
      await providerTurn.submitToolResult({
        toolCallId: "call_grep_1",
        toolResultText: "packages/contracts/src/toolCallRequest.ts:64: ToolCallRequestSchema",
      });
      await providerTurn.submitToolResult({
        toolCallId: "call_read_1",
        toolResultText: "<path>README.md</path>\n1: # buli",
      });
    }
  }

  expect(emittedEvents.map((emittedEvent) => emittedEvent.type)).toEqual([
    "tool_call_requested",
    "tool_call_requested",
    "text_chunk",
    "completed",
  ]);
  expect(JSON.parse(requestBodies[1] ?? "{}")).toMatchObject({
    input: [
      { role: "user", content: "Inspect docs" },
      {
        id: "fc_1",
        type: "function_call",
        call_id: "call_read_1",
        name: "read",
        arguments: '{"filePath":"README.md"}',
      },
      {
        id: "fc_2",
        type: "function_call",
        call_id: "call_grep_1",
        name: "grep",
        arguments: '{"pattern":"ToolCallRequest","path":"packages"}',
      },
      {
        type: "function_call_output",
        call_id: "call_read_1",
        output: "<path>README.md</path>\n1: # buli",
      },
      {
        type: "function_call_output",
        call_id: "call_grep_1",
        output: "packages/contracts/src/toolCallRequest.ts:64: ToolCallRequestSchema",
      },
    ],
  });
  expect(providerTurn.getProviderTurnReplay()).toEqual({
    provider: "openai",
    inputItems: [
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_read_1",
        name: "read",
        arguments: '{"filePath":"README.md"}',
      },
      {
        type: "function_call",
        id: "fc_2",
        call_id: "call_grep_1",
        name: "grep",
        arguments: '{"pattern":"ToolCallRequest","path":"packages"}',
      },
      {
        type: "function_call_output",
        call_id: "call_read_1",
        output: "<path>README.md</path>\n1: # buli",
      },
      {
        type: "function_call_output",
        call_id: "call_grep_1",
        output: "packages/contracts/src/toolCallRequest.ts:64: ToolCallRequestSchema",
      },
    ],
  });
});

test("OpenAiProviderConversationTurn honors a configured response-step limit", async () => {
  const requestBodies: string[] = [];
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImpl([
      createOpenAiStepResponse([
        'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"read","arguments":""}}\n\n',
        'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"filePath\\":\\"README.md\\"}"}\n\n',
        'data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_1","name":"read","arguments":"{\\"filePath\\":\\"README.md\\"}"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
      ]),
    ], requestBodies),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Read README"),
    maxResponseStepsPerTurn: 1,
    onStepRequestFailed: async () => new Error("unexpected request failure"),
  });
  const emittedEvents: ProviderStreamEvent[] = [];

  await expect((async () => {
    for await (const emittedEvent of providerTurn.streamProviderEvents()) {
      emittedEvents.push(emittedEvent);
      if (emittedEvent.type === "tool_call_requested") {
        await providerTurn.submitToolResult({
          toolCallId: emittedEvent.toolCallId,
          toolResultText: "<path>README.md</path>\n1: # buli",
        });
      }
    }
  })()).rejects.toThrow("OpenAI response step limit exceeded after 1 steps");

  expect(emittedEvents.map((emittedEvent) => emittedEvent.type)).toEqual(["tool_call_requested"]);
  expect(requestBodies).toHaveLength(1);
});

test("OpenAiProviderConversationTurn stops before another response step when continuation context reaches Buli's performance budget", async () => {
  const requestBodies: string[] = [];
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const queuedResponses = [
    createOpenAiStepResponse([
      createOpenAiSseFrame({
        type: "response.output_item.added",
        output_index: 0,
        item: { type: "function_call", id: "fc_1", call_id: "call_read_1", name: "read", arguments: "" },
      }),
      createOpenAiSseFrame({
        type: "response.function_call_arguments.done",
        item_id: "fc_1",
        arguments: '{"filePath":"README.md"}',
      }),
      createOpenAiSseFrame({
        type: "response.completed",
        response: {
          output: [{ id: "fc_1", type: "function_call", call_id: "call_read_1", name: "read", arguments: '{"filePath":"README.md"}' }],
          usage: { input_tokens: 252_000, output_tokens: 0, total_tokens: 252_000 },
        },
      }),
    ]),
    createOpenAiStepResponse([
      createOpenAiSseFrame({ type: "response.output_text.delta", item_id: "msg_1", delta: "Should not be requested" }),
      createOpenAiSseFrame({
        type: "response.completed",
        response: { usage: { input_tokens: 20, output_tokens: 4, total_tokens: 24 } },
      }),
    ]),
  ];
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImpl(queuedResponses, requestBodies),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.5",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Read README"),
    onStepRequestFailed: async () => new Error("unexpected request failure"),
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });

  const emittedEvents: ProviderStreamEvent[] = [];
  for await (const emittedEvent of providerTurn.streamProviderEvents()) {
    emittedEvents.push(emittedEvent);
    if (emittedEvent.type === "tool_call_requested") {
      await providerTurn.submitToolResult({
        toolCallId: emittedEvent.toolCallId,
        toolResultText: "<path>README.md</path>\n1: # buli",
      });
    }
  }

  expect(emittedEvents).toEqual([
    {
      type: "tool_call_requested",
      toolCallId: "call_read_1",
      toolCallRequest: { toolName: "read", readTargetPath: "README.md" },
    },
    {
      type: "incomplete",
      incompleteReason: "context_window_near_limit",
      usage: {
        total: 252_000,
        input: 252_000,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      contextWindowUsage: {
        total: 252_000,
        input: 252_000,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    },
  ]);
  expect(requestBodies).toHaveLength(1);
  expect(providerTurn.getProviderTurnReplay()).toEqual({
    provider: "openai",
    inputItems: [
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_read_1",
        name: "read",
        arguments: '{"filePath":"README.md"}',
      },
      {
        type: "function_call_output",
        call_id: "call_read_1",
        output: "<path>README.md</path>\n1: # buli",
      },
    ],
  });
  const guardDiagnosticEvent = diagnosticEvents.find(
    (diagnosticEvent) => diagnosticEvent.eventName === "response_step.continuation_context_guard_triggered",
  );
  expect(guardDiagnosticEvent?.fields).toMatchObject({
    reason: "context_window_near_limit",
    contextTokensUsed: 252_000,
    promptInputTokensUsed: 252_000,
    contextWindowTokenCapacity: 1_050_000,
    inputTokenCapacity: null,
    preferredContextPerformanceBudgetTokenCount: 272_000,
    continuationTriggerTokenCount: 252_000,
  });
});

test("OpenAiProviderConversationTurn lets the agent finish after more than twenty response steps by default", async () => {
  const requestBodies: string[] = [];
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const toolStepCount = 32;
  const queuedResponses = [
    ...Array.from({ length: toolStepCount }, (_value, index) => createOpenAiReadToolStepResponse(index + 1)),
    createOpenAiStepResponse([
      createOpenAiSseFrame({ type: "response.output_text.delta", item_id: "msg_1", delta: "Done after extended inspection" }),
      createOpenAiSseFrame({
        type: "response.completed",
        response: { usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 } },
      }),
    ]),
  ];
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImpl(queuedResponses, requestBodies),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Inspect all files"),
    onStepRequestFailed: async () => new Error("unexpected request failure"),
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });
  const emittedEvents: ProviderStreamEvent[] = [];

  for await (const emittedEvent of providerTurn.streamProviderEvents()) {
    emittedEvents.push(emittedEvent);
    if (emittedEvent.type === "tool_call_requested") {
      await providerTurn.submitToolResult({
        toolCallId: emittedEvent.toolCallId,
        toolResultText: `<path>${emittedEvent.toolCallId}.txt</path>\n1: inspected`,
      });
    }
  }

  expect(emittedEvents.filter((emittedEvent) => emittedEvent.type === "tool_call_requested")).toHaveLength(toolStepCount);
  expect(emittedEvents.map((emittedEvent) => emittedEvent.type).slice(-2)).toEqual(["text_chunk", "completed"]);
  expect(requestBodies).toHaveLength(toolStepCount + 1);
  const responseStepWarning = diagnosticEvents.find(
    (diagnosticEvent) => diagnosticEvent.eventName === "provider_turn.response_step_warning_threshold_reached",
  );
  expect(responseStepWarning?.fields).toMatchObject({
    responseStepIndex: 32,
    responseStepDiagnosticWarningThreshold: 32,
    requestedToolCallCount: 31,
  });
});

test("OpenAiProviderConversationTurn emits soft loop diagnostics without limiting the turn", async () => {
  const requestBodies: string[] = [];
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const toolStepCount = 3;
  const queuedResponses = [
    ...Array.from({ length: toolStepCount }, (_value, index) => createOpenAiReadToolStepResponse(index + 1)),
    createOpenAiStepResponse([
      createOpenAiSseFrame({ type: "response.output_text.delta", item_id: "msg_1", delta: "Done after warnings" }),
      createOpenAiSseFrame({
        type: "response.completed",
        response: { usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 } },
      }),
    ]),
  ];
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImpl(queuedResponses, requestBodies),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Inspect all files"),
    responseStepDiagnosticWarningThreshold: 2,
    toolCallDiagnosticWarningThreshold: 2,
    repeatedToolCallDiagnosticWarningThreshold: 2,
    onStepRequestFailed: async () => new Error("unexpected request failure"),
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });
  const emittedEvents: ProviderStreamEvent[] = [];

  for await (const emittedEvent of providerTurn.streamProviderEvents()) {
    emittedEvents.push(emittedEvent);
    if (emittedEvent.type === "tool_call_requested") {
      await providerTurn.submitToolResult({
        toolCallId: emittedEvent.toolCallId,
        toolResultText: `<path>${emittedEvent.toolCallId}.txt</path>\n1: inspected`,
      });
    }
  }

  expect(emittedEvents.filter((emittedEvent) => emittedEvent.type === "tool_call_requested")).toHaveLength(toolStepCount);
  expect(emittedEvents.map((emittedEvent) => emittedEvent.type).slice(-2)).toEqual(["text_chunk", "completed"]);
  expect(requestBodies).toHaveLength(toolStepCount + 1);

  const responseStepWarning = diagnosticEvents.find(
    (diagnosticEvent) => diagnosticEvent.eventName === "provider_turn.response_step_warning_threshold_reached",
  );
  expect(responseStepWarning?.fields).toMatchObject({
    responseStepIndex: 2,
    responseStepDiagnosticWarningThreshold: 2,
    requestedToolCallCount: 1,
  });

  const toolCallWarning = diagnosticEvents.find(
    (diagnosticEvent) => diagnosticEvent.eventName === "provider_turn.tool_call_warning_threshold_reached",
  );
  expect(toolCallWarning?.fields).toMatchObject({
    responseStepIndex: 2,
    requestedToolCallCount: 2,
    toolCallDiagnosticWarningThreshold: 2,
    currentResponseStepToolCallCount: 1,
  });

  const repeatedPatternWarning = diagnosticEvents.find(
    (diagnosticEvent) => diagnosticEvent.eventName === "provider_turn.repeated_tool_call_pattern_observed",
  );
  expect(repeatedPatternWarning?.fields).toMatchObject({
    responseStepIndex: 2,
    toolName: "read",
    toolCallPatternObservationCount: 2,
    repeatedToolCallDiagnosticWarningThreshold: 2,
    readTargetPathLength: 10,
  });
  expect(JSON.stringify(repeatedPatternWarning?.fields ?? {})).not.toContain("file-1.txt");
  expect(JSON.stringify(repeatedPatternWarning?.fields ?? {})).not.toContain("file-2.txt");
});

test("OpenAiProviderConversationTurn honors a configured per-turn tool-call limit", async () => {
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImpl([
      createOpenAiStepResponse([
        'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_read_1","name":"read","arguments":""}}\n\n',
        'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"filePath\\":\\"README.md\\"}"}\n\n',
        'data: {"type":"response.output_item.added","output_index":1,"item":{"type":"function_call","id":"fc_2","call_id":"call_grep_1","name":"grep","arguments":""}}\n\n',
        'data: {"type":"response.function_call_arguments.done","item_id":"fc_2","arguments":"{\\"pattern\\":\\"Buli\\"}"}\n\n',
        'data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_read_1","name":"read","arguments":"{\\"filePath\\":\\"README.md\\"}"},{"id":"fc_2","type":"function_call","call_id":"call_grep_1","name":"grep","arguments":"{\\"pattern\\":\\"Buli\\"}"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
      ]),
    ], []),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Inspect README"),
    maxToolCallsPerTurn: 1,
    onStepRequestFailed: async () => new Error("unexpected request failure"),
  });
  const emittedEvents: ProviderStreamEvent[] = [];

  await expect((async () => {
    for await (const emittedEvent of providerTurn.streamProviderEvents()) {
      emittedEvents.push(emittedEvent);
    }
  })()).rejects.toThrow("OpenAI tool-call limit exceeded: requested 2 tool calls (max 1)");

  expect(emittedEvents.map((emittedEvent) => emittedEvent.type)).toEqual(["tool_call_requested"]);
});

test("OpenAiProviderConversationTurn passes an abortable signal to response fetch", async () => {
  const abortController = new AbortController();
  const receivedAbortSignals: Array<AbortSignal | null | undefined> = [];
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createSignalRecordingFetchImpl({
      response: createOpenAiStepResponse([
        'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"Done"}\n\n',
        'data: {"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":4,"total_tokens":14}}}\n\n',
      ]),
      receivedAbortSignals,
    }),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Answer"),
    abortSignal: abortController.signal,
    onStepRequestFailed: async () => new Error("unexpected request failure"),
  });

  for await (const _emittedEvent of providerTurn.streamProviderEvents()) {
    // Consume the stream so the request is issued.
  }

  expect(receivedAbortSignals).toHaveLength(1);
  expect(receivedAbortSignals[0]).toBeInstanceOf(AbortSignal);
  expect(receivedAbortSignals[0]?.aborted).toBe(false);
});

test("OpenAiProviderConversationTurn times out stalled response-step fetches", async () => {
  const requestBodies: string[] = [];
  const receivedAbortSignals: AbortSignal[] = [];
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createAbortablePendingFetchImpl({
      receivedAbortSignals,
      requestBodies,
    }),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Answer after a stalled request"),
    responseStepFetchTimeoutMilliseconds: 1,
    onStepRequestFailed: async () => new Error("unexpected request failure"),
  });

  await expect(collectProviderEvents(providerTurn)).rejects.toThrow("OpenAI response-step request timed out");

  expect(requestBodies).toHaveLength(6);
  expect(receivedAbortSignals).toHaveLength(6);
  expect(receivedAbortSignals.every((receivedAbortSignal) => receivedAbortSignal.aborted)).toBe(true);
});

test("OpenAiProviderConversationTurn retries transient response-step failures", async () => {
  const requestBodies: string[] = [];
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImpl([
      createOpenAiErrorResponse({
        status: 429,
        message: "slow down",
        headers: { "retry-after-ms": "0", "openai-request-id": "req_retry_1" },
      }),
      createOpenAiErrorResponse({
        status: 503,
        message: "temporarily unavailable",
        headers: { "retry-after": "0", "openai-request-id": "req_retry_2" },
      }),
      createOpenAiStepResponse([
        createOpenAiSseFrame({ type: "response.output_text.delta", item_id: "msg_1", delta: "Done after retry" }),
        createOpenAiSseFrame({
          type: "response.completed",
          response: { usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 } },
        }),
      ]),
    ], requestBodies),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Answer after transient failures"),
    onStepRequestFailed: async () => new Error("unexpected request failure"),
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });

  const emittedEvents = await collectProviderEvents(providerTurn);

  expect(emittedEvents.map((emittedEvent) => emittedEvent.type)).toEqual([
    "rate_limit_pending",
    "rate_limit_pending",
    "text_chunk",
    "completed",
  ]);
  expect(emittedEvents[0]).toMatchObject({
    type: "rate_limit_pending",
    retryAfterSeconds: 0,
    retryReason: "rate_limit",
  });
  expect(emittedEvents[1]).toMatchObject({
    type: "rate_limit_pending",
    retryAfterSeconds: 0,
    retryReason: "transient_http_response",
  });
  expect(requestBodies).toHaveLength(3);
  expect(diagnosticEvents.filter((diagnosticEvent) => diagnosticEvent.eventName === "response_step.retry_scheduled"))
    .toHaveLength(2);
  expect(diagnosticEvents.find((diagnosticEvent) => diagnosticEvent.eventName === "response_step.retry_succeeded")?.fields)
    .toMatchObject({
      responseStepIndex: 1,
      responseStepRequestAttemptIndex: 3,
      retryAttemptCount: 2,
      status: 200,
    });
});

test("OpenAiProviderConversationTurn reports intermediate retry headers to the rate-limit coordinator", async () => {
  const requestBodies: string[] = [];
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const diagnosticLogger = (diagnosticEvent: BuliDiagnosticLogEvent): void => {
    diagnosticEvents.push(diagnosticEvent);
  };
  const rateLimitCoordinator = new OpenAiRateLimitCoordinator({
    maximumConcurrentResponseStepStreams: 4,
    diagnosticLogger,
  });
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImpl([
      createOpenAiErrorResponse({
        status: 429,
        message: "slow down",
        headers: {
          "retry-after-ms": "0",
          "x-ratelimit-remaining-requests": "0",
          "x-ratelimit-reset-requests": "0ms",
        },
      }),
      createOpenAiStepResponse([
        createOpenAiSseFrame({ type: "response.output_text.delta", item_id: "msg_1", delta: "Done after retry" }),
        createOpenAiSseFrame({
          type: "response.completed",
          response: { usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 } },
        }),
      ], { "x-ratelimit-remaining-requests": "8" }),
    ], requestBodies),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Answer after a coordinated retry"),
    rateLimitCoordinator,
    onStepRequestFailed: async () => new Error("unexpected request failure"),
    diagnosticLogger,
  });

  const emittedEvents = await collectProviderEvents(providerTurn);

  expect(emittedEvents.map((emittedEvent) => emittedEvent.type)).toEqual([
    "rate_limit_pending",
    "text_chunk",
    "completed",
  ]);
  expect(requestBodies).toHaveLength(2);
  expect(diagnosticEvents).toContainEqual(expect.objectContaining({
    subsystem: "openai",
    eventName: "rate_limit_coordinator.adaptive_stream_limit_reduced",
    fields: expect.objectContaining({
      previousConcurrentResponseStepStreamLimit: 4,
      currentConcurrentResponseStepStreamLimit: 2,
      rateLimitRequestsRemaining: 0,
    }),
  }));
  expect(diagnosticEvents).toContainEqual(expect.objectContaining({
    subsystem: "openai",
    eventName: "rate_limit_coordinator.adaptive_stream_limit_increased",
    fields: expect.objectContaining({
      previousConcurrentResponseStepStreamLimit: 2,
      currentConcurrentResponseStepStreamLimit: 3,
      rateLimitRequestsRemaining: 8,
    }),
  }));
});

test("OpenAiProviderConversationTurn fails after exhausting transient response-step retries", async () => {
  const requestBodies: string[] = [];
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImpl([
      createOpenAiErrorResponse({ status: 429, message: "retry 1", headers: { "retry-after-ms": "0" } }),
      createOpenAiErrorResponse({ status: 429, message: "retry 2", headers: { "retry-after-ms": "0" } }),
      createOpenAiErrorResponse({ status: 429, message: "retry 3", headers: { "retry-after-ms": "0" } }),
      createOpenAiErrorResponse({ status: 429, message: "retry 4", headers: { "retry-after-ms": "0" } }),
      createOpenAiErrorResponse({ status: 429, message: "retry 5", headers: { "retry-after-ms": "0" } }),
      createOpenAiErrorResponse({ status: 429, message: "retry 6", headers: { "retry-after-ms": "0" } }),
    ], requestBodies),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Answer after too many transient failures"),
    onStepRequestFailed: async (response) => new Error(`request failed with ${response.status}`),
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });

  await expect(collectProviderEvents(providerTurn)).rejects.toThrow("request failed with 429");

  expect(requestBodies).toHaveLength(6);
  expect(diagnosticEvents.filter((diagnosticEvent) => diagnosticEvent.eventName === "response_step.retry_scheduled"))
    .toHaveLength(5);
  expect(diagnosticEvents.find((diagnosticEvent) => diagnosticEvent.eventName === "response_step.retry_exhausted")?.fields)
    .toMatchObject({
      responseStepIndex: 1,
      responseStepRequestAttemptIndex: 6,
      maxResponseStepHttpRetryCount: 5,
      status: 429,
    });
});

test("OpenAiProviderConversationTurn stops waiting for a response-step retry when aborted", async () => {
  const abortController = new AbortController();
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImpl([
      createOpenAiErrorResponse({
        status: 429,
        message: "wait before retry",
        headers: { "retry-after-ms": "60000" },
      }),
    ], []),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Answer after retry wait"),
    abortSignal: abortController.signal,
    onStepRequestFailed: async () => new Error("unexpected request failure"),
  });
  const providerEventIterator = providerTurn.streamProviderEvents()[Symbol.asyncIterator]();

  await expect(providerEventIterator.next()).resolves.toMatchObject({
    done: false,
    value: { type: "rate_limit_pending", retryAfterSeconds: 60, retryReason: "rate_limit" },
  });
  abortController.abort();

  await expect(providerEventIterator.next()).rejects.toThrow("interrupted while waiting to retry OpenAI request");
});

test("OpenAiProviderConversationTurn retries transient response-step transport failures", async () => {
  const requestBodies: string[] = [];
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImplWithQueuedOutcomes([
      { outcomeKind: "rejection", error: new TypeError("fetch failed with secret-token") },
      { outcomeKind: "rejection", error: new TypeError("socket reset") },
      {
        outcomeKind: "response",
        response: createOpenAiStepResponse([
          createOpenAiSseFrame({ type: "response.output_text.delta", item_id: "msg_1", delta: "Done after transport retry" }),
          createOpenAiSseFrame({
            type: "response.completed",
            response: { usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 } },
          }),
        ]),
      },
    ], requestBodies),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Answer after transport failures"),
    onStepRequestFailed: async () => new Error("unexpected request failure"),
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });

  const emittedEvents = await collectProviderEvents(providerTurn);

  expect(emittedEvents.map((emittedEvent) => emittedEvent.type)).toEqual([
    "rate_limit_pending",
    "rate_limit_pending",
    "text_chunk",
    "completed",
  ]);
  expect(emittedEvents[0]).toMatchObject({
    type: "rate_limit_pending",
    retryAfterSeconds: 0,
    retryReason: "transport_error",
  });
  expect(requestBodies).toHaveLength(3);
  expect(diagnosticEvents.filter((diagnosticEvent) => diagnosticEvent.eventName === "response_step.transport_retry_scheduled"))
    .toHaveLength(2);
  expect(diagnosticEvents.find((diagnosticEvent) => diagnosticEvent.eventName === "response_step.transport_retry_succeeded")?.fields)
    .toMatchObject({
      responseStepIndex: 1,
      responseStepRequestAttemptIndex: 3,
      transportRetryAttemptCount: 2,
      status: 200,
    });
  expect(JSON.stringify(diagnosticEvents)).not.toContain("secret-token");
});

test("OpenAiProviderConversationTurn fails after exhausting transient response-step transport retries", async () => {
  const requestBodies: string[] = [];
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImplWithQueuedOutcomes([
      { outcomeKind: "rejection", error: new TypeError("fetch failed 1") },
      { outcomeKind: "rejection", error: new TypeError("fetch failed 2") },
      { outcomeKind: "rejection", error: new TypeError("fetch failed 3") },
      { outcomeKind: "rejection", error: new TypeError("fetch failed 4") },
      { outcomeKind: "rejection", error: new TypeError("fetch failed 5") },
      { outcomeKind: "rejection", error: new TypeError("fetch failed 6") },
    ], requestBodies),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Answer after too many transport failures"),
    onStepRequestFailed: async () => new Error("unexpected request failure"),
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });

  await expect(collectProviderEvents(providerTurn)).rejects.toThrow("fetch failed 6");

  expect(requestBodies).toHaveLength(6);
  expect(diagnosticEvents.filter((diagnosticEvent) => diagnosticEvent.eventName === "response_step.transport_retry_scheduled"))
    .toHaveLength(5);
  expect(diagnosticEvents.find((diagnosticEvent) => diagnosticEvent.eventName === "response_step.transport_retry_exhausted")?.fields)
    .toMatchObject({
      responseStepIndex: 1,
      responseStepRequestAttemptIndex: 6,
      maxResponseStepHttpRetryCount: 5,
      transportErrorName: "TypeError",
    });
});

test("OpenAiProviderConversationTurn does not retry aborted response-step fetches", async () => {
  const requestBodies: string[] = [];
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImplWithQueuedOutcomes([
      { outcomeKind: "rejection", error: new DOMException("request aborted", "AbortError") },
      {
        outcomeKind: "response",
        response: createOpenAiStepResponse([
          createOpenAiSseFrame({ type: "response.output_text.delta", item_id: "msg_1", delta: "Unexpected retry" }),
          createOpenAiSseFrame({
            type: "response.completed",
            response: { usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 } },
          }),
        ]),
      },
    ], requestBodies),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Answer after abort"),
    onStepRequestFailed: async () => new Error("unexpected request failure"),
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });

  await expect(collectProviderEvents(providerTurn)).rejects.toThrow("request aborted");

  expect(requestBodies).toHaveLength(1);
  expect(diagnosticEvents.some((diagnosticEvent) => diagnosticEvent.eventName === "response_step.transport_retry_scheduled"))
    .toBe(false);
});

test("OpenAiProviderConversationTurn does not retry non-transport response-step fetch errors", async () => {
  const requestBodies: string[] = [];
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImplWithQueuedOutcomes([
      { outcomeKind: "rejection", error: new Error("test programming error") },
      {
        outcomeKind: "response",
        response: createOpenAiStepResponse([
          createOpenAiSseFrame({ type: "response.output_text.delta", item_id: "msg_1", delta: "Unexpected retry" }),
          createOpenAiSseFrame({
            type: "response.completed",
            response: { usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 } },
          }),
        ]),
      },
    ], requestBodies),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Answer after programming error"),
    onStepRequestFailed: async () => new Error("unexpected request failure"),
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });

  await expect(collectProviderEvents(providerTurn)).rejects.toThrow("test programming error");

  expect(requestBodies).toHaveLength(1);
  expect(diagnosticEvents.some((diagnosticEvent) => diagnosticEvent.eventName === "response_step.transport_retry_scheduled"))
    .toBe(false);
});

test("OpenAiProviderConversationTurn stops waiting for a tool result when aborted", async () => {
  const abortController = new AbortController();
  const controlledToolStep = createControlledOpenAiStepResponse();
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImpl([controlledToolStep.response], []),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Run pwd"),
    abortSignal: abortController.signal,
    onStepRequestFailed: async () => new Error("unexpected request failure"),
  });
  const providerEventIterator = providerTurn.streamProviderEvents()[Symbol.asyncIterator]();
  const requestedToolCallResult = providerEventIterator.next();

  controlledToolStep.enqueueSseFrame({
    type: "response.output_item.added",
    output_index: 0,
    item: { type: "function_call", id: "fc_1", call_id: "call_1", name: "bash", arguments: "" },
  });
  controlledToolStep.enqueueSseFrame({
    type: "response.function_call_arguments.done",
    item_id: "fc_1",
    arguments: '{"command":"pwd","description":"Print working directory"}',
  });

  await expect(requestedToolCallResult).resolves.toMatchObject({
    done: false,
    value: { type: "tool_call_requested", toolCallId: "call_1" },
  });
  controlledToolStep.enqueueSseFrame({
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
  });
  controlledToolStep.close();
  const waitingForToolResult = providerEventIterator.next();

  await expect(waitForProviderIteratorResult(waitingForToolResult, 100)).rejects.toThrow("Provider iterator did not yield");
  abortController.abort();

  await expect(waitingForToolResult).rejects.toThrow("interrupted while waiting for tool result");
});

test("OpenAiProviderConversationTurn restricts tool definitions when availableToolNames is provided", async () => {
  const requestBodies: string[] = [];
  const queuedResponses = [
    createOpenAiStepResponse([
      'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"Done"}\n\n',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":4,"total_tokens":14}}}\n\n',
    ]),
  ];
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImpl(queuedResponses, requestBodies),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are Buli Explorer.",
    conversationSessionEntries: createConversationSessionEntries("Explore runtime"),
    availableToolNames: ["read", "glob", "grep"],
    onStepRequestFailed: async () => new Error("unexpected request failure"),
  });

  for await (const _emittedEvent of providerTurn.streamProviderEvents()) {
    // Consume the stream so the request is issued.
  }

  const requestBody = JSON.parse(requestBodies[0] ?? "{}") as { tools?: Array<{ name?: string }> };
  expect(requestBody.tools?.map((toolDefinition) => toolDefinition.name)).toEqual(["read", "glob", "grep"]);
});

test("OpenAiProviderConversationTurn sends reasoning effort without summaries when reasoning is disabled", async () => {
  const requestBodies: string[] = [];
  const queuedResponses = [
    createOpenAiStepResponse([
      'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"Done"}\n\n',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":4,"total_tokens":14}}}\n\n',
    ]),
  ];
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImpl(queuedResponses, requestBodies),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    selectedReasoningEffort: "none",
    promptCacheKey: "buli:test-session",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Answer quickly"),
    onStepRequestFailed: async () => new Error("unexpected request failure"),
  });

  const emittedEvents: ProviderStreamEvent[] = [];
  for await (const emittedEvent of providerTurn.streamProviderEvents()) {
    emittedEvents.push(emittedEvent);
  }

  expect(emittedEvents.map((emittedEvent) => emittedEvent.type)).toEqual(["text_chunk", "completed"]);
  expect(JSON.parse(requestBodies[0] ?? "{}")).toMatchObject({
    prompt_cache_key: "buli:test-session",
    reasoning: { effort: "none" },
  });
});

test("OpenAiProviderConversationTurn aggregates usage across tool and final response steps", async () => {
  const requestBodies: string[] = [];
  const queuedResponses = [
    createOpenAiStepResponse([
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"bash","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}"}\n\n',
      'data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_1","name":"bash","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}"}],"usage":{"input_tokens":100,"input_tokens_details":{"cached_tokens":20},"output_tokens":30,"output_tokens_details":{"reasoning_tokens":12},"total_tokens":130}}}\n\n',
    ]),
    createOpenAiStepResponse([
      'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"Done"}\n\n',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":50,"input_tokens_details":{"cached_tokens":5},"output_tokens":25,"output_tokens_details":{"reasoning_tokens":7},"total_tokens":75}}}\n\n',
    ]),
  ];
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImpl(queuedResponses, requestBodies),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Run pwd"),
    onStepRequestFailed: async () => new Error("unexpected request failure"),
  });

  const emittedEvents: ProviderStreamEvent[] = [];
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
  expect(emittedEvents.find((emittedEvent) => emittedEvent.type === "completed")).toEqual({
    type: "completed",
    usage: {
      total: 205,
      input: 125,
      output: 36,
      reasoning: 19,
      cache: { read: 25, write: 0 },
    },
    contextWindowUsage: {
      total: 75,
      input: 45,
      output: 18,
      reasoning: 7,
      cache: { read: 5, write: 0 },
    },
  });
});

test("OpenAiProviderConversationTurn replays streamed function_call items when terminal response output omits them", async () => {
  const requestBodies: string[] = [];
  const queuedResponses = [
    createOpenAiStepResponse([
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"message","id":"msg_1","role":"assistant","status":"completed","content":[{"type":"output_text","text":"I will run pwd."}]}}\n\n',
      'data: {"type":"response.output_item.added","output_index":1,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"bash","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}"}\n\n',
      'data: {"type":"response.completed","response":{"output":[{"type":"message","id":"msg_1","role":"assistant","status":"completed","content":[{"type":"output_text","text":"I will run pwd."}]}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
    ]),
    createOpenAiStepResponse([
      'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"Done"}\n\n',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":20,"output_tokens":4,"total_tokens":24}}}\n\n',
    ]),
  ];
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImpl(queuedResponses, requestBodies),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Run pwd"),
    onStepRequestFailed: async () => new Error("unexpected request failure"),
  });

  const emittedEvents: ProviderStreamEvent[] = [];
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
    "text_chunk",
    "tool_call_requested",
    "text_chunk",
    "completed",
  ]);
  expect(emittedEvents[0]).toEqual({ type: "text_chunk", text: "I will run pwd." });
  expect(providerTurn.getProviderTurnReplay()).toEqual({
    provider: "openai",
    inputItems: [
      {
        type: "function_call",
        id: "fc_1",
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
  });
  expect(JSON.parse(requestBodies[1] ?? "{}")).toMatchObject({
    input: [
      {
        role: "user",
        content: "Run pwd",
      },
      {
        role: "assistant",
        content: "I will run pwd.",
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
  });
});

test("OpenAiProviderConversationTurn replays streamed assistant text before a tool call when terminal output omits it", async () => {
  const requestBodies: string[] = [];
  const queuedResponses = [
    createOpenAiStepResponse([
      'data: {"type":"response.output_text.delta","output_index":0,"item_id":"msg_1","content_index":0,"delta":"I will run pwd."}\n\n',
      'data: {"type":"response.output_item.added","output_index":1,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"bash","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}"}\n\n',
      'data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_1","name":"bash","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
    ]),
    createOpenAiStepResponse([
      'data: {"type":"response.output_text.delta","item_id":"msg_2","delta":"Done"}\n\n',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":20,"output_tokens":4,"total_tokens":24}}}\n\n',
    ]),
  ];
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImpl(queuedResponses, requestBodies),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Run pwd"),
    onStepRequestFailed: async () => new Error("unexpected request failure"),
  });

  for await (const emittedEvent of providerTurn.streamProviderEvents()) {
    if (emittedEvent.type === "tool_call_requested") {
      await providerTurn.submitToolResult({
        toolCallId: emittedEvent.toolCallId,
        toolResultText: "Command: pwd\nWorking directory: /tmp\nExit code: 0",
      });
    }
  }

  expect(JSON.parse(requestBodies[1] ?? "{}")).toMatchObject({
    input: [
      { role: "user", content: "Run pwd" },
      { role: "assistant", content: "I will run pwd." },
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
  });
});

test("OpenAiProviderConversationTurn matches queued tool results by toolCallId across repeated tool steps", async () => {
  const requestBodies: string[] = [];
  const queuedResponses = [
    createOpenAiStepResponse([
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"bash","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}"}\n\n',
      'data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_1","name":"bash","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
    ]),
    createOpenAiStepResponse([
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_2","call_id":"call_2","name":"bash","arguments":""}}\n\n',
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_2","arguments":"{\\"command\\":\\"ls\\",\\"description\\":\\"List files\\"}"}\n\n',
      'data: {"type":"response.completed","response":{"output":[{"id":"fc_2","type":"function_call","call_id":"call_2","name":"bash","arguments":"{\\"command\\":\\"ls\\",\\"description\\":\\"List files\\"}"}],"usage":{"input_tokens":12,"output_tokens":0,"total_tokens":12}}}\n\n',
    ]),
    createOpenAiStepResponse([
      'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"Done"}\n\n',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":22,"output_tokens":4,"total_tokens":26}}}\n\n',
    ]),
  ];
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImpl(queuedResponses, requestBodies),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Run both commands"),
    onStepRequestFailed: async () => new Error("unexpected request failure"),
  });

  const emittedEvents: ProviderStreamEvent[] = [];
  for await (const emittedEvent of providerTurn.streamProviderEvents()) {
    emittedEvents.push(emittedEvent);
    if (emittedEvent.type === "tool_call_requested" && emittedEvent.toolCallId === "call_1") {
      await providerTurn.submitToolResult({
        toolCallId: "call_2",
        toolResultText: "Command: ls\nFiles: a.txt",
      });
      await providerTurn.submitToolResult({
        toolCallId: "call_1",
        toolResultText: "Command: pwd\nWorking directory: /tmp",
      });
    }
  }

  expect(emittedEvents.map((emittedEvent) => emittedEvent.type)).toEqual([
    "tool_call_requested",
    "tool_call_requested",
    "text_chunk",
    "completed",
  ]);
  expect(JSON.parse(requestBodies[2] ?? "{}")).toMatchObject({
    input: [
      {
        role: "user",
        content: "Run both commands",
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
        output: "Command: pwd\nWorking directory: /tmp",
      },
      {
        id: "fc_2",
        type: "function_call",
        call_id: "call_2",
        name: "bash",
        arguments: '{"command":"ls","description":"List files"}',
      },
      {
        type: "function_call_output",
        call_id: "call_2",
        output: "Command: ls\nFiles: a.txt",
      },
    ],
  });
  expect(providerTurn.getProviderTurnReplay()).toEqual({
    provider: "openai",
    inputItems: [
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "bash",
        arguments: '{"command":"pwd","description":"Print working directory"}',
      },
      {
        type: "function_call_output",
        call_id: "call_1",
        output: "Command: pwd\nWorking directory: /tmp",
      },
      {
        type: "function_call",
        id: "fc_2",
        call_id: "call_2",
        name: "bash",
        arguments: '{"command":"ls","description":"List files"}',
      },
      {
        type: "function_call_output",
        call_id: "call_2",
        output: "Command: ls\nFiles: a.txt",
      },
    ],
  });
});

test("OpenAiProviderConversationTurn redacts failed-response structured diagnostics", async () => {
  const requestBodies: string[] = [];
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImpl([
      new Response(
        JSON.stringify({
          error: {
            message: `proxy echoed Bearer secret-token and access_token=abc123 ${"x".repeat(600)}`,
          },
        }),
        {
          status: 400,
          headers: { "content-type": "application/json", "openai-request-id": "req_secret" },
        },
      ),
    ], requestBodies),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Prompt containing private context"),
    onStepRequestFailed: async () => new Error("request failed"),
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });

  await expect(collectProviderEvents(providerTurn)).rejects.toThrow("request failed");

  const failedRequestDiagnosticEvent = diagnosticEvents.find(
    (diagnosticEvent) => diagnosticEvent.eventName === "response_step.request_failed",
  );
  const structuredErrorMessage = failedRequestDiagnosticEvent?.fields?.["structuredErrorMessage"];
  expect(typeof structuredErrorMessage).toBe("string");
  if (typeof structuredErrorMessage !== "string") {
    throw new Error("expected structured error diagnostic message");
  }
  expect(structuredErrorMessage).toContain("Bearer [REDACTED]");
  expect(structuredErrorMessage).toContain("access_token=[REDACTED]");
  expect(structuredErrorMessage).toContain("chars omitted");
  expect(structuredErrorMessage).not.toContain("secret-token");
  expect(structuredErrorMessage).not.toContain("abc123");
  expect(requestBodies).toHaveLength(1);
});
