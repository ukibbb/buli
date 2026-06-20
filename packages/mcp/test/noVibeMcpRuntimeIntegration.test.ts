import { expect, test } from "bun:test";
import {
  resolveDefaultAssistantProviderModelPromptProfile,
  resolveTaskSubagentProviderModelSelection,
} from "@buli/engine";
import { createNoVibeMcpAssistantRuntimeConfiguration } from "../src/noVibeMcpRuntimeIntegration.ts";

test("builds a runtime configuration that exposes NoVibe MCP tools to default agents", () => {
  const integration = createNoVibeMcpAssistantRuntimeConfiguration({
    listedMcpTools: [
      {
        name: "teacher_library_note_read",
        description: "Read a NoVibe note.",
        inputSchema: {
          properties: {
            note_id: { type: "string", format: "uuid" },
          },
          required: ["note_id"],
        },
      },
    ],
    callNoVibeMcpTool: async () => ({ content: [{ type: "text", text: "note" }] }),
  });
  const runtimeConfiguration = integration.assistantRuntimeConfiguration;

  expect(integration.toolNames).toEqual(["novibe_teacher_library_note_read"]);
  expect(
    runtimeConfiguration.assistantToolRegistry.resolveCustomToolDefinition("novibe_teacher_library_note_read").toolName,
  ).toBe("novibe_teacher_library_note_read");

  const primaryAgentCompositionResolver = runtimeConfiguration.assistantRuntimeInput.primaryAssistantAgentCompositionResolver;
  if (!primaryAgentCompositionResolver) {
    throw new Error("expected NoVibe MCP primary agent overlay resolver");
  }
  const understandAgent = runtimeConfiguration.assistantAgentRegistry.resolvePrimaryAgentDefinition("understand");
  const planAgent = runtimeConfiguration.assistantAgentRegistry.resolvePrimaryAgentDefinition("plan");
  const implementationAgent = runtimeConfiguration.assistantAgentRegistry.resolvePrimaryAgentDefinition("implementation");

  expect(primaryAgentCompositionResolver({
    registeredPrimaryAssistantAgent: understandAgent,
    providerName: "openai",
    selectedModelId: "test-model",
  }).primaryAssistantAgent.availableToolNames).toEqual(expect.arrayContaining([
    "read",
    "task",
    "novibe_teacher_library_note_read",
  ]));
  expect(primaryAgentCompositionResolver({
    registeredPrimaryAssistantAgent: planAgent,
    providerName: "openai",
    selectedModelId: "test-model",
  }).primaryAssistantAgent.availableToolNames).toEqual(expect.arrayContaining([
    "read",
    "task",
    "novibe_teacher_library_note_read",
  ]));
  expect(primaryAgentCompositionResolver({
    registeredPrimaryAssistantAgent: implementationAgent,
    providerName: "openai",
    selectedModelId: "test-model",
  }).primaryAssistantAgent.availableToolNames).toEqual(expect.arrayContaining([
    "write",
    "record_workflow_handoff",
    "novibe_teacher_library_note_read",
  ]));
});

test("builds a runtime configuration that exposes NoVibe MCP tools to the explore subagent", () => {
  const integration = createNoVibeMcpAssistantRuntimeConfiguration({
    listedMcpTools: [{ name: "teacher_library_read_current_learning_area_tree" }],
    callNoVibeMcpTool: async () => ({ content: [{ type: "text", text: "tree" }] }),
  });
  const runtimeConfiguration = integration.assistantRuntimeConfiguration;
  const taskSubagentCompositionResolver = runtimeConfiguration.assistantRuntimeInput.taskSubagentCompositionResolver;
  if (!taskSubagentCompositionResolver) {
    throw new Error("expected NoVibe MCP task subagent overlay resolver");
  }

  const parentPrimaryAssistantAgent = runtimeConfiguration.assistantAgentRegistry.resolvePrimaryAgentDefinition("understand");
  const exploreSubagent = runtimeConfiguration.assistantAgentRegistry.resolveSubagentDefinition("explore");
  const composedExploreSubagent = taskSubagentCompositionResolver({
    registeredSubagent: exploreSubagent,
    parentPrimaryAssistantAgent,
    providerName: "openai",
    parentSelectedModelId: "test-parent-model",
    parentSelectedReasoningEffort: "medium",
    taskSubagentProviderModelSelection: resolveTaskSubagentProviderModelSelection({
      parentAssistantProviderName: "openai",
      parentSelectedModelId: "test-parent-model",
      parentSelectedReasoningEffort: "medium",
    }),
    defaultTaskSubagentAssistantProviderModelPromptProfile: resolveDefaultAssistantProviderModelPromptProfile({
      providerName: "openai",
      selectedModelId: "test-subagent-model",
    }),
  }).taskSubagent;

  expect(composedExploreSubagent.availableToolNames).toEqual(expect.arrayContaining([
    "read",
    "grep",
    "novibe_teacher_library_read_current_learning_area_tree",
  ]));
});
