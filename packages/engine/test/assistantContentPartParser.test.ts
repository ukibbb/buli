import { expect, test } from "bun:test";
import {
  parseAssistantResponseIntoContentParts,
  parseInlineMarkdownSpans,
} from "../src/assistantContentPartParser.ts";

test("parseAssistantResponseIntoContentParts parses a single paragraph into one plain span", () => {
  const blocks = parseAssistantResponseIntoContentParts("Hello world");
  expect(blocks).toEqual([
    { kind: "paragraph", inlineSpans: [{ spanKind: "plain", spanText: "Hello world" }] },
  ]);
});

test("parseAssistantResponseIntoContentParts parses ATX headings at levels 1, 2, and 3", () => {
  const blocks = parseAssistantResponseIntoContentParts("# Title\n\n## Sub\n\n### Section");
  expect(blocks.map((block) => block.kind === "heading" && block.headingLevel)).toEqual([1, 2, 3]);
});

test("parseAssistantResponseIntoContentParts parses a fenced code block with a language label", () => {
  const blocks = parseAssistantResponseIntoContentParts(
    "```ts\nconst a = 1;\nconst b = 2;\n```",
  );
  expect(blocks).toEqual([
    {
      kind: "fenced_code_block",
      languageLabel: "ts",
      codeLines: ["const a = 1;", "const b = 2;"],
    },
  ]);
});

test("parseAssistantResponseIntoContentParts parses a fenced code block without a language label", () => {
  const blocks = parseAssistantResponseIntoContentParts("```\nplain\n```");
  expect(blocks).toEqual([
    {
      kind: "fenced_code_block",
      codeLines: ["plain"],
    },
  ]);
});

test("parseAssistantResponseIntoContentParts treats an unterminated fence as code until end of stream", () => {
  const blocks = parseAssistantResponseIntoContentParts("```py\nstill typing\nmore");
  expect(blocks).toEqual([
    {
      kind: "fenced_code_block",
      languageLabel: "py",
      codeLines: ["still typing", "more"],
    },
  ]);
});

test("parseAssistantResponseIntoContentParts parses bulleted and numbered lists", () => {
  const bulletedBlocks = parseAssistantResponseIntoContentParts("- first\n- second");
  expect(bulletedBlocks[0]).toEqual({
    kind: "bulleted_list",
    itemSpanArrays: [
      [{ spanKind: "plain", spanText: "first" }],
      [{ spanKind: "plain", spanText: "second" }],
    ],
  });

  const numberedBlocks = parseAssistantResponseIntoContentParts("1. one\n2. two\n3. three");
  expect(numberedBlocks[0]).toEqual({
    kind: "numbered_list",
    itemSpanArrays: [
      [{ spanKind: "plain", spanText: "one" }],
      [{ spanKind: "plain", spanText: "two" }],
      [{ spanKind: "plain", spanText: "three" }],
    ],
  });
});

test("parseAssistantResponseIntoContentParts parses a checklist with pending and completed items", () => {
  const blocks = parseAssistantResponseIntoContentParts("- [ ] open\n- [x] done\n- [X] also done");
  expect(blocks).toEqual([
    {
      kind: "checklist",
      items: [
        { itemTitle: "open", itemStatus: "pending" },
        { itemTitle: "done", itemStatus: "completed" },
        { itemTitle: "also done", itemStatus: "completed" },
      ],
    },
  ]);
});

test("parseAssistantResponseIntoContentParts parses a GitHub-style admonition into a callout", () => {
  const blocks = parseAssistantResponseIntoContentParts("> [!WARNING] Heads up\n> Be careful here");
  expect(blocks).toEqual([
    {
      kind: "callout",
      severity: "warning",
      titleText: "Heads up",
      inlineSpans: [{ spanKind: "plain", spanText: "Be careful here" }],
    },
  ]);
});

test("parseAssistantResponseIntoContentParts parses a horizontal rule as its own block", () => {
  const blocks = parseAssistantResponseIntoContentParts("above\n\n---\n\nbelow");
  expect(blocks.map((block) => block.kind)).toEqual([
    "paragraph",
    "horizontal_rule",
    "paragraph",
  ]);
});

test("parseInlineMarkdownSpans parses bold, italic, strike, code, and link spans", () => {
  const spans = parseInlineMarkdownSpans(
    "Plain **bold** and *italic* and _under_ and ~~gone~~ and `code` and [docs](https://example.com) end.",
  );
  expect(spans).toEqual([
    { spanKind: "plain", spanText: "Plain " },
    { spanKind: "bold", spanText: "bold" },
    { spanKind: "plain", spanText: " and " },
    { spanKind: "italic", spanText: "italic" },
    { spanKind: "plain", spanText: " and " },
    { spanKind: "italic", spanText: "under" },
    { spanKind: "plain", spanText: " and " },
    { spanKind: "strike", spanText: "gone" },
    { spanKind: "plain", spanText: " and " },
    { spanKind: "code", spanText: "code" },
    { spanKind: "plain", spanText: " and " },
    { spanKind: "link", spanText: "docs", hrefUrl: "https://example.com" },
    { spanKind: "plain", spanText: " end." },
  ]);
});

test("parseInlineMarkdownSpans leaves unpaired markers as plain text", () => {
  const spans = parseInlineMarkdownSpans("hello **world");
  expect(spans).toEqual([{ spanKind: "plain", spanText: "hello **world" }]);
});

test("parseAssistantResponseIntoContentParts handles a mixed document end-to-end", () => {
  const blocks = parseAssistantResponseIntoContentParts(
    [
      "# Report",
      "",
      "Here is the **summary**.",
      "",
      "1. collect",
      "2. publish",
      "",
      "```py",
      "print('hi')",
      "```",
      "",
      "> [!INFO] Note",
      "> Sync is incremental.",
    ].join("\n"),
  );
  expect(blocks.map((block) => block.kind)).toEqual([
    "heading",
    "paragraph",
    "numbered_list",
    "fenced_code_block",
    "callout",
  ]);
});
