import { expect, test } from "bun:test";
import { TextareaRenderable } from "@opentui/core";
import { act, useState } from "react";
import { PromptTextarea, type PromptTextareaEdit } from "../../src/components/PromptTextarea.tsx";
import { testRender } from "../testRenderWithCleanup.ts";

const noopPromptDraftEdited = (_promptTextareaEdit: PromptTextareaEdit) => {};
const noopPromptSubmitted = () => {};

test("prompt textarea focuses and blurs the OpenTUI renderable from isFocused", async () => {
  let setPromptTextareaFocused: ((isFocused: boolean) => void) | undefined;

  function PromptTextareaFocusHarness() {
    const [isPromptTextareaFocused, setIsPromptTextareaFocused] = useState(true);
    setPromptTextareaFocused = setIsPromptTextareaFocused;

    return (
      <PromptTextarea
        promptDraft="hello"
        promptDraftCursorOffset={5}
        isFocused={isPromptTextareaFocused}
        onPromptDraftEdited={noopPromptDraftEdited}
        onPromptSubmitted={noopPromptSubmitted}
      />
    );
  }

  const renderedPromptTextarea = await testRender(<PromptTextareaFocusHarness />, { width: 40, height: 4 });
  await renderedPromptTextarea.renderOnce();

  expect(renderedPromptTextarea.renderer.currentFocusedRenderable).toBeInstanceOf(TextareaRenderable);

  if (!setPromptTextareaFocused) {
    throw new Error("PromptTextareaFocusHarness did not expose its focus setter");
  }
  const focusPromptTextarea = setPromptTextareaFocused;

  await act(async () => {
    focusPromptTextarea(false);
  });
  await renderedPromptTextarea.renderOnce();

  expect(renderedPromptTextarea.renderer.currentFocusedRenderable).toBeNull();
});
