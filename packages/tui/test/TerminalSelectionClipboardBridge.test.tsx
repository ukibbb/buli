import { expect, test } from "bun:test";
import type { Selection } from "@opentui/core";
import { act } from "react";
import {
  copyOpenTuiSelectionToClipboard,
  TerminalSelectionClipboardBridge,
} from "../src/clipboard/TerminalSelectionClipboardBridge.tsx";
import { testRender } from "./testRenderWithCleanup.ts";

function createSelectionWithText(selectedText: string): Pick<Selection, "getSelectedText"> {
  return {
    getSelectedText: () => selectedText,
  };
}

test("copyOpenTuiSelectionToClipboard writes selected text and clears OpenTUI selection", async () => {
  const osc52ClipboardTexts: string[] = [];
  const nativeClipboardTexts: string[] = [];
  let clearSelectionCount = 0;

  const didWriteClipboardText = await copyOpenTuiSelectionToClipboard({
    renderer: {
      clearSelection: () => {
        clearSelectionCount += 1;
      },
      copyToClipboardOSC52: (clipboardText) => {
        osc52ClipboardTexts.push(clipboardText);
        return true;
      },
    },
    selection: createSelectionWithText("selected assistant text"),
    writeClipboardText: async (clipboardText) => {
      nativeClipboardTexts.push(clipboardText);
      return true;
    },
  });

  expect(didWriteClipboardText).toBe(true);
  expect(osc52ClipboardTexts).toEqual(["selected assistant text"]);
  expect(nativeClipboardTexts).toEqual(["selected assistant text"]);
  expect(clearSelectionCount).toBe(1);
});

test("copyOpenTuiSelectionToClipboard ignores empty selection text", async () => {
  let clipboardWriteCount = 0;
  let clearSelectionCount = 0;

  const didWriteClipboardText = await copyOpenTuiSelectionToClipboard({
    renderer: {
      clearSelection: () => {
        clearSelectionCount += 1;
      },
      copyToClipboardOSC52: () => {
        clipboardWriteCount += 1;
        return true;
      },
    },
    selection: createSelectionWithText(""),
    writeClipboardText: async () => {
      clipboardWriteCount += 1;
      return true;
    },
  });

  expect(didWriteClipboardText).toBe(false);
  expect(clipboardWriteCount).toBe(0);
  expect(clearSelectionCount).toBe(0);
});

test("TerminalSelectionClipboardBridge handles completed OpenTUI selection events", async () => {
  const nativeClipboardTexts: string[] = [];
  const osc52ClipboardTexts: string[] = [];
  let clearSelectionCount = 0;
  const renderedBridge = await testRender(
    <TerminalSelectionClipboardBridge
      writeClipboardText={async (clipboardText) => {
        nativeClipboardTexts.push(clipboardText);
        return true;
      }}
    />,
  );
  renderedBridge.renderer.copyToClipboardOSC52 = (clipboardText: string): boolean => {
    osc52ClipboardTexts.push(clipboardText);
    return true;
  };
  renderedBridge.renderer.clearSelection = (): void => {
    clearSelectionCount += 1;
  };

  await act(async () => {
    renderedBridge.renderer.emit(
      "selection",
      createSelectionWithText("selected terminal text") as Selection,
    );
    await Promise.resolve();
  });

  expect(osc52ClipboardTexts).toEqual(["selected terminal text"]);
  expect(nativeClipboardTexts).toEqual(["selected terminal text"]);
  expect(clearSelectionCount).toBe(1);
});
