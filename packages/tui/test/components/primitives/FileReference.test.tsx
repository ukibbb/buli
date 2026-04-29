import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { FileReference } from "../../../src/components/primitives/FileReference.tsx";

describe("FileReference", () => {
  test("inline_variant_contains_path", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <FileReference variant="inline" filePath="src/index.ts" />,
      { width: 40, height: 5 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("src/index.ts");
  });

  test("pill_variant_contains_path", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <FileReference variant="pill" filePath="src/index.ts" />,
      { width: 40, height: 5 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("src/index.ts");
  });

  test("symbol_variant_contains_path", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <FileReference variant="symbol" filePath="src/index.ts" />,
      { width: 40, height: 5 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("src/index.ts");
  });

  test("inline_variant_truncates_long_paths_before_they_wrap", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <FileReference
        variant="inline"
        filePath="packages/tui/src/components/ConversationMessageList.tsx"
        lineNumber={180}
      />,
      { width: 36, height: 5 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("...");
    expect(frame).not.toContain("ConversationMessageList.tsx");
  });
});
