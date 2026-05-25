import { z } from "zod";
import { OpenAiUsageSchema } from "./usage.ts";

type OpenAiStreamChunkObject = {
  readonly [openAiChunkFieldName: string]: unknown;
};

type OpenAiStringDeltaChunk<EventType extends string> = OpenAiStreamChunkObject & {
  readonly type: EventType;
  readonly item_id: string;
  readonly delta: string;
};

const OutputItemAddedChunkSchema = z.object({
  type: z.literal("response.output_item.added"),
  output_index: z.number().int().nonnegative(),
  item: z.object({ type: z.string() }).passthrough(),
});

const OutputItemDoneChunkSchema = z.object({
  type: z.literal("response.output_item.done"),
  output_index: z.number().int().nonnegative().optional(),
  item: z.object({ type: z.string() }).passthrough(),
});

const ErrorChunkSchema = z.object({
  type: z.literal("error"),
}).passthrough();

const ResponseCompletedChunkSchema = z.object({
  type: z.literal("response.completed"),
  response: z.object({
    usage: OpenAiUsageSchema,
    output: z.array(z.unknown()).optional(),
  }),
});

const ResponseIncompleteChunkSchema = z.object({
  type: z.literal("response.incomplete"),
  response: z.object({
    incomplete_details: z.object({ reason: z.string() }).nullish(),
    usage: OpenAiUsageSchema,
    output: z.array(z.unknown()).optional(),
  }),
});

const ResponseFailedChunkSchema = z.object({
  type: z.literal("response.failed"),
  response: z.object({
    error: z.object({
      code: z.string().optional(),
      message: z.string().optional(),
    }).nullish(),
  }).passthrough(),
});

export type OpenAiReasoningSummaryPartAddedChunk = OpenAiStreamChunkObject & {
  readonly type: "response.reasoning_summary_part.added";
  readonly item_id: string;
  readonly output_index?: number | undefined;
  readonly summary_index: number;
};
export type OpenAiOutputTextDeltaChunk = OpenAiStringDeltaChunk<"response.output_text.delta">;
export type OpenAiReasoningSummaryTextDeltaChunk = OpenAiStringDeltaChunk<"response.reasoning_summary_text.delta">;
export type OpenAiReasoningSummaryTextDoneChunk = OpenAiStreamChunkObject & {
  readonly type: "response.reasoning_summary_text.done";
  readonly item_id: string;
};
export type OpenAiFunctionCallArgumentsDeltaChunk = OpenAiStringDeltaChunk<"response.function_call_arguments.delta">;
export type OpenAiFunctionCallArgumentsDoneChunk = OpenAiStreamChunkObject & {
  readonly type: "response.function_call_arguments.done";
  readonly item_id: string;
  readonly arguments: string;
};
export type OpenAiOutputItemAddedChunk = z.infer<typeof OutputItemAddedChunkSchema>;
export type OpenAiOutputItemDoneChunk = z.infer<typeof OutputItemDoneChunkSchema>;
export type OpenAiErrorChunk = {
  readonly type: "error";
  readonly message: string;
  readonly code?: string | undefined;
};
export type OpenAiResponseCompletedChunk = z.infer<typeof ResponseCompletedChunkSchema>;
export type OpenAiResponseIncompleteChunk = z.infer<typeof ResponseIncompleteChunkSchema>;
export type OpenAiResponseFailedChunk = z.infer<typeof ResponseFailedChunkSchema>;

export function readOpenAiReasoningSummaryPartAddedChunk(value: unknown): OpenAiReasoningSummaryPartAddedChunk | undefined {
  if (!isOpenAiChunkObject(value, "response.reasoning_summary_part.added")) {
    return undefined;
  }

  const summaryIndex = value["summary_index"];
  const outputIndex = value["output_index"];
  if (typeof value["item_id"] !== "string" || !isNonNegativeInteger(summaryIndex)) {
    return undefined;
  }
  if (outputIndex !== undefined && !isNonNegativeInteger(outputIndex)) {
    return undefined;
  }

  return value as OpenAiReasoningSummaryPartAddedChunk;
}

export function readOpenAiOutputTextDeltaChunk(value: unknown): OpenAiOutputTextDeltaChunk | undefined {
  return readOpenAiStringDeltaChunk(value, "response.output_text.delta");
}

export function readOpenAiReasoningSummaryTextDeltaChunk(value: unknown): OpenAiReasoningSummaryTextDeltaChunk | undefined {
  return readOpenAiStringDeltaChunk(value, "response.reasoning_summary_text.delta");
}

export function readOpenAiReasoningSummaryTextDoneChunk(value: unknown): OpenAiReasoningSummaryTextDoneChunk | undefined {
  if (!isOpenAiChunkObject(value, "response.reasoning_summary_text.done") || typeof value["item_id"] !== "string") {
    return undefined;
  }

  return value as OpenAiReasoningSummaryTextDoneChunk;
}

export function readOpenAiFunctionCallArgumentsDeltaChunk(value: unknown): OpenAiFunctionCallArgumentsDeltaChunk | undefined {
  return readOpenAiStringDeltaChunk(value, "response.function_call_arguments.delta");
}

export function readOpenAiFunctionCallArgumentsDoneChunk(value: unknown): OpenAiFunctionCallArgumentsDoneChunk | undefined {
  if (
    !isOpenAiChunkObject(value, "response.function_call_arguments.done") ||
    typeof value["item_id"] !== "string" ||
    typeof value["arguments"] !== "string"
  ) {
    return undefined;
  }

  return value as OpenAiFunctionCallArgumentsDoneChunk;
}

export function readOpenAiOutputItemAddedChunk(value: unknown): OpenAiOutputItemAddedChunk | undefined {
  return readSafelyParsedOpenAiChunk(OutputItemAddedChunkSchema, value);
}

export function readOpenAiOutputItemDoneChunk(value: unknown): OpenAiOutputItemDoneChunk | undefined {
  return readSafelyParsedOpenAiChunk(OutputItemDoneChunkSchema, value);
}

export function readOpenAiResponseFailedChunk(value: unknown): OpenAiResponseFailedChunk | undefined {
  return readSafelyParsedOpenAiChunk(ResponseFailedChunkSchema, value);
}

export function parseOpenAiErrorChunk(value: unknown): OpenAiErrorChunk {
  const parsedErrorChunk = ErrorChunkSchema.parse(value);
  const nestedError = readUnknownField(parsedErrorChunk, "error");
  const message = readStringField(parsedErrorChunk, "message") ?? readStringField(nestedError, "message") ??
    "OpenAI stream returned an error event without a message";
  const code = readStringField(parsedErrorChunk, "code") ?? readStringField(nestedError, "code");
  return {
    type: "error",
    message,
    ...(code !== undefined ? { code } : {}),
  };
}

function readUnknownField(value: unknown, fieldName: string): unknown {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  return (value as Record<string, unknown>)[fieldName];
}

function readStringField(value: unknown, fieldName: string): string | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const fieldValue = (value as Record<string, unknown>)[fieldName];
  return typeof fieldValue === "string" ? fieldValue : undefined;
}

export function parseOpenAiResponseCompletedChunk(value: unknown): OpenAiResponseCompletedChunk {
  return ResponseCompletedChunkSchema.parse(value);
}

export function parseOpenAiResponseIncompleteChunk(value: unknown): OpenAiResponseIncompleteChunk {
  return ResponseIncompleteChunkSchema.parse(value);
}

function readSafelyParsedOpenAiChunk<Output>(schema: z.ZodType<Output>, value: unknown): Output | undefined {
  const parsedChunk = schema.safeParse(value);
  return parsedChunk.success ? parsedChunk.data : undefined;
}

type OpenAiStringDeltaChunkEventType =
  | "response.output_text.delta"
  | "response.reasoning_summary_text.delta"
  | "response.function_call_arguments.delta";

function readOpenAiStringDeltaChunk<EventType extends OpenAiStringDeltaChunkEventType>(
  value: unknown,
  eventType: EventType,
): OpenAiStringDeltaChunk<EventType> | undefined {
  if (!isOpenAiChunkObject(value, eventType) || typeof value["item_id"] !== "string" || typeof value["delta"] !== "string") {
    return undefined;
  }

  return value as OpenAiStringDeltaChunk<EventType>;
}

function isOpenAiChunkObject(value: unknown, eventType: string): value is OpenAiStreamChunkObject {
  return typeof value === "object" && value !== null && (value as OpenAiStreamChunkObject)["type"] === eventType;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
