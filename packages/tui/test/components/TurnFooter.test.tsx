import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
import { TurnFooter } from "../../src/components/TurnFooter.tsx";

test("turn footer with full usage renders duration, total, reasoning, cached", async () => {
  const { captureCharFrame, renderOnce } = await testRender(
    <TurnFooter
      modelDisplayName="GPT-5.5"
      turnDurationMs={1400}
      usage={{
        input: 1200,
        output: 900,
        reasoning: 800,
        total: 2100,
        cache: { read: 18_400, write: 0 },
      }}
    />,
    { width: 120, height: 3 },
  );
  await renderOnce();
  const frame = captureCharFrame();
  expect(frame).toContain("done");
  expect(frame).toContain("1.4s");
  expect(frame).toContain("2.1k");
  expect(frame).toContain("tokens");
  expect(frame).toContain("800");
  expect(frame).toContain("reasoning");
  expect(frame).toContain("18.4k");
  expect(frame).toContain("cached");
});

test("turn footer with missing usage renders left half only", async () => {
  const { captureCharFrame, renderOnce } = await testRender(
    <TurnFooter
      modelDisplayName="GPT-5.5"
      turnDurationMs={950}
      usage={undefined}
    />,
    { width: 120, height: 3 },
  );
  await renderOnce();
  const frame = captureCharFrame();
  expect(frame).toContain("done");
  expect(frame).toContain("950ms");
  expect(frame).not.toContain("tokens");
  expect(frame).not.toContain("reasoning");
  expect(frame).not.toContain("cached");
});

describe("TurnFooter", () => {
  test("renders_done_state_and_duration_without_model_name", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TurnFooter modelDisplayName="claude-3-5-sonnet" turnDurationMs={3200} usage={undefined} />,
      { width: 80, height: 3 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("done 3.2s");
    expect(frame).not.toContain("claude-3-5-sonnet");
    expect(frame).not.toContain("·");
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
    expect(frame).toContain("0 reasoning tok");
    expect(frame).toContain("0 cached");
    expect(frame).not.toContain("claude-3-5-sonnet");
    expect(frame).not.toContain("·");
  });

  test("renders_reasoning_token_usage_when_provided", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TurnFooter
        modelDisplayName="gpt-5.4"
        turnDurationMs={1800}
        usage={{
          input: 120,
          output: 30,
          reasoning: 42,
          total: 192,
          cache: { read: 10, write: 0 },
        }}
      />,
      { width: 80, height: 3 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("192 tok");
    expect(frame).toContain("42 reasoning tok");
    expect(frame).toContain("10 cached");
    expect(frame).not.toContain("gpt-5.4");
    expect(frame).not.toContain("·");
  });

  test("renders_large_token_counts_compactly", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TurnFooter
        modelDisplayName="gpt-5.5"
        turnDurationMs={2800}
        usage={{
          input: 74_863,
          output: 14,
          reasoning: 0,
          total: 74_877,
          cache: { read: 0, write: 0 },
        }}
      />,
      { width: 80, height: 3 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("74.9k tok");
    expect(frame).not.toContain("gpt-5.5");
    expect(frame).not.toContain("·");
  });

  test("shortens_usage_metadata_in_narrow_widths_without_model_name", async () => {
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
    expect(frame).toContain("512 tok");
    expect(frame).toContain("...");
    expect(frame).toContain("24 cached");
    expect(frame).not.toContain("gpt-5.4-preview");
    expect(frame).not.toContain("·");
    expect(frame).not.toContain("very-long-provider-suffix");
  });
});
