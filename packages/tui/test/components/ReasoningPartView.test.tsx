import { describe, expect, test } from "bun:test";
import { act } from "react";
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
  test("renders_expanded_completed_reasoning_summary", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ReasoningPartView
        assistantReasoningConversationMessagePart={completedReasoningPart}
        isReasoningSummaryVisible={true}
      />,
      { width: 90, height: 8 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("[-]");
    expect(frame).toContain("Thought");
    expect(frame).toContain("2.4s");
    expect(frame).toContain("I checked the route before answering.");
    expect(frame).not.toContain("42 reasoning tok");
    expect(frame).not.toContain("reasoning tokens unavailable");
    expect(frame).not.toContain("click to");
  });

  test("renders_nothing_when_reasoning_summaries_are_hidden", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ReasoningPartView
        assistantReasoningConversationMessagePart={completedReasoningPart}
        isReasoningSummaryVisible={false}
      />,
      { width: 90, height: 4 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).not.toContain("[+]");
    expect(frame).not.toContain("Thought");
    expect(frame).not.toContain("I checked the route before answering.");
  });

  test("toggles_reasoning_summary_content_when_clicked", async () => {
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <ReasoningPartView
        assistantReasoningConversationMessagePart={completedReasoningPart}
        isReasoningSummaryVisible={true}
      />,
      { width: 90, height: 8 },
    );

    await renderOnce();
    expect(captureCharFrame()).toContain("I checked the route before answering.");

    await act(async () => {
      await mockMouse.click(3, 1);
    });
    await renderOnce();
    const collapsedFrame = captureCharFrame();
    expect(collapsedFrame).toContain("[+]");
    expect(collapsedFrame).toContain("Thought");
    expect(collapsedFrame).not.toContain("I checked the route before answering.");
    expect(collapsedFrame).not.toContain("click to");

    await act(async () => {
      await mockMouse.click(3, 1);
    });
    await renderOnce();
    const expandedFrame = captureCharFrame();
    expect(expandedFrame).toContain("[-]");
    expect(expandedFrame).toContain("I checked the route before answering.");
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
    expect(frame).toContain("◆");
    expect(frame).toContain("[-]");
    expect(frame).toContain("Thinking");
    expect(frame).toContain("Reading the relevant files.");
    expect(frame).not.toContain("click to");
  });

  test("renders_nothing_for_empty_or_redacted_reasoning_summary_text", async () => {
    const emptyReasoningPart = {
      ...completedReasoningPart,
      reasoningSummaryText: "[REDACTED]",
    } satisfies AssistantReasoningConversationMessagePart;
    const { captureCharFrame, renderOnce } = await testRender(
      <ReasoningPartView
        assistantReasoningConversationMessagePart={emptyReasoningPart}
        isReasoningSummaryVisible={true}
      />,
      { width: 90, height: 4 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).not.toContain("Thought");
    expect(frame).not.toContain("[REDACTED]");
  });

  test("wraps_long_reasoning_title_without_truncation", async () => {
    const longTitleReasoningPart = {
      ...completedReasoningPart,
      reasoningSummaryText: "**Considering the parser state before rendering the final transcript row**\nThe row should stay readable.",
    } satisfies AssistantReasoningConversationMessagePart;
    const { captureCharFrame, renderOnce } = await testRender(
      <ReasoningPartView
        assistantReasoningConversationMessagePart={longTitleReasoningPart}
        isReasoningSummaryVisible={true}
      />,
      { width: 44, height: 12 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Considering the parser");
    expect(frame).toContain("final transcript row");
    expect(frame).not.toContain("...");
    expect(frame).not.toContain("…");
  });
});
