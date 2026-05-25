import { describe, expect, test } from "bun:test";
import {
  buildStableAssistantMarkdownRenderSections,
  TypeScriptAssistantMarkdownRenderSectionBuilder,
} from "../../../src/components/primitives/assistantMarkdownRenderSections.ts";

describe("assistantMarkdownRenderSections", () => {
  test("reuses_completed_custom_render_sections_when_streaming_tail_changes", () => {
    const firstMarkdownSections = buildStableAssistantMarkdownRenderSections({
      markdownText: ["```ts title=src/stable.ts", "const stable = true;", "```"].join("\n"),
      isStreaming: true,
      previousCache: undefined,
    });
    const firstCodeFenceSection = firstMarkdownSections.renderSections.find(
      (renderSection) => renderSection.sectionKind === "codeFence",
    );

    const secondMarkdownSections = buildStableAssistantMarkdownRenderSections({
      markdownText: [
        "```ts title=src/stable.ts",
        "const stable = true;",
        "```",
        "",
        "Streaming tail is still changing",
      ].join("\n"),
      isStreaming: true,
      previousCache: firstMarkdownSections.nextCache,
    });
    const secondCodeFenceSection = secondMarkdownSections.renderSections.find(
      (renderSection) => renderSection.sectionKind === "codeFence",
    );

    expect(firstCodeFenceSection?.sectionKind).toBe("codeFence");
    expect(secondCodeFenceSection).toBe(firstCodeFenceSection);
  });

  test("TypeScriptAssistantMarkdownRenderSectionBuilder matches the default builder", () => {
    const input = {
      markdownText: ["# Heading", "", "```diff", "+added", "```"].join("\n"),
      isStreaming: false,
      previousCache: undefined,
    };

    expect(new TypeScriptAssistantMarkdownRenderSectionBuilder().buildStableAssistantMarkdownRenderSections(input)).toEqual(
      buildStableAssistantMarkdownRenderSections(input),
    );
  });

  test("parses_source_line_ranges_from_code_fence_paths", () => {
    const markdownSections = buildStableAssistantMarkdownRenderSections({
      markdownText: ["```ts path=src/runtime.ts:10-12", "startRuntime();", "```"].join("\n"),
      isStreaming: false,
      previousCache: undefined,
    });
    const codeFenceSection = markdownSections.renderSections.find(
      (renderSection) => renderSection.sectionKind === "codeFence",
    );

    expect(codeFenceSection).toMatchObject({
      sectionKind: "codeFence",
      codeFenceInfo: {
        codeLanguageLabel: "ts",
        codeFenceDisplayLabel: "src/runtime.ts:10-12",
        codeFenceFilePath: "src/runtime.ts",
        sourceLineRange: {
          sourceStartLineNumber: 10,
          sourceEndLineNumber: 12,
        },
      },
    });
  });

  test("drops_incomplete_streaming_tilde_fence_start", () => {
    const markdownSections = buildStableAssistantMarkdownRenderSections({
      markdownText: ["Ready", "", "~~~ts"].join("\n"),
      isStreaming: true,
      previousCache: undefined,
    });

    expect(markdownSections.renderSections).toHaveLength(1);
    expect(markdownSections.renderSections[0]).toMatchObject({
      sectionKind: "paragraph",
      paragraphText: "Ready",
    });
    expect(markdownSections.renderSections.some((renderSection) => renderSection.sectionKind === "codeFence")).toBe(false);
  });

  test("table_sections_stop_before_non_table_prose_lines", () => {
    const markdownSections = buildStableAssistantMarkdownRenderSections({
      markdownText: ["| Key | Value |", "| --- | --- |", "| A | B |", "Next paragraph."].join("\n"),
      isStreaming: false,
      previousCache: undefined,
    });

    expect(markdownSections.renderSections.map((renderSection) => renderSection.sectionKind)).toEqual(["table", "paragraph"]);
    expect(markdownSections.renderSections[0]).toMatchObject({
      sectionKind: "table",
      tableMarkdownText: ["| Key | Value |", "| --- | --- |", "| A | B |"].join("\n"),
    });
    expect(markdownSections.renderSections[1]).toMatchObject({
      sectionKind: "paragraph",
      paragraphText: "Next paragraph.",
    });
  });

  test("parses_path_only_code_fence_info_without_using_path_as_language", () => {
    const markdownSections = buildStableAssistantMarkdownRenderSections({
      markdownText: ["```src/app.ts:10-12", "run();", "```"].join("\n"),
      isStreaming: false,
      previousCache: undefined,
    });
    const codeFenceSection = markdownSections.renderSections.find(
      (renderSection) => renderSection.sectionKind === "codeFence",
    );

    expect(codeFenceSection).toMatchObject({
      sectionKind: "codeFence",
      codeFenceInfo: {
        codeLanguageLabel: "code",
        codeFenceDisplayLabel: "src/app.ts:10-12",
        codeFenceFilePath: "src/app.ts",
        sourceLineRange: {
          sourceStartLineNumber: 10,
          sourceEndLineNumber: 12,
        },
      },
    });
  });
});
