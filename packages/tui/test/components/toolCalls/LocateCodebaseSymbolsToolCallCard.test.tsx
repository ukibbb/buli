import { describe, expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "../../testRenderWithCleanup.ts";
import { LocateCodebaseSymbolsToolCallCard } from "../../../src/components/toolCalls/LocateCodebaseSymbolsToolCallCard.tsx";

describe("LocateCodebaseSymbolsToolCallCard", () => {
  test("streaming_shows_requested_symbol_count", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <LocateCodebaseSymbolsToolCallCard
        renderState="streaming"
        toolCallDetail={{
          toolName: "locate_codebase_symbols",
          symbolNames: ["runDispatch"],
        }}
      />,
      { width: 90, height: 10 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("LocateSymbols");
    expect(frame).toContain("[1 symbol]");
    expect(frame).toContain("locating");
  });

  test("completed_expands_requested_targets", async () => {
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <LocateCodebaseSymbolsToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "locate_codebase_symbols",
          filePaths: ["packages/engine/src/runtimeToolCallExecution.ts"],
          symbolNames: ["streamAssistantResponseEventsForRequestedToolCalls"],
          locatedSymbolCount: 2,
          verificationReadCount: 3,
        }}
      />,
      { width: 120, height: 16 },
    );
    await renderOnce();

    expect(captureCharFrame()).toContain("2 definitions");
    expect(captureCharFrame()).toContain("3 reads");
    expect(captureCharFrame()).not.toContain("file packages");

    await act(async () => {
      await mockMouse.click(3, 0);
    });
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("[-]");
    expect(frame).toContain("packages/engine/src/runtimeToolCallExecution.ts");
    expect(frame).toContain("symbol streamAssistantResponseEventsForRequestedToolCalls");
  });

  test("failed_shows_error", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <LocateCodebaseSymbolsToolCallCard
        renderState="failed"
        errorText="index file is unreadable"
        toolCallDetail={{
          toolName: "locate_codebase_symbols",
          symbolNames: ["runDispatch"],
        }}
      />,
      { width: 90, height: 10 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("[1 symbol]");
    expect(frame).toContain("index file is unreadable");
  });
});
