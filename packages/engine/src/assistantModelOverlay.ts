import type {
  AssistantToolRequestName,
  ProviderAvailableToolName,
  ProviderBuiltInToolDescriptionOverlay,
  ReasoningEffort,
} from "@buli/contracts";
import type { PrimaryAssistantAgentDefinition, SubagentDefinition } from "./assistantAgentRegistry.ts";
import {
  appendAssistantProviderModelPromptFragments,
  type AssistantProviderModelPromptFragmentsToAppend,
  type AssistantProviderName,
} from "./assistantProviderModelPromptProfile.ts";
import {
  appendPrimaryAssistantAgentPromptSections,
  createModelAwarePrimaryAssistantAgentCompositionResolver,
  type PrimaryAssistantAgentCompositionResolver,
} from "./assistantPrimaryAgentComposition.ts";
import {
  appendSubagentPromptSections,
  createModelAwareTaskSubagentCompositionResolver,
  type TaskSubagentCompositionResolver,
} from "./assistantSubagentComposition.ts";
import {
  appendProviderToolDefinitionDescription,
  type CustomAssistantToolDefinition,
  type CustomAssistantToolProviderDefinitionResolver,
  type CustomAssistantToolProviderDefinitionTurnKind,
} from "./assistantToolRegistry.ts";

export type AssistantModelOverlayTurnMatcherInput = Readonly<{
  providerName: AssistantProviderName;
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort | undefined;
  assistantTurnKind: CustomAssistantToolProviderDefinitionTurnKind;
  assistantAgentName: string;
}>;

export type AssistantModelOverlayTurnMatcher = (input: AssistantModelOverlayTurnMatcherInput) => boolean;

export type AssistantModelOverlayPrimaryAgentEntry = Readonly<{
  agentName: PrimaryAssistantAgentDefinition["agentName"];
  additionalPromptSections?: readonly string[] | undefined;
  availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
  promptFragments?: AssistantProviderModelPromptFragmentsToAppend | undefined;
}>;

export type AssistantModelOverlayTaskSubagentEntry = Readonly<{
  subagentName: SubagentDefinition["subagentName"];
  additionalPromptSections?: readonly string[] | undefined;
  availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
  promptFragments?: AssistantProviderModelPromptFragmentsToAppend | undefined;
}>;

export type AssistantModelOverlayCustomToolProviderDefinitionEntry = Readonly<{
  toolName: string;
  additionalDescriptionParagraphs?: readonly string[] | undefined;
}>;

export type AssistantModelOverlayBuiltInToolDescriptionEntry = Readonly<{
  toolName: AssistantToolRequestName;
  additionalDescriptionParagraphs?: readonly string[] | undefined;
}>;

export type ResolveBuiltInToolDescriptionOverlaysForTurnInput = Readonly<{
  providerName: AssistantProviderName;
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort | undefined;
  assistantTurnKind: CustomAssistantToolProviderDefinitionTurnKind;
  assistantAgentName: string;
  availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
}>;

export type BuiltInToolDescriptionOverlayResolver = (
  input: ResolveBuiltInToolDescriptionOverlaysForTurnInput,
) => readonly ProviderBuiltInToolDescriptionOverlay[];

export type AssistantModelOverlay = Readonly<{
  overlayName: string;
  matchesTurn: AssistantModelOverlayTurnMatcher;
  primaryAgentOverlays?: readonly AssistantModelOverlayPrimaryAgentEntry[] | undefined;
  taskSubagentOverlays?: readonly AssistantModelOverlayTaskSubagentEntry[] | undefined;
  customToolProviderDefinitionOverlays?: readonly AssistantModelOverlayCustomToolProviderDefinitionEntry[] | undefined;
  builtInToolDescriptionOverlays?: readonly AssistantModelOverlayBuiltInToolDescriptionEntry[] | undefined;
}>;

export type CreateAssistantModelOverlayResolversInput = Readonly<{
  modelOverlays: readonly AssistantModelOverlay[];
  baselinePrimaryAssistantAgentCompositionResolver?: PrimaryAssistantAgentCompositionResolver | undefined;
  baselineTaskSubagentCompositionResolver?: TaskSubagentCompositionResolver | undefined;
}>;

export type AssistantModelOverlayRuntimeResolverInput = Readonly<{
  primaryAssistantAgentCompositionResolver: PrimaryAssistantAgentCompositionResolver;
  taskSubagentCompositionResolver: TaskSubagentCompositionResolver;
  builtInToolDescriptionOverlayResolver: BuiltInToolDescriptionOverlayResolver;
}>;

export type AssistantModelOverlayResolvers = Readonly<{
  primaryAssistantAgentCompositionResolver: PrimaryAssistantAgentCompositionResolver;
  taskSubagentCompositionResolver: TaskSubagentCompositionResolver;
  customAssistantToolProviderDefinitionResolver: CustomAssistantToolProviderDefinitionResolver;
  builtInToolDescriptionOverlayResolver: BuiltInToolDescriptionOverlayResolver;
  assistantRuntimeResolverInput: AssistantModelOverlayRuntimeResolverInput;
}>;

export type ApplyAssistantModelOverlayResolverToCustomToolDefinitionInput = Readonly<{
  customToolDefinition: CustomAssistantToolDefinition;
  customAssistantToolProviderDefinitionResolver: CustomAssistantToolProviderDefinitionResolver;
}>;

export function createDefaultBuiltInToolDescriptionOverlayResolver(): BuiltInToolDescriptionOverlayResolver {
  return () => [];
}

export function createAssistantModelOverlayResolvers(
  input: CreateAssistantModelOverlayResolversInput,
): AssistantModelOverlayResolvers {
  const primaryAssistantAgentCompositionResolver = createModelAwarePrimaryAssistantAgentCompositionResolver({
    ...(input.baselinePrimaryAssistantAgentCompositionResolver
      ? { baselinePrimaryAssistantAgentCompositionResolver: input.baselinePrimaryAssistantAgentCompositionResolver }
      : {}),
    composePrimaryAssistantAgentForModel: (compositionInput) => {
      const matchingPrimaryAgentOverlays = listMatchingPrimaryAgentOverlays({
        modelOverlays: input.modelOverlays,
        matcherInput: {
          providerName: compositionInput.providerName,
          selectedModelId: compositionInput.selectedModelId,
          selectedReasoningEffort: compositionInput.selectedReasoningEffort,
          assistantTurnKind: "primary_assistant_agent",
          assistantAgentName: compositionInput.defaultPrimaryAssistantAgent.agentName,
        },
        agentName: compositionInput.defaultPrimaryAssistantAgent.agentName,
      });

      if (matchingPrimaryAgentOverlays.length === 0) {
        return undefined;
      }

      let effectivePrimaryAssistantAgent = compositionInput.defaultPrimaryAssistantAgent;
      let effectiveAssistantProviderModelPromptProfile = compositionInput.defaultAssistantProviderModelPromptProfile;
      for (const primaryAgentOverlay of matchingPrimaryAgentOverlays) {
        effectivePrimaryAssistantAgent = applyPrimaryAgentOverlay({
          primaryAssistantAgent: effectivePrimaryAssistantAgent,
          primaryAgentOverlay,
        });
        if (primaryAgentOverlay.promptFragments) {
          effectiveAssistantProviderModelPromptProfile = appendAssistantProviderModelPromptFragments({
            assistantProviderModelPromptProfile: effectiveAssistantProviderModelPromptProfile,
            promptFragments: primaryAgentOverlay.promptFragments,
          });
        }
      }

      return {
        primaryAssistantAgent: effectivePrimaryAssistantAgent,
        assistantProviderModelPromptProfile: effectiveAssistantProviderModelPromptProfile,
      };
    },
  });

  const taskSubagentCompositionResolver = createModelAwareTaskSubagentCompositionResolver({
    ...(input.baselineTaskSubagentCompositionResolver
      ? { baselineTaskSubagentCompositionResolver: input.baselineTaskSubagentCompositionResolver }
      : {}),
    composeTaskSubagentForModel: (compositionInput) => {
      const matchingTaskSubagentOverlays = listMatchingTaskSubagentOverlays({
        modelOverlays: input.modelOverlays,
        matcherInput: {
          providerName: compositionInput.providerName,
          selectedModelId: compositionInput.taskSubagentProviderModelSelection.taskSubagentSelectedModelId,
          selectedReasoningEffort: compositionInput.taskSubagentProviderModelSelection.taskSubagentSelectedReasoningEffort,
          assistantTurnKind: "task_subagent",
          assistantAgentName: compositionInput.defaultTaskSubagent.subagentName,
        },
        subagentName: compositionInput.defaultTaskSubagent.subagentName,
      });

      if (matchingTaskSubagentOverlays.length === 0) {
        return undefined;
      }

      let effectiveTaskSubagent = compositionInput.defaultTaskSubagent;
      let effectiveAssistantProviderModelPromptProfile =
        compositionInput.defaultTaskSubagentAssistantProviderModelPromptProfile;
      for (const taskSubagentOverlay of matchingTaskSubagentOverlays) {
        effectiveTaskSubagent = applyTaskSubagentOverlay({
          taskSubagent: effectiveTaskSubagent,
          taskSubagentOverlay,
        });
        if (taskSubagentOverlay.promptFragments) {
          effectiveAssistantProviderModelPromptProfile = appendAssistantProviderModelPromptFragments({
            assistantProviderModelPromptProfile: effectiveAssistantProviderModelPromptProfile,
            promptFragments: taskSubagentOverlay.promptFragments,
          });
        }
      }

      return {
        taskSubagent: effectiveTaskSubagent,
        assistantProviderModelPromptProfile: effectiveAssistantProviderModelPromptProfile,
      };
    },
  });

  const customAssistantToolProviderDefinitionResolver: CustomAssistantToolProviderDefinitionResolver = (resolverInput) => {
    const matchingCustomToolProviderDefinitionOverlays = listMatchingCustomToolProviderDefinitionOverlays({
      modelOverlays: input.modelOverlays,
      matcherInput: {
        providerName: resolverInput.providerName,
        selectedModelId: resolverInput.selectedModelId,
        selectedReasoningEffort: resolverInput.selectedReasoningEffort,
        assistantTurnKind: resolverInput.assistantTurnKind,
        assistantAgentName: resolverInput.assistantAgentName,
      },
      toolName: resolverInput.toolName,
    });

    let effectiveProviderToolDefinition = resolverInput.defaultProviderToolDefinition;
    for (const customToolProviderDefinitionOverlay of matchingCustomToolProviderDefinitionOverlays) {
      effectiveProviderToolDefinition = appendProviderToolDefinitionDescription({
        providerToolDefinition: effectiveProviderToolDefinition,
        additionalDescriptionParagraphs: customToolProviderDefinitionOverlay.additionalDescriptionParagraphs ?? [],
      });
    }

    return effectiveProviderToolDefinition;
  };

  const builtInToolDescriptionOverlayResolver: BuiltInToolDescriptionOverlayResolver = (resolverInput) => {
    const matchingBuiltInToolDescriptionOverlays = listMatchingBuiltInToolDescriptionOverlays({
      modelOverlays: input.modelOverlays,
      matcherInput: {
        providerName: resolverInput.providerName,
        selectedModelId: resolverInput.selectedModelId,
        selectedReasoningEffort: resolverInput.selectedReasoningEffort,
        assistantTurnKind: resolverInput.assistantTurnKind,
        assistantAgentName: resolverInput.assistantAgentName,
      },
      availableToolNames: resolverInput.availableToolNames,
    });

    return matchingBuiltInToolDescriptionOverlays.flatMap((builtInToolDescriptionOverlay) => {
      const additionalDescriptionParagraphs = builtInToolDescriptionOverlay.additionalDescriptionParagraphs ?? [];
      return additionalDescriptionParagraphs.length > 0
        ? [{ toolName: builtInToolDescriptionOverlay.toolName, additionalDescriptionParagraphs: [...additionalDescriptionParagraphs] }]
        : [];
    });
  };

  return {
    primaryAssistantAgentCompositionResolver,
    taskSubagentCompositionResolver,
    customAssistantToolProviderDefinitionResolver,
    builtInToolDescriptionOverlayResolver,
    assistantRuntimeResolverInput: {
      primaryAssistantAgentCompositionResolver,
      taskSubagentCompositionResolver,
      builtInToolDescriptionOverlayResolver,
    },
  };
}

export function applyAssistantModelOverlayResolverToCustomToolDefinition(
  input: ApplyAssistantModelOverlayResolverToCustomToolDefinitionInput,
): CustomAssistantToolDefinition {
  const baselineCustomToolProviderDefinitionResolver = input.customToolDefinition.resolveProviderToolDefinitionForTurn;

  return {
    ...input.customToolDefinition,
    resolveProviderToolDefinitionForTurn: (resolverInput) => {
      const baselineProviderToolDefinition = baselineCustomToolProviderDefinitionResolver?.(resolverInput) ??
        resolverInput.defaultProviderToolDefinition;

      return input.customAssistantToolProviderDefinitionResolver({
        ...resolverInput,
        defaultProviderToolDefinition: baselineProviderToolDefinition,
      });
    },
  };
}

function listMatchingPrimaryAgentOverlays(input: {
  modelOverlays: readonly AssistantModelOverlay[];
  matcherInput: AssistantModelOverlayTurnMatcherInput;
  agentName: PrimaryAssistantAgentDefinition["agentName"];
}): readonly AssistantModelOverlayPrimaryAgentEntry[] {
  return input.modelOverlays.flatMap((modelOverlay) => {
    if (!modelOverlay.matchesTurn(input.matcherInput)) {
      return [];
    }

    return (modelOverlay.primaryAgentOverlays ?? []).filter((primaryAgentOverlay) =>
      primaryAgentOverlay.agentName === input.agentName
    );
  });
}

function listMatchingTaskSubagentOverlays(input: {
  modelOverlays: readonly AssistantModelOverlay[];
  matcherInput: AssistantModelOverlayTurnMatcherInput;
  subagentName: SubagentDefinition["subagentName"];
}): readonly AssistantModelOverlayTaskSubagentEntry[] {
  return input.modelOverlays.flatMap((modelOverlay) => {
    if (!modelOverlay.matchesTurn(input.matcherInput)) {
      return [];
    }

    return (modelOverlay.taskSubagentOverlays ?? []).filter((taskSubagentOverlay) =>
      taskSubagentOverlay.subagentName === input.subagentName
    );
  });
}

function listMatchingCustomToolProviderDefinitionOverlays(input: {
  modelOverlays: readonly AssistantModelOverlay[];
  matcherInput: AssistantModelOverlayTurnMatcherInput;
  toolName: string;
}): readonly AssistantModelOverlayCustomToolProviderDefinitionEntry[] {
  return input.modelOverlays.flatMap((modelOverlay) => {
    if (!modelOverlay.matchesTurn(input.matcherInput)) {
      return [];
    }

    return (modelOverlay.customToolProviderDefinitionOverlays ?? []).filter((customToolProviderDefinitionOverlay) =>
      customToolProviderDefinitionOverlay.toolName === input.toolName
    );
  });
}

function listMatchingBuiltInToolDescriptionOverlays(input: {
  modelOverlays: readonly AssistantModelOverlay[];
  matcherInput: AssistantModelOverlayTurnMatcherInput;
  availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
}): readonly AssistantModelOverlayBuiltInToolDescriptionEntry[] {
  const availableToolNameSet = input.availableToolNames
    ? new Set<ProviderAvailableToolName>(input.availableToolNames)
    : undefined;
  return input.modelOverlays.flatMap((modelOverlay) => {
    if (!modelOverlay.matchesTurn(input.matcherInput)) {
      return [];
    }

    return (modelOverlay.builtInToolDescriptionOverlays ?? []).filter((builtInToolDescriptionOverlay) =>
      availableToolNameSet === undefined || availableToolNameSet.has(builtInToolDescriptionOverlay.toolName)
    );
  });
}

function applyPrimaryAgentOverlay(input: {
  primaryAssistantAgent: PrimaryAssistantAgentDefinition;
  primaryAgentOverlay: AssistantModelOverlayPrimaryAgentEntry;
}): PrimaryAssistantAgentDefinition {
  const promptAugmentedPrimaryAssistantAgent = appendPrimaryAssistantAgentPromptSections({
    primaryAssistantAgent: input.primaryAssistantAgent,
    additionalPromptSections: input.primaryAgentOverlay.additionalPromptSections ?? [],
  });

  if (!input.primaryAgentOverlay.availableToolNames) {
    return promptAugmentedPrimaryAssistantAgent;
  }

  return {
    ...promptAugmentedPrimaryAssistantAgent,
    availableToolNames: input.primaryAgentOverlay.availableToolNames,
  };
}

function applyTaskSubagentOverlay(input: {
  taskSubagent: SubagentDefinition;
  taskSubagentOverlay: AssistantModelOverlayTaskSubagentEntry;
}): SubagentDefinition {
  const promptAugmentedTaskSubagent = appendSubagentPromptSections({
    subagent: input.taskSubagent,
    additionalPromptSections: input.taskSubagentOverlay.additionalPromptSections ?? [],
  });

  if (!input.taskSubagentOverlay.availableToolNames) {
    return promptAugmentedTaskSubagent;
  }

  return {
    ...promptAugmentedTaskSubagent,
    availableToolNames: input.taskSubagentOverlay.availableToolNames,
  };
}
