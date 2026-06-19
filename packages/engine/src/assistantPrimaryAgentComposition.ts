import type { ReasoningEffort } from "@buli/contracts";
import type { PrimaryAssistantAgentDefinition } from "./assistantAgentRegistry.ts";
import {
  resolveDefaultAssistantProviderModelPromptProfile,
  type AssistantProviderModelPromptProfile,
  type AssistantProviderModelPromptProfileResolver,
  type AssistantProviderName,
} from "./assistantProviderModelPromptProfile.ts";

export type ResolvePrimaryAssistantAgentCompositionInput = Readonly<{
  registeredPrimaryAssistantAgent: PrimaryAssistantAgentDefinition;
  providerName: AssistantProviderName;
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort | undefined;
}>;

export type ResolvedPrimaryAssistantAgentComposition = Readonly<{
  primaryAssistantAgent: PrimaryAssistantAgentDefinition;
  assistantProviderModelPromptProfile: AssistantProviderModelPromptProfile;
}>;

export type PrimaryAssistantAgentCompositionResolver = (
  input: ResolvePrimaryAssistantAgentCompositionInput,
) => ResolvedPrimaryAssistantAgentComposition;

export type ComposePrimaryAssistantAgentForModelInput = ResolvePrimaryAssistantAgentCompositionInput & Readonly<{
  defaultPrimaryAssistantAgent: PrimaryAssistantAgentDefinition;
  defaultAssistantProviderModelPromptProfile: AssistantProviderModelPromptProfile;
}>;

export type ComposePrimaryAssistantAgentForModelResult = Readonly<{
  primaryAssistantAgent?: PrimaryAssistantAgentDefinition | undefined;
  assistantProviderModelPromptProfile?: AssistantProviderModelPromptProfile | undefined;
}>;

export type ComposePrimaryAssistantAgentForModel = (
  input: ComposePrimaryAssistantAgentForModelInput,
) => ComposePrimaryAssistantAgentForModelResult | undefined;

export function createDefaultPrimaryAssistantAgentCompositionResolver(input: {
  assistantProviderModelPromptProfileResolver?: AssistantProviderModelPromptProfileResolver | undefined;
} = {}): PrimaryAssistantAgentCompositionResolver {
  return createPrimaryAssistantAgentCompositionResolverFromPromptProfileResolver({
    assistantProviderModelPromptProfileResolver: input.assistantProviderModelPromptProfileResolver ??
      resolveDefaultAssistantProviderModelPromptProfile,
  });
}

export function createPrimaryAssistantAgentCompositionResolverFromPromptProfileResolver(input: {
  assistantProviderModelPromptProfileResolver: AssistantProviderModelPromptProfileResolver;
}): PrimaryAssistantAgentCompositionResolver {
  return (compositionInput) => ({
    primaryAssistantAgent: compositionInput.registeredPrimaryAssistantAgent,
    assistantProviderModelPromptProfile: input.assistantProviderModelPromptProfileResolver({
      providerName: compositionInput.providerName,
      selectedModelId: compositionInput.selectedModelId,
    }),
  });
}

export function createModelAwarePrimaryAssistantAgentCompositionResolver(input: {
  composePrimaryAssistantAgentForModel: ComposePrimaryAssistantAgentForModel;
  baselinePrimaryAssistantAgentCompositionResolver?: PrimaryAssistantAgentCompositionResolver | undefined;
}): PrimaryAssistantAgentCompositionResolver {
  const baselinePrimaryAssistantAgentCompositionResolver = input.baselinePrimaryAssistantAgentCompositionResolver ??
    createDefaultPrimaryAssistantAgentCompositionResolver();

  return (compositionInput) => {
    const defaultPrimaryAssistantAgentComposition = baselinePrimaryAssistantAgentCompositionResolver(compositionInput);
    const composedPrimaryAssistantAgentForModel = input.composePrimaryAssistantAgentForModel({
      ...compositionInput,
      defaultPrimaryAssistantAgent: defaultPrimaryAssistantAgentComposition.primaryAssistantAgent,
      defaultAssistantProviderModelPromptProfile:
        defaultPrimaryAssistantAgentComposition.assistantProviderModelPromptProfile,
    });

    const resolvedPrimaryAssistantAgentComposition = {
      primaryAssistantAgent: composedPrimaryAssistantAgentForModel?.primaryAssistantAgent ??
        defaultPrimaryAssistantAgentComposition.primaryAssistantAgent,
      assistantProviderModelPromptProfile: composedPrimaryAssistantAgentForModel?.assistantProviderModelPromptProfile ??
        defaultPrimaryAssistantAgentComposition.assistantProviderModelPromptProfile,
    } satisfies ResolvedPrimaryAssistantAgentComposition;

    assertResolvedPrimaryAssistantAgentMatchesRegisteredAgent({
      registeredPrimaryAssistantAgent: compositionInput.registeredPrimaryAssistantAgent,
      resolvedPrimaryAssistantAgent: resolvedPrimaryAssistantAgentComposition.primaryAssistantAgent,
    });

    return resolvedPrimaryAssistantAgentComposition;
  };
}

export function appendPrimaryAssistantAgentPromptSections(input: {
  primaryAssistantAgent: PrimaryAssistantAgentDefinition;
  additionalPromptSections: readonly string[];
}): PrimaryAssistantAgentDefinition {
  if (input.additionalPromptSections.length === 0) {
    return input.primaryAssistantAgent;
  }

  const systemPromptConfiguration = input.primaryAssistantAgent.systemPromptConfiguration;
  return {
    ...input.primaryAssistantAgent,
    systemPromptConfiguration: {
      ...systemPromptConfiguration,
      additionalPromptSections: [
        ...(systemPromptConfiguration.additionalPromptSections ?? []),
        ...input.additionalPromptSections,
      ],
    },
  };
}

export function assertResolvedPrimaryAssistantAgentMatchesRegisteredAgent(input: {
  registeredPrimaryAssistantAgent: PrimaryAssistantAgentDefinition;
  resolvedPrimaryAssistantAgent: PrimaryAssistantAgentDefinition;
}): void {
  if (input.resolvedPrimaryAssistantAgent.agentName === input.registeredPrimaryAssistantAgent.agentName) {
    return;
  }

  throw new Error(
    `Primary assistant agent composition returned agentName "${input.resolvedPrimaryAssistantAgent.agentName}" for selected agent "${input.registeredPrimaryAssistantAgent.agentName}". A composition resolver may tune prompt, tools, and profile for a selected agent, but it must not change the selected agent identity.`,
  );
}
