import { describe, expect, test } from "bun:test";
import { BuliStickyNotesPartView } from "../../../src/components/messageParts/BuliStickyNotesPartView.tsx";
import { testRender } from "../../testRenderWithCleanup.ts";

describe("BuliStickyNotesPartView", () => {
  test("renders_label_status_and_exact_context_text_without_tool_call_wording", async () => {
    const buliStickyNotesContextText = [
      "BuliStickyNotes:",
      "Purpose-aware evidence notes from prior turns:",
      "",
      "Evidence 1:",
      "- Prior user task: \"Inspect prompts\"",
      "- Inspection question: \"Where inserted?\"",
      "- What was inspected: read src/systemPrompt.ts line 1 via call_read_1",
      "- What was found directly: returned line 1; 1 line; direct preview lines 1: buildBuliSystemPrompt inserts context",
      "- Freshness: fresh. Re-read the source before relying on details.",
      "",
      "Use these as source pointers, not active memory.",
    ].join("\n");

    const { captureCharFrame, renderOnce } = await testRender(
      <BuliStickyNotesPartView
        assistantBuliStickyNotesConversationMessagePart={{
          id: "sticky-notes-part-1",
          partKind: "assistant_buli_sticky_notes",
          buliStickyNotesContextText,
        }}
      />,
      { width: 220, height: 18 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("Buli Sticky Notes");
    expect(frame).toContain("Loaded into model context");
    for (const contextLine of buliStickyNotesContextText.split("\n")) {
      expect(frame).toContain(contextLine);
    }
    expect(frame.toLowerCase()).not.toContain("tool call");
    expect(frame.toLowerCase()).not.toContain("model used");
  });
});
