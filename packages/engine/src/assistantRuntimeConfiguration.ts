import {
  createDefaultAssistantAgentRegistry,
  type AssistantAgentRegistry,
  type PrimaryAssistantAgentDefinition,
  type SubagentDefinition,
} from "./assistantAgentRegistry.ts";
import {
  applyAssistantModelOverlayResolverToCustomToolDefinition,
  createAssistantModelOverlayResolvers,
  type AssistantModelOverlay,
  type AssistantModelOverlayResolvers,
  type BuiltInToolDescriptionOverlayResolver,
} from "./assistantModelOverlay.ts";
import type { AssistantProviderModelPromptProfileResolver } from "./assistantProviderModelPromptProfile.ts";
import {
  createDefaultPrimaryAssistantAgentCompositionResolver,
  type PrimaryAssistantAgentCompositionResolver,
} from "./assistantPrimaryAgentComposition.ts";
import type { TaskSubagentCompositionResolver } from "./assistantSubagentComposition.ts";
import {
  createDefaultAssistantToolRegistry,
  type AssistantToolRegistry,
  type CustomAssistantToolDefinition,
} from "./assistantToolRegistry.ts";

export type AssistantRuntimeConfigurationInput = Readonly<{
  additionalPrimaryAgents?: readonly PrimaryAssistantAgentDefinition[] | undefined;
  additionalSubagents?: readonly SubagentDefinition[] | undefined;
  additionalCustomTools?: readonly CustomAssistantToolDefinition[] | undefined;
  assistantProviderModelPromptProfileResolver?: AssistantProviderModelPromptProfileResolver | undefined;
  primaryAssistantAgentCompositionResolver?: PrimaryAssistantAgentCompositionResolver | undefined;
  taskSubagentCompositionResolver?: TaskSubagentCompositionResolver | undefined;
  builtInToolDescriptionOverlayResolver?: BuiltInToolDescriptionOverlayResolver | undefined;
  modelOverlays?: readonly AssistantModelOverlay[] | undefined;
}>;

export type AssistantRuntimeConfigurationRuntimeInput = Readonly<{
  assistantAgentRegistry: AssistantAgentRegistry;
  assistantToolRegistry: AssistantToolRegistry;
  assistantProviderModelPromptProfileResolver?: AssistantProviderModelPromptProfileResolver | undefined;
  primaryAssistantAgentCompositionResolver?: PrimaryAssistantAgentCompositionResolver | undefined;
  taskSubagentCompositionResolver?: TaskSubagentCompositionResolver | undefined;
  builtInToolDescriptionOverlayResolver?: BuiltInToolDescriptionOverlayResolver | undefined;
}>;

export type AssistantRuntimeConfiguration = Readonly<{
  assistantAgentRegistry: AssistantAgentRegistry;
  assistantToolRegistry: AssistantToolRegistry;
  assistantModelOverlayResolvers?: AssistantModelOverlayResolvers | undefined;
  assistantRuntimeInput: AssistantRuntimeConfigurationRuntimeInput;
}>;

export function createAssistantRuntimeConfiguration(
  input: AssistantRuntimeConfigurationInput = {},
): AssistantRuntimeConfiguration {
  const hasModelOverlays = (input.modelOverlays?.length ?? 0) > 0;
  const baselinePrimaryAssistantAgentCompositionResolver = hasModelOverlays
    ? resolveBaselinePrimaryAssistantAgentCompositionResolver(input)
    : undefined;
  const assistantModelOverlayResolvers = hasModelOverlays
    ? createAssistantModelOverlayResolvers({
      modelOverlays: input.modelOverlays ?? [],
      ...(baselinePrimaryAssistantAgentCompositionResolver
        ? { baselinePrimaryAssistantAgentCompositionResolver }
        : {}),
      ...(input.taskSubagentCompositionResolver
        ? { baselineTaskSubagentCompositionResolver: input.taskSubagentCompositionResolver }
        : {}),
    })
    : undefined;
  const assistantAgentRegistry = createDefaultAssistantAgentRegistry({
    additionalPrimaryAgents: input.additionalPrimaryAgents,
    additionalSubagents: input.additionalSubagents,
  });
  const assistantToolRegistry = createDefaultAssistantToolRegistry({
    additionalCustomTools: resolveAdditionalCustomToolDefinitions({
      additionalCustomTools: input.additionalCustomTools,
      assistantModelOverlayResolvers,
    }),
  });
  const primaryAssistantAgentCompositionResolver = assistantModelOverlayResolvers?.primaryAssistantAgentCompositionResolver ??
    input.primaryAssistantAgentCompositionResolver;
  const taskSubagentCompositionResolver = assistantModelOverlayResolvers?.taskSubagentCompositionResolver ??
    input.taskSubagentCompositionResolver;
  const builtInToolDescriptionOverlayResolver = resolveBuiltInToolDescriptionOverlayResolver({
    baselineBuiltInToolDescriptionOverlayResolver: input.builtInToolDescriptionOverlayResolver,
    assistantModelOverlayResolvers,
  });
  const assistantRuntimeInput = {
    assistantAgentRegistry,
    assistantToolRegistry,
    ...(input.assistantProviderModelPromptProfileResolver
      ? { assistantProviderModelPromptProfileResolver: input.assistantProviderModelPromptProfileResolver }
      : {}),
    ...(primaryAssistantAgentCompositionResolver ? { primaryAssistantAgentCompositionResolver } : {}),
    ...(taskSubagentCompositionResolver ? { taskSubagentCompositionResolver } : {}),
    ...(builtInToolDescriptionOverlayResolver ? { builtInToolDescriptionOverlayResolver } : {}),
  } satisfies AssistantRuntimeConfigurationRuntimeInput;

  return {
    assistantAgentRegistry,
    assistantToolRegistry,
    ...(assistantModelOverlayResolvers ? { assistantModelOverlayResolvers } : {}),
    assistantRuntimeInput,
  };
}

function resolveBaselinePrimaryAssistantAgentCompositionResolver(
  input: AssistantRuntimeConfigurationInput,
): PrimaryAssistantAgentCompositionResolver | undefined {
  if (input.primaryAssistantAgentCompositionResolver) {
    return input.primaryAssistantAgentCompositionResolver;
  }

  if (input.assistantProviderModelPromptProfileResolver) {
    return createDefaultPrimaryAssistantAgentCompositionResolver({
      assistantProviderModelPromptProfileResolver: input.assistantProviderModelPromptProfileResolver,
    });
  }

  return undefined;
}

function resolveAdditionalCustomToolDefinitions(input: {
  additionalCustomTools?: readonly CustomAssistantToolDefinition[] | undefined;
  assistantModelOverlayResolvers?: AssistantModelOverlayResolvers | undefined;
}): readonly CustomAssistantToolDefinition[] | undefined {
  if (!input.additionalCustomTools) {
    return undefined;
  }

  const assistantModelOverlayResolvers = input.assistantModelOverlayResolvers;
  if (!assistantModelOverlayResolvers) {
    return input.additionalCustomTools;
  }

  return input.additionalCustomTools.map((customToolDefinition) =>
    applyAssistantModelOverlayResolverToCustomToolDefinition({
      customToolDefinition,
      customAssistantToolProviderDefinitionResolver: assistantModelOverlayResolvers.customAssistantToolProviderDefinitionResolver,
    })
  );
}

function resolveBuiltInToolDescriptionOverlayResolver(input: {
  baselineBuiltInToolDescriptionOverlayResolver?: BuiltInToolDescriptionOverlayResolver | undefined;
  assistantModelOverlayResolvers?: AssistantModelOverlayResolvers | undefined;
}): BuiltInToolDescriptionOverlayResolver | undefined {
  if (!input.assistantModelOverlayResolvers) {
    return input.baselineBuiltInToolDescriptionOverlayResolver;
  }

  const builtInToolDescriptionOverlayResolver = input.assistantModelOverlayResolvers.builtInToolDescriptionOverlayResolver;
  const baselineBuiltInToolDescriptionOverlayResolver = input.baselineBuiltInToolDescriptionOverlayResolver;
  if (!baselineBuiltInToolDescriptionOverlayResolver) {
    return builtInToolDescriptionOverlayResolver;
  }

  return (resolverInput) => [
    ...baselineBuiltInToolDescriptionOverlayResolver(resolverInput),
    ...builtInToolDescriptionOverlayResolver(resolverInput),
  ];
}
