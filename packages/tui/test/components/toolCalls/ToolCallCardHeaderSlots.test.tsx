import { describe, expect, test } from "bun:test";
import { useState } from "react";
import { act } from "react";
import { testRender } from "../../testRenderWithCleanup.ts";
import { ToolCallCompactHeader } from "../../../src/components/toolCalls/ToolCallCardHeaderSlots.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

function extractRenderedNonEmptyLineIndexes(frame: string): number[] {
  return frame
    .split("\n")
    .flatMap((line, lineIndex) => line.trim().length > 0 ? [lineIndex] : []);
}

describe("ToolCallCardHeaderSlots (opentui)", () => {
  test("ToolCallCompactHeader renders disclosure, label, target, and status on one row", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ToolCallCompactHeader
        accentColor={chatScreenTheme.accentAmber}
        disclosureState={{ isContentExpandable: false }}
        statusColor={chatScreenTheme.accentGreen}
        statusKind="success"
        statusLabel="exit 0"
        toolNameLabel="Bash"
        toolTargetText="bun test"
      />,
      { width: 80, height: 3 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("[+]");
    expect(frame).toContain("Bash");
    expect(frame).toContain("[bun test]");
    expect(frame).toContain("exit 0");
    expect(frame).toContain("✓");
  });

  test("ToolCallCompactHeader wraps long targets instead of clipping them", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ToolCallCompactHeader
        accentColor={chatScreenTheme.accentAmber}
        disclosureState={{ isContentExpandable: false }}
        statusColor={chatScreenTheme.accentGreen}
        statusKind="success"
        statusLabel="1-52:52"
        toolNameLabel="Read"
        toolTargetText="packages/tui/src/components/ConversationMessageList.tsx"
      />,
      { width: 32, height: 6 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame.replace(/\s/g, "")).toContain("packages/tui/src/components/ConversationMessageList.tsx");
    expect(frame.split("\n").filter((line) => line.trim().length > 0).length).toBeGreaterThan(1);
    expect(frame).not.toContain("...");
    expect(frame).not.toContain("…");
    expect(frame).toContain("1-52:52");
  });

  test("ToolCallCompactHeader does not leave blank rows inside a wrapped row", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ToolCallCompactHeader
        accentColor={chatScreenTheme.accentAmber}
        disclosureState={{ isContentExpandable: false }}
        statusColor={chatScreenTheme.accentGreen}
        statusKind="success"
        statusLabel="1-110:199"
        toolNameLabel="Read"
        toolTargetText="packages/chat-app-controller/src/useChatAppAssistantTurnActions.ts"
      />,
      { width: 54, height: 6 },
    );
    await renderOnce();
    const renderedLineIndexes = extractRenderedNonEmptyLineIndexes(captureCharFrame());
    const firstLineIndex = renderedLineIndexes.at(0);
    const lastLineIndex = renderedLineIndexes.at(-1);
    expect(firstLineIndex).toBeDefined();
    expect(lastLineIndex).toBeDefined();
    expect(renderedLineIndexes).toHaveLength((lastLineIndex ?? 0) - (firstLineIndex ?? 0) + 1);
  });

  test("ToolCallCompactHeader toggles the inline disclosure marker", async () => {
    function ExpandableHeaderFixture() {
      const [isExpanded, setIsExpanded] = useState(false);
      return (
        <ToolCallCompactHeader
          accentColor={chatScreenTheme.accentAmber}
          disclosureState={{
            isContentExpandable: true,
            isContentExpanded: isExpanded,
            onContentExpansionToggle: () => setIsExpanded((currentExpanded) => !currentExpanded),
          }}
          statusColor={chatScreenTheme.accentGreen}
          statusKind="success"
          statusLabel="2 paths"
          toolNameLabel="Glob"
          toolTargetText="*.ts"
        />
      );
    }

    const { captureCharFrame, mockMouse, renderOnce } = await testRender(<ExpandableHeaderFixture />, {
      width: 80,
      height: 3,
    });
    await renderOnce();
    expect(captureCharFrame()).toContain("[+]");

    await act(async () => {
      await mockMouse.click(2, 0);
    });
    await renderOnce();
    expect(captureCharFrame()).toContain("[-]");
  });

  test("ToolCallCompactHeader renders pending apple snake before disclosure marker", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ToolCallCompactHeader
        accentColor={chatScreenTheme.accentAmber}
        disclosureState={{ isContentExpandable: false }}
        statusColor={chatScreenTheme.accentAmber}
        statusKind="pending"
        statusLabel="running…"
        toolNameLabel="Read"
        toolTargetText="README.md"
      />,
      { width: 80, height: 3 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("◆");
    expect(frame.indexOf("◆")).toBeLessThan(frame.indexOf("[+]"));
    expect(frame).not.toContain("running");
  });
});
