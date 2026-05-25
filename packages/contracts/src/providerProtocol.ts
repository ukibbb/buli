import { z } from "zod";
import { ASSISTANT_TOOL_REQUEST_NAMES } from "./toolCatalog.ts";
import { ConversationSessionEntrySchema } from "./conversationSessionEntry.ts";
import { AvailableAssistantModelSchema, ProviderStreamEventSchema, ReasoningEffortSchema } from "./provider.ts";
import { ProviderTurnReplaySchema } from "./providerTurnReplay.ts";

export const PROVIDER_PROTOCOL_VERSION = "buli.provider.v1";
export const PROVIDER_PROTOCOL_JSON_SCHEMA_ID = "https://buli.dev/schemas/provider-protocol/v1.json";
export const PROVIDER_PROTOCOL_JSON_LINE_MAX_CHARACTER_COUNT = 1_048_576;

const ProviderProtocolBaseFields = {
  protocol: z.literal(PROVIDER_PROTOCOL_VERSION),
} as const;

export const ProviderProtocolRequestIdSchema = z.string().min(1);
export const ProviderProtocolTurnIdSchema = z.string().min(1);
export const ProviderProtocolSequenceNumberSchema = z.number().int().positive();
export const ProviderProtocolCancellationReasonSchema = z.enum([
  "user_interrupted",
  "host_shutdown",
  "timeout",
  "superseded",
  "unknown",
]);
export const ProviderProtocolClosedReasonSchema = z.enum([
  "completed",
  "incomplete",
  "failed",
  "cancelled",
]);
export const ProviderProtocolAcknowledgedFrameKindSchema = z.enum([
  "host_list_models",
  "host_start_turn",
  "host_submit_tool_result",
  "host_cancel_turn",
]);
export const ProviderProtocolErrorDetailPrimitiveSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
export const ProviderProtocolErrorDetailValueSchema = z.union([
  ProviderProtocolErrorDetailPrimitiveSchema,
  z.array(ProviderProtocolErrorDetailPrimitiveSchema),
]);
export const ProviderProtocolErrorSchema = z.strictObject({
  errorCode: z.string().min(1),
  errorMessage: z.string().min(1),
  isRetryable: z.boolean().optional(),
  providerName: z.string().min(1).optional(),
  details: z.record(z.string().min(1), ProviderProtocolErrorDetailValueSchema).optional(),
});

export const ProviderProtocolTurnRequestSchema = z.strictObject({
  systemPromptText: z.string(),
  conversationSessionEntries: z.array(ConversationSessionEntrySchema),
  selectedModelId: z.string().min(1),
  selectedReasoningEffort: ReasoningEffortSchema.optional(),
  promptCacheKey: z.string().min(1).optional(),
  availableToolNames: z.array(z.enum(ASSISTANT_TOOL_REQUEST_NAMES)).optional(),
});

export const ProviderProtocolHostListModelsFrameSchema = z.strictObject({
  ...ProviderProtocolBaseFields,
  frameKind: z.literal("host_list_models"),
  requestId: ProviderProtocolRequestIdSchema,
});

export const ProviderProtocolHostStartTurnFrameSchema = z.strictObject({
  ...ProviderProtocolBaseFields,
  frameKind: z.literal("host_start_turn"),
  requestId: ProviderProtocolRequestIdSchema,
  turnId: ProviderProtocolTurnIdSchema,
  turnRequest: ProviderProtocolTurnRequestSchema,
});

export const ProviderProtocolHostSubmitToolResultFrameSchema = z.strictObject({
  ...ProviderProtocolBaseFields,
  frameKind: z.literal("host_submit_tool_result"),
  requestId: ProviderProtocolRequestIdSchema,
  turnId: ProviderProtocolTurnIdSchema,
  toolCallId: z.string().min(1),
  toolResultText: z.string(),
});

export const ProviderProtocolHostCancelTurnFrameSchema = z.strictObject({
  ...ProviderProtocolBaseFields,
  frameKind: z.literal("host_cancel_turn"),
  requestId: ProviderProtocolRequestIdSchema,
  turnId: ProviderProtocolTurnIdSchema,
  cancellationReason: ProviderProtocolCancellationReasonSchema,
});

export const ProviderProtocolProviderRequestAcknowledgedFrameSchema = z.strictObject({
  ...ProviderProtocolBaseFields,
  frameKind: z.literal("provider_request_acknowledged"),
  requestId: ProviderProtocolRequestIdSchema,
  turnId: ProviderProtocolTurnIdSchema.optional(),
  acknowledgedFrameKind: ProviderProtocolAcknowledgedFrameKindSchema,
});

export const ProviderProtocolProviderEventFrameSchema = z.strictObject({
  ...ProviderProtocolBaseFields,
  frameKind: z.literal("provider_event"),
  turnId: ProviderProtocolTurnIdSchema,
  sequenceNumber: ProviderProtocolSequenceNumberSchema,
  providerStreamEvent: ProviderStreamEventSchema,
});

export const ProviderProtocolProviderAvailableModelsFrameSchema = z.strictObject({
  ...ProviderProtocolBaseFields,
  frameKind: z.literal("provider_available_models"),
  requestId: ProviderProtocolRequestIdSchema,
  availableModels: z.array(AvailableAssistantModelSchema),
});

export const ProviderProtocolProviderErrorFrameSchema = z.strictObject({
  ...ProviderProtocolBaseFields,
  frameKind: z.literal("provider_error"),
  requestId: ProviderProtocolRequestIdSchema.optional(),
  turnId: ProviderProtocolTurnIdSchema.optional(),
  error: ProviderProtocolErrorSchema,
});

export const ProviderProtocolProviderTurnClosedFrameSchema = z.strictObject({
  ...ProviderProtocolBaseFields,
  frameKind: z.literal("provider_turn_closed"),
  turnId: ProviderProtocolTurnIdSchema,
  closedReason: ProviderProtocolClosedReasonSchema,
  finalSequenceNumber: ProviderProtocolSequenceNumberSchema.optional(),
  providerTurnReplay: ProviderTurnReplaySchema.optional(),
});

export const ProviderProtocolHostFrameSchema = z.discriminatedUnion("frameKind", [
  ProviderProtocolHostListModelsFrameSchema,
  ProviderProtocolHostStartTurnFrameSchema,
  ProviderProtocolHostSubmitToolResultFrameSchema,
  ProviderProtocolHostCancelTurnFrameSchema,
]);

export const ProviderProtocolProviderFrameSchema = z.discriminatedUnion("frameKind", [
  ProviderProtocolProviderRequestAcknowledgedFrameSchema,
  ProviderProtocolProviderAvailableModelsFrameSchema,
  ProviderProtocolProviderEventFrameSchema,
  ProviderProtocolProviderErrorFrameSchema,
  ProviderProtocolProviderTurnClosedFrameSchema,
]);

export const ProviderProtocolFrameSchema = z.discriminatedUnion("frameKind", [
  ProviderProtocolHostListModelsFrameSchema,
  ProviderProtocolHostStartTurnFrameSchema,
  ProviderProtocolHostSubmitToolResultFrameSchema,
  ProviderProtocolHostCancelTurnFrameSchema,
  ProviderProtocolProviderRequestAcknowledgedFrameSchema,
  ProviderProtocolProviderAvailableModelsFrameSchema,
  ProviderProtocolProviderEventFrameSchema,
  ProviderProtocolProviderErrorFrameSchema,
  ProviderProtocolProviderTurnClosedFrameSchema,
]);

export type ProviderProtocolRequestId = z.infer<typeof ProviderProtocolRequestIdSchema>;
export type ProviderProtocolTurnId = z.infer<typeof ProviderProtocolTurnIdSchema>;
export type ProviderProtocolSequenceNumber = z.infer<typeof ProviderProtocolSequenceNumberSchema>;
export type ProviderProtocolCancellationReason = z.infer<typeof ProviderProtocolCancellationReasonSchema>;
export type ProviderProtocolClosedReason = z.infer<typeof ProviderProtocolClosedReasonSchema>;
export type ProviderProtocolAcknowledgedFrameKind = z.infer<typeof ProviderProtocolAcknowledgedFrameKindSchema>;
export type ProviderProtocolErrorDetailPrimitive = z.infer<typeof ProviderProtocolErrorDetailPrimitiveSchema>;
export type ProviderProtocolErrorDetailValue = z.infer<typeof ProviderProtocolErrorDetailValueSchema>;
export type ProviderProtocolError = z.infer<typeof ProviderProtocolErrorSchema>;
export type ProviderProtocolTurnRequest = z.infer<typeof ProviderProtocolTurnRequestSchema>;
export type ProviderProtocolHostListModelsFrame = z.infer<typeof ProviderProtocolHostListModelsFrameSchema>;
export type ProviderProtocolHostStartTurnFrame = z.infer<typeof ProviderProtocolHostStartTurnFrameSchema>;
export type ProviderProtocolHostSubmitToolResultFrame = z.infer<typeof ProviderProtocolHostSubmitToolResultFrameSchema>;
export type ProviderProtocolHostCancelTurnFrame = z.infer<typeof ProviderProtocolHostCancelTurnFrameSchema>;
export type ProviderProtocolProviderRequestAcknowledgedFrame = z.infer<
  typeof ProviderProtocolProviderRequestAcknowledgedFrameSchema
>;
export type ProviderProtocolProviderAvailableModelsFrame = z.infer<typeof ProviderProtocolProviderAvailableModelsFrameSchema>;
export type ProviderProtocolProviderEventFrame = z.infer<typeof ProviderProtocolProviderEventFrameSchema>;
export type ProviderProtocolProviderErrorFrame = z.infer<typeof ProviderProtocolProviderErrorFrameSchema>;
export type ProviderProtocolProviderTurnClosedFrame = z.infer<typeof ProviderProtocolProviderTurnClosedFrameSchema>;
export type ProviderProtocolHostFrame = z.infer<typeof ProviderProtocolHostFrameSchema>;
export type ProviderProtocolProviderFrame = z.infer<typeof ProviderProtocolProviderFrameSchema>;
export type ProviderProtocolFrame = z.infer<typeof ProviderProtocolFrameSchema>;
export type ProviderProtocolJsonLineChunk = string | Uint8Array;

export type ProviderProtocolJsonSchema = Readonly<Record<string, unknown> & {
  $id: typeof PROVIDER_PROTOCOL_JSON_SCHEMA_ID;
  title: string;
  description: string;
}>;

export function createProviderProtocolJsonSchema(): ProviderProtocolJsonSchema {
  const jsonSchema = z.toJSONSchema(ProviderProtocolFrameSchema, {
    target: "draft-2020-12",
    reused: "ref",
  }) as Record<string, unknown>;

  return {
    ...jsonSchema,
    $id: PROVIDER_PROTOCOL_JSON_SCHEMA_ID,
    title: "Buli Provider Protocol v1",
    description: "Versioned newline-delimited JSON frame contract for Buli provider IPC.",
  } satisfies ProviderProtocolJsonSchema;
}

export function encodeProviderProtocolFrameAsJsonLine(frame: ProviderProtocolFrame): string {
  return `${JSON.stringify(ProviderProtocolFrameSchema.parse(frame))}\n`;
}

export function decodeProviderProtocolFrameFromJsonLine(jsonLine: string): ProviderProtocolFrame {
  return ProviderProtocolFrameSchema.parse(parseProviderProtocolJsonLine(jsonLine));
}

export function decodeProviderProtocolHostFrameFromJsonLine(jsonLine: string): ProviderProtocolHostFrame {
  return ProviderProtocolHostFrameSchema.parse(parseProviderProtocolJsonLine(jsonLine));
}

export function decodeProviderProtocolProviderFrameFromJsonLine(jsonLine: string): ProviderProtocolProviderFrame {
  return ProviderProtocolProviderFrameSchema.parse(parseProviderProtocolJsonLine(jsonLine));
}

export async function* streamProviderProtocolFramesFromJsonLines(
  chunks: AsyncIterable<ProviderProtocolJsonLineChunk>,
): AsyncGenerator<ProviderProtocolFrame> {
  yield* streamDecodedProviderProtocolFramesFromJsonLines(chunks, decodeProviderProtocolFrameFromJsonLine);
}

export async function* streamProviderProtocolHostFramesFromJsonLines(
  chunks: AsyncIterable<ProviderProtocolJsonLineChunk>,
): AsyncGenerator<ProviderProtocolHostFrame> {
  yield* streamDecodedProviderProtocolFramesFromJsonLines(chunks, decodeProviderProtocolHostFrameFromJsonLine);
}

export async function* streamProviderProtocolProviderFramesFromJsonLines(
  chunks: AsyncIterable<ProviderProtocolJsonLineChunk>,
): AsyncGenerator<ProviderProtocolProviderFrame> {
  yield* streamDecodedProviderProtocolFramesFromJsonLines(chunks, decodeProviderProtocolProviderFrameFromJsonLine);
}

async function* streamDecodedProviderProtocolFramesFromJsonLines<ProviderProtocolJsonLineFrame>(
  chunks: AsyncIterable<ProviderProtocolJsonLineChunk>,
  decodeFrame: (jsonLine: string) => ProviderProtocolJsonLineFrame,
): AsyncGenerator<ProviderProtocolJsonLineFrame> {
  const textDecoder = new TextDecoder();
  let bufferedText = "";

  for await (const chunk of chunks) {
    bufferedText += typeof chunk === "string" ? chunk : textDecoder.decode(chunk, { stream: true });
    yield* drainCompleteProviderProtocolJsonLines({
      bufferedText,
      decodeFrame,
      updateBufferedText: (remainingBufferedText) => {
        bufferedText = remainingBufferedText;
      },
    });
    assertProviderProtocolJsonLineWithinLimit(bufferedText);
  }

  bufferedText += textDecoder.decode();
  const trailingJsonLine = normalizeProviderProtocolJsonLine(bufferedText);
  if (trailingJsonLine.length === 0) {
    return;
  }

  assertProviderProtocolJsonLineWithinLimit(trailingJsonLine);
  yield decodeFrame(trailingJsonLine);
}

function* drainCompleteProviderProtocolJsonLines<ProviderProtocolJsonLineFrame>(input: {
  bufferedText: string;
  decodeFrame: (jsonLine: string) => ProviderProtocolJsonLineFrame;
  updateBufferedText: (remainingBufferedText: string) => void;
}): Generator<ProviderProtocolJsonLineFrame> {
  let jsonLineStartIndex = 0;
  let newlineIndex = input.bufferedText.indexOf("\n", jsonLineStartIndex);

  while (newlineIndex >= 0) {
    const jsonLine = normalizeProviderProtocolJsonLine(input.bufferedText.slice(jsonLineStartIndex, newlineIndex));
    assertProviderProtocolJsonLineWithinLimit(jsonLine);
    if (jsonLine.length === 0) {
      throw new Error("Provider protocol JSON line cannot be empty.");
    }

    yield input.decodeFrame(jsonLine);
    jsonLineStartIndex = newlineIndex + 1;
    newlineIndex = input.bufferedText.indexOf("\n", jsonLineStartIndex);
  }

  input.updateBufferedText(jsonLineStartIndex === 0 ? input.bufferedText : input.bufferedText.slice(jsonLineStartIndex));
}

function parseProviderProtocolJsonLine(jsonLine: string): unknown {
  const normalizedJsonLine = normalizeProviderProtocolJsonLine(jsonLine);
  assertProviderProtocolJsonLineWithinLimit(normalizedJsonLine);
  if (normalizedJsonLine.length === 0) {
    throw new Error("Provider protocol JSON line cannot be empty.");
  }

  return JSON.parse(normalizedJsonLine) as unknown;
}

function normalizeProviderProtocolJsonLine(jsonLine: string): string {
  return jsonLine.endsWith("\r") ? jsonLine.slice(0, -1) : jsonLine;
}

function assertProviderProtocolJsonLineWithinLimit(jsonLine: string): void {
  if (jsonLine.length <= PROVIDER_PROTOCOL_JSON_LINE_MAX_CHARACTER_COUNT) {
    return;
  }

  throw new Error(
    `Provider protocol JSON line exceeded ${PROVIDER_PROTOCOL_JSON_LINE_MAX_CHARACTER_COUNT} characters (${jsonLine.length} characters).`,
  );
}
