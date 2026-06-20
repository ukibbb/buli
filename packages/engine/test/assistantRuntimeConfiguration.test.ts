import { expect, test } from "bun:test";
import type { ProviderBuiltInToolDescriptionOverlay, ProviderToolDefinition } from "@buli/contracts";
import {
  createAssistantRuntimeConfiguration,
  EMPTY_ASSISTANT_PROVIDER_MODEL_PROMPT_FRAGMENTS,
  resolveDefaultAssistantProviderModelPromptProfile,
  type AssistantProviderModelPromptProfileResolver,
  type BuiltInToolDescriptionOverlayResolver,
  type CustomAssistantToolDefinition,
  type PrimaryAssistantAgentCompositionResolver,
  type PrimaryAssistantAgentDefinition,
  type SubagentDefinition,
  type TaskSubagentCompositionResolver,
} from "../src/index.ts";

const workspaceStatusToolName = "workspace_status";

function createWorkspaceStatusProviderDefinition(): ProviderToolDefinition {
  return {
    toolName: workspaceStatusToolName,
    description: "Summarize the workspace status.",
    parameters: {
      type: "object",
      properties: {
        includeRisks: {
          type: "boolean",
          description: "Whether to include known risks.",
        },
      },
      required: ["includeRisks"],
      additionalProperties: false,
    },
  };
}

function createWorkspaceStatusCustomToolDefinition(input: {
  resolveProviderToolDefinitionForTurn?: CustomAssistantToolDefinition["resolveProviderToolDefinitionForTurn"];
} = {}): CustomAssistantToolDefinition {
  return {
    toolName: workspaceStatusToolName,
    providerToolDefinition: createWorkspaceStatusProviderDefinition(),
    ...(input.resolveProviderToolDefinitionForTurn
      ? { resolveProviderToolDefinitionForTurn: input.resolveProviderToolDefinitionForTurn }
      : {}),
    executionPolicy: {
      workspaceEffectKind: "read_only",
      isAutoConcurrent: false,
      isAutoApprovedReadOnly: false,
      clearsSameTurnReadCoverageBeforeExecution: false,
    },
    executor: async () => ({
      outcomeKind: "completed",
      toolResultText: "Workspace status is available.",
    }),
  };
}

function createWorkspaceStatusPrimaryAgentDefinition(): PrimaryAssistantAgentDefinition {
  return {
    agentName: "status",
    displayName: "Status Agent",
    shortLabel: "Status",
    description: "Reviews the current workspace status.",
    accentColorName: "cyan",
    isReadOnly: true,
    availableToolNames: [workspaceStatusToolName],
    systemPromptConfiguration: {
      promptConfigurationKind: "custom",
      systemReminderText: "Use the workspace status tool when status is requested.",
    },
  };
}

function createWorkspaceStatusSubagentDefinition(): SubagentDefinition {
  return {
    subagentName: "status_explorer",
    displayName: "Status Explorer",
    availableToolNames: ["read"],
    systemPromptConfiguration: {
      promptConfigurationKind: "custom",
      systemPromptText: "Inspect workspace status evidence.",
    },
    conversationSessionAssistantOperatingMode: "understand",
  };
}

test("assistant runtime configuration exposes default registries as ready-to-spread runtime input", () => {
  const assistantRuntimeConfiguration = createAssistantRuntimeConfiguration();

  expect(assistantRuntimeConfiguration.assistantAgentRegistry.resolvePrimaryAgentDefinition("understand").agentName).toBe(
    "understand",
  );
  expect(assistantRuntimeConfiguration.assistantToolRegistry.resolveToolDefinition("read").toolName).toBe("read");
  expect(assistantRuntimeConfiguration.assistantRuntimeInput.assistantAgentRegistry).toBe(
    assistantRuntimeConfiguration.assistantAgentRegistry,
  );
  expect(assistantRuntimeConfiguration.assistantRuntimeInput.assistantToolRegistry).toBe(
    assistantRuntimeConfiguration.assistantToolRegistry,
  );
  expect(Object.keys(assistantRuntimeConfiguration.assistantRuntimeInput).sort()).toEqual([
    "assistantAgentRegistry",
    "assistantToolRegistry",
  ]);
});

test("assistant runtime configuration registers additional primary agents, subagents, and custom tools", () => {
  const customPrimaryAgentDefinition = createWorkspaceStatusPrimaryAgentDefinition();
  const customSubagentDefinition = createWorkspaceStatusSubagentDefinition();
  const customToolDefinition = createWorkspaceStatusCustomToolDefinition();

  const assistantRuntimeConfiguration = createAssistantRuntimeConfiguration({
    additionalPrimaryAgents: [customPrimaryAgentDefinition],
    additionalSubagents: [customSubagentDefinition],
    additionalCustomTools: [customToolDefinition],
  });

  expect(assistantRuntimeConfiguration.assistantAgentRegistry.resolvePrimaryAgentDefinition("status")).toBe(
    customPrimaryAgentDefinition,
  );
  expect(assistantRuntimeConfiguration.assistantAgentRegistry.resolveSubagentDefinition("status_explorer")).toBe(
    customSubagentDefinition,
  );
  expect(assistantRuntimeConfiguration.assistantToolRegistry.resolveCustomToolDefinition(workspaceStatusToolName)).toBe(
    customToolDefinition,
  );
});

test("assistant runtime configuration preserves direct resolver inputs when no model overlays are supplied", () => {
  const assistantProviderModelPromptProfileResolver: AssistantProviderModelPromptProfileResolver = (resolverInput) => ({
    profileId: `test-profile:${resolverInput.providerName}:${resolverInput.selectedModelId}`,
    providerName: resolverInput.providerName,
    selectedModelId: resolverInput.selectedModelId,
    promptFragments: EMPTY_ASSISTANT_PROVIDER_MODEL_PROMPT_FRAGMENTS,
    stickyNotes: {
      maximumRelevantEvidenceNoteCount: 1,
      maximumPromptNoteTextCharacterCount: 2,
      maximumObservationTextCharacterCount: 3,
    },
    workflowHandoff: {
      renderingDetail: "compact",
      maximumListItemCount: 4,
      maximumTextCharacterCount: 5,
    },
  });
  const primaryAssistantAgentCompositionResolver: PrimaryAssistantAgentCompositionResolver = (resolverInput) => ({
    primaryAssistantAgent: resolverInput.registeredPrimaryAssistantAgent,
    assistantProviderModelPromptProfile: assistantProviderModelPromptProfileResolver({
      providerName: resolverInput.providerName,
      selectedModelId: resolverInput.selectedModelId,
    }),
  });
  const taskSubagentCompositionResolver: TaskSubagentCompositionResolver = (resolverInput) => ({
    taskSubagent: resolverInput.registeredSubagent,
    assistantProviderModelPromptProfile: resolverInput.defaultTaskSubagentAssistantProviderModelPromptProfile,
  });
  const builtInToolDescriptionOverlayResolver: BuiltInToolDescriptionOverlayResolver = () => [
    {
      toolName: "read",
      additionalDescriptionParagraphs: ["Direct read tool paragraph."],
    },
  ];

  const assistantRuntimeConfiguration = createAssistantRuntimeConfiguration({
    assistantProviderModelPromptProfileResolver,
    primaryAssistantAgentCompositionResolver,
    taskSubagentCompositionResolver,
    builtInToolDescriptionOverlayResolver,
  });

  expect(assistantRuntimeConfiguration.assistantRuntimeInput.assistantProviderModelPromptProfileResolver).toBe(
    assistantProviderModelPromptProfileResolver,
  );
  expect(assistantRuntimeConfiguration.assistantRuntimeInput.primaryAssistantAgentCompositionResolver).toBe(
    primaryAssistantAgentCompositionResolver,
  );
  expect(assistantRuntimeConfiguration.assistantRuntimeInput.taskSubagentCompositionResolver).toBe(
    taskSubagentCompositionResolver,
  );
  expect(assistantRuntimeConfiguration.assistantRuntimeInput.builtInToolDescriptionOverlayResolver).toBe(
    builtInToolDescriptionOverlayResolver,
  );
});

test("assistant runtime configuration composes model overlays on top of a supplied prompt-profile resolver", () => {
  const assistantProviderModelPromptProfileResolver: AssistantProviderModelPromptProfileResolver = (resolverInput) => ({
    profileId: `custom-profile:${resolverInput.providerName}:${resolverInput.selectedModelId}`,
    providerName: resolverInput.providerName,
    selectedModelId: resolverInput.selectedModelId,
    promptFragments: EMPTY_ASSISTANT_PROVIDER_MODEL_PROMPT_FRAGMENTS,
    stickyNotes: {
      maximumRelevantEvidenceNoteCount: 1,
      maximumPromptNoteTextCharacterCount: 2,
      maximumObservationTextCharacterCount: 3,
    },
    workflowHandoff: {
      renderingDetail: "compact",
      maximumListItemCount: 4,
      maximumTextCharacterCount: 5,
    },
  });
  const assistantRuntimeConfiguration = createAssistantRuntimeConfiguration({
    assistantProviderModelPromptProfileResolver,
    modelOverlays: [
      {
        overlayName: "small-local-model",
        matchesTurn: (matcherInput) => matcherInput.selectedModelId === "small-local-model",
        primaryAgentOverlays: [
          {
            agentName: "understand",
            promptFragments: {
              primaryAssistantSystemPrompt: ["Overlay prompt fragment."],
            },
          },
        ],
      },
    ],
  });

  const registeredUnderstandAgent = assistantRuntimeConfiguration.assistantAgentRegistry.resolvePrimaryAgentDefinition(
    "understand",
  );
  const primaryAssistantAgentComposition = assistantRuntimeConfiguration.assistantRuntimeInput
    .primaryAssistantAgentCompositionResolver?.({
      registeredPrimaryAssistantAgent: registeredUnderstandAgent,
      providerName: "openai",
      selectedModelId: "small-local-model",
    });

  expect(primaryAssistantAgentComposition?.assistantProviderModelPromptProfile.profileId).toBe(
    "custom-profile:openai:small-local-model",
  );
  expect(primaryAssistantAgentComposition?.assistantProviderModelPromptProfile.promptFragments.primaryAssistantSystemPrompt)
    .toEqual(["Overlay prompt fragment."]);
});

test("assistant runtime configuration composes model overlays and wraps custom tools without mutating base definitions", () => {
  const baseProviderDefinitionDescriptions: string[] = [];
  const baseCustomToolDefinition = createWorkspaceStatusCustomToolDefinition({
    resolveProviderToolDefinitionForTurn: (resolverInput) => {
      baseProviderDefinitionDescriptions.push(resolverInput.defaultProviderToolDefinition.description);
      return {
        ...resolverInput.defaultProviderToolDefinition,
        description: `${resolverInput.defaultProviderToolDefinition.description}\n\nBase resolver paragraph.`,
      };
    },
  });
  const baselineBuiltInToolDescriptionOverlayResolver: BuiltInToolDescriptionOverlayResolver = (): readonly ProviderBuiltInToolDescriptionOverlay[] => [
    {
      toolName: "read",
      additionalDescriptionParagraphs: ["Baseline read paragraph."],
    },
  ];

  const assistantRuntimeConfiguration = createAssistantRuntimeConfiguration({
    additionalCustomTools: [baseCustomToolDefinition],
    builtInToolDescriptionOverlayResolver: baselineBuiltInToolDescriptionOverlayResolver,
    modelOverlays: [
      {
        overlayName: "small-local-model",
        matchesTurn: (matcherInput) => matcherInput.selectedModelId === "small-local-model",
        primaryAgentOverlays: [
          {
            agentName: "understand",
            additionalPromptSections: ["Small model understand prompt section."],
            availableToolNames: ["read", workspaceStatusToolName],
            promptFragments: {
              primaryAssistantSystemPrompt: ["Small model prompt fragment."],
            },
          },
        ],
        customToolProviderDefinitionOverlays: [
          {
            toolName: workspaceStatusToolName,
            additionalDescriptionParagraphs: ["Model overlay paragraph."],
          },
        ],
        builtInToolDescriptionOverlays: [
          {
            toolName: "read",
            additionalDescriptionParagraphs: ["Model read paragraph."],
          },
        ],
      },
    ],
  });

  const registeredUnderstandAgent = assistantRuntimeConfiguration.assistantAgentRegistry.resolvePrimaryAgentDefinition(
    "understand",
  );
  const primaryAssistantAgentComposition = assistantRuntimeConfiguration.assistantRuntimeInput
    .primaryAssistantAgentCompositionResolver?.({
      registeredPrimaryAssistantAgent: registeredUnderstandAgent,
      providerName: "openai",
      selectedModelId: "small-local-model",
    });
  const [resolvedCustomToolProviderDefinition] = assistantRuntimeConfiguration.assistantToolRegistry
    .resolveProviderToolDefinitionsForTurn({
      availableToolNames: [workspaceStatusToolName],
      turnContext: {
        providerName: "openai",
        selectedModelId: "small-local-model",
        assistantTurnKind: "primary_assistant_agent",
        assistantAgentName: "understand",
      },
    });
  const builtInToolDescriptionOverlays = assistantRuntimeConfiguration.assistantRuntimeInput
    .builtInToolDescriptionOverlayResolver?.({
      providerName: "openai",
      selectedModelId: "small-local-model",
      assistantTurnKind: "primary_assistant_agent",
      assistantAgentName: "understand",
      availableToolNames: ["read"],
    });

  const registeredCustomToolDefinition = assistantRuntimeConfiguration.assistantToolRegistry.resolveCustomToolDefinition(
    workspaceStatusToolName,
  );
  expect(registeredCustomToolDefinition).not.toBe(baseCustomToolDefinition);
  expect(registeredCustomToolDefinition.toolName).toBe(baseCustomToolDefinition.toolName);
  expect(registeredCustomToolDefinition.providerToolDefinition).toBe(baseCustomToolDefinition.providerToolDefinition);
  expect(registeredCustomToolDefinition.executionPolicy).toBe(baseCustomToolDefinition.executionPolicy);
  expect(registeredCustomToolDefinition.executor).toBe(baseCustomToolDefinition.executor);
  expect(baseProviderDefinitionDescriptions).toEqual(["Summarize the workspace status."]);
  expect(resolvedCustomToolProviderDefinition).toEqual({
    ...baseCustomToolDefinition.providerToolDefinition,
    description: "Summarize the workspace status.\n\nBase resolver paragraph.\n\nModel overlay paragraph.",
  });
  expect(baseCustomToolDefinition.providerToolDefinition.description).toBe("Summarize the workspace status.");
  expect(primaryAssistantAgentComposition?.primaryAssistantAgent.systemPromptConfiguration.additionalPromptSections).toEqual([
    "Small model understand prompt section.",
  ]);
  expect(primaryAssistantAgentComposition?.primaryAssistantAgent.availableToolNames).toEqual([
    "read",
    workspaceStatusToolName,
  ]);
  expect(primaryAssistantAgentComposition?.assistantProviderModelPromptProfile.promptFragments.primaryAssistantSystemPrompt)
    .toEqual(["Small model prompt fragment."]);
  expect(builtInToolDescriptionOverlays).toEqual([
    {
      toolName: "read",
      additionalDescriptionParagraphs: ["Baseline read paragraph."],
    },
    {
      toolName: "read",
      additionalDescriptionParagraphs: ["Model read paragraph."],
    },
  ]);
});

test("assistant runtime configuration keeps custom tool definitions unwrapped when no model overlays are supplied", () => {
  const customToolDefinition = createWorkspaceStatusCustomToolDefinition();

  const assistantRuntimeConfiguration = createAssistantRuntimeConfiguration({
    additionalCustomTools: [customToolDefinition],
  });

  expect(assistantRuntimeConfiguration.assistantToolRegistry.resolveCustomToolDefinition(workspaceStatusToolName)).toBe(
    customToolDefinition,
  );
});

test("assistant runtime configuration treats an empty model overlay list as no overlay configuration", () => {
  const customToolDefinition = createWorkspaceStatusCustomToolDefinition();

  const assistantRuntimeConfiguration = createAssistantRuntimeConfiguration({
    additionalCustomTools: [customToolDefinition],
    modelOverlays: [],
  });

  expect(assistantRuntimeConfiguration.assistantToolRegistry.resolveCustomToolDefinition(workspaceStatusToolName)).toBe(
    customToolDefinition,
  );
  expect(Object.keys(assistantRuntimeConfiguration.assistantRuntimeInput).sort()).toEqual([
    "assistantAgentRegistry",
    "assistantToolRegistry",
  ]);
});

test("assistant runtime configuration composes model overlays on top of custom baseline primary and subagent resolvers", () => {
  const baselinePrimaryAssistantAgentCompositionResolver: PrimaryAssistantAgentCompositionResolver = (resolverInput) => ({
    primaryAssistantAgent: {
      ...resolverInput.registeredPrimaryAssistantAgent,
      systemPromptConfiguration: {
        ...resolverInput.registeredPrimaryAssistantAgent.systemPromptConfiguration,
        additionalPromptSections: ["Baseline primary prompt section."],
      },
    },
    assistantProviderModelPromptProfile: resolveDefaultAssistantProviderModelPromptProfile({
      providerName: resolverInput.providerName,
      selectedModelId: resolverInput.selectedModelId,
    }),
  });
  const baselineTaskSubagentCompositionResolver: TaskSubagentCompositionResolver = (resolverInput) => ({
    taskSubagent: {
      ...resolverInput.registeredSubagent,
      systemPromptConfiguration: {
        ...resolverInput.registeredSubagent.systemPromptConfiguration,
        additionalPromptSections: ["Baseline subagent prompt section."],
      },
    },
    assistantProviderModelPromptProfile: resolverInput.defaultTaskSubagentAssistantProviderModelPromptProfile,
  });

  const assistantRuntimeConfiguration = createAssistantRuntimeConfiguration({
    primaryAssistantAgentCompositionResolver: baselinePrimaryAssistantAgentCompositionResolver,
    taskSubagentCompositionResolver: baselineTaskSubagentCompositionResolver,
    modelOverlays: [
      {
        overlayName: "small-local-model",
        matchesTurn: (matcherInput) => matcherInput.selectedModelId === "small-local-model",
        primaryAgentOverlays: [
          {
            agentName: "understand",
            additionalPromptSections: ["Overlay primary prompt section."],
          },
        ],
        taskSubagentOverlays: [
          {
            subagentName: "explore",
            additionalPromptSections: ["Overlay subagent prompt section."],
          },
        ],
      },
    ],
  });

  const registeredUnderstandAgent = assistantRuntimeConfiguration.assistantAgentRegistry.resolvePrimaryAgentDefinition(
    "understand",
  );
  const registeredExploreSubagent = assistantRuntimeConfiguration.assistantAgentRegistry.resolveSubagentDefinition("explore");
  const defaultTaskSubagentAssistantProviderModelPromptProfile = resolveDefaultAssistantProviderModelPromptProfile({
    providerName: "openai",
    selectedModelId: "small-local-model",
  });

  const primaryAssistantAgentComposition = assistantRuntimeConfiguration.assistantRuntimeInput
    .primaryAssistantAgentCompositionResolver?.({
      registeredPrimaryAssistantAgent: registeredUnderstandAgent,
      providerName: "openai",
      selectedModelId: "small-local-model",
    });
  const taskSubagentComposition = assistantRuntimeConfiguration.assistantRuntimeInput.taskSubagentCompositionResolver?.({
    registeredSubagent: registeredExploreSubagent,
    parentPrimaryAssistantAgent: registeredUnderstandAgent,
    providerName: "openai",
    parentSelectedModelId: "small-local-model",
    taskSubagentProviderModelSelection: {
      taskSubagentSelectedModelId: "small-local-model",
      taskSubagentSelectedReasoningEffort: "low",
      modelSelectionReason: "policy_model_override",
      reasoningEffortSelectionReason: "clamped_to_policy_maximum",
    },
    defaultTaskSubagentAssistantProviderModelPromptProfile,
  });

  expect(primaryAssistantAgentComposition?.primaryAssistantAgent.systemPromptConfiguration.additionalPromptSections).toEqual([
    "Baseline primary prompt section.",
    "Overlay primary prompt section.",
  ]);
  expect(taskSubagentComposition?.taskSubagent.systemPromptConfiguration.additionalPromptSections).toEqual([
    "Baseline subagent prompt section.",
    "Overlay subagent prompt section.",
  ]);
});
