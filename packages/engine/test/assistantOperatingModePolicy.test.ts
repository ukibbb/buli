import { expect, test } from "bun:test";
import {
  resolveAssistantOperatingModeToolAccess,
  resolveAvailableToolNamesForAssistantOperatingMode,
} from "../src/assistantOperatingModePolicy.ts";

test("resolveAvailableToolNamesForAssistantOperatingMode exposes read-only tools by default in understand mode", () => {
  expect(
    resolveAvailableToolNamesForAssistantOperatingMode({
      assistantOperatingMode: "understand",
      requestedAvailableToolNames: undefined,
    }),
  ).toEqual({ availableToolNames: ["read", "read_many", "search_many", "glob", "grep", "query_codebase_knowledge", "task", "skill"] });
});

test("resolveAvailableToolNamesForAssistantOperatingMode filters requested tools in plan mode", () => {
  expect(
    resolveAvailableToolNamesForAssistantOperatingMode({
      assistantOperatingMode: "plan",
      requestedAvailableToolNames: ["bash", "read", "read_many", "search_many", "write", "grep", "query_codebase_knowledge", "task"],
    }),
  ).toEqual({ availableToolNames: ["read", "read_many", "search_many", "grep", "query_codebase_knowledge", "task"] });
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
  ).toEqual({
    availableToolNames: [
      "bash",
      "read",
      "read_many",
      "search_many",
      "glob",
      "grep",
      "query_codebase_knowledge",
      "edit",
      "edit_many",
      "patch",
      "patch_many",
      "write",
      "task",
      "skill",
    ],
  });
});

test("resolveAssistantOperatingModeToolAccess denies bash in plan mode", () => {
  expect(
    resolveAssistantOperatingModeToolAccess({
      assistantOperatingMode: "plan",
      requestedAvailableToolNames: undefined,
      requestedToolName: "bash",
    }),
  ).toEqual({
    accessKind: "denied",
    effectiveAvailableToolNames: ["read", "read_many", "search_many", "glob", "grep", "query_codebase_knowledge", "task", "skill"],
    denialText: "Plan Agent is read-only, so this bash command was not executed.",
  });
});

test("resolveAssistantOperatingModeToolAccess enforces explicit implementation tool overrides", () => {
  expect(
    resolveAssistantOperatingModeToolAccess({
      assistantOperatingMode: "implementation",
      requestedAvailableToolNames: ["read"],
      requestedToolName: "write",
    }),
  ).toEqual({
    accessKind: "denied",
    effectiveAvailableToolNames: ["read"],
    denialText: "Implementation Agent cannot use write in this turn. Available tools: read.",
  });
});
