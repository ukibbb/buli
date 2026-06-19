import type { ReasoningEffort } from "@buli/contracts";
import type { PrimaryAssistantAgentDefinition, SubagentDefinition } from "./assistantAgentRegistry.ts";
import type {
  AssistantProviderModelPromptProfile,
  AssistantProviderName,
} from "./assistantProviderModelPromptProfile.ts";
import type { TaskSubagentProviderModelSelection } from "./taskSubagentProviderModelSelection.ts";

export type ResolveTaskSubagentCompositionInput = Readonly<{
  registeredSubagent: SubagentDefinition;
  parentPrimaryAssistantAgent: PrimaryAssistantAgentDefinition;
  providerName: AssistantProviderName;
  parentSelectedModelId: string;
  parentSelectedReasoningEffort?: ReasoningEffort | undefined;
  taskSubagentProviderModelSelection: TaskSubagentProviderModelSelection;
  defaultTaskSubagentAssistantProviderModelPromptProfile: AssistantProviderModelPromptProfile;
}>;

export type ResolvedTaskSubagentComposition = Readonly<{
  taskSubagent: SubagentDefinition;
  assistantProviderModelPromptProfile: AssistantProviderModelPromptProfile;
}>;

export type TaskSubagentCompositionResolver = (
  input: ResolveTaskSubagentCompositionInput,
) => ResolvedTaskSubagentComposition;

export type ComposeTaskSubagentForModelInput = ResolveTaskSubagentCompositionInput & Readonly<{
  defaultTaskSubagent: SubagentDefinition;
  defaultTaskSubagentAssistantProviderModelPromptProfile: AssistantProviderModelPromptProfile;
}>;

export type ComposeTaskSubagentForModelResult = Readonly<{
  taskSubagent?: SubagentDefinition | undefined;
  assistantProviderModelPromptProfile?: AssistantProviderModelPromptProfile | undefined;
}>;

export type ComposeTaskSubagentForModel = (
  input: ComposeTaskSubagentForModelInput,
) => ComposeTaskSubagentForModelResult | undefined;

export function createDefaultTaskSubagentCompositionResolver(): TaskSubagentCompositionResolver {
  return (compositionInput) => ({
    taskSubagent: compositionInput.registeredSubagent,
    assistantProviderModelPromptProfile: compositionInput.defaultTaskSubagentAssistantProviderModelPromptProfile,
  });
}

export function createModelAwareTaskSubagentCompositionResolver(input: {
  composeTaskSubagentForModel: ComposeTaskSubagentForModel;
  baselineTaskSubagentCompositionResolver?: TaskSubagentCompositionResolver | undefined;
}): TaskSubagentCompositionResolver {
  const baselineTaskSubagentCompositionResolver = input.baselineTaskSubagentCompositionResolver ??
    createDefaultTaskSubagentCompositionResolver();

  return (compositionInput) => {
    const defaultTaskSubagentComposition = baselineTaskSubagentCompositionResolver(compositionInput);
    assertResolvedTaskSubagentMatchesRegisteredSubagent({
      registeredSubagent: compositionInput.registeredSubagent,
      resolvedSubagent: defaultTaskSubagentComposition.taskSubagent,
    });

    const composedTaskSubagentForModel = input.composeTaskSubagentForModel({
      ...compositionInput,
      defaultTaskSubagent: defaultTaskSubagentComposition.taskSubagent,
      defaultTaskSubagentAssistantProviderModelPromptProfile:
        defaultTaskSubagentComposition.assistantProviderModelPromptProfile,
    });

    const resolvedTaskSubagentComposition = {
      taskSubagent: composedTaskSubagentForModel?.taskSubagent ?? defaultTaskSubagentComposition.taskSubagent,
      assistantProviderModelPromptProfile: composedTaskSubagentForModel?.assistantProviderModelPromptProfile ??
        defaultTaskSubagentComposition.assistantProviderModelPromptProfile,
    } satisfies ResolvedTaskSubagentComposition;

    assertResolvedTaskSubagentMatchesRegisteredSubagent({
      registeredSubagent: compositionInput.registeredSubagent,
      resolvedSubagent: resolvedTaskSubagentComposition.taskSubagent,
    });

    return resolvedTaskSubagentComposition;
  };
}

export function appendSubagentPromptSections(input: {
  subagent: SubagentDefinition;
  additionalPromptSections: readonly string[];
}): SubagentDefinition {
  if (input.additionalPromptSections.length === 0) {
    return input.subagent;
  }

  const systemPromptConfiguration = input.subagent.systemPromptConfiguration;
  return {
    ...input.subagent,
    systemPromptConfiguration: {
      ...systemPromptConfiguration,
      additionalPromptSections: [
        ...(systemPromptConfiguration.additionalPromptSections ?? []),
        ...input.additionalPromptSections,
      ],
    },
  };
}

export function assertResolvedTaskSubagentMatchesRegisteredSubagent(input: {
  registeredSubagent: SubagentDefinition;
  resolvedSubagent: SubagentDefinition;
}): void {
  if (input.resolvedSubagent.subagentName === input.registeredSubagent.subagentName) {
    return;
  }

  throw new Error(
    `Task subagent composition returned subagentName "${input.resolvedSubagent.subagentName}" for requested subagent "${input.registeredSubagent.subagentName}". A composition resolver may tune prompt, tools, and profile for a requested subagent, but it must not change the requested subagent identity.`,
  );
}
