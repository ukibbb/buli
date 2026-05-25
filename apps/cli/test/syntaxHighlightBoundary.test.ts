import { expect, test } from "bun:test";
import {
  renderCodeWrap,
  type CodeBlockHighlighter,
} from "../src/conversationSession/export/syntaxHighlight.ts";

test("renderCodeWrap can use an injected code block highlighter", () => {
  const fakeCodeBlockHighlighter: CodeBlockHighlighter = {
    highlightCodeBlock: (input) => ({
      resolvedLanguageId: input.languageLabel ?? "plain",
      innerHtml: "<pre><code>highlighted by fixture</code></pre>",
    }),
  };

  expect(renderCodeWrap({
    codeText: "const value = true;",
    languageLabel: "ts",
    codeBlockHighlighter: fakeCodeBlockHighlighter,
  })).toContain("highlighted by fixture");
});

test("renderCodeWrap uses code tab label when no language is provided", () => {
  expect(renderCodeWrap({ codeText: "plain text" })).toContain('<div class="code-tab">code</div>');
});
