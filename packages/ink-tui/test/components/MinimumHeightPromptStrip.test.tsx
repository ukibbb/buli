import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import { MinimumHeightPromptStrip } from "../../src/components/MinimumHeightPromptStrip.tsx";

function renderWithoutAnsi(node: React.ReactElement) {
  return stripVTControlCharacters(renderToString(node));
}

test("MinimumHeightPromptStrip renders the caret and draft text when idle", () => {
  const output = renderWithoutAnsi(
    <MinimumHeightPromptStrip
      promptDraft="hello world"
      promptDraftCursorOffset={11}
      isPromptInputDisabled={false}
      assistantResponseStatus="waiting_for_user_input"
    />,
  );
  expect(output).toContain(">");
  expect(output).toContain("hello world");
});

test("MinimumHeightPromptStrip swaps the caret line for the working label while streaming", () => {
  const output = renderWithoutAnsi(
    <MinimumHeightPromptStrip
      promptDraft="anything"
      promptDraftCursorOffset={8}
      isPromptInputDisabled={true}
      assistantResponseStatus="streaming_assistant_response"
    />,
  );
  expect(output).toContain("working");
  expect(output).not.toContain("anything");
});

test("MinimumHeightPromptStrip omits the context meter and help shortcuts footer", () => {
  const output = renderWithoutAnsi(
    <MinimumHeightPromptStrip
      promptDraft=""
      promptDraftCursorOffset={0}
      isPromptInputDisabled={false}
      assistantResponseStatus="waiting_for_user_input"
    />,
  );
  expect(output).not.toContain("ctx");
  expect(output).not.toContain("help · shortcuts");
});
