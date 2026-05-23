import { expect, test } from "bun:test";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { QueuedPromptStack } from "../../src/components/QueuedPromptStack.tsx";
import { testRender } from "../testRenderWithCleanup.ts";

test("queued prompt stack renders queued prompt previews", async () => {
  const { captureCharFrame, renderOnce } = await testRender(
    <QueuedPromptStack
      accentColor={chatScreenTheme.accentGreen}
      queuedPromptPreviews={[
        {
          queuedPromptId: "queued-1",
          submittedPromptText: "Run this next",
          submittedPromptImageAttachmentCount: 0,
        },
        {
          queuedPromptId: "queued-2",
          submittedPromptText: "Describe image",
          submittedPromptImageAttachmentCount: 1,
        },
      ]}
    />,
    { width: 80, height: 8 },
  );

  await renderOnce();

  const frame = captureCharFrame();
  expect(frame).toContain("Queued prompts (2)");
  expect(frame).toContain("Run this next");
  expect(frame).toContain("Describe image  [1 image]");
});

test("queued prompt stack summarizes hidden queued prompts", async () => {
  const { captureCharFrame, renderOnce } = await testRender(
    <QueuedPromptStack
      accentColor={chatScreenTheme.accentGreen}
      queuedPromptPreviews={[
        { queuedPromptId: "queued-1", submittedPromptText: "One", submittedPromptImageAttachmentCount: 0 },
        { queuedPromptId: "queued-2", submittedPromptText: "Two", submittedPromptImageAttachmentCount: 0 },
        { queuedPromptId: "queued-3", submittedPromptText: "Three", submittedPromptImageAttachmentCount: 0 },
        { queuedPromptId: "queued-4", submittedPromptText: "Four", submittedPromptImageAttachmentCount: 0 },
      ]}
    />,
    { width: 80, height: 10 },
  );

  await renderOnce();

  const frame = captureCharFrame();
  expect(frame).toContain("Queued prompts (4)");
  expect(frame).toContain("One");
  expect(frame).toContain("Three");
  expect(frame).not.toContain("Four");
  expect(frame).toContain("+ 1 more queued");
});
