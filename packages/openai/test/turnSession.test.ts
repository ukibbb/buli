import { expect, test } from "bun:test";
import type { BuliDiagnosticLogEvent, ProviderStreamEvent } from "@buli/contracts";
import { OpenAiProviderConversationTurn } from "../src/provider/turnSession.ts";

function createOpenAiStepResponse(eventFrames: readonly string[]): Response {
  return new Response(eventFrames.join(""), {
    headers: { "Content-Type": "text/event-stream" },
  });
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

async function collectProviderEvents(providerTurn: OpenAiProviderConversationTurn): Promise<ProviderStreamEvent[]> {
  const providerEvents: ProviderStreamEvent[] = [];
  for await (const providerEvent of providerTurn.streamProviderEvents()) {
    providerEvents.push(providerEvent);
  }

  return providerEvents;
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
    "tool_call_requested",
    "text_chunk",
    "completed",
  ]);
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

test("OpenAiProviderConversationTurn auto-continues after a code execution walkthrough presentation call", async () => {
  const requestBodies: string[] = [];
  const codeExecutionWalkthroughArgumentsText = JSON.stringify({
    titleText: "Request flow",
    summaryText: "How the request moves through Buli.",
    walkthroughKind: "source_walkthrough",
    steps: [
      {
        stepTitle: "Prompt accepted",
        whenText: null,
        whatHappensText: "The user prompt is recorded.",
        dataStateText: "The request carries the accepted prompt text.",
        decisionText: null,
        stateChangeText: null,
        nextStepText: "Provider turn starts next.",
        codeExamples: [
          {
            sourceFilePath: "packages/engine/src/runtimeConversationTurnStart.ts",
            sourceSymbolName: "startAcceptedRuntimeConversationTurn",
            startLineNumber: 64,
            endLineNumber: 67,
            languageLabel: "ts",
            codeText: "input.conversationTurnSessionRecorder.appendAcceptedUserPromptSessionEntry(\n  modelFacingPromptTextForAcceptedTurn,\n  projectInstructionSnapshotsForAcceptedTurn,\n);",
            explanationText: null,
          },
        ],
      },
    ],
  });
  const queuedResponses = [
    createOpenAiStepResponse([
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_present_1","name":"present_code_execution_walkthrough","arguments":""}}\n\n',
      `data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":${JSON.stringify(codeExecutionWalkthroughArgumentsText)}}\n\n`,
      `data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_present_1","name":"present_code_execution_walkthrough","arguments":${JSON.stringify(codeExecutionWalkthroughArgumentsText)}}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n`,
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
    conversationSessionEntries: createConversationSessionEntries("Explain request flow"),
    onStepRequestFailed: async () => new Error("unexpected request failure"),
  });

  const emittedEvents = await collectProviderEvents(providerTurn);

  expect(emittedEvents.map((emittedEvent) => emittedEvent.type)).toEqual([
    "code_execution_walkthrough_presented",
    "text_chunk",
    "completed",
  ]);
  expect(emittedEvents[0]).toEqual({
    type: "code_execution_walkthrough_presented",
    presentationCallId: "call_present_1",
    codeExecutionWalkthrough: {
      titleText: "Request flow",
      summaryText: "How the request moves through Buli.",
      walkthroughKind: "source_walkthrough",
      steps: [
        {
          stepTitle: "Prompt accepted",
          whatHappensText: "The user prompt is recorded.",
          dataStateText: "The request carries the accepted prompt text.",
          nextStepText: "Provider turn starts next.",
          codeExamples: [
            {
              sourceFilePath: "packages/engine/src/runtimeConversationTurnStart.ts",
              sourceSymbolName: "startAcceptedRuntimeConversationTurn",
              startLineNumber: 64,
              endLineNumber: 67,
              languageLabel: "ts",
              codeText: "input.conversationTurnSessionRecorder.appendAcceptedUserPromptSessionEntry(\n  modelFacingPromptTextForAcceptedTurn,\n  projectInstructionSnapshotsForAcceptedTurn,\n);",
            },
          ],
        },
      ],
    },
  });
  expect(providerTurn.getProviderTurnReplay()).toEqual({
    provider: "openai",
    inputItems: [
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_present_1",
        name: "present_code_execution_walkthrough",
        arguments: codeExecutionWalkthroughArgumentsText,
      },
      {
        type: "function_call_output",
        call_id: "call_present_1",
        output: "Rendered code execution walkthrough: Request flow",
      },
    ],
  });
  expect(JSON.parse(requestBodies[1] ?? "{}")).toMatchObject({
    input: [
      { role: "user", content: "Explain request flow" },
      {
        id: "fc_1",
        type: "function_call",
        call_id: "call_present_1",
        name: "present_code_execution_walkthrough",
        arguments: codeExecutionWalkthroughArgumentsText,
      },
      {
        type: "function_call_output",
        call_id: "call_present_1",
        output: "Rendered code execution walkthrough: Request flow",
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
    "tool_calls_requested",
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

test("OpenAiProviderConversationTurn lets the agent finish after more than twenty response steps by default", async () => {
  const requestBodies: string[] = [];
  const toolStepCount = 21;
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

  expect(emittedEvents.map((emittedEvent) => emittedEvent.type)).toEqual([]);
});

test("OpenAiProviderConversationTurn passes the abort signal to response fetch", async () => {
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

  expect(receivedAbortSignals).toEqual([abortController.signal]);
});

test("OpenAiProviderConversationTurn stops waiting for a tool result when aborted", async () => {
  const abortController = new AbortController();
  const providerTurn = new OpenAiProviderConversationTurn({
    endpoint: "https://example.test/v1/responses",
    fetchImpl: createFetchImpl([
      createOpenAiStepResponse([
        'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"bash","arguments":""}}\n\n',
        'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}"}\n\n',
        'data: {"type":"response.completed","response":{"output":[{"id":"fc_1","type":"function_call","call_id":"call_1","name":"bash","arguments":"{\\"command\\":\\"pwd\\",\\"description\\":\\"Print working directory\\"}"}],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}}\n\n',
      ]),
    ], []),
    loadRequestHeaders: async () => new Headers(),
    selectedModelId: "gpt-5.4",
    systemPromptText: "You are buli.",
    conversationSessionEntries: createConversationSessionEntries("Run pwd"),
    abortSignal: abortController.signal,
    onStepRequestFailed: async () => new Error("unexpected request failure"),
  });
  const providerEventIterator = providerTurn.streamProviderEvents()[Symbol.asyncIterator]();

  await expect(providerEventIterator.next()).resolves.toMatchObject({
    done: false,
    value: { type: "tool_call_requested", toolCallId: "call_1" },
  });
  abortController.abort();

  await expect(providerEventIterator.next()).rejects.toThrow("interrupted while waiting for tool result");
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
    availablePresentationFunctionNames: [],
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
    "tool_call_requested",
    "text_chunk",
    "completed",
  ]);
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
});
