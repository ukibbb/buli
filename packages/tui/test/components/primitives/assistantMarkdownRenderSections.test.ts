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

  test("reuses_stable_prefix_sections_when_streaming_appends_after_a_longer_prefix", () => {
    const firstMarkdownSections = buildStableAssistantMarkdownRenderSections({
      markdownText: ["# Stable heading", "", "Stable paragraph", "", "```ts", "const stable = true;", "```"].join("\n"),
      isStreaming: true,
      previousCache: undefined,
    });

    const secondMarkdownSections = buildStableAssistantMarkdownRenderSections({
      markdownText: [
        "# Stable heading",
        "",
        "Stable paragraph",
        "",
        "```ts",
        "const stable = true;",
        "```",
        "",
        "Streaming tail",
      ].join("\n"),
      isStreaming: true,
      previousCache: firstMarkdownSections.nextCache,
    });

    expect(firstMarkdownSections.renderSections.map((renderSection) => renderSection.sectionKind)).toEqual([
      "heading",
      "paragraph",
      "codeFence",
    ]);
    expect(secondMarkdownSections.renderSections[0]).toBe(firstMarkdownSections.renderSections[0]);
    expect(secondMarkdownSections.renderSections[1]).toBe(firstMarkdownSections.renderSections[1]);
    expect(secondMarkdownSections.renderSections[2]).toBe(firstMarkdownSections.renderSections[2]);
    expect(secondMarkdownSections.renderSections[3]).toMatchObject({
      sectionKind: "streamingTail",
      streamingTailText: "Streaming tail",
    });
  });

  test("renders_active_streaming_tail_as_streaming_tail_section_after_stable_prefix", () => {
    const markdownSections = buildStableAssistantMarkdownRenderSections({
      markdownText: ["# Stable heading", "", "Stable paragraph", "", "## Tail still typing"].join("\n"),
      isStreaming: true,
      previousCache: undefined,
    });

    expect(markdownSections.renderSections).toMatchObject([
      { sectionKind: "heading", headingText: "Stable heading" },
      { sectionKind: "paragraph", paragraphText: "Stable paragraph" },
      { sectionKind: "streamingTail", streamingTailText: "## Tail still typing" },
    ]);
  });

  test("promotes_active_tail_to_rich_markdown_when_streaming_completes", () => {
    const markdownSections = buildStableAssistantMarkdownRenderSections({
      markdownText: ["# Stable heading", "", "Stable paragraph", "", "## Tail completed"].join("\n"),
      isStreaming: false,
      previousCache: undefined,
    });

    expect(markdownSections.renderSections).toMatchObject([
      { sectionKind: "heading", headingText: "Stable heading" },
      { sectionKind: "paragraph", paragraphText: "Stable paragraph" },
      { sectionKind: "heading", headingText: "Tail completed" },
    ]);
  });

  test("reuses_the_cached_render_sections_when_prepared_markdown_and_streaming_mode_are_unchanged", () => {
    const firstMarkdownSections = buildStableAssistantMarkdownRenderSections({
      markdownText: ["# Stable", "", "No changes."].join("\n"),
      isStreaming: false,
      previousCache: undefined,
    });

    const secondMarkdownSections = buildStableAssistantMarkdownRenderSections({
      markdownText: ["# Stable", "", "No changes."].join("\n"),
      isStreaming: false,
      previousCache: firstMarkdownSections.nextCache,
    });

    expect(secondMarkdownSections.renderSections).toBe(firstMarkdownSections.renderSections);
    expect(secondMarkdownSections.nextCache).toBe(firstMarkdownSections.nextCache);
  });

  test("does_not_reuse_the_cache_when_streaming_mode_changes_the_visible_markdown", () => {
    const streamingMarkdownSections = buildStableAssistantMarkdownRenderSections({
      markdownText: "Still **typing",
      isStreaming: true,
      previousCache: undefined,
    });

    const completedMarkdownSections = buildStableAssistantMarkdownRenderSections({
      markdownText: "Still **typing",
      isStreaming: false,
      previousCache: streamingMarkdownSections.nextCache,
    });

    expect(completedMarkdownSections.renderSections).not.toBe(streamingMarkdownSections.renderSections);
    expect(completedMarkdownSections.nextCache).not.toBe(streamingMarkdownSections.nextCache);
    expect(completedMarkdownSections.renderSections[0]).toMatchObject({
      sectionKind: "paragraph",
      paragraphText: "Still **typing",
    });
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
