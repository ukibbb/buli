import { describe, expect, test } from "bun:test";
import {
  lookupContextWindowTokenCapacityForModel,
  lookupModelContextWindowTokenLimitsForModel,
} from "../src/modelContextWindowCapacity.ts";

describe("lookupContextWindowTokenCapacityForModel", () => {
  test("returns OpenCode-derived GPT 5.5 Codex OAuth capacities", () => {
    expect(lookupContextWindowTokenCapacityForModel("gpt-5.5")).toBe(400_000);
    expect(lookupContextWindowTokenCapacityForModel("gpt-5.5-pro")).toBe(400_000);
    expect(lookupModelContextWindowTokenLimitsForModel("gpt-5.5")).toEqual({
      contextWindowTokenCapacity: 400_000,
      inputTokenCapacity: 272_000,
    });
  });

  test("returns OpenCode models.dev GPT 5.4 capacities", () => {
    expect(lookupContextWindowTokenCapacityForModel("gpt-5.4")).toBe(1_050_000);
    expect(lookupContextWindowTokenCapacityForModel("gpt-5.4-pro")).toBe(1_050_000);
    expect(lookupContextWindowTokenCapacityForModel("gpt-5.4-mini")).toBe(400_000);
    expect(lookupContextWindowTokenCapacityForModel("gpt-5.4-nano")).toBe(400_000);
  });

  test("returns undefined for unknown models", () => {
    expect(lookupContextWindowTokenCapacityForModel("unknown-model")).toBeUndefined();
  });
});
