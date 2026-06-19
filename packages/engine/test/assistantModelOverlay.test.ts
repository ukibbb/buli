import { expect, test } from "bun:test";
import type { ProviderToolDefinition } from "@buli/contracts";
import {
  DEFAULT_ASSISTANT_SUBAGENT_DEFINITIONS,
  DEFAULT_PRIMARY_ASSISTANT_AGENT_DEFINITIONS,
  type PrimaryAssistantAgentDefinition,
  type SubagentDefinition,
} from "../src/assistantAgentRegistry.ts";
import { resolveDefaultAssistantProviderModelPromptProfile } from "../src/assistantProviderModelPromptProfile.ts";
import {
  applyAssistantModelOverlayResolverToCustomToolDefinition,
  createAssistantModelOverlayResolvers,
  type AssistantModelOverlayTurnMatcherInput,
} from "../src/assistantModelOverlay.ts";
import {
  createDefaultAssistantToolRegistry,
  type CustomAssistantToolDefinition,
} from "../src/assistantToolRegistry.ts";
import type { TaskSubagentProviderModelSelection } from "../src/taskSubagentProviderModelSelection.ts";

test("assistant model overlay resolvers fall back to default primary, subagent, and custom tool definitions", () => {
  const registeredPrimaryAgent = resolveDefaultUnderstandPrimaryAgent();
  const registeredSubagent = resolveDefaultExploreSubagent();
  const defaultSubagentPromptProfile = resolveDefaultAssistantProviderModelPromptProfile({
    providerName: "openai",
    selectedModelId: "gpt-5.5",
  });
  const workspaceSummaryProviderDefinition = createWorkspaceSummaryProviderDefinition();
  const resolvers = createAssistantModelOverlayResolvers({
    modelOverlays: [
      {
        overlayName: "small-local-model",
        matchesTurn: (matcherInput) => matcherInput.selectedModelId === "small-local-model",
        primaryAgentOverlays: [
          {
            agentName: "understand",
            additionalPromptSections: ["Small primary prompt section."],
          },
        ],
        taskSubagentOverlays: [
          {
            subagentName: "explore",
            additionalPromptSections: ["Small subagent prompt section."],
          },
        ],
        customToolProviderDefinitionOverlays: [
          {
            toolName: "workspace_summary",
            additionalDescriptionParagraphs: ["Small tool description."],
          },
        ],
        builtInToolDescriptionOverlays: [
          {
            toolName: "read",
            additionalDescriptionParagraphs: ["Small read description."],
          },
        ],
      },
    ],
  });

  const primaryComposition = resolvers.primaryAssistantAgentCompositionResolver({
    registeredPrimaryAssistantAgent: registeredPrimaryAgent,
    providerName: "openai",
    selectedModelId: "gpt-5.5",
  });
  const taskSubagentComposition = resolvers.taskSubagentCompositionResolver({
    registeredSubagent,
    parentPrimaryAssistantAgent: registeredPrimaryAgent,
    providerName: "openai",
    parentSelectedModelId: "gpt-5.5",
    taskSubagentProviderModelSelection: createTaskSubagentModelSelection("gpt-5.5"),
    defaultTaskSubagentAssistantProviderModelPromptProfile: defaultSubagentPromptProfile,
  });
  const providerToolDefinition = resolvers.customAssistantToolProviderDefinitionResolver({
    providerName: "openai",
    selectedModelId: "gpt-5.5",
    assistantTurnKind: "primary_assistant_agent",
    assistantAgentName: "understand",
    toolName: "workspace_summary",
    defaultProviderToolDefinition: workspaceSummaryProviderDefinition,
  });
  const builtInToolDescriptionOverlays = resolvers.builtInToolDescriptionOverlayResolver({
    providerName: "openai",
    selectedModelId: "gpt-5.5",
    assistantTurnKind: "primary_assistant_agent",
    assistantAgentName: "understand",
    availableToolNames: ["read"],
  });

  expect(primaryComposition.primaryAssistantAgent).toBe(registeredPrimaryAgent);
  expect(taskSubagentComposition.taskSubagent).toBe(registeredSubagent);
  expect(taskSubagentComposition.assistantProviderModelPromptProfile).toBe(defaultSubagentPromptProfile);
  expect(providerToolDefinition).toBe(workspaceSummaryProviderDefinition);
  expect(builtInToolDescriptionOverlays).toEqual([]);
});

test("assistant model overlay resolvers expose a ready-to-spread runtime resolver input", () => {
  const resolvers = createAssistantModelOverlayResolvers({ modelOverlays: [] });

  expect(resolvers.assistantRuntimeResolverInput.primaryAssistantAgentCompositionResolver).toBe(
    resolvers.primaryAssistantAgentCompositionResolver,
  );
  expect(resolvers.assistantRuntimeResolverInput.taskSubagentCompositionResolver).toBe(
    resolvers.taskSubagentCompositionResolver,
  );
  expect(resolvers.assistantRuntimeResolverInput.builtInToolDescriptionOverlayResolver).toBe(
    resolvers.builtInToolDescriptionOverlayResolver,
  );
  expect(Object.keys(resolvers.assistantRuntimeResolverInput).sort()).toEqual([
    "builtInToolDescriptionOverlayResolver",
    "primaryAssistantAgentCompositionResolver",
    "taskSubagentCompositionResolver",
  ]);
});

test("assistant model overlay resolvers apply ordered primary overlays without mutating the base agent", () => {
  const registeredPrimaryAgent = resolveDefaultUnderstandPrimaryAgent();
  const matcherInputs: AssistantModelOverlayTurnMatcherInput[] = [];
  const resolvers = createAssistantModelOverlayResolvers({
    modelOverlays: [
      {
        overlayName: "first-small-overlay",
        matchesTurn: (matcherInput) => {
          matcherInputs.push(matcherInput);
          return matcherInput.selectedModelId === "small-local-model" &&
            matcherInput.assistantTurnKind === "primary_assistant_agent";
        },
        primaryAgentOverlays: [
          {
            agentName: "understand",
            additionalPromptSections: ["First small primary prompt section."],
            availableToolNames: ["read"],
            promptFragments: {
              primaryAssistantSystemPrompt: ["First small primary prompt fragment."],
            },
          },
        ],
      },
      {
        overlayName: "second-small-overlay",
        matchesTurn: (matcherInput) => matcherInput.selectedModelId === "small-local-model",
        primaryAgentOverlays: [
          {
            agentName: "understand",
            additionalPromptSections: ["Second small primary prompt section."],
            availableToolNames: ["read", "glob"],
            promptFragments: {
              primaryAssistantSystemPrompt: ["Second small primary prompt fragment."],
            },
          },
          {
            agentName: "plan",
            additionalPromptSections: ["Non-selected agent prompt section."],
          },
        ],
      },
    ],
  });

  const primaryComposition = resolvers.primaryAssistantAgentCompositionResolver({
    registeredPrimaryAssistantAgent: registeredPrimaryAgent,
    providerName: "openai",
    selectedModelId: "small-local-model",
    selectedReasoningEffort: "low",
  });

  expect(primaryComposition.primaryAssistantAgent).not.toBe(registeredPrimaryAgent);
  expect(registeredPrimaryAgent.systemPromptConfiguration.additionalPromptSections).toBeUndefined();
  expect(registeredPrimaryAgent.availableToolNames).not.toEqual(["read", "glob"]);
  expect(primaryComposition.primaryAssistantAgent.systemPromptConfiguration.additionalPromptSections).toEqual([
    "First small primary prompt section.",
    "Second small primary prompt section.",
  ]);
  expect(primaryComposition.primaryAssistantAgent.availableToolNames).toEqual(["read", "glob"]);
  expect(primaryComposition.assistantProviderModelPromptProfile.promptFragments.primaryAssistantSystemPrompt).toEqual([
    "First small primary prompt fragment.",
    "Second small primary prompt fragment.",
  ]);
  expect(matcherInputs[0]).toEqual({
    providerName: "openai",
    selectedModelId: "small-local-model",
    selectedReasoningEffort: "low",
    assistantTurnKind: "primary_assistant_agent",
    assistantAgentName: "understand",
  });
});

test("assistant model overlay resolvers apply ordered task subagent overlays without mutating the base subagent", () => {
  const registeredPrimaryAgent = resolveDefaultUnderstandPrimaryAgent();
  const registeredSubagent = resolveDefaultExploreSubagent();
  const defaultSubagentPromptProfile = resolveDefaultAssistantProviderModelPromptProfile({
    providerName: "openai",
    selectedModelId: "small-subagent-model",
  });
  const resolvers = createAssistantModelOverlayResolvers({
    modelOverlays: [
      {
        overlayName: "first-small-subagent-overlay",
        matchesTurn: (matcherInput) => matcherInput.selectedModelId === "small-subagent-model" &&
          matcherInput.assistantTurnKind === "task_subagent" &&
          matcherInput.assistantAgentName === "explore",
        taskSubagentOverlays: [
          {
            subagentName: "explore",
            additionalPromptSections: ["First small subagent prompt section."],
            availableToolNames: ["read"],
            promptFragments: {
              explorerSystemPrompt: ["First small Explorer prompt fragment."],
            },
          },
        ],
      },
      {
        overlayName: "second-small-subagent-overlay",
        matchesTurn: (matcherInput) => matcherInput.selectedModelId === "small-subagent-model",
        taskSubagentOverlays: [
          {
            subagentName: "explore",
            additionalPromptSections: ["Second small subagent prompt section."],
            availableToolNames: ["read", "grep"],
            promptFragments: {
              explorerSystemPrompt: ["Second small Explorer prompt fragment."],
              taskSubagentPrompt: ["Second small task prompt fragment."],
            },
          },
        ],
      },
    ],
  });

  const taskSubagentComposition = resolvers.taskSubagentCompositionResolver({
    registeredSubagent,
    parentPrimaryAssistantAgent: registeredPrimaryAgent,
    providerName: "openai",
    parentSelectedModelId: "gpt-5.5",
    parentSelectedReasoningEffort: "high",
    taskSubagentProviderModelSelection: {
      ...createTaskSubagentModelSelection("small-subagent-model"),
      taskSubagentSelectedReasoningEffort: "low",
    },
    defaultTaskSubagentAssistantProviderModelPromptProfile: defaultSubagentPromptProfile,
  });

  expect(taskSubagentComposition.taskSubagent).not.toBe(registeredSubagent);
  expect(registeredSubagent.systemPromptConfiguration.additionalPromptSections).toBeUndefined();
  expect(registeredSubagent.availableToolNames).not.toEqual(["read", "grep"]);
  expect(taskSubagentComposition.taskSubagent.systemPromptConfiguration.additionalPromptSections).toEqual([
    "First small subagent prompt section.",
    "Second small subagent prompt section.",
  ]);
  expect(taskSubagentComposition.taskSubagent.availableToolNames).toEqual(["read", "grep"]);
  expect(taskSubagentComposition.assistantProviderModelPromptProfile.promptFragments.explorerSystemPrompt).toEqual([
    "First small Explorer prompt fragment.",
    "Second small Explorer prompt fragment.",
  ]);
  expect(taskSubagentComposition.assistantProviderModelPromptProfile.promptFragments.taskSubagentPrompt).toEqual([
    "Second small task prompt fragment.",
  ]);
});

test("assistant model overlay resolvers append custom tool provider descriptions in overlay order", () => {
  const workspaceSummaryProviderDefinition = createWorkspaceSummaryProviderDefinition();
  const resolvers = createAssistantModelOverlayResolvers({
    modelOverlays: [
      {
        overlayName: "first-small-tool-overlay",
        matchesTurn: (matcherInput) => matcherInput.selectedModelId === "small-local-model",
        customToolProviderDefinitionOverlays: [
          {
            toolName: "workspace_summary",
            additionalDescriptionParagraphs: ["First small tool paragraph."],
          },
        ],
      },
      {
        overlayName: "second-small-tool-overlay",
        matchesTurn: (matcherInput) => matcherInput.selectedModelId === "small-local-model" &&
          matcherInput.assistantTurnKind === "task_subagent",
        customToolProviderDefinitionOverlays: [
          {
            toolName: "workspace_summary",
            additionalDescriptionParagraphs: ["Second small tool paragraph."],
          },
          {
            toolName: "other_custom_tool",
            additionalDescriptionParagraphs: ["Wrong tool paragraph."],
          },
        ],
      },
    ],
  });

  const providerToolDefinition = resolvers.customAssistantToolProviderDefinitionResolver({
    providerName: "openai",
    selectedModelId: "small-local-model",
    selectedReasoningEffort: "low",
    assistantTurnKind: "task_subagent",
    assistantAgentName: "explore",
    toolName: "workspace_summary",
    defaultProviderToolDefinition: workspaceSummaryProviderDefinition,
  });

  expect(providerToolDefinition).toEqual({
    ...workspaceSummaryProviderDefinition,
    description: "Summarize a workspace topic.\n\nFirst small tool paragraph.\n\nSecond small tool paragraph.",
  });
  expect(workspaceSummaryProviderDefinition.description).toBe("Summarize a workspace topic.");
});

test("assistant model overlay custom tool helper composes existing provider resolver before overlay resolver", () => {
  const baseProviderDefinitionDescriptions: string[] = [];
  const baseCustomToolDefinition = createWorkspaceSummaryCustomToolDefinition({
    resolveProviderToolDefinitionForTurn: (resolverInput) => {
      baseProviderDefinitionDescriptions.push(resolverInput.defaultProviderToolDefinition.description);
      return {
        ...resolverInput.defaultProviderToolDefinition,
        description: `${resolverInput.defaultProviderToolDefinition.description}\n\nBase resolver paragraph.`,
      };
    },
  });
  const modelOverlayResolvers = createAssistantModelOverlayResolvers({
    modelOverlays: [
      {
        overlayName: "small-local-tool-overlay",
        matchesTurn: (matcherInput) => matcherInput.selectedModelId === "small-local-model",
        customToolProviderDefinitionOverlays: [
          {
            toolName: "workspace_summary",
            additionalDescriptionParagraphs: ["Model overlay paragraph."],
          },
        ],
      },
    ],
  });

  const overlayAwareCustomToolDefinition = applyAssistantModelOverlayResolverToCustomToolDefinition({
    customToolDefinition: baseCustomToolDefinition,
    customAssistantToolProviderDefinitionResolver: modelOverlayResolvers.customAssistantToolProviderDefinitionResolver,
  });
  const assistantToolRegistry = createDefaultAssistantToolRegistry({
    additionalCustomTools: [overlayAwareCustomToolDefinition],
  });

  const [resolvedProviderToolDefinition] = assistantToolRegistry.resolveProviderToolDefinitionsForTurn({
    availableToolNames: ["workspace_summary"],
    turnContext: {
      providerName: "openai",
      selectedModelId: "small-local-model",
      assistantTurnKind: "primary_assistant_agent",
      assistantAgentName: "understand",
    },
  });

  expect(overlayAwareCustomToolDefinition).not.toBe(baseCustomToolDefinition);
  expect(overlayAwareCustomToolDefinition.toolName).toBe(baseCustomToolDefinition.toolName);
  expect(overlayAwareCustomToolDefinition.providerToolDefinition).toBe(baseCustomToolDefinition.providerToolDefinition);
  expect(overlayAwareCustomToolDefinition.executionPolicy).toBe(baseCustomToolDefinition.executionPolicy);
  expect(overlayAwareCustomToolDefinition.approvalPolicy).toBe(baseCustomToolDefinition.approvalPolicy);
  expect(overlayAwareCustomToolDefinition.executor).toBe(baseCustomToolDefinition.executor);
  expect(baseProviderDefinitionDescriptions).toEqual(["Summarize a workspace topic."]);
  expect(resolvedProviderToolDefinition).toEqual({
    ...baseCustomToolDefinition.providerToolDefinition,
    description: "Summarize a workspace topic.\n\nBase resolver paragraph.\n\nModel overlay paragraph.",
  });
  expect(baseCustomToolDefinition.providerToolDefinition.description).toBe("Summarize a workspace topic.");
});

test("assistant model overlay resolvers list built-in tool description overlays in overlay order and filter unavailable tools", () => {
  const resolvers = createAssistantModelOverlayResolvers({
    modelOverlays: [
      {
        overlayName: "first-small-built-in-overlay",
        matchesTurn: (matcherInput) => matcherInput.selectedModelId === "small-local-model",
        builtInToolDescriptionOverlays: [
          {
            toolName: "read",
            additionalDescriptionParagraphs: ["First small read paragraph."],
          },
          {
            toolName: "grep",
            additionalDescriptionParagraphs: ["Unavailable grep paragraph."],
          },
        ],
      },
      {
        overlayName: "second-small-built-in-overlay",
        matchesTurn: (matcherInput) => matcherInput.selectedModelId === "small-local-model" &&
          matcherInput.assistantTurnKind === "task_subagent",
        builtInToolDescriptionOverlays: [
          {
            toolName: "read",
            additionalDescriptionParagraphs: ["Second small read paragraph."],
          },
        ],
      },
    ],
  });

  const builtInToolDescriptionOverlays = resolvers.builtInToolDescriptionOverlayResolver({
    providerName: "openai",
    selectedModelId: "small-local-model",
    selectedReasoningEffort: "low",
    assistantTurnKind: "task_subagent",
    assistantAgentName: "explore",
    availableToolNames: ["read", "workspace_summary"],
  });

  expect(builtInToolDescriptionOverlays).toEqual([
    {
      toolName: "read",
      additionalDescriptionParagraphs: ["First small read paragraph."],
    },
    {
      toolName: "read",
      additionalDescriptionParagraphs: ["Second small read paragraph."],
    },
  ]);
});

function createTaskSubagentModelSelection(
  taskSubagentSelectedModelId: string,
): TaskSubagentProviderModelSelection {
  return {
    taskSubagentSelectedModelId,
    modelSelectionReason: "policy_model_override",
    reasoningEffortSelectionReason: "parent_reasoning_effort_undefined",
  };
}

function createWorkspaceSummaryProviderDefinition(): ProviderToolDefinition {
  return {
    toolName: "workspace_summary",
    description: "Summarize a workspace topic.",
    parameters: {
      type: "object",
      properties: { topic: { type: "string" } },
      required: ["topic"],
      additionalProperties: false,
    },
  };
}

function createWorkspaceSummaryCustomToolDefinition(input: {
  resolveProviderToolDefinitionForTurn?: CustomAssistantToolDefinition["resolveProviderToolDefinitionForTurn"] | undefined;
} = {}): CustomAssistantToolDefinition {
  return {
    toolName: "workspace_summary",
    providerToolDefinition: createWorkspaceSummaryProviderDefinition(),
    ...(input.resolveProviderToolDefinitionForTurn
      ? { resolveProviderToolDefinitionForTurn: input.resolveProviderToolDefinitionForTurn }
      : {}),
    executionPolicy: {
      workspaceEffectKind: "read_only",
      isAutoConcurrent: false,
      isAutoApprovedReadOnly: false,
      clearsSameTurnReadCoverageBeforeExecution: false,
    },
    approvalPolicy: {
      approvalPolicyKind: "requires_user_approval",
      riskExplanation: "Workspace summary is manually approved in tests.",
    },
    executor: async () => ({
      outcomeKind: "completed",
      toolResultText: "Workspace summary complete.",
    }),
  };
}

function resolveDefaultUnderstandPrimaryAgent(): PrimaryAssistantAgentDefinition {
  const primaryAgent = DEFAULT_PRIMARY_ASSISTANT_AGENT_DEFINITIONS.find((candidatePrimaryAgent) =>
    candidatePrimaryAgent.agentName === "understand"
  );
  if (!primaryAgent) {
    throw new Error("Default understand primary agent was not registered.");
  }

  return primaryAgent;
}

function resolveDefaultExploreSubagent(): SubagentDefinition {
  const subagent = DEFAULT_ASSISTANT_SUBAGENT_DEFINITIONS.find((candidateSubagent) =>
    candidateSubagent.subagentName === "explore"
  );
  if (!subagent) {
    throw new Error("Default explore subagent was not registered.");
  }

  return subagent;
}
