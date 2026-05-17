import { expect, test } from "bun:test";
import {
  parseOpenAiResponseCompletedChunk,
  readOpenAiFunctionCallArgumentsDeltaChunk,
  readOpenAiOutputTextDeltaChunk,
  readOpenAiOutputItemAddedChunk,
  readOpenAiReasoningSummaryTextDeltaChunk,
  readOpenAiReasoningSummaryTextDoneChunk,
  readOpenAiResponseFailedChunk,
} from "../src/provider/openAiResponseStreamEvents.ts";

test("readOpenAiOutputItemAddedChunk returns parsed added chunks", () => {
  expect(readOpenAiOutputItemAddedChunk({
    type: "response.output_item.added",
    output_index: 1,
    item: { type: "message", id: "msg_1" },
  })).toEqual({
    type: "response.output_item.added",
    output_index: 1,
    item: { type: "message", id: "msg_1" },
  });
});

test("readOpenAiOutputItemAddedChunk rejects malformed added chunks without throwing", () => {
  expect(readOpenAiOutputItemAddedChunk({
    type: "response.output_item.added",
    output_index: -1,
    item: { type: "message" },
  })).toBeUndefined();
});

test("readOpenAiOutputTextDeltaChunk parses text deltas without rejecting optional provider fields", () => {
  expect(readOpenAiOutputTextDeltaChunk({
    type: "response.output_text.delta",
    item_id: "msg_1",
    delta: "Hello",
    output_index: "provider-bug",
  })).toMatchObject({
    type: "response.output_text.delta",
    item_id: "msg_1",
    delta: "Hello",
    output_index: "provider-bug",
  });
});

test("readOpenAiReasoningSummaryTextDeltaChunk parses reasoning deltas", () => {
  expect(readOpenAiReasoningSummaryTextDeltaChunk({
    type: "response.reasoning_summary_text.delta",
    item_id: "rs_1",
    summary_index: 0,
    delta: "Thinking",
  })).toMatchObject({
    type: "response.reasoning_summary_text.delta",
    item_id: "rs_1",
    summary_index: 0,
    delta: "Thinking",
  });
});

test("readOpenAiReasoningSummaryTextDoneChunk parses reasoning done events", () => {
  expect(readOpenAiReasoningSummaryTextDoneChunk({
    type: "response.reasoning_summary_text.done",
    item_id: "rs_1",
    summary_index: 0,
  })).toMatchObject({
    type: "response.reasoning_summary_text.done",
    item_id: "rs_1",
    summary_index: 0,
  });
});

test("readOpenAiFunctionCallArgumentsDeltaChunk parses function-call argument deltas", () => {
  expect(readOpenAiFunctionCallArgumentsDeltaChunk({
    type: "response.function_call_arguments.delta",
    item_id: "fc_1",
    delta: "{\"command\":",
  })).toEqual({
    type: "response.function_call_arguments.delta",
    item_id: "fc_1",
    delta: "{\"command\":",
  });
});

test("parseOpenAiResponseCompletedChunk throws for malformed terminal chunks", () => {
  expect(() =>
    parseOpenAiResponseCompletedChunk({
      type: "response.completed",
      response: {},
    })
  ).toThrow();
});

test("readOpenAiResponseFailedChunk parses failed chunks safely", () => {
  expect(readOpenAiResponseFailedChunk({
    type: "response.failed",
    response: { error: { code: "server_error", message: "failed" } },
  })).toEqual({
    type: "response.failed",
    response: { error: { code: "server_error", message: "failed" } },
  });
});
