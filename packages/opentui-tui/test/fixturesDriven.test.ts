import { describe, expect, test } from "bun:test";
import * as fixtureScenarios from "@buli/assistant-transcript-fixtures";
import type { AssistantTranscriptScenario } from "@buli/assistant-transcript-fixtures";
import {
  applyAssistantResponseEventToChatScreenState,
  createInitialChatScreenState,
} from "../src/chatScreenState.ts";

const scenarioValues: AssistantTranscriptScenario[] = Object.values(fixtureScenarios).filter(
  (exported): exported is AssistantTranscriptScenario =>
    typeof exported === "object" &&
    exported !== null &&
    "scenarioName" in exported &&
    "responseEventSequence" in exported &&
    "expectedConversationTranscriptEntries" in exported,
);

describe("ink-tui reducer against shared fixtures", () => {
  test("fixtures_package_exposes_at_least_one_scenario", () => {
    expect(scenarioValues.length).toBeGreaterThan(0);
  });

  for (const scenario of scenarioValues) {
    test(`folds_${scenario.scenarioName}_to_expected_transcript_entry_kinds`, () => {
      let chatScreenState = createInitialChatScreenState({ selectedModelId: "gpt-5.4" });
      for (const responseEvent of scenario.responseEventSequence) {
        chatScreenState = applyAssistantResponseEventToChatScreenState(chatScreenState, responseEvent);
      }
      const actualKinds = chatScreenState.conversationTranscript.map((entry) => entry.kind);
      const expectedKinds = scenario.expectedConversationTranscriptEntries.map((entry) => entry.kind);
      expect(actualKinds).toEqual(expectedKinds);
    });
  }
});
