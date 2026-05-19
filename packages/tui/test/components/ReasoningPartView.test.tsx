import { describe, expect, test } from "bun:test";
import type { AssistantReasoningConversationMessagePart } from "@buli/contracts";
import { testRender } from "../testRenderWithCleanup.ts";
import { ReasoningPartView } from "../../src/components/messageParts/ReasoningPartView.tsx";

const completedReasoningPart = {
  id: "reasoning-1",
  partKind: "assistant_reasoning",
  partStatus: "completed",
  reasoningSummaryText: "I checked the route before answering.",
  reasoningStartedAtMs: 1000,
  reasoningDurationMs: 2400,
  reasoningTokenCount: 42,
} as const satisfies AssistantReasoningConversationMessagePart;

describe("ReasoningPartView", () => {
  test("renders_completed_reasoning_summary_when_visible", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ReasoningPartView
        assistantReasoningConversationMessagePart={completedReasoningPart}
        isReasoningSummaryVisible={true}
      />,
      { width: 90, height: 8 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("_Thought:_");
    expect(frame).toContain("I checked the route before answering.");
    expect(frame).toContain("42 reasoning tok");
  });

  test("renders_collapsed_reasoning_chip_when_hidden", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ReasoningPartView
        assistantReasoningConversationMessagePart={completedReasoningPart}
        isReasoningSummaryVisible={false}
      />,
      { width: 90, height: 4 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Thought");
    expect(frame).toContain("42 reasoning tok");
    expect(frame).not.toContain("I checked the route before answering.");
  });

  test("renders_streaming_reasoning_summary_text_when_visible", async () => {
    const streamingReasoningPart = {
      id: "reasoning-1",
      partKind: "assistant_reasoning",
      partStatus: "streaming",
      reasoningSummaryText: "Reading the relevant files.",
      reasoningStartedAtMs: Date.now() - 1000,
    } as const satisfies AssistantReasoningConversationMessagePart;

    const { captureCharFrame, renderOnce } = await testRender(
      <ReasoningPartView
        assistantReasoningConversationMessagePart={streamingReasoningPart}
        isReasoningSummaryVisible={true}
      />,
      { width: 90, height: 8 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Thinking");
    expect(frame).toContain("Reading the relevant files.");
  });
});
