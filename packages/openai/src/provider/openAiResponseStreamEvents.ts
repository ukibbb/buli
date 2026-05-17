import { z } from "zod";
import { OpenAiUsageSchema } from "./usage.ts";

const ReasoningSummaryPartAddedChunkSchema = z.object({
  type: z.literal("response.reasoning_summary_part.added"),
  item_id: z.string(),
  output_index: z.number().int().nonnegative().optional(),
  summary_index: z.number().int().nonnegative(),
});

const OutputTextDeltaChunkSchema = z.object({
  type: z.literal("response.output_text.delta"),
  item_id: z.string(),
  delta: z.string(),
}).passthrough();

const ReasoningSummaryTextDeltaChunkSchema = z.object({
  type: z.literal("response.reasoning_summary_text.delta"),
  item_id: z.string(),
  delta: z.string(),
}).passthrough();

const ReasoningSummaryTextDoneChunkSchema = z.object({
  type: z.literal("response.reasoning_summary_text.done"),
  item_id: z.string(),
}).passthrough();

const FunctionCallArgumentsDeltaChunkSchema = z.object({
  type: z.literal("response.function_call_arguments.delta"),
  item_id: z.string(),
  delta: z.string(),
});

const FunctionCallArgumentsDoneChunkSchema = z.object({
  type: z.literal("response.function_call_arguments.done"),
  item_id: z.string(),
  arguments: z.string(),
});

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
  message: z.string(),
});

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

export type OpenAiReasoningSummaryPartAddedChunk = z.infer<typeof ReasoningSummaryPartAddedChunkSchema>;
export type OpenAiOutputTextDeltaChunk = z.infer<typeof OutputTextDeltaChunkSchema>;
export type OpenAiReasoningSummaryTextDeltaChunk = z.infer<typeof ReasoningSummaryTextDeltaChunkSchema>;
export type OpenAiReasoningSummaryTextDoneChunk = z.infer<typeof ReasoningSummaryTextDoneChunkSchema>;
export type OpenAiFunctionCallArgumentsDeltaChunk = z.infer<typeof FunctionCallArgumentsDeltaChunkSchema>;
export type OpenAiFunctionCallArgumentsDoneChunk = z.infer<typeof FunctionCallArgumentsDoneChunkSchema>;
export type OpenAiOutputItemAddedChunk = z.infer<typeof OutputItemAddedChunkSchema>;
export type OpenAiOutputItemDoneChunk = z.infer<typeof OutputItemDoneChunkSchema>;
export type OpenAiErrorChunk = z.infer<typeof ErrorChunkSchema>;
export type OpenAiResponseCompletedChunk = z.infer<typeof ResponseCompletedChunkSchema>;
export type OpenAiResponseIncompleteChunk = z.infer<typeof ResponseIncompleteChunkSchema>;
export type OpenAiResponseFailedChunk = z.infer<typeof ResponseFailedChunkSchema>;

export function readOpenAiReasoningSummaryPartAddedChunk(value: unknown): OpenAiReasoningSummaryPartAddedChunk | undefined {
  return readSafelyParsedOpenAiChunk(ReasoningSummaryPartAddedChunkSchema, value);
}

export function readOpenAiOutputTextDeltaChunk(value: unknown): OpenAiOutputTextDeltaChunk | undefined {
  return readSafelyParsedOpenAiChunk(OutputTextDeltaChunkSchema, value);
}

export function readOpenAiReasoningSummaryTextDeltaChunk(value: unknown): OpenAiReasoningSummaryTextDeltaChunk | undefined {
  return readSafelyParsedOpenAiChunk(ReasoningSummaryTextDeltaChunkSchema, value);
}

export function readOpenAiReasoningSummaryTextDoneChunk(value: unknown): OpenAiReasoningSummaryTextDoneChunk | undefined {
  return readSafelyParsedOpenAiChunk(ReasoningSummaryTextDoneChunkSchema, value);
}

export function readOpenAiFunctionCallArgumentsDeltaChunk(value: unknown): OpenAiFunctionCallArgumentsDeltaChunk | undefined {
  return readSafelyParsedOpenAiChunk(FunctionCallArgumentsDeltaChunkSchema, value);
}

export function readOpenAiFunctionCallArgumentsDoneChunk(value: unknown): OpenAiFunctionCallArgumentsDoneChunk | undefined {
  return readSafelyParsedOpenAiChunk(FunctionCallArgumentsDoneChunkSchema, value);
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
  return ErrorChunkSchema.parse(value);
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
