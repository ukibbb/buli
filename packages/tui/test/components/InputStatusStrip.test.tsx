import { expect, test } from "bun:test";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { testRender } from "../testRenderWithCleanup.ts";
import { InputStatusStrip } from "../../src/components/InputStatusStrip.tsx";

test("idle strip in Understand mode shows the mode word, model id, effort and destination keycap", async () => {
  const { captureCharFrame, renderOnce } = await testRender(
    <InputStatusStrip
      assistantResponseStatus="idle"
      pendingPromptImageAttachmentCount={0}
      accentColor={chatScreenTheme.accentPink}
      shortModeLabel="Understand"
      nextShortModeLabel="Plan"
      nextModeAccentColor={chatScreenTheme.accentAmber}
      modelIdentifier="gpt-5.5"
      reasoningEffortLabel="xhigh"
      totalContextTokensUsed={22_900}
      contextWindowTokenCapacity={400_000}
    />,
    { width: 120, height: 3 },
  );
  await renderOnce();
  const frame = captureCharFrame();
  expect(frame).toContain("Understand");
  expect(frame).toContain("gpt-5.5");
  expect(frame).toContain("xhigh");
  expect(frame).toContain("tab");
  expect(frame).toContain("Plan");
  expect(frame).toContain("22.9k");
});
