import { expect, test } from "bun:test";
import { TextareaRenderable } from "@opentui/core";
import { act, useState } from "react";
import { PromptTextarea, type PromptTextareaEdit } from "../../src/components/PromptTextarea.tsx";
import { testRender } from "../testRenderWithCleanup.ts";

const noopPromptDraftEdited = (_promptTextareaEdit: PromptTextareaEdit) => {};
const noopPromptSubmitted = () => {};

type RenderedPromptTextarea = Awaited<ReturnType<typeof testRender>>;

function readFocusedPromptTextarea(renderedPromptTextarea: RenderedPromptTextarea): TextareaRenderable {
  const focusedRenderable = renderedPromptTextarea.renderer.currentFocusedRenderable;
  if (!(focusedRenderable instanceof TextareaRenderable)) {
    throw new Error("Expected PromptTextarea to be focused");
  }

  return focusedRenderable;
}

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

test("prompt textarea syncs controlled text and clamps cursor offsets without publishing edits", async () => {
  let setPromptTextareaEdit: ((promptTextareaEdit: PromptTextareaEdit) => void) | undefined;
  const publishedPromptTextareaEdits: PromptTextareaEdit[] = [];

  function PromptTextareaControlledHarness() {
    const [promptTextareaEdit, setPromptTextareaEditState] = useState<PromptTextareaEdit>({
      promptDraft: "hello",
      promptDraftCursorOffset: 99,
    });
    setPromptTextareaEdit = setPromptTextareaEditState;

    return (
      <PromptTextarea
        promptDraft={promptTextareaEdit.promptDraft}
        promptDraftCursorOffset={promptTextareaEdit.promptDraftCursorOffset}
        isFocused={true}
        onPromptDraftEdited={(nextPromptTextareaEdit) => {
          publishedPromptTextareaEdits.push(nextPromptTextareaEdit);
          setPromptTextareaEditState(nextPromptTextareaEdit);
        }}
        onPromptSubmitted={noopPromptSubmitted}
      />
    );
  }

  const renderedPromptTextarea = await testRender(<PromptTextareaControlledHarness />, { width: 40, height: 4 });
  await renderedPromptTextarea.renderOnce();

  const promptTextarea = readFocusedPromptTextarea(renderedPromptTextarea);
  expect(promptTextarea.plainText).toBe("hello");
  expect(promptTextarea.cursorOffset).toBe(5);
  expect(publishedPromptTextareaEdits).toEqual([]);

  if (!setPromptTextareaEdit) {
    throw new Error("PromptTextareaControlledHarness did not expose its edit setter");
  }
  const setControlledPromptTextareaEdit = setPromptTextareaEdit;

  await act(async () => {
    setControlledPromptTextareaEdit({ promptDraft: "hello world", promptDraftCursorOffset: -10 });
  });
  await renderedPromptTextarea.renderOnce();

  expect(promptTextarea.plainText).toBe("hello world");
  expect(promptTextarea.cursorOffset).toBe(0);
  expect(publishedPromptTextareaEdits).toEqual([]);
});

test("prompt textarea publishes user edits with the current cursor offset", async () => {
  const publishedPromptTextareaEdits: PromptTextareaEdit[] = [];

  function PromptTextareaEditingHarness() {
    const [promptTextareaEdit, setPromptTextareaEdit] = useState<PromptTextareaEdit>({
      promptDraft: "",
      promptDraftCursorOffset: 0,
    });

    return (
      <PromptTextarea
        promptDraft={promptTextareaEdit.promptDraft}
        promptDraftCursorOffset={promptTextareaEdit.promptDraftCursorOffset}
        isFocused={true}
        onPromptDraftEdited={(nextPromptTextareaEdit) => {
          publishedPromptTextareaEdits.push(nextPromptTextareaEdit);
          setPromptTextareaEdit(nextPromptTextareaEdit);
        }}
        onPromptSubmitted={noopPromptSubmitted}
      />
    );
  }

  const renderedPromptTextarea = await testRender(<PromptTextareaEditingHarness />, { width: 40, height: 4 });
  await renderedPromptTextarea.renderOnce();

  await act(async () => {
    renderedPromptTextarea.mockInput.pressKey("a");
  });
  await renderedPromptTextarea.renderOnce();

  expect(publishedPromptTextareaEdits.at(-1)).toEqual({
    promptDraft: "a",
    promptDraftCursorOffset: 1,
  });
});

test("prompt textarea hard-wraps long unbroken prompt text before the cursor leaves its bounds", async () => {
  const promptDraft = "s".repeat(30);
  const renderedPromptTextarea = await testRender(
    <PromptTextarea
      promptDraft={promptDraft}
      promptDraftCursorOffset={promptDraft.length}
      isFocused={true}
      onPromptDraftEdited={noopPromptDraftEdited}
      onPromptSubmitted={noopPromptSubmitted}
    />,
    { width: 12, height: 4 },
  );
  await renderedPromptTextarea.renderOnce();

  const promptTextarea = readFocusedPromptTextarea(renderedPromptTextarea);
  expect(promptTextarea.wrapMode).toBe("char");
  expect(promptTextarea.visualCursor.visualCol).toBeLessThan(promptTextarea.width);
});

test("prompt textarea creates virtual extmarks for image placeholders", async () => {
  const renderedPromptTextarea = await testRender(
    <PromptTextarea
      promptDraft="Describe [Image 1] and [Image 2]"
      promptDraftCursorOffset={30}
      promptImageAttachmentPlaceholderTexts={["[Image 1]", "[Image 2]"]}
      isFocused={true}
      onPromptDraftEdited={noopPromptDraftEdited}
      onPromptSubmitted={noopPromptSubmitted}
    />,
    { width: 80, height: 4 },
  );
  await renderedPromptTextarea.renderOnce();

  const promptTextarea = readFocusedPromptTextarea(renderedPromptTextarea);
  const promptImagePlaceholderExtmarks = promptTextarea.extmarks.getAll();
  const promptImagePlaceholderTypeIds = new Set(promptImagePlaceholderExtmarks.map((extmark) => extmark.typeId));

  expect(promptImagePlaceholderExtmarks.map((extmark) => ({
    start: extmark.start,
    end: extmark.end,
    virtual: extmark.virtual,
  }))).toEqual([
    { start: 9, end: 18, virtual: true },
    { start: 23, end: 32, virtual: true },
  ]);
  expect(promptImagePlaceholderTypeIds.size).toBe(1);
  expect(promptTextarea.extmarks.getTypeName(promptImagePlaceholderExtmarks[0]?.typeId ?? 0)).toBe(
    "prompt-image-attachment-placeholder",
  );
});

test("prompt textarea creates non-virtual extmarks for selected prompt-context references", async () => {
  const renderedPromptTextarea = await testRender(
    <PromptTextarea
      promptDraft="Read @README.md and @packages/tui/src/ChatScreen.tsx"
      promptDraftCursorOffset={"Read @README.md".length}
      selectedPromptContextReferenceTexts={["@README.md"]}
      isFocused={true}
      onPromptDraftEdited={noopPromptDraftEdited}
      onPromptSubmitted={noopPromptSubmitted}
    />,
    { width: 80, height: 4 },
  );
  await renderedPromptTextarea.renderOnce();

  const promptTextarea = readFocusedPromptTextarea(renderedPromptTextarea);
  const promptContextReferenceExtmarks = promptTextarea.extmarks.getAll().filter((extmark) =>
    promptTextarea.extmarks.getTypeName(extmark.typeId) === "prompt-context-reference"
  );

  expect(promptContextReferenceExtmarks.map((extmark) => ({
    start: extmark.start,
    end: extmark.end,
    virtual: extmark.virtual,
  }))).toEqual([
    { start: "Read ".length, end: "Read @README.md".length, virtual: false },
  ]);
});

test("prompt textarea requests native clipboard paste only for empty paste bytes", async () => {
  let nativeClipboardPasteRequestCount = 0;
  const publishedPromptTextareaEdits: PromptTextareaEdit[] = [];

  function PromptTextareaPasteHarness() {
    const [promptTextareaEdit, setPromptTextareaEdit] = useState<PromptTextareaEdit>({
      promptDraft: "",
      promptDraftCursorOffset: 0,
    });

    return (
      <PromptTextarea
        promptDraft={promptTextareaEdit.promptDraft}
        promptDraftCursorOffset={promptTextareaEdit.promptDraftCursorOffset}
        isFocused={true}
        onNativeClipboardPasteRequested={() => {
          nativeClipboardPasteRequestCount += 1;
        }}
        onPromptDraftEdited={(nextPromptTextareaEdit) => {
          publishedPromptTextareaEdits.push(nextPromptTextareaEdit);
          setPromptTextareaEdit(nextPromptTextareaEdit);
        }}
        onPromptSubmitted={noopPromptSubmitted}
      />
    );
  }

  const renderedPromptTextarea = await testRender(<PromptTextareaPasteHarness />, { width: 40, height: 4 });
  await renderedPromptTextarea.renderOnce();

  await act(async () => {
    await renderedPromptTextarea.mockInput.pasteBracketedText("hello\r\nworld");
  });
  await renderedPromptTextarea.renderOnce();
  expect(publishedPromptTextareaEdits.at(-1)).toEqual({
    promptDraft: "hello\nworld",
    promptDraftCursorOffset: 11,
  });
  expect(nativeClipboardPasteRequestCount).toBe(0);

  await act(async () => {
    await renderedPromptTextarea.mockInput.pasteBracketedText("\x1B[31m\x1B[0m");
  });
  await renderedPromptTextarea.renderOnce();
  expect(nativeClipboardPasteRequestCount).toBe(0);

  await act(async () => {
    await renderedPromptTextarea.mockInput.pasteBracketedText("");
  });
  await renderedPromptTextarea.renderOnce();
  expect(nativeClipboardPasteRequestCount).toBe(1);
});
