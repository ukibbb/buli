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
