import { describe, expect, test } from "bun:test";
import { AssistantContentPartSchema } from "../src/assistantContentPart.ts";

describe("AssistantContentPartSchema", () => {
  test("parses_paragraph_part_with_inline_spans", () => {
    const parsed = AssistantContentPartSchema.parse({
      kind: "paragraph",
      inlineSpans: [{ spanKind: "plain", spanText: "hello" }],
    });
    expect(parsed.kind).toBe("paragraph");
  });

  test("parses_heading_part_at_level_1", () => {
    const parsed = AssistantContentPartSchema.parse({
      kind: "heading",
      headingLevel: 1,
      inlineSpans: [{ spanKind: "plain", spanText: "Title" }],
    });
    expect(parsed).toMatchObject({ kind: "heading", headingLevel: 1 });
  });

  test("parses_heading_part_at_level_2", () => {
    const parsed = AssistantContentPartSchema.parse({
      kind: "heading",
      headingLevel: 2,
      inlineSpans: [{ spanKind: "plain", spanText: "Subtitle" }],
    });
    expect(parsed.kind === "heading" && parsed.headingLevel).toBe(2);
  });

  test("parses_heading_part_at_level_3", () => {
    const parsed = AssistantContentPartSchema.parse({
      kind: "heading",
      headingLevel: 3,
      inlineSpans: [{ spanKind: "plain", spanText: "Section" }],
    });
    expect(parsed.kind === "heading" && parsed.headingLevel).toBe(3);
  });

  test("parses_heading_part_at_level_4", () => {
    const parsed = AssistantContentPartSchema.parse({
      kind: "heading",
      headingLevel: 4,
      inlineSpans: [{ spanKind: "plain", spanText: "Subsection" }],
    });
    expect(parsed.kind === "heading" && parsed.headingLevel).toBe(4);
  });

  test("parses_heading_part_at_level_5", () => {
    const parsed = AssistantContentPartSchema.parse({
      kind: "heading",
      headingLevel: 5,
      inlineSpans: [{ spanKind: "plain", spanText: "Minor heading" }],
    });
    expect(parsed.kind === "heading" && parsed.headingLevel).toBe(5);
  });

  test("parses_heading_part_at_level_6", () => {
    const parsed = AssistantContentPartSchema.parse({
      kind: "heading",
      headingLevel: 6,
      inlineSpans: [{ spanKind: "plain", spanText: "Smallest heading" }],
    });
    expect(parsed.kind === "heading" && parsed.headingLevel).toBe(6);
  });

  test("rejects_heading_part_at_level_7", () => {
    expect(() =>
      AssistantContentPartSchema.parse({
        kind: "heading",
        headingLevel: 7,
        inlineSpans: [],
      }),
    ).toThrow();
  });

  test("parses_bulleted_list_part_with_multiple_items", () => {
    const parsed = AssistantContentPartSchema.parse({
      kind: "bulleted_list",
      itemSpanArrays: [
        [{ spanKind: "plain", spanText: "first item" }],
        [{ spanKind: "plain", spanText: "second item" }],
      ],
    });
    expect(parsed.kind === "bulleted_list" && parsed.itemSpanArrays.length).toBe(2);
  });

  test("parses_numbered_list_part_with_items", () => {
    const parsed = AssistantContentPartSchema.parse({
      kind: "numbered_list",
      itemSpanArrays: [[{ spanKind: "plain", spanText: "step one" }]],
    });
    expect(parsed.kind).toBe("numbered_list");
  });

  test("parses_checklist_part_with_mixed_item_statuses", () => {
    const parsed = AssistantContentPartSchema.parse({
      kind: "checklist",
      items: [
        { itemTitle: "todo", itemStatus: "pending" },
        { itemTitle: "in progress", itemStatus: "in_progress" },
        { itemTitle: "done", itemStatus: "completed" },
      ],
    });
    expect(parsed.kind === "checklist" && parsed.items.length).toBe(3);
  });

  test("rejects_checklist_item_with_unknown_status", () => {
    expect(() =>
      AssistantContentPartSchema.parse({
        kind: "checklist",
        items: [{ itemTitle: "x", itemStatus: "frozen" }],
      }),
    ).toThrow();
  });

  test("parses_fenced_code_block_with_language_label", () => {
    const parsed = AssistantContentPartSchema.parse({
      kind: "fenced_code_block",
      languageLabel: "typescript",
      codeLines: ["const x = 1;", "console.log(x);"],
    });
    expect(parsed.kind === "fenced_code_block" && parsed.languageLabel).toBe("typescript");
  });

  test("parses_fenced_code_block_without_language_label", () => {
    const parsed = AssistantContentPartSchema.parse({
      kind: "fenced_code_block",
      codeLines: ["raw text"],
    });
    expect(parsed.kind).toBe("fenced_code_block");
  });

  test("parses_callout_part_with_info_severity", () => {
    const parsed = AssistantContentPartSchema.parse({
      kind: "callout",
      severity: "info",
      inlineSpans: [{ spanKind: "plain", spanText: "note" }],
    });
    expect(parsed.kind === "callout" && parsed.severity).toBe("info");
  });

  test("parses_callout_part_with_all_severity_values_including_warning", () => {
    for (const severity of ["info", "success", "warning", "error"] as const) {
      const parsed = AssistantContentPartSchema.parse({
        kind: "callout",
        severity,
        inlineSpans: [{ spanKind: "plain", spanText: "x" }],
      });
      expect(parsed.kind === "callout" && parsed.severity).toBe(severity);
    }
  });

  test("rejects_callout_severity_warn_without_trailing_ing", () => {
    expect(() =>
      AssistantContentPartSchema.parse({
        kind: "callout",
        severity: "warn",
        inlineSpans: [{ spanKind: "plain", spanText: "x" }],
      }),
    ).toThrow();
  });

  test("parses_callout_part_with_optional_title_text", () => {
    const parsed = AssistantContentPartSchema.parse({
      kind: "callout",
      severity: "warning",
      titleText: "Heads up",
      inlineSpans: [{ spanKind: "plain", spanText: "watch out" }],
    });
    expect(parsed.kind === "callout" && parsed.titleText).toBe("Heads up");
  });

  test("parses_horizontal_rule_part_with_no_fields", () => {
    const parsed = AssistantContentPartSchema.parse({ kind: "horizontal_rule" });
    expect(parsed.kind).toBe("horizontal_rule");
  });

  test("rejects_unknown_content_part_kind", () => {
    expect(() => AssistantContentPartSchema.parse({ kind: "widget" })).toThrow();
  });
});
