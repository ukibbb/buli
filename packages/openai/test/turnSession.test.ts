import { expect, test } from "bun:test";
import type { ProviderStreamEvent } from "@buli/contracts";
import { OpenAiProviderConversationTurn } from "../src/provider/turnSession.ts";

function createOpenAiStepResponse(eventFrames: readonly string[]): Response {
  return new Response(eventFrames.join(""), {
    headers: { "Content-Type": "text/event-stream" },
  });
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
