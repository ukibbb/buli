import { expect, test } from "bun:test";
import {
  readTrailingPossibleInternalModeScopeTagFragment,
  removeInternalModeScopeTagsFromAssistantTranscriptText,
} from "../src/index.ts";

test("removeInternalModeScopeTagsFromAssistantTranscriptText removes exact internal mode wrappers", () => {
  const projectedAssistantTranscriptText = removeInternalModeScopeTagsFromAssistantTranscriptText([
    '<understand_mode speaker="assistant">',
    "Visible answer.",
    "</understand_mode>",
    "Before <plan_mode speaker=\"user\">inline context</plan_mode> after",
  ].join("\n"));

  expect(projectedAssistantTranscriptText).toBe([
    "Visible answer.",
    "Before inline context after",
  ].join("\n"));
});

test("removeInternalModeScopeTagsFromAssistantTranscriptText preserves non-generated XML-like text", () => {
  const assistantTranscriptText = [
    "Literal <understand_mode> text remains.",
    '<plan_mode speaker="critic">not an internal Buli tag</plan_mode>',
  ].join("\n");

  expect(removeInternalModeScopeTagsFromAssistantTranscriptText(assistantTranscriptText)).toBe(assistantTranscriptText);
});

test("readTrailingPossibleInternalModeScopeTagFragment detects only trailing internal tag prefixes", () => {
  expect(readTrailingPossibleInternalModeScopeTagFragment("answer <under")).toBe("<under");
  expect(readTrailingPossibleInternalModeScopeTagFragment("answer </implementation")).toBe("</implementation");
  expect(readTrailingPossibleInternalModeScopeTagFragment("answer <plan is text")).toBe("");
  expect(readTrailingPossibleInternalModeScopeTagFragment("answer\n")).toBe("");
  expect(readTrailingPossibleInternalModeScopeTagFragment('<plan_mode speaker="assistant">')).toBe("");
});
