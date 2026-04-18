import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
import { StreamingAssistantMessageBlock } from "../../src/components/StreamingAssistantMessageBlock.tsx";

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

describe("StreamingAssistantMessageBlock (opentui)", () => {
  test("streaming_renders_muted_header_and_body", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <StreamingAssistantMessageBlock
        renderState="streaming"
        streamingProjection={projectionWithText}
      />,
      { width: 80, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("// agent · response");
    expect(frame).toContain("The Atlas indexer walks the project tree.");
  });

  test("failed_renders_assistant_failed_label", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <StreamingAssistantMessageBlock
        renderState="failed"
        streamingProjection={projectionWithText}
      />,
      { width: 80, height: 12 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("assistant · failed");
  });

  test("incomplete_renders_assistant_incomplete_label", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <StreamingAssistantMessageBlock
        renderState="incomplete"
        streamingProjection={projectionWithText}
      />,
      { width: 80, height: 12 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("assistant · incomplete");
  });
});
