import { describe, expect, test } from "bun:test";
import { RGBA, TextAttributes, type TextChunk } from "@opentui/core";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import {
  decorateAssistantMarkdownDiffFenceTextChunks,
  decorateAssistantMarkdownListTextChunks,
  decorateAssistantMarkdownProseTextChunks,
} from "../../../src/components/primitives/assistantMarkdownChunkDecorators.ts";
import {
  assistantMarkdownDiffAdditionForegroundColor,
  assistantMarkdownDiffMetadataForegroundColor,
  assistantMarkdownDiffRemovalForegroundColor,
} from "../../../src/components/primitives/codeRenderingTheme.ts";

function createPlainTextChunk(text: string): TextChunk {
  return {
    __isChunk: true,
    text,
    fg: RGBA.fromHex(chatScreenTheme.textPrimary),
    attributes: 0,
  };
}

function findTextChunkByExactText(textChunks: TextChunk[], text: string): TextChunk | undefined {
  return textChunks.find((textChunk) => textChunk.text === text);
}

describe("assistantMarkdownChunkDecorators", () => {
  test("highlights_file_path_references_inside_assistant_prose", () => {
    const decoratedChunks = decorateAssistantMarkdownProseTextChunks([
      createPlainTextChunk("Open packages/tui/src/index.ts:42, not https://example.com/file.ts."),
    ]);
    const filePathChunk = findTextChunkByExactText(decoratedChunks, "packages/tui/src/index.ts:42");

    expect(filePathChunk).toBeDefined();
    expect(filePathChunk?.fg?.toString()).toBe(RGBA.fromHex(chatScreenTheme.accentCyan).toString());
    expect((filePathChunk?.attributes ?? 0) & TextAttributes.UNDERLINE).toBe(TextAttributes.UNDERLINE);
    expect(decoratedChunks.some((textChunk) => textChunk.text === "example.com/file.ts")).toBe(false);
  });

  test("highlights_common_shell_commands_inside_assistant_prose", () => {
    const decoratedChunks = decorateAssistantMarkdownProseTextChunks([
      createPlainTextChunk("Run bun test and git status --short before committing."),
    ]);
    const bunTestChunk = findTextChunkByExactText(decoratedChunks, "bun test");
    const gitStatusChunk = findTextChunkByExactText(decoratedChunks, "git status --short");

    expect(bunTestChunk?.fg?.toString()).toBe(RGBA.fromHex(chatScreenTheme.accentGreen).toString());
    expect((bunTestChunk?.attributes ?? 0) & TextAttributes.BOLD).toBe(TextAttributes.BOLD);
    expect(gitStatusChunk?.fg?.toString()).toBe(RGBA.fromHex(chatScreenTheme.accentGreen).toString());
    expect((gitStatusChunk?.attributes ?? 0) & TextAttributes.BOLD).toBe(TextAttributes.BOLD);
  });

  test("highlights_diagnostic_path_severity_and_code", () => {
    const decoratedChunks = decorateAssistantMarkdownProseTextChunks([
      createPlainTextChunk("packages/tui/src/index.ts:12:34 error TS2322 needs a fix."),
    ]);
    const diagnosticPathChunk = findTextChunkByExactText(decoratedChunks, "packages/tui/src/index.ts:12:34");
    const diagnosticSeverityChunk = findTextChunkByExactText(decoratedChunks, "error");
    const diagnosticCodeChunk = findTextChunkByExactText(decoratedChunks, "TS2322");

    expect(diagnosticPathChunk?.fg?.toString()).toBe(RGBA.fromHex(chatScreenTheme.accentCyan).toString());
    expect((diagnosticPathChunk?.attributes ?? 0) & TextAttributes.UNDERLINE).toBe(TextAttributes.UNDERLINE);
    expect(diagnosticSeverityChunk?.fg?.toString()).toBe(RGBA.fromHex(chatScreenTheme.accentRed).toString());
    expect((diagnosticSeverityChunk?.attributes ?? 0) & TextAttributes.BOLD).toBe(TextAttributes.BOLD);
    expect(diagnosticCodeChunk?.fg?.toString()).toBe(RGBA.fromHex(chatScreenTheme.accentPurple).toString());
    expect((diagnosticCodeChunk?.attributes ?? 0) & TextAttributes.BOLD).toBe(TextAttributes.BOLD);
  });

  test("decorates_list_markers_before_prose_highlights", () => {
    const decoratedChunks = decorateAssistantMarkdownListTextChunks([
      createPlainTextChunk("• Run bun test\n  ◦ Open packages/tui/src/index.ts"),
    ]);

    expect(findTextChunkByExactText(decoratedChunks, "•")?.fg?.toString()).toBe(
      RGBA.fromHex(chatScreenTheme.accentPrimaryMuted).toString(),
    );
    expect(findTextChunkByExactText(decoratedChunks, "bun test")?.fg?.toString()).toBe(
      RGBA.fromHex(chatScreenTheme.accentGreen).toString(),
    );
    expect(findTextChunkByExactText(decoratedChunks, "packages/tui/src/index.ts")?.fg?.toString()).toBe(
      RGBA.fromHex(chatScreenTheme.accentCyan).toString(),
    );
  });

  test("decorates_diff_fence_lines_before_prose_highlights", () => {
    const decoratedChunks = decorateAssistantMarkdownDiffFenceTextChunks([
      createPlainTextChunk("│ @@ -1 +1 @@\n│ -old\n│ +new"),
    ]);

    expect(findTextChunkByExactText(decoratedChunks, "│ @@ -1 +1 @@")?.fg?.toString()).toBe(
      assistantMarkdownDiffMetadataForegroundColor.toString(),
    );
    expect(findTextChunkByExactText(decoratedChunks, "│ -old")?.fg?.toString()).toBe(
      assistantMarkdownDiffRemovalForegroundColor.toString(),
    );
    expect(findTextChunkByExactText(decoratedChunks, "│ +new")?.fg?.toString()).toBe(
      assistantMarkdownDiffAdditionForegroundColor.toString(),
    );
  });
});
