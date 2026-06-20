import { expect, test } from "bun:test";
import {
  AssistantAgentRegistry,
  createDefaultAssistantAgentRegistry,
  type PrimaryAssistantAgentDefinition,
  type SubagentDefinition,
} from "../src/assistantAgentRegistry.ts";

function createRegistryTestPrimaryAgent(agentName: string): PrimaryAssistantAgentDefinition {
  return {
    agentName,
    displayName: `${agentName} Agent`,
    shortLabel: agentName,
    accentColorName: "blue",
    isReadOnly: true,
    availableToolNames: ["read"],
    systemPromptConfiguration: {
      promptConfigurationKind: "custom",
      systemReminderText: `${agentName} custom reminder`,
    },
  };
}

function createRegistryTestSubagent(subagentName: string): SubagentDefinition {
  return {
    subagentName,
    displayName: `${subagentName} Subagent`,
    availableToolNames: ["read"],
    systemPromptConfiguration: {
      promptConfigurationKind: "custom",
      systemPromptText: `${subagentName} custom system prompt`,
    },
    conversationSessionAssistantOperatingMode: "understand",
  };
}

test("default assistant agent registry preserves built-in primary agents and subagent", () => {
  const registry = createDefaultAssistantAgentRegistry();

  expect(registry.resolvePrimaryAgentDefinition("understand")).toMatchObject({
    agentName: "understand",
    displayName: "Understand Agent",
    shortLabel: "Understand",
    isReadOnly: true,
    availableToolNames: ["read", "glob", "grep", "task", "skill", "record_workflow_handoff", "bash"],
    workflowHandoffKind: "understanding",
  });
  expect(registry.resolvePrimaryAgentDefinition("plan").workflowHandoffKind).toBe("plan");
  expect(registry.resolvePrimaryAgentDefinition("implementation")).toMatchObject({
    isReadOnly: false,
    workflowHandoffKind: "implementation",
  });
  expect(registry.resolveSubagentDefinition("explore")).toMatchObject({
    subagentName: "explore",
    displayName: "Explorer",
    availableToolNames: ["read", "glob", "grep"],
    conversationSessionAssistantOperatingMode: "understand",
  });
});

test("assistant agent registry rejects duplicate primary agents and subagents", () => {
  const duplicatePrimaryAgent = createRegistryTestPrimaryAgent("review");
  expect(() =>
    new AssistantAgentRegistry({
      primaryAgents: [duplicatePrimaryAgent, duplicatePrimaryAgent],
    })
  ).toThrow("Assistant primary agent is already registered: review");

  const duplicateSubagent = createRegistryTestSubagent("mapper");
  expect(() =>
    new AssistantAgentRegistry({
      subagents: [duplicateSubagent, duplicateSubagent],
    })
  ).toThrow("Assistant subagent is already registered: mapper");
});

test("assistant agent registry reports missing primary agents and subagents", () => {
  const registry = createDefaultAssistantAgentRegistry();

  expect(() => registry.resolvePrimaryAgentDefinition("missing-agent")).toThrow(
    "Assistant primary agent is not registered: missing-agent",
  );
  expect(() => registry.resolveSubagentDefinition("missing-subagent")).toThrow(
    "Assistant subagent is not registered: missing-subagent",
  );
});

test("default assistant agent registry accepts code-registered custom agents", () => {
  const registry = createDefaultAssistantAgentRegistry({
    additionalPrimaryAgents: [createRegistryTestPrimaryAgent("review")],
    additionalSubagents: [createRegistryTestSubagent("mapper")],
  });

  expect(registry.resolvePrimaryAgentDefinition("review")).toMatchObject({
    displayName: "review Agent",
    availableToolNames: ["read"],
  });
  expect(registry.resolveSubagentDefinition("mapper")).toMatchObject({
    displayName: "mapper Subagent",
    availableToolNames: ["read"],
  });
  expect(registry.listPrimaryAgentDisplayMetadata().map((agentMetadata) => agentMetadata.agentName)).toEqual([
    "understand",
    "plan",
    "implementation",
    "review",
  ]);
});
