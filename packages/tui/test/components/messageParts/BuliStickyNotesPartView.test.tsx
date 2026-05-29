import { describe, expect, test } from "bun:test";
import { BuliStickyNotesPartView } from "../../../src/components/messageParts/BuliStickyNotesPartView.tsx";
import { testRender } from "../../testRenderWithCleanup.ts";

describe("BuliStickyNotesPartView", () => {
  test("renders_label_status_and_exact_context_text_without_tool_call_wording", async () => {
    const buliStickyNotesContextText = [
      "BuliStickyNotes:",
      "Purpose-aware evidence notes from prior turns:",
      "- Prior task: \"Inspect prompts\"; question: \"Where inserted?\"; source: read src/systemPrompt.ts via call_read_1; observed: found prompt input; freshness: fresh.",
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
      { width: 220, height: 12 },
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
