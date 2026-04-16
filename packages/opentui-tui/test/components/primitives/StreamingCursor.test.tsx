import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { StreamingCursor } from "../../../src/components/primitives/StreamingCursor.tsx";

describe("StreamingCursor", () => {
  test("renders_non_empty_frame_for_amber_variant", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <StreamingCursor variant="amber" />,
      { width: 10, height: 3 },
    );
    await renderOnce();
    // First frame is the filled block glyph; frame must be non-empty.
    const frame = captureCharFrame();
    expect(frame.trim().length).toBeGreaterThan(0);
    // Initial state renders the block cursor character.
    expect(frame).toContain("█");
  });
});
