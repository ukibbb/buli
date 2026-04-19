import { describe, expect, test } from "bun:test";
import { AssistantResponseEventSchema } from "@buli/contracts";
import * as scenariosBarrel from "../src/index.ts";
import type { ChatSessionFixtureScenario } from "../src/scenarioShape.ts";

const scenarioValues: ChatSessionFixtureScenario[] = Object.values(scenariosBarrel).filter(
  (exported): exported is ChatSessionFixtureScenario =>
    typeof exported === "object" &&
    exported !== null &&
    "scenarioName" in exported &&
    "responseEventSequence" in exported &&
    "expectedConversationMessages" in exported,
);

describe("assistant transcript fixtures", () => {
  test("exports_exactly_four_scenarios", () => {
    expect(scenarioValues.length).toBe(4);
  });

  for (const scenario of scenarioValues) {
    test(`scenario_${scenario.scenarioName}_events_validate_against_schema`, () => {
      for (const responseEvent of scenario.responseEventSequence) {
        expect(() => AssistantResponseEventSchema.parse(responseEvent)).not.toThrow();
      }
    });

    test(`scenario_${scenario.scenarioName}_has_at_least_one_expected_message`, () => {
      expect(scenario.expectedConversationMessages.length).toBeGreaterThan(0);
    });
  }
});
