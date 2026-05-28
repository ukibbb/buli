import { expect, test } from "bun:test";
import {
  HISTORICAL_TOOL_RESULT_TEXT_PER_OUTPUT_MAX_CHARACTER_COUNT,
  HISTORICAL_TOOL_TRANSCRIPT_TURN_MAX_CHARACTER_COUNT,
  projectHistoricalToolResultTextForModelContext,
  projectHistoricalToolTranscriptTextForModelContext,
} from "../src/index.ts";

test("projectHistoricalToolResultTextForModelContext keeps small historical tool results unchanged", () => {
  expect(projectHistoricalToolResultTextForModelContext({ text: "short result" })).toBe("short result");
});

test("projectHistoricalToolResultTextForModelContext truncates large historical tool results with an explicit notice", () => {
  const historicalToolResultText = `start-${"x".repeat(HISTORICAL_TOOL_RESULT_TEXT_PER_OUTPUT_MAX_CHARACTER_COUNT)}-tail`;

  const projectedToolResultText = projectHistoricalToolResultTextForModelContext({
    text: historicalToolResultText,
  });

  expect(projectedToolResultText.length).toBeLessThanOrEqual(
    HISTORICAL_TOOL_RESULT_TEXT_PER_OUTPUT_MAX_CHARACTER_COUNT,
  );
  expect(projectedToolResultText).toContain("start-");
  expect(projectedToolResultText).not.toContain("-tail");
  expect(projectedToolResultText).toContain(
    "[Historical tool result truncated for model context: omitted",
  );
});

test("projectHistoricalToolTranscriptTextForModelContext applies the transcript budget", () => {
  const historicalToolTranscriptText = `start-${"x".repeat(HISTORICAL_TOOL_TRANSCRIPT_TURN_MAX_CHARACTER_COUNT)}-tail`;

  const projectedToolTranscriptText = projectHistoricalToolTranscriptTextForModelContext({
    text: historicalToolTranscriptText,
  });

  expect(projectedToolTranscriptText.length).toBeLessThanOrEqual(
    HISTORICAL_TOOL_TRANSCRIPT_TURN_MAX_CHARACTER_COUNT,
  );
  expect(projectedToolTranscriptText).toContain("start-");
  expect(projectedToolTranscriptText).not.toContain("-tail");
  expect(projectedToolTranscriptText).toContain(
    "[Historical tool transcript truncated for model context: omitted",
  );
});
