import { expect, test } from "bun:test";
import {
  isOpenAiOutputTextContentPart,
  isOpenAiResponseObject,
  listOpenAiOutputTextContentParts,
  listOpenAiReasoningSummaryTextParts,
  readOpenAiFunctionCallOutputItem,
} from "../src/provider/openAiResponseObjects.ts";

test("isOpenAiResponseObject accepts only non-array objects with a string type", () => {
  expect(isOpenAiResponseObject({ type: "message", id: "msg_1" })).toBe(true);
  expect(isOpenAiResponseObject({ type: 42 })).toBe(false);
  expect(isOpenAiResponseObject({ id: "msg_1" })).toBe(false);
  expect(isOpenAiResponseObject(null)).toBe(false);
  expect(isOpenAiResponseObject([{ type: "message" }])).toBe(false);
});

test("listOpenAiReasoningSummaryTextParts keeps only valid summary text parts", () => {
  expect(
    listOpenAiReasoningSummaryTextParts([
      { type: "summary_text", text: "I should inspect first." },
      { type: "summary_text", text: 42 },
      { type: "other", text: "ignored" },
      null,
    ]),
  ).toEqual([{ type: "summary_text", text: "I should inspect first." }]);
});

test("isOpenAiOutputTextContentPart accepts only output_text parts with string text", () => {
  expect(isOpenAiOutputTextContentPart({ type: "output_text", text: "Hello" })).toBe(true);
  expect(isOpenAiOutputTextContentPart({ type: "annotation", text: "ignored" })).toBe(false);
  expect(isOpenAiOutputTextContentPart({ type: "output_text", text: 42 })).toBe(false);
});

test("listOpenAiOutputTextContentParts keeps only valid output text parts", () => {
  expect(
    listOpenAiOutputTextContentParts([
      { type: "output_text", text: "Hello" },
      { type: "annotation", text: "ignored" },
      { type: "output_text", text: 42 },
      { type: "output_text", text: " world" },
    ]),
  ).toEqual([
    { type: "output_text", text: "Hello" },
    { type: "output_text", text: " world" },
  ]);
});

test("readOpenAiFunctionCallOutputItem reads valid function calls and rejects malformed calls", () => {
  expect(
    readOpenAiFunctionCallOutputItem({
      type: "function_call",
      id: "fc_1",
      call_id: "call_1",
      name: "bash",
      arguments: "{\"command\":\"pwd\"}",
    }),
  ).toEqual({
    itemId: "fc_1",
    functionCallId: "call_1",
    functionName: "bash",
    argumentsText: "{\"command\":\"pwd\"}",
  });
  expect(readOpenAiFunctionCallOutputItem({ type: "function_call", id: "", call_id: "call_1", name: "bash", arguments: "{}" })).toBeUndefined();
  expect(readOpenAiFunctionCallOutputItem({ type: "function_call", id: "fc_1", call_id: "call_1", name: "bash", arguments: 42 })).toBeUndefined();
  expect(readOpenAiFunctionCallOutputItem({ type: "message", id: "msg_1" })).toBeUndefined();
});
