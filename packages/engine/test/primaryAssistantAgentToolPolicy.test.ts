import { expect, test } from "bun:test";
import {
  resolvePrimaryAgentNameToolAccess,
  resolveAvailableToolNamesForPrimaryAgentName,
} from "../src/primaryAssistantAgentToolPolicy.ts";
import { createDefaultAssistantAgentRegistry } from "../src/assistantAgentRegistry.ts";

test("resolveAvailableToolNamesForPrimaryAgentName exposes read-only tools by default in understand agent", () => {
  expect(
    resolveAvailableToolNamesForPrimaryAgentName({
      selectedPrimaryAgentName: "understand",
      requestedAvailableToolNames: undefined,
    }),
  ).toEqual({ availableToolNames: ["read", "glob", "grep", "task", "skill", "record_workflow_handoff", "bash"] });
});

test("resolveAvailableToolNamesForPrimaryAgentName filters requested tools in plan agent", () => {
  expect(
    resolveAvailableToolNamesForPrimaryAgentName({
      selectedPrimaryAgentName: "plan",
      requestedAvailableToolNames: ["bash", "read", "write", "grep", "task"],
    }),
  ).toEqual({ availableToolNames: ["bash", "read", "grep", "task"] });
});

test("resolveAvailableToolNamesForPrimaryAgentName preserves requested tools in implementation agent", () => {
  expect(
    resolveAvailableToolNamesForPrimaryAgentName({
      selectedPrimaryAgentName: "implementation",
      requestedAvailableToolNames: ["bash", "read", "write"],
    }),
  ).toEqual({ availableToolNames: ["bash", "read", "write"] });
});

test("resolveAvailableToolNamesForPrimaryAgentName exposes implementation agent tools by default", () => {
  expect(
    resolveAvailableToolNamesForPrimaryAgentName({
      selectedPrimaryAgentName: "implementation",
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

test("resolvePrimaryAgentNameToolAccess allows bash in plan agent", () => {
  expect(
    resolvePrimaryAgentNameToolAccess({
      selectedPrimaryAgentName: "plan",
      requestedAvailableToolNames: undefined,
      requestedToolName: "bash",
    }),
  ).toEqual({
    accessKind: "allowed",
    effectiveAvailableToolNames: ["read", "glob", "grep", "task", "skill", "record_workflow_handoff", "bash"],
  });
});

test("resolvePrimaryAgentNameToolAccess denies bash when explicit read-only overrides omit bash", () => {
  expect(
    resolvePrimaryAgentNameToolAccess({
      selectedPrimaryAgentName: "plan",
      requestedAvailableToolNames: ["read"],
      requestedToolName: "bash",
    }),
  ).toEqual({
    accessKind: "denied",
    effectiveAvailableToolNames: ["read"],
    denialText: "Plan Agent can use bash only for explicitly approved read/inspect commands, and bash is not available in this turn.",
  });
});

test("resolvePrimaryAgentNameToolAccess enforces explicit implementation tool overrides", () => {
  expect(
    resolvePrimaryAgentNameToolAccess({
      selectedPrimaryAgentName: "implementation",
      requestedAvailableToolNames: ["read"],
      requestedToolName: "write",
    }),
  ).toEqual({
    accessKind: "denied",
    effectiveAvailableToolNames: ["read"],
    denialText: "Implementation Agent cannot use write in this turn. Available tools: read.",
  });
});

test("resolvePrimaryAgentNameToolAccess uses code-registered custom primary agent policy", () => {
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
    resolvePrimaryAgentNameToolAccess({
      selectedPrimaryAgentName: "review",
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
