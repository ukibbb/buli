import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import { StreamingAssistantMessageBlock } from "../../src/components/StreamingAssistantMessageBlock.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

function ansi24BitBg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[48;2;${r};${g};${b}m`;
}

const projectionWithText = {
  fullResponseText: "The Atlas indexer walks the project tree.",
  completedContentParts: [
    {
      kind: "paragraph" as const,
      inlineSpans: [{ spanKind: "plain" as const, spanText: "The Atlas indexer walks the project tree." }],
    },
  ],
  openContentPart: undefined,
};

test("streaming success state renders a muted '// agent · response' header", () => {
  const plain = stripVTControlCharacters(
    renderToString(
      <StreamingAssistantMessageBlock
        renderState="streaming"
        streamingProjection={projectionWithText}
      />,
    ),
  );
  expect(plain).toContain("// agent · response");
  expect(plain).toContain("The Atlas indexer walks the project tree.");
});

test("streaming success state does NOT render a cyan stripe row", () => {
  const ansiOutput = renderToString(
    <StreamingAssistantMessageBlock
      renderState="streaming"
      streamingProjection={projectionWithText}
    />,
  );
  expect(ansiOutput).not.toContain(ansi24BitBg(chatScreenTheme.accentCyan));
});

test("failed state still renders the accentRed stripe wrapper", () => {
  const ansiOutput = renderToString(
    <StreamingAssistantMessageBlock
      renderState="failed"
      streamingProjection={projectionWithText}
    />,
  );
  expect(ansiOutput).toContain(ansi24BitBg(chatScreenTheme.accentRed));
});

test("incomplete state still renders the accentAmber stripe wrapper", () => {
  const ansiOutput = renderToString(
    <StreamingAssistantMessageBlock
      renderState="incomplete"
      streamingProjection={projectionWithText}
    />,
  );
  expect(ansiOutput).toContain(ansi24BitBg(chatScreenTheme.accentAmber));
});
