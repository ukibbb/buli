import { expect, test } from "bun:test";
import {
  DEFAULT_ASSISTANT_SUBAGENT_DEFINITIONS,
  DEFAULT_PRIMARY_ASSISTANT_AGENT_DEFINITIONS,
  type PrimaryAssistantAgentDefinition,
  type SubagentDefinition,
} from "../src/assistantAgentRegistry.ts";
import {
  OPENAI_GPT_5_5_CURRENT_PROMPT_PROFILE_ID,
  appendAssistantProviderModelPromptFragments,
  resolveDefaultAssistantProviderModelPromptProfile,
} from "../src/assistantProviderModelPromptProfile.ts";
import {
  appendSubagentPromptSections,
  createModelAwareTaskSubagentCompositionResolver,
} from "../src/assistantSubagentComposition.ts";
import type { TaskSubagentProviderModelSelection } from "../src/taskSubagentProviderModelSelection.ts";

test("model-aware task subagent composition resolver falls back to the default subagent and prompt profile", () => {
  const registeredSubagent = resolveDefaultExploreSubagent();
  const parentPrimaryAssistantAgent = resolveDefaultUnderstandPrimaryAgent();
  const defaultPromptProfile = resolveDefaultAssistantProviderModelPromptProfile({
    providerName: "openai",
    selectedModelId: "gpt-5.5",
  });
  const compositionInputs: Array<{
    selectedModelId: string;
    defaultTaskSubagent: SubagentDefinition;
    defaultAssistantProviderModelPromptProfileId: string;
    parentPrimaryAssistantAgent: PrimaryAssistantAgentDefinition;
  }> = [];
  const resolver = createModelAwareTaskSubagentCompositionResolver({
    composeTaskSubagentForModel: (compositionInput) => {
      compositionInputs.push({
        selectedModelId: compositionInput.taskSubagentProviderModelSelection.taskSubagentSelectedModelId,
        defaultTaskSubagent: compositionInput.defaultTaskSubagent,
        defaultAssistantProviderModelPromptProfileId:
          compositionInput.defaultTaskSubagentAssistantProviderModelPromptProfile.profileId,
        parentPrimaryAssistantAgent: compositionInput.parentPrimaryAssistantAgent,
      });
      return undefined;
    },
  });

  const composition = resolver({
    registeredSubagent,
    parentPrimaryAssistantAgent,
    providerName: "openai",
    parentSelectedModelId: "gpt-5.5",
    taskSubagentProviderModelSelection: createTaskSubagentModelSelection("gpt-5.5"),
    defaultTaskSubagentAssistantProviderModelPromptProfile: defaultPromptProfile,
  });

  expect(composition.taskSubagent).toBe(registeredSubagent);
  expect(composition.assistantProviderModelPromptProfile).toBe(defaultPromptProfile);
  expect(composition.assistantProviderModelPromptProfile.profileId).toBe(OPENAI_GPT_5_5_CURRENT_PROMPT_PROFILE_ID);
  expect(compositionInputs).toEqual([
    {
      selectedModelId: "gpt-5.5",
      defaultTaskSubagent: registeredSubagent,
      defaultAssistantProviderModelPromptProfileId: OPENAI_GPT_5_5_CURRENT_PROMPT_PROFILE_ID,
      parentPrimaryAssistantAgent,
    },
  ]);
});

test("model-aware task subagent composition resolver preserves default fields for partial overrides", () => {
  const registeredSubagent = resolveDefaultExploreSubagent();
  const parentPrimaryAssistantAgent = resolveDefaultUnderstandPrimaryAgent();
  const defaultPromptProfile = resolveDefaultAssistantProviderModelPromptProfile({
    providerName: "openai",
    selectedModelId: "small-subagent-model",
  });
  const profileOnlyResolver = createModelAwareTaskSubagentCompositionResolver({
    composeTaskSubagentForModel: (compositionInput) => ({
      assistantProviderModelPromptProfile: {
        ...compositionInput.defaultTaskSubagentAssistantProviderModelPromptProfile,
        profileId: "small-subagent-profile-overlay",
      },
    }),
  });

  const profileOnlyComposition = profileOnlyResolver({
    registeredSubagent,
    parentPrimaryAssistantAgent,
    providerName: "openai",
    parentSelectedModelId: "gpt-5.5",
    taskSubagentProviderModelSelection: createTaskSubagentModelSelection("small-subagent-model"),
    defaultTaskSubagentAssistantProviderModelPromptProfile: defaultPromptProfile,
  });

  expect(profileOnlyComposition.taskSubagent).toBe(registeredSubagent);
  expect(profileOnlyComposition.assistantProviderModelPromptProfile.profileId).toBe("small-subagent-profile-overlay");

  const subagentOnlyResolver = createModelAwareTaskSubagentCompositionResolver({
    composeTaskSubagentForModel: (compositionInput) => ({
      taskSubagent: {
        ...compositionInput.defaultTaskSubagent,
        availableToolNames: ["read"],
      },
    }),
  });

  const subagentOnlyComposition = subagentOnlyResolver({
    registeredSubagent,
    parentPrimaryAssistantAgent,
    providerName: "openai",
    parentSelectedModelId: "gpt-5.5",
    taskSubagentProviderModelSelection: createTaskSubagentModelSelection("small-subagent-model"),
    defaultTaskSubagentAssistantProviderModelPromptProfile: defaultPromptProfile,
  });

  expect(subagentOnlyComposition.taskSubagent.availableToolNames).toEqual(["read"]);
  expect(subagentOnlyComposition.assistantProviderModelPromptProfile).toBe(defaultPromptProfile);
});

test("appendSubagentPromptSections appends to built-in subagent prompt configuration without mutation", () => {
  const registeredSubagent = resolveDefaultExploreSubagent();

  const appendedSubagent = appendSubagentPromptSections({
    subagent: registeredSubagent,
    additionalPromptSections: ["Small subagent guidance: use one narrow search at a time."],
  });

  expect(appendedSubagent).not.toBe(registeredSubagent);
  expect(registeredSubagent.systemPromptConfiguration.additionalPromptSections).toBeUndefined();
  expect(appendedSubagent.systemPromptConfiguration).toEqual({
    promptConfigurationKind: "built_in_subagent_prompt",
    systemPromptKind: "explorer_system_prompt",
    additionalPromptSections: ["Small subagent guidance: use one narrow search at a time."],
  });
});

test("appendSubagentPromptSections appends to custom subagent prompt configuration without mutation", () => {
  const customSubagent = {
    ...resolveDefaultExploreSubagent(),
    systemPromptConfiguration: {
      promptConfigurationKind: "custom",
      systemPromptText: "Base custom subagent prompt.",
      additionalPromptSections: ["Existing custom subagent guidance."],
    },
  } satisfies SubagentDefinition;

  const appendedSubagent = appendSubagentPromptSections({
    subagent: customSubagent,
    additionalPromptSections: ["Small model custom subagent guidance."],
  });

  expect(appendedSubagent).not.toBe(customSubagent);
  expect(customSubagent.systemPromptConfiguration.additionalPromptSections).toEqual(["Existing custom subagent guidance."]);
  expect(appendedSubagent.systemPromptConfiguration).toEqual({
    promptConfigurationKind: "custom",
    systemPromptText: "Base custom subagent prompt.",
    additionalPromptSections: ["Existing custom subagent guidance.", "Small model custom subagent guidance."],
  });
});

test("appendSubagentPromptSections keeps subagent reference when no sections are appended", () => {
  const registeredSubagent = resolveDefaultExploreSubagent();

  const appendedSubagent = appendSubagentPromptSections({
    subagent: registeredSubagent,
    additionalPromptSections: [],
  });

  expect(appendedSubagent).toBe(registeredSubagent);
});

test("model-aware task subagent composition resolver rejects overlays that change the requested subagent identity", () => {
  const registeredSubagent = resolveDefaultExploreSubagent();
  const resolver = createModelAwareTaskSubagentCompositionResolver({
    composeTaskSubagentForModel: (compositionInput) => ({
      taskSubagent: {
        ...compositionInput.defaultTaskSubagent,
        subagentName: "different_explorer",
      },
    }),
  });

  expect(() =>
    resolver({
      registeredSubagent,
      parentPrimaryAssistantAgent: resolveDefaultUnderstandPrimaryAgent(),
      providerName: "openai",
      parentSelectedModelId: "gpt-5.5",
      taskSubagentProviderModelSelection: createTaskSubagentModelSelection("small-subagent-model"),
      defaultTaskSubagentAssistantProviderModelPromptProfile: resolveDefaultAssistantProviderModelPromptProfile({
        providerName: "openai",
        selectedModelId: "small-subagent-model",
      }),
    })
  ).toThrow(
    'Task subagent composition returned subagentName "different_explorer" for requested subagent "explore".',
  );
});

test("model-aware task subagent composition resolver composes prompt sections and provider/model prompt fragments together", () => {
  const registeredSubagent = resolveDefaultExploreSubagent();
  const resolver = createModelAwareTaskSubagentCompositionResolver({
    composeTaskSubagentForModel: (compositionInput) => ({
      taskSubagent: appendSubagentPromptSections({
        subagent: compositionInput.defaultTaskSubagent,
        additionalPromptSections: ["Small subagent prompt section."],
      }),
      assistantProviderModelPromptProfile: appendAssistantProviderModelPromptFragments({
        assistantProviderModelPromptProfile: compositionInput.defaultTaskSubagentAssistantProviderModelPromptProfile,
        promptFragments: {
          explorerSystemPrompt: ["Small subagent Explorer system prompt fragment."],
          taskSubagentPrompt: ["Small subagent task prompt fragment."],
        },
      }),
    }),
  });

  const composition = resolver({
    registeredSubagent,
    parentPrimaryAssistantAgent: resolveDefaultUnderstandPrimaryAgent(),
    providerName: "openai",
    parentSelectedModelId: "gpt-5.5",
    taskSubagentProviderModelSelection: createTaskSubagentModelSelection("small-subagent-model"),
    defaultTaskSubagentAssistantProviderModelPromptProfile: resolveDefaultAssistantProviderModelPromptProfile({
      providerName: "openai",
      selectedModelId: "small-subagent-model",
    }),
  });

  expect(composition.taskSubagent.systemPromptConfiguration.additionalPromptSections).toEqual([
    "Small subagent prompt section.",
  ]);
  expect(composition.assistantProviderModelPromptProfile.promptFragments.explorerSystemPrompt).toEqual([
    "Small subagent Explorer system prompt fragment.",
  ]);
  expect(composition.assistantProviderModelPromptProfile.promptFragments.taskSubagentPrompt).toEqual([
    "Small subagent task prompt fragment.",
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

function resolveDefaultExploreSubagent(): SubagentDefinition {
  const subagent = DEFAULT_ASSISTANT_SUBAGENT_DEFINITIONS.find((candidateSubagent) =>
    candidateSubagent.subagentName === "explore"
  );
  if (!subagent) {
    throw new Error("Default explore subagent was not registered.");
  }

  return subagent;
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
