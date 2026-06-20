import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
import { LiveInteractionStatusStack } from "../../src/components/LiveInteractionStatusStack.tsx";

describe("LiveInteractionStatusStack", () => {
  test("renders startup integration notices", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <LiveInteractionStatusStack
        inputPanelAccentColor="#00ffff"
        startupIntegrationNotices={[
          { noticeSeverity: "success", noticeText: "MCP: novibe connected (4 tools)" },
          { noticeSeverity: "warning", noticeText: "MCP: docs unavailable: connection refused" },
        ]}
        conversationSessionSelectionState={{ step: "hidden" }}
        modelAndReasoningSelectionState={{ step: "hidden" }}
        slashCommandSelectionState={{ step: "hidden" }}
        promptContextSelectionState={{ step: "hidden" }}
        conversationSessionExportStatus={{ step: "idle" }}
        conversationSessionCompactionStatus={{ step: "idle" }}
        queuedPromptPreviews={[]}
        onConversationSessionDeletionRequested={() => {}}
      />,
      { width: 100, height: 12 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("MCP: novibe connected (4 tools)");
    expect(frame).toContain("MCP: docs unavailable: connection refused");
  });
});
