import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { AssistantLearningSequencePartView } from "../../../src/components/messageParts/AssistantLearningSequencePartView.tsx";

describe("AssistantLearningSequencePartView", () => {
  test("shows_title_summary_and_sequence_items", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantLearningSequencePartView
        assistantLearningSequenceConversationMessagePart={{
          id: "learning-sequence-1",
          partKind: "assistant_learning_sequence",
          titleText: "Runtime flow",
          summaryText: "The main stages in one turn.",
          sequenceItems: [
            { labelText: "Prompt accepted" },
            { labelText: "Provider streams", detailText: "Chunks become assistant events." },
          ],
        }}
      />,
      { width: 80, height: 20 },
    );
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("Runtime flow");
    expect(frame).toContain("The main stages in one turn.");
    expect(frame).toContain("Prompt accepted");
    expect(frame).toContain("Provider streams");
  });

  test("uses_singular_step_count_for_one_item", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantLearningSequencePartView
        assistantLearningSequenceConversationMessagePart={{
          id: "learning-sequence-1",
          partKind: "assistant_learning_sequence",
          titleText: "Single stage",
          sequenceItems: [{ labelText: "Only step" }],
        }}
      />,
      { width: 80, height: 10 },
    );
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("1 step");
    expect(frame).not.toContain("1 steps");
  });
});
