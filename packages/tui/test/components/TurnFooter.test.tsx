import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
import { TurnFooter } from "../../src/components/TurnFooter.tsx";

describe("TurnFooter", () => {
  test("renders_model_name_and_duration", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TurnFooter modelDisplayName="claude-3-5-sonnet" turnDurationMs={3200} usage={undefined} />,
      { width: 80, height: 3 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("claude-3-5-sonnet");
    expect(frame).toContain("3.2s");
  });

  test("renders_token_usage_when_provided", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TurnFooter
        modelDisplayName="claude-3-5-sonnet"
        turnDurationMs={1000}
        usage={{
          input: 100,
          output: 50,
          reasoning: 0,
          total: 150,
          cache: { read: 0, write: 0 },
        }}
      />,
      { width: 80, height: 3 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("150 tok");
  });

  test("shortens_right_side_metadata_in_narrow_widths", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TurnFooter
        modelDisplayName="gpt-5.4-preview-with-very-long-provider-suffix"
        turnDurationMs={2300}
        usage={{
          input: 280,
          output: 180,
          reasoning: 52,
          total: 512,
          cache: { read: 24, write: 0 },
        }}
      />,
      { width: 44, height: 4 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("done");
    expect(frame).toContain("2.3s");
    expect(frame).toContain("...");
    expect(frame).not.toContain("very-long-provider-suffix");
  });
});
