import { readFile } from "node:fs/promises";
import { expect, test } from "bun:test";
import {
  PROVIDER_PROTOCOL_JSON_SCHEMA_ID,
  PROVIDER_PROTOCOL_VERSION,
  ProviderProtocolFrameSchema,
  ProviderProtocolHostStartTurnFrameSchema,
  ProviderProtocolHostSubmitToolResultFrameSchema,
  ProviderProtocolProviderErrorFrameSchema,
  ProviderProtocolProviderEventFrameSchema,
  ProviderProtocolProviderTurnClosedFrameSchema,
  createProviderProtocolJsonSchema,
  decodeProviderProtocolHostFrameFromJsonLine,
  encodeProviderProtocolFrameAsJsonLine,
  streamProviderProtocolHostFramesFromJsonLines,
} from "../src/index.ts";
import {
  providerProtocolJsonSchemaArtifactUrl,
  serializeProviderProtocolJsonSchema,
} from "../scripts/writeProviderProtocolJsonSchema.ts";

const validHostStartTurnFrame = {
  protocol: PROVIDER_PROTOCOL_VERSION,
  frameKind: "host_start_turn",
  requestId: "req-start-1",
  turnId: "turn-1",
  turnRequest: {
    systemPromptText: "You are Buli.",
    conversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Read README.md",
        modelFacingPromptText: "Read README.md",
        assistantOperatingMode: "understand",
      },
    ],
    selectedModelId: "gpt-5.5",
    selectedReasoningEffort: "medium",
    promptCacheKey: "workspace-cache-key",
    availableToolNames: ["read", "glob", "grep"],
  },
} as const;

async function* streamProviderProtocolTestChunks(
  chunks: readonly (string | Uint8Array)[],
): AsyncGenerator<string | Uint8Array> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

test("ProviderProtocolFrameSchema parses golden provider protocol frames", async () => {
  const goldenFramesJson = await readFile(
    new URL("./fixtures/provider-protocol-v1-golden-frames.json", import.meta.url),
    "utf8",
  );
  const parsedFrames = ProviderProtocolFrameSchema.array().parse(JSON.parse(goldenFramesJson) as unknown);

  expect(parsedFrames.map((frame) => frame.frameKind)).toEqual([
    "host_start_turn",
    "provider_request_acknowledged",
    "provider_event",
    "host_submit_tool_result",
    "provider_event",
    "provider_turn_closed",
    "host_cancel_turn",
    "provider_error",
  ]);
});

test("ProviderProtocolHostStartTurnFrameSchema parses a provider turn request without JS runtime fields", () => {
  const parsedFrame = ProviderProtocolHostStartTurnFrameSchema.parse(validHostStartTurnFrame);

  expect(parsedFrame.frameKind).toBe("host_start_turn");
  expect(parsedFrame.turnRequest.conversationSessionEntries).toHaveLength(1);
  expect(parsedFrame.turnRequest.availableToolNames).toEqual(["read", "glob", "grep"]);
});

test("ProviderProtocolHostStartTurnFrameSchema rejects AbortSignal-shaped runtime fields", () => {
  expect(
    ProviderProtocolHostStartTurnFrameSchema.safeParse({
      ...validHostStartTurnFrame,
      turnRequest: {
        ...validHostStartTurnFrame.turnRequest,
        abortSignal: {},
      },
    }).success,
  ).toBe(false);
});

test("provider protocol JSON-line codec round trips host frames from split chunks", async () => {
  const hostStartTurnFrame = ProviderProtocolHostStartTurnFrameSchema.parse(validHostStartTurnFrame);
  const encodedFrame = encodeProviderProtocolFrameAsJsonLine(hostStartTurnFrame);

  expect(encodedFrame.endsWith("\n")).toBe(true);
  expect(decodeProviderProtocolHostFrameFromJsonLine(encodedFrame.trimEnd())).toEqual(hostStartTurnFrame);

  const decodedFrames = [];
  const textEncoder = new TextEncoder();
  for await (
    const decodedFrame of streamProviderProtocolHostFramesFromJsonLines(streamProviderProtocolTestChunks([
      encodedFrame.slice(0, 24),
      textEncoder.encode(encodedFrame.slice(24)),
    ]))
  ) {
    decodedFrames.push(decodedFrame);
  }

  expect(decodedFrames).toEqual([hostStartTurnFrame]);
});

test("provider protocol JSON-line stream drains multiple complete frames from one chunk", async () => {
  const hostStartTurnFrame = ProviderProtocolHostStartTurnFrameSchema.parse(validHostStartTurnFrame);
  const hostSubmitToolResultFrame = ProviderProtocolHostSubmitToolResultFrameSchema.parse({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "host_submit_tool_result",
    requestId: "req-tool-result-1",
    turnId: "turn-1",
    toolCallId: "call-read-1",
    toolResultText: "README contents",
  });
  const encodedFrames = `${encodeProviderProtocolFrameAsJsonLine(hostStartTurnFrame)}${encodeProviderProtocolFrameAsJsonLine(hostSubmitToolResultFrame)}`;

  const decodedFrames = [];
  for await (const decodedFrame of streamProviderProtocolHostFramesFromJsonLines(streamProviderProtocolTestChunks([encodedFrames]))) {
    decodedFrames.push(decodedFrame);
  }

  expect(decodedFrames).toEqual([hostStartTurnFrame, hostSubmitToolResultFrame]);
});

test("ProviderProtocolFrameSchema rejects unknown protocol versions and frame kinds", () => {
  expect(
    ProviderProtocolFrameSchema.safeParse({
      ...validHostStartTurnFrame,
      protocol: "buli.provider.v2",
    }).success,
  ).toBe(false);
  expect(
    ProviderProtocolFrameSchema.safeParse({
      ...validHostStartTurnFrame,
      frameKind: "host_unknown_turn",
    }).success,
  ).toBe(false);
});

test("ProviderProtocolHostSubmitToolResultFrameSchema parses tool result submissions", () => {
  expect(
    ProviderProtocolHostSubmitToolResultFrameSchema.parse({
      protocol: PROVIDER_PROTOCOL_VERSION,
      frameKind: "host_submit_tool_result",
      requestId: "req-tool-result-1",
      turnId: "turn-1",
      toolCallId: "call-read-1",
      toolResultText: "<path>README.md</path>\n1: # Buli",
    }),
  ).toEqual({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "host_submit_tool_result",
    requestId: "req-tool-result-1",
    turnId: "turn-1",
    toolCallId: "call-read-1",
    toolResultText: "<path>README.md</path>\n1: # Buli",
  });
});

test("ProviderProtocolProviderEventFrameSchema parses event frames without provider replay", () => {
  expect(
    ProviderProtocolProviderEventFrameSchema.parse({
      protocol: PROVIDER_PROTOCOL_VERSION,
      frameKind: "provider_event",
      turnId: "turn-1",
      sequenceNumber: 2,
      providerStreamEvent: {
        type: "completed",
        usage: {
          input: 10,
          output: 4,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
      },
    }),
  ).toEqual({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_event",
    turnId: "turn-1",
    sequenceNumber: 2,
    providerStreamEvent: {
      type: "completed",
      usage: {
        input: 10,
        output: 4,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    },
  });
});

test("ProviderProtocolProviderEventFrameSchema rejects provider replay on live events", () => {
  expect(
    ProviderProtocolProviderEventFrameSchema.safeParse({
      protocol: PROVIDER_PROTOCOL_VERSION,
      frameKind: "provider_event",
      turnId: "turn-1",
      sequenceNumber: 2,
      providerStreamEvent: {
        type: "completed",
        usage: {
          input: 10,
          output: 4,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
      },
      providerTurnReplay: {
        provider: "openai",
        inputItems: [],
      },
    }).success,
  ).toBe(false);
});

test("ProviderProtocolProviderTurnClosedFrameSchema owns terminal provider replay", () => {
  expect(
    ProviderProtocolProviderTurnClosedFrameSchema.parse({
      protocol: PROVIDER_PROTOCOL_VERSION,
      frameKind: "provider_turn_closed",
      turnId: "turn-1",
      closedReason: "completed",
      finalSequenceNumber: 2,
      providerTurnReplay: {
        provider: "openai",
        inputItems: [],
      },
    }),
  ).toEqual({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_turn_closed",
    turnId: "turn-1",
    closedReason: "completed",
    finalSequenceNumber: 2,
    providerTurnReplay: {
      provider: "openai",
      inputItems: [],
    },
  });
});

test("ProviderProtocolProviderErrorFrameSchema parses structured provider errors", () => {
  expect(
    ProviderProtocolProviderErrorFrameSchema.parse({
      protocol: PROVIDER_PROTOCOL_VERSION,
      frameKind: "provider_error",
      requestId: "req-start-1",
      turnId: "turn-1",
      error: {
        errorCode: "provider_transport_failed",
        errorMessage: "OpenAI stream failed",
        isRetryable: true,
        providerName: "openai",
        details: {
          status: 503,
          requestId: "req-openai-1",
          upstreamReasons: ["temporarily_unavailable", "retryable"],
        },
      },
    }),
  ).toMatchObject({
    frameKind: "provider_error",
    error: {
      errorCode: "provider_transport_failed",
      isRetryable: true,
    },
  });
});

test("createProviderProtocolJsonSchema exports a versioned provider protocol schema", () => {
  const providerProtocolJsonSchema = createProviderProtocolJsonSchema();

  expect(providerProtocolJsonSchema.$id).toBe(PROVIDER_PROTOCOL_JSON_SCHEMA_ID);
  expect(providerProtocolJsonSchema.title).toBe("Buli Provider Protocol v1");
  expect(JSON.stringify(providerProtocolJsonSchema)).toContain("host_start_turn");
  expect(JSON.stringify(providerProtocolJsonSchema)).toContain("provider_event");
});

test("committed provider protocol JSON Schema artifact matches generated schema", async () => {
  const committedProviderProtocolJsonSchemaText = await readFile(providerProtocolJsonSchemaArtifactUrl, "utf8");

  expect(committedProviderProtocolJsonSchemaText).toBe(serializeProviderProtocolJsonSchema());
});
