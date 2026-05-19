import { expect, test } from "bun:test";
import { resolveAvailableToolNamesForAssistantOperatingMode } from "../src/assistantOperatingModePolicy.ts";

test("resolveAvailableToolNamesForAssistantOperatingMode exposes read-only tools by default in understand mode", () => {
  expect(
    resolveAvailableToolNamesForAssistantOperatingMode({
      assistantOperatingMode: "understand",
      requestedAvailableToolNames: undefined,
    }),
  ).toEqual({ availableToolNames: ["read", "glob", "grep", "task"] });
});

test("resolveAvailableToolNamesForAssistantOperatingMode filters requested tools in plan mode", () => {
  expect(
    resolveAvailableToolNamesForAssistantOperatingMode({
      assistantOperatingMode: "plan",
      requestedAvailableToolNames: ["bash", "read", "write", "grep", "task"],
    }),
  ).toEqual({ availableToolNames: ["read", "grep", "task"] });
});

test("resolveAvailableToolNamesForAssistantOperatingMode preserves requested tools in implementation mode", () => {
  expect(
    resolveAvailableToolNamesForAssistantOperatingMode({
      assistantOperatingMode: "implementation",
      requestedAvailableToolNames: ["bash", "read", "write"],
    }),
  ).toEqual({ availableToolNames: ["bash", "read", "write"] });
});

test("resolveAvailableToolNamesForAssistantOperatingMode exposes implementation agent tools by default", () => {
  expect(
    resolveAvailableToolNamesForAssistantOperatingMode({
      assistantOperatingMode: "implementation",
      requestedAvailableToolNames: undefined,
    }),
  ).toEqual({ availableToolNames: ["bash", "read", "glob", "grep", "edit", "write", "task"] });
});
