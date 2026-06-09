import { describe, expect, test } from "bun:test";
import { RGBA, TextAttributes, type TextChunk } from "@opentui/core";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { githubLikeTerminalCodeColors } from "../../../src/components/primitives/codeRenderingTheme.ts";
import { decorateTeachingCommentCodeChunks } from "../../../src/components/primitives/teachingCommentCodeChunks.ts";

const defaultCodeForegroundColor = RGBA.fromHex(githubLikeTerminalCodeColors.foreground);

function createCodeTextChunk(text: string): TextChunk {
  return {
    __isChunk: true,
    text,
    fg: defaultCodeForegroundColor,
    attributes: 0,
  };
}

function joinTextChunks(textChunks: readonly TextChunk[]): string {
  return textChunks.map((textChunk) => textChunk.text).join("");
}

function findTextChunkByExactText(textChunks: readonly TextChunk[], text: string): TextChunk | undefined {
  return textChunks.find((textChunk) => textChunk.text === text);
}

function findTextChunkContainingText(textChunks: readonly TextChunk[], text: string): TextChunk | undefined {
  return textChunks.find((textChunk) => textChunk.text.includes(text));
}

describe("teachingCommentCodeChunks", () => {
  test("styles_teaching_comment_labels_without_changing_code_text", () => {
    const sourceText = [
      "  // explain: The guard decides whether this branch should run.",
      "if (isReady) {",
      "  startRuntime();",
      "}",
      "// regular comment",
    ].join("\n");
    const decoratedChunks = decorateTeachingCommentCodeChunks([createCodeTextChunk(sourceText)]);

    const commentMarkerChunk = findTextChunkByExactText(decoratedChunks, "// ");
    const labelChunk = findTextChunkByExactText(decoratedChunks, "explain");
    const separatorChunk = findTextChunkByExactText(decoratedChunks, ": ");
    const bodyChunk = findTextChunkByExactText(decoratedChunks, "The guard decides whether this branch should run.");

    expect(joinTextChunks(decoratedChunks)).toBe(sourceText);
    expect(commentMarkerChunk?.fg?.toString()).toBe(RGBA.fromHex(githubLikeTerminalCodeColors.subtle).toString());
    expect((commentMarkerChunk?.attributes ?? 0) & TextAttributes.ITALIC).toBe(TextAttributes.ITALIC);
    expect(labelChunk?.fg?.toString()).toBe(RGBA.fromHex(chatScreenTheme.accentCyan).toString());
    expect((labelChunk?.attributes ?? 0) & TextAttributes.BOLD).toBe(TextAttributes.BOLD);
    expect(separatorChunk?.fg?.toString()).toBe(RGBA.fromHex(githubLikeTerminalCodeColors.subtle).toString());
    expect(bodyChunk?.fg?.toString()).toBe(RGBA.fromHex(githubLikeTerminalCodeColors.comment).toString());
    expect((bodyChunk?.attributes ?? 0) & TextAttributes.ITALIC).toBe(TextAttributes.ITALIC);
    expect(findTextChunkContainingText(decoratedChunks, "// regular comment")?.fg?.toString()).toBe(
      defaultCodeForegroundColor.toString(),
    );
  });

  test("recognizes_multi_word_teaching_comment_labels", () => {
    const sourceText = "// plain pseudocode: If the runtime is ready, start it.";
    const decoratedChunks = decorateTeachingCommentCodeChunks([createCodeTextChunk(sourceText)]);

    const labelChunk = findTextChunkByExactText(decoratedChunks, "plain pseudocode");

    expect(joinTextChunks(decoratedChunks)).toBe(sourceText);
    expect(labelChunk?.fg?.toString()).toBe(RGBA.fromHex(chatScreenTheme.accentCyan).toString());
    expect((labelChunk?.attributes ?? 0) & TextAttributes.BOLD).toBe(TextAttributes.BOLD);
  });

  test("recognizes_example_values_teaching_comment_label", () => {
    const sourceText = "// example values: if forecast_hours = 30, forecast_days becomes 3.";
    const decoratedChunks = decorateTeachingCommentCodeChunks([createCodeTextChunk(sourceText)]);

    const labelChunk = findTextChunkByExactText(decoratedChunks, "example values");

    expect(joinTextChunks(decoratedChunks)).toBe(sourceText);
    expect(labelChunk?.fg?.toString()).toBe(RGBA.fromHex(chatScreenTheme.accentCyan).toString());
    expect((labelChunk?.attributes ?? 0) & TextAttributes.BOLD).toBe(TextAttributes.BOLD);
  });

  test("styles_hash_teaching_comment_markers_without_changing_code_text", () => {
    const sourceText = [
      "# example values: if forecast_hours = 30, forecast_days becomes 3.",
      "# regular comment",
    ].join("\n");
    const decoratedChunks = decorateTeachingCommentCodeChunks([createCodeTextChunk(sourceText)]);

    const commentMarkerChunk = findTextChunkByExactText(decoratedChunks, "# ");
    const labelChunk = findTextChunkByExactText(decoratedChunks, "example values");

    expect(joinTextChunks(decoratedChunks)).toBe(sourceText);
    expect(commentMarkerChunk?.fg?.toString()).toBe(RGBA.fromHex(githubLikeTerminalCodeColors.subtle).toString());
    expect((commentMarkerChunk?.attributes ?? 0) & TextAttributes.ITALIC).toBe(TextAttributes.ITALIC);
    expect(labelChunk?.fg?.toString()).toBe(RGBA.fromHex(chatScreenTheme.accentCyan).toString());
    expect((labelChunk?.attributes ?? 0) & TextAttributes.BOLD).toBe(TextAttributes.BOLD);
    expect(findTextChunkContainingText(decoratedChunks, "# regular comment")?.fg?.toString()).toBe(
      defaultCodeForegroundColor.toString(),
    );
  });
});
