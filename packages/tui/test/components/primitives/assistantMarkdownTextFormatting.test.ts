import { describe, expect, test } from "bun:test";
import { prepareAssistantMarkdownTextForRendering } from "../../../src/components/primitives/assistantMarkdownTextFormatting.ts";

describe("prepareAssistantMarkdownTextForRendering streaming inline healing", () => {
  test("removes_trailing_unmatched_single_star_italic_delimiter", () => {
    expect(prepareAssistantMarkdownTextForRendering("This is *ital", true)).toBe("This is ital");
  });

  test("removes_trailing_unmatched_single_underscore_italic_delimiter", () => {
    expect(prepareAssistantMarkdownTextForRendering("This is _ital", true)).toBe("This is ital");
  });

  test("removes_trailing_unmatched_strikethrough_delimiter", () => {
    expect(prepareAssistantMarkdownTextForRendering("This is ~~struck", true)).toBe("This is struck");
  });

  test("removes_leftover_single_star_after_healing_unmatched_double_star", () => {
    expect(prepareAssistantMarkdownTextForRendering("**bold** and *ital", true)).toBe("**bold** and ital");
  });

  test("keeps_balanced_single_star_italic_pairs", () => {
    expect(prepareAssistantMarkdownTextForRendering("*a* and *b*", true)).toBe("*a* and *b*");
  });

  test("keeps_balanced_strikethrough_pairs", () => {
    expect(prepareAssistantMarkdownTextForRendering("This is ~~done~~ now", true)).toBe("This is ~~done~~ now");
  });

  test("keeps_whitespace_isolated_star_used_as_arithmetic", () => {
    expect(prepareAssistantMarkdownTextForRendering("compute 2 * 3", true)).toBe("compute 2 * 3");
  });

  test("keeps_intra_word_underscores_in_identifiers", () => {
    expect(prepareAssistantMarkdownTextForRendering("use snake_case here", true)).toBe("use snake_case here");
  });

  test("keeps_list_marker_star_while_healing_trailing_italic_delimiter", () => {
    expect(prepareAssistantMarkdownTextForRendering("* item with *ital", true)).toBe("* item with ital");
  });

  test("keeps_unmatched_single_star_when_not_streaming", () => {
    expect(prepareAssistantMarkdownTextForRendering("This is *ital", false)).toBe("This is *ital");
  });

  test("keeps_inline_delimiters_on_last_line_inside_open_code_fence", () => {
    const openFenceMarkdown = "```python\nvalue = first * second";
    expect(prepareAssistantMarkdownTextForRendering(openFenceMarkdown, true)).toBe(openFenceMarkdown);
  });

  test("heals_only_the_last_streaming_line", () => {
    expect(prepareAssistantMarkdownTextForRendering("Earlier *line stays\nnew *ital", true)).toBe(
      "Earlier *line stays\nnew ital",
    );
  });
});
