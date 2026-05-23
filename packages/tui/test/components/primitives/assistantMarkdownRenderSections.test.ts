import { describe, expect, test } from "bun:test";
import { buildStableAssistantMarkdownRenderSections } from "../../../src/components/primitives/assistantMarkdownRenderSections.ts";

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
});
