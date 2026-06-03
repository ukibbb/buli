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
  ).toEqual({ availableToolNames: ["read", "glob", "grep", "locate_codebase_symbols", "task", "skill", "record_workflow_handoff", "bash"] });
});

test("resolveAvailableToolNamesForAssistantOperatingMode filters requested tools in plan mode", () => {
  expect(
    resolveAvailableToolNamesForAssistantOperatingMode({
      assistantOperatingMode: "plan",
      requestedAvailableToolNames: ["bash", "read", "write", "grep", "locate_codebase_symbols", "task"],
    }),
  ).toEqual({ availableToolNames: ["bash", "read", "grep", "locate_codebase_symbols", "task"] });
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
      "glob",
      "grep",
      "locate_codebase_symbols",
      "edit",
      "edit_many",
      "patch",
      "patch_many",
      "write",
      "task",
      "skill",
      "record_workflow_handoff",
    ],
  });
});

test("resolveAssistantOperatingModeToolAccess allows bash in plan mode", () => {
  expect(
    resolveAssistantOperatingModeToolAccess({
      assistantOperatingMode: "plan",
      requestedAvailableToolNames: undefined,
      requestedToolName: "bash",
    }),
  ).toEqual({
    accessKind: "allowed",
    effectiveAvailableToolNames: ["read", "glob", "grep", "locate_codebase_symbols", "task", "skill", "record_workflow_handoff", "bash"],
  });
});

test("resolveAssistantOperatingModeToolAccess denies bash when explicit read-only overrides omit bash", () => {
  expect(
    resolveAssistantOperatingModeToolAccess({
      assistantOperatingMode: "plan",
      requestedAvailableToolNames: ["read"],
      requestedToolName: "bash",
    }),
  ).toEqual({
    accessKind: "denied",
    effectiveAvailableToolNames: ["read"],
    denialText: "Plan Agent can use bash only for explicitly approved read/inspect commands, and bash is not available in this turn.",
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
