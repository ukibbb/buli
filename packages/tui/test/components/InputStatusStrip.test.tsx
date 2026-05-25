import { expect, test } from "bun:test";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { testRender } from "../testRenderWithCleanup.ts";
import { InputStatusStrip } from "../../src/components/InputStatusStrip.tsx";

test("idle strip shows the mode word, model id, effort, destination keycap and context meter", async () => {
  const { captureCharFrame, renderOnce } = await testRender(
    <InputStatusStrip
      assistantResponseStatus="waiting_for_user_input"
      queuedPromptCount={0}
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
      queuedPromptCount={0}
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

test("streaming state shows queued prompt count", async () => {
  const { captureCharFrame, renderOnce } = await testRender(
    <InputStatusStrip
      assistantResponseStatus="streaming_assistant_response"
      queuedPromptCount={2}
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

  expect(captureCharFrame()).toContain("Queued: 2");
});

test("hint override replaces the mode cluster without rendering attachment status", async () => {
  const { captureCharFrame, renderOnce } = await testRender(
    <InputStatusStrip
      assistantResponseStatus="waiting_for_user_input"
      queuedPromptCount={0}
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
  expect(frame).not.toContain("image attached");
  expect(frame).not.toContain("pasted");
});
