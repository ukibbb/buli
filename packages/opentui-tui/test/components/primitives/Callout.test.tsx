import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { Callout } from "../../../src/components/primitives/Callout.tsx";

describe("Callout", () => {
  test("renders_info_body_text", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <Callout severity="info" bodyContent={<text>info body</text>} />,
      { width: 60, height: 6 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("info body");
  });

  test("renders_success_body_text", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <Callout severity="success" bodyContent={<text>success body</text>} />,
      { width: 60, height: 6 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("success body");
  });

  test("renders_warning_body_text", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <Callout severity="warning" bodyContent={<text>warning body</text>} />,
      { width: 60, height: 6 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("warning body");
  });

  test("renders_error_body_text", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <Callout severity="error" bodyContent={<text>error body</text>} />,
      { width: 60, height: 6 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("error body");
  });

  test("renders_title_text_when_supplied", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <Callout severity="info" titleText="Note" bodyContent={<text>body</text>} />,
      { width: 60, height: 6 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Note");
    expect(frame).toContain("body");
  });
});
