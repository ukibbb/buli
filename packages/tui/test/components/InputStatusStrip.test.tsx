import { expect, test } from "bun:test";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { testRender } from "../testRenderWithCleanup.ts";
import { InputStatusStrip } from "../../src/components/InputStatusStrip.tsx";

test("idle strip in Understand mode shows the mode word, model id, effort and destination keycap", async () => {
  const { captureCharFrame, renderOnce } = await testRender(
    <InputStatusStrip
      assistantResponseStatus="waiting_for_user_input"
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

test("streaming state renders the snake indicator and the meter, omits mode chips", async () => {
  const { captureCharFrame, renderOnce } = await testRender(
    <InputStatusStrip
      assistantResponseStatus="streaming_assistant_response"
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
  expect(frame).not.toContain("Understand");
  expect(frame).not.toContain("tab");
  expect(frame).toContain("22.9k");
});

test("pending images state renders the attachment hint and the meter", async () => {
  const { captureCharFrame, renderOnce } = await testRender(
    <InputStatusStrip
      assistantResponseStatus="waiting_for_user_input"
      pendingPromptImageAttachmentCount={2}
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
  expect(frame).toContain("2 images attached");
  expect(frame).not.toContain("Understand");
});

test("hint override replaces the mode cluster", async () => {
  const { captureCharFrame, renderOnce } = await testRender(
    <InputStatusStrip
      assistantResponseStatus="waiting_for_user_input"
      pendingPromptImageAttachmentCount={0}
      promptInputHintOverride="press enter again to confirm"
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
  expect(frame).toContain("press enter again to confirm");
  expect(frame).not.toContain("Understand");
});
