import { expect, test } from "bun:test";
import { resolveNextAssistantOperatingMode } from "../src/resolveNextAssistantOperatingMode.ts";

test("understand mode cycles to plan", () => {
  expect(resolveNextAssistantOperatingMode("understand")).toBe("plan");
});

test("plan mode cycles to implementation", () => {
  expect(resolveNextAssistantOperatingMode("plan")).toBe("implementation");
});

test("implementation mode cycles back to understand", () => {
  expect(resolveNextAssistantOperatingMode("implementation")).toBe("understand");
});

test("custom primary agent metadata controls the cycle order", () => {
  expect(
    resolveNextAssistantOperatingMode("review", [
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
    resolveNextAssistantOperatingMode("unknown-agent", [
      {
        agentName: "review",
        displayName: "Review Agent",
        shortLabel: "Review",
        accentColorName: "purple",
      },
    ]),
  ).toBe("review");
});
