import { expect, test } from "bun:test";
import { act, useState } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import {
  ConversationTranscriptPane,
  createInitialConversationTranscriptViewportState,
  reconcileConversationTranscriptViewportAfterObservedScrollPosition,
  reconcileConversationTranscriptViewportAfterMeasurement,
  type ConversationTranscriptEntry,
  type ConversationTranscriptViewportMeasurements,
} from "../src/index.ts";
import { testRender } from "./testRenderWithCleanup.ts";

const longConversationTranscriptEntries: ConversationTranscriptEntry[] = Array.from({ length: 40 }, (_value, index) => ({
  kind: "message",
  message: {
    id: `user-message-${index}`,
    role: "user",
    text: `User line ${String(index).padStart(2, "0")}`,
  },
}));

function ConversationTranscriptWheelHarness() {
  const [conversationTranscriptViewportState, setConversationTranscriptViewportState] = useState(() =>
    createInitialConversationTranscriptViewportState(),
  );
  const [conversationTranscriptViewportMeasurements, setConversationTranscriptViewportMeasurements] =
    useState<ConversationTranscriptViewportMeasurements | undefined>(undefined);

  return (
    <box backgroundColor={chatScreenTheme.bg} flexDirection="column" height={16} width={80}>
      <ConversationTranscriptPane
        conversationTranscriptEntries={longConversationTranscriptEntries}
        hiddenTranscriptRowsAboveViewport={conversationTranscriptViewportState.hiddenTranscriptRowsAboveViewport}
        isFollowingNewestTranscriptRows={conversationTranscriptViewportState.isFollowingNewestTranscriptRows}
        onConversationTranscriptViewportMeasured={(nextConversationTranscriptViewportMeasurements) => {
          setConversationTranscriptViewportMeasurements((currentConversationTranscriptViewportMeasurements) => {
            if (
              currentConversationTranscriptViewportMeasurements?.visibleViewportHeightInRows ===
                nextConversationTranscriptViewportMeasurements.visibleViewportHeightInRows &&
              currentConversationTranscriptViewportMeasurements.fullTranscriptContentHeightInRows ===
                nextConversationTranscriptViewportMeasurements.fullTranscriptContentHeightInRows
            ) {
              return currentConversationTranscriptViewportMeasurements;
            }

            return nextConversationTranscriptViewportMeasurements;
          });
          setConversationTranscriptViewportState((currentConversationTranscriptViewportState) =>
            reconcileConversationTranscriptViewportAfterMeasurement(
              currentConversationTranscriptViewportState,
              nextConversationTranscriptViewportMeasurements,
            ),
          );
        }}
        onConversationTranscriptScrollPositionChanged={(hiddenTranscriptRowsAboveViewport) => {
          const latestConversationTranscriptViewportMeasurements = conversationTranscriptViewportMeasurements;
          if (!latestConversationTranscriptViewportMeasurements) {
            return;
          }

          setConversationTranscriptViewportState(
            reconcileConversationTranscriptViewportAfterObservedScrollPosition(
              latestConversationTranscriptViewportMeasurements,
              hiddenTranscriptRowsAboveViewport,
            ),
          );
        }}
      />
    </box>
  );
}

async function waitForRenderedFrame(
  renderedTranscriptHarness: Awaited<ReturnType<typeof testRender>>,
  predicate: (renderedFrame: string) => boolean,
): Promise<string> {
  let lastRenderedFrame = renderedTranscriptHarness.captureCharFrame();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await renderedTranscriptHarness.renderOnce();
    lastRenderedFrame = renderedTranscriptHarness.captureCharFrame();
    if (predicate(lastRenderedFrame)) {
      return lastRenderedFrame;
    }

    await Promise.resolve();
  }

  throw new Error(`expected rendered frame condition, got:\n${lastRenderedFrame}`);
}

test("ConversationTranscriptPane scrolls when the mouse wheel moves over empty transcript space", async () => {
  const renderedTranscriptHarness = await testRender(<ConversationTranscriptWheelHarness />, {
    width: 80,
    height: 16,
  });

  const initialTranscriptFrame = await waitForRenderedFrame(
    renderedTranscriptHarness,
    (renderedFrame) => renderedFrame.includes("User line 00"),
  );
  expect(initialTranscriptFrame).toContain("User line 00");

  await act(async () => {
    await renderedTranscriptHarness.mockMouse.scroll(60, 5, "down");
    await renderedTranscriptHarness.mockMouse.scroll(60, 5, "down");
    await renderedTranscriptHarness.mockMouse.scroll(60, 5, "down");
  });

  const scrolledTranscriptFrame = await waitForRenderedFrame(
    renderedTranscriptHarness,
    (renderedFrame) => !renderedFrame.includes("User line 00"),
  );

  expect(scrolledTranscriptFrame).not.toContain("User line 00");
  expect(scrolledTranscriptFrame).toContain("User line 02");
});
