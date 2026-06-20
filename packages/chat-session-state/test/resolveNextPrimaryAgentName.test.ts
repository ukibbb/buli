import { expect, test } from "bun:test";
import { resolveNextPrimaryAgentName } from "../src/resolveNextPrimaryAgentName.ts";

test("understand primary agent cycles to plan", () => {
  expect(resolveNextPrimaryAgentName("understand")).toBe("plan");
});

test("plan primary agent cycles to implementation", () => {
  expect(resolveNextPrimaryAgentName("plan")).toBe("implementation");
});

test("implementation primary agent cycles back to understand", () => {
  expect(resolveNextPrimaryAgentName("implementation")).toBe("understand");
});

test("custom primary agent metadata controls the cycle order", () => {
  expect(
    resolveNextPrimaryAgentName("review", [
      {
        agentName: "understand",
        displayName: "Understand Agent",
        shortLabel: "Understand",
        accentColorName: "pink",
      },
      {
        agentName: "review",
        displayName: "Review Agent",
        shortLabel: "Review",
        accentColorName: "purple",
      },
      {
        agentName: "implementation",
        displayName: "Implementation Agent",
        shortLabel: "Implementation",
        accentColorName: "green",
      },
    ]),
  ).toBe("implementation");
});

test("unknown current agent falls back to the first configured primary agent", () => {
  expect(
    resolveNextPrimaryAgentName("unknown-agent", [
      {
        agentName: "review",
        displayName: "Review Agent",
        shortLabel: "Review",
        accentColorName: "purple",
      },
    ]),
  ).toBe("review");
});
