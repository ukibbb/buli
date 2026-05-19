import { expect, test } from "bun:test";
import { OpenAiReasoningSummaryStreamProjector } from "../src/provider/openAiReasoningSummaryStreamProjector.ts";

test("OpenAiReasoningSummaryStreamProjector can start before summary text arrives", () => {
  const reasoningSummaryStreamProjector = new OpenAiReasoningSummaryStreamProjector({
    readCurrentTimeInMilliseconds: () => 100,
  });

  expect(reasoningSummaryStreamProjector.beginReasoningSummary()).toEqual([
    { type: "reasoning_summary_started" },
  ]);
  expect(reasoningSummaryStreamProjector.beginReasoningSummary()).toEqual([]);
  expect(reasoningSummaryStreamProjector.appendReasoningSummaryTextDelta({
    itemId: "rs_1",
    summaryIndex: 0,
    deltaText: "First",
  })).toEqual([
    { type: "reasoning_summary_text_chunk", text: "First" },
  ]);
});

test("OpenAiReasoningSummaryStreamProjector starts once on the first reasoning delta", () => {
  const reasoningSummaryStreamProjector = new OpenAiReasoningSummaryStreamProjector({
    readCurrentTimeInMilliseconds: () => 100,
  });

  expect(reasoningSummaryStreamProjector.appendReasoningSummaryTextDelta({
    itemId: "rs_1",
    summaryIndex: 0,
    deltaText: "First",
  })).toEqual([
    { type: "reasoning_summary_started" },
    { type: "reasoning_summary_text_chunk", text: "First" },
  ]);
  expect(reasoningSummaryStreamProjector.appendReasoningSummaryTextDelta({
    itemId: "rs_1",
    summaryIndex: 0,
    deltaText: " part",
  })).toEqual([
    { type: "reasoning_summary_text_chunk", text: " part" },
  ]);
});

test("OpenAiReasoningSummaryStreamProjector inserts paragraph separators between parts", () => {
  const reasoningSummaryStreamProjector = new OpenAiReasoningSummaryStreamProjector({
    readCurrentTimeInMilliseconds: () => 100,
  });

  reasoningSummaryStreamProjector.appendReasoningSummaryTextDelta({
    itemId: "rs_1",
    summaryIndex: 0,
    deltaText: "First",
  });
  reasoningSummaryStreamProjector.markReasoningSummaryPartDone();

  expect(reasoningSummaryStreamProjector.appendReasoningSummaryTextDelta({
    itemId: "rs_1",
    summaryIndex: 1,
    deltaText: "Second",
  })).toEqual([
    { type: "reasoning_summary_text_chunk", text: "\n\n" },
    { type: "reasoning_summary_text_chunk", text: "Second" },
  ]);
});

test("OpenAiReasoningSummaryStreamProjector completes once before non-reasoning events", () => {
  let currentTimeInMilliseconds = 100;
  const reasoningSummaryStreamProjector = new OpenAiReasoningSummaryStreamProjector({
    readCurrentTimeInMilliseconds: () => currentTimeInMilliseconds,
  });

  reasoningSummaryStreamProjector.appendReasoningSummaryTextDelta({
    itemId: "rs_1",
    summaryIndex: 0,
    deltaText: "Thinking",
  });
  currentTimeInMilliseconds = 145;

  expect(reasoningSummaryStreamProjector.completeReasoningSummaryBeforeNonReasoningEvent()).toEqual([
    { type: "reasoning_summary_completed", reasoningDurationMs: 45 },
  ]);
  expect(reasoningSummaryStreamProjector.completeReasoningSummaryBeforeNonReasoningEvent()).toEqual([]);
});

test("OpenAiReasoningSummaryStreamProjector completes reasoning without summary text", () => {
  let currentTimeInMilliseconds = 100;
  const reasoningSummaryStreamProjector = new OpenAiReasoningSummaryStreamProjector({
    readCurrentTimeInMilliseconds: () => currentTimeInMilliseconds,
  });

  reasoningSummaryStreamProjector.beginReasoningSummary();
  currentTimeInMilliseconds = 145;

  expect(reasoningSummaryStreamProjector.completeReasoningSummaryBeforeNonReasoningEvent()).toEqual([
    { type: "reasoning_summary_completed", reasoningDurationMs: 45 },
  ]);
});

test("OpenAiReasoningSummaryStreamProjector does not complete before reasoning starts", () => {
  const reasoningSummaryStreamProjector = new OpenAiReasoningSummaryStreamProjector();

  expect(reasoningSummaryStreamProjector.completeReasoningSummaryBeforeNonReasoningEvent()).toEqual([]);
});
