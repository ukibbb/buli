import { describe, expect, test } from "bun:test";
import {
  lookupContextWindowTokenCapacityForModel,
  lookupModelContextWindowTokenLimitsForModel,
} from "../src/modelContextWindowCapacity.ts";

describe("lookupContextWindowTokenCapacityForModel", () => {
  test("returns GPT 5.5 hard context capacities and Buli performance budgets", () => {
    expect(lookupContextWindowTokenCapacityForModel("gpt-5.5")).toBe(1_050_000);
    expect(lookupContextWindowTokenCapacityForModel("gpt-5.5-pro")).toBe(1_050_000);
    expect(lookupModelContextWindowTokenLimitsForModel("gpt-5.5")).toEqual({
      contextWindowTokenCapacity: 1_050_000,
      preferredContextPerformanceBudgetTokenCount: 272_000,
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
