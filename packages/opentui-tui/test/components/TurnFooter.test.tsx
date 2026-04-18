import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
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
});
