import { expect, test } from "bun:test";
import { resolveNextAssistantOperatingMode } from "../src/resolveNextAssistantOperatingMode.ts";

test("deprecated resolveNextAssistantOperatingMode delegates to primary-agent cycle resolution", () => {
  expect(resolveNextAssistantOperatingMode("understand")).toBe("plan");
});
