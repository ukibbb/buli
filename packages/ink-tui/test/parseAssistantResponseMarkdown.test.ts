import { expect, test } from "bun:test";
import {
  parseAssistantResponseMarkdown,
  parseInlineMarkdownSpans,
} from "../src/richText/parseAssistantResponseMarkdown.ts";

test("parseAssistantResponseMarkdown parses a single paragraph into one plain span", () => {
  const blocks = parseAssistantResponseMarkdown("Hello world");
  expect(blocks).toEqual([
    { blockKind: "paragraph", inlineSpans: [{ spanKind: "plain", spanText: "Hello world" }] },
  ]);
});

test("parseAssistantResponseMarkdown parses ATX headings at levels 1, 2, and 3", () => {
  const blocks = parseAssistantResponseMarkdown("# Title\n\n## Sub\n\n### Section");
  expect(blocks.map((block) => block.blockKind === "heading" && block.headingLevel)).toEqual([1, 2, 3]);
});

test("parseAssistantResponseMarkdown parses a fenced code block with a language label", () => {
  const blocks = parseAssistantResponseMarkdown(
    "```ts\nconst a = 1;\nconst b = 2;\n```",
  );
  expect(blocks).toEqual([
    {
      blockKind: "fenced_code",
      languageLabel: "ts",
      codeLines: ["const a = 1;", "const b = 2;"],
    },
  ]);
});

test("parseAssistantResponseMarkdown parses a fenced code block without a language label", () => {
  const blocks = parseAssistantResponseMarkdown("```\nplain\n```");
  expect(blocks).toEqual([
    {
      blockKind: "fenced_code",
      codeLines: ["plain"],
    },
  ]);
});

test("parseAssistantResponseMarkdown treats an unterminated fence as code until end of stream", () => {
  const blocks = parseAssistantResponseMarkdown("```py\nstill typing\nmore");
  expect(blocks).toEqual([
    {
      blockKind: "fenced_code",
      languageLabel: "py",
      codeLines: ["still typing", "more"],
    },
  ]);
});

test("parseAssistantResponseMarkdown parses bulleted and numbered lists", () => {
  const bulletedBlocks = parseAssistantResponseMarkdown("- first\n- second");
  expect(bulletedBlocks[0]).toEqual({
    blockKind: "bulleted_list",
    itemSpanArrays: [
      [{ spanKind: "plain", spanText: "first" }],
      [{ spanKind: "plain", spanText: "second" }],
    ],
  });

  const numberedBlocks = parseAssistantResponseMarkdown("1. one\n2. two\n3. three");
  expect(numberedBlocks[0]).toEqual({
    blockKind: "numbered_list",
    itemSpanArrays: [
      [{ spanKind: "plain", spanText: "one" }],
      [{ spanKind: "plain", spanText: "two" }],
      [{ spanKind: "plain", spanText: "three" }],
    ],
  });
});

test("parseAssistantResponseMarkdown parses a checklist with pending and completed items", () => {
  const blocks = parseAssistantResponseMarkdown("- [ ] open\n- [x] done\n- [X] also done");
  expect(blocks).toEqual([
    {
      blockKind: "checklist",
      items: [
        { itemTitle: "open", itemStatus: "pending" },
        { itemTitle: "done", itemStatus: "completed" },
        { itemTitle: "also done", itemStatus: "completed" },
      ],
    },
  ]);
});

test("parseAssistantResponseMarkdown parses a GitHub-style admonition into a callout", () => {
  const blocks = parseAssistantResponseMarkdown("> [!WARNING] Heads up\n> Be careful here");
  expect(blocks).toEqual([
    {
      blockKind: "callout",
      severity: "warning",
      titleText: "Heads up",
      inlineSpans: [{ spanKind: "plain", spanText: "Be careful here" }],
    },
  ]);
});

test("parseAssistantResponseMarkdown parses a horizontal rule as its own block", () => {
  const blocks = parseAssistantResponseMarkdown("above\n\n---\n\nbelow");
  expect(blocks.map((block) => block.blockKind)).toEqual([
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

test("parseAssistantResponseMarkdown handles a mixed document end-to-end", () => {
  const blocks = parseAssistantResponseMarkdown(
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
  expect(blocks.map((block) => block.blockKind)).toEqual([
    "heading",
    "paragraph",
    "numbered_list",
    "fenced_code",
    "callout",
  ]);
});
