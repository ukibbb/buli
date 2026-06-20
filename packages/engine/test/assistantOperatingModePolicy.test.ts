import { expect, test } from "bun:test";
import {
  resolveAssistantOperatingModeToolAccess,
  resolveAvailableToolNamesForAssistantOperatingMode,
} from "../src/assistantOperatingModePolicy.ts";
import { createDefaultAssistantAgentRegistry } from "../src/assistantAgentRegistry.ts";

test("resolveAvailableToolNamesForAssistantOperatingMode exposes read-only tools by default in understand mode", () => {
  expect(
    resolveAvailableToolNamesForAssistantOperatingMode({
      assistantOperatingMode: "understand",
      requestedAvailableToolNames: undefined,
    }),
  ).toEqual({ availableToolNames: ["read", "glob", "grep", "task", "skill", "record_workflow_handoff", "bash"] });
});

test("resolveAvailableToolNamesForAssistantOperatingMode filters requested tools in plan mode", () => {
  expect(
    resolveAvailableToolNamesForAssistantOperatingMode({
      assistantOperatingMode: "plan",
      requestedAvailableToolNames: ["bash", "read", "write", "grep", "task"],
    }),
  ).toEqual({ availableToolNames: ["bash", "read", "grep", "task"] });
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
      "edit",
      "patch",
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
    effectiveAvailableToolNames: ["read", "glob", "grep", "task", "skill", "record_workflow_handoff", "bash"],
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

test("resolveAssistantOperatingModeToolAccess uses code-registered custom primary agent policy", () => {
  const assistantAgentRegistry = createDefaultAssistantAgentRegistry({
    additionalPrimaryAgents: [
      {
        agentName: "review",
        displayName: "Review Agent",
        shortLabel: "Review",
        accentColorName: "blue",
        isReadOnly: true,
        availableToolNames: ["read"],
        systemPromptConfiguration: {
          promptConfigurationKind: "custom",
          systemReminderText: "Review code without changing files.",
        },
      },
    ],
  });

  expect(
    resolveAssistantOperatingModeToolAccess({
      assistantOperatingMode: "review",
      requestedAvailableToolNames: undefined,
      requestedToolName: "write",
      assistantAgentRegistry,
    }),
  ).toEqual({
    accessKind: "denied",
    effectiveAvailableToolNames: ["read"],
    denialText: "Review Agent is read-only, so this write tool call was not applied.",
  });
});
