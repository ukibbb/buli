import { expect, test } from "bun:test";
import {
  DEFAULT_PRIMARY_ASSISTANT_AGENT_DEFINITIONS,
  type PrimaryAssistantAgentDefinition,
} from "../src/assistantAgentRegistry.ts";
import {
  OPENAI_GPT_5_5_CURRENT_PROMPT_PROFILE_ID,
  appendAssistantProviderModelPromptFragments,
  resolveDefaultAssistantProviderModelPromptProfile,
} from "../src/assistantProviderModelPromptProfile.ts";
import {
  appendPrimaryAssistantAgentPromptSections,
  createModelAwarePrimaryAssistantAgentCompositionResolver,
} from "../src/assistantPrimaryAgentComposition.ts";

test("model-aware primary composition resolver falls back to the default agent and prompt profile", () => {
  const registeredPrimaryAgent = resolveDefaultUnderstandPrimaryAgent();
  const compositionInputs: Array<{
    selectedModelId: string;
    defaultPrimaryAssistantAgent: PrimaryAssistantAgentDefinition;
    defaultAssistantProviderModelPromptProfileId: string;
  }> = [];
  const resolver = createModelAwarePrimaryAssistantAgentCompositionResolver({
    composePrimaryAssistantAgentForModel: (compositionInput) => {
      compositionInputs.push({
        selectedModelId: compositionInput.selectedModelId,
        defaultPrimaryAssistantAgent: compositionInput.defaultPrimaryAssistantAgent,
        defaultAssistantProviderModelPromptProfileId: compositionInput.defaultAssistantProviderModelPromptProfile.profileId,
      });
      return undefined;
    },
  });

  const composition = resolver({
    registeredPrimaryAssistantAgent: registeredPrimaryAgent,
    providerName: "openai",
    selectedModelId: "gpt-5.5",
  });

  expect(composition.primaryAssistantAgent).toBe(registeredPrimaryAgent);
  expect(composition.assistantProviderModelPromptProfile.profileId).toBe(OPENAI_GPT_5_5_CURRENT_PROMPT_PROFILE_ID);
  expect(compositionInputs).toEqual([
    {
      selectedModelId: "gpt-5.5",
      defaultPrimaryAssistantAgent: registeredPrimaryAgent,
      defaultAssistantProviderModelPromptProfileId: OPENAI_GPT_5_5_CURRENT_PROMPT_PROFILE_ID,
    },
  ]);
});

test("model-aware primary composition resolver preserves default fields for partial overrides", () => {
  const registeredPrimaryAgent = resolveDefaultUnderstandPrimaryAgent();
  const profileOnlyResolver = createModelAwarePrimaryAssistantAgentCompositionResolver({
    composePrimaryAssistantAgentForModel: (compositionInput) => ({
      assistantProviderModelPromptProfile: {
        ...compositionInput.defaultAssistantProviderModelPromptProfile,
        profileId: "small-model-profile-overlay",
      },
    }),
  });

  const profileOnlyComposition = profileOnlyResolver({
    registeredPrimaryAssistantAgent: registeredPrimaryAgent,
    providerName: "openai",
    selectedModelId: "small-local-model",
  });

  expect(profileOnlyComposition.primaryAssistantAgent).toBe(registeredPrimaryAgent);
  expect(profileOnlyComposition.assistantProviderModelPromptProfile.profileId).toBe("small-model-profile-overlay");

  const agentOnlyResolver = createModelAwarePrimaryAssistantAgentCompositionResolver({
    composePrimaryAssistantAgentForModel: (compositionInput) => ({
      primaryAssistantAgent: {
        ...compositionInput.defaultPrimaryAssistantAgent,
        availableToolNames: ["read"],
      },
    }),
  });

  const agentOnlyComposition = agentOnlyResolver({
    registeredPrimaryAssistantAgent: registeredPrimaryAgent,
    providerName: "openai",
    selectedModelId: "small-local-model",
  });

  expect(agentOnlyComposition.primaryAssistantAgent.availableToolNames).toEqual(["read"]);
  expect(agentOnlyComposition.assistantProviderModelPromptProfile.profileId).toBe(
    resolveDefaultAssistantProviderModelPromptProfile({
      providerName: "openai",
      selectedModelId: "small-local-model",
    }).profileId,
  );
});

test("appendPrimaryAssistantAgentPromptSections appends to built-in primary prompt configuration without mutation", () => {
  const registeredPrimaryAgent = resolveDefaultUnderstandPrimaryAgent();

  const appendedPrimaryAgent = appendPrimaryAssistantAgentPromptSections({
    primaryAssistantAgent: registeredPrimaryAgent,
    additionalPromptSections: ["Small model guidance: inspect before summarizing."],
  });

  expect(appendedPrimaryAgent).not.toBe(registeredPrimaryAgent);
  expect(registeredPrimaryAgent.systemPromptConfiguration.additionalPromptSections).toBeUndefined();
  expect(appendedPrimaryAgent.systemPromptConfiguration).toEqual({
    promptConfigurationKind: "built_in_system_reminder",
    systemReminderKind: "understand_mode_system_reminder",
    additionalPromptSections: ["Small model guidance: inspect before summarizing."],
  });
});

test("appendPrimaryAssistantAgentPromptSections appends to custom primary prompt configuration without mutation", () => {
  const customPrimaryAgent = {
    ...resolveDefaultUnderstandPrimaryAgent(),
    systemPromptConfiguration: {
      promptConfigurationKind: "custom",
      systemReminderText: "Base custom reminder.",
      additionalPromptSections: ["Existing custom guidance."],
    },
  } satisfies PrimaryAssistantAgentDefinition;

  const appendedPrimaryAgent = appendPrimaryAssistantAgentPromptSections({
    primaryAssistantAgent: customPrimaryAgent,
    additionalPromptSections: ["Small model custom guidance."],
  });

  expect(appendedPrimaryAgent).not.toBe(customPrimaryAgent);
  expect(customPrimaryAgent.systemPromptConfiguration.additionalPromptSections).toEqual(["Existing custom guidance."]);
  expect(appendedPrimaryAgent.systemPromptConfiguration).toEqual({
    promptConfigurationKind: "custom",
    systemReminderText: "Base custom reminder.",
    additionalPromptSections: ["Existing custom guidance.", "Small model custom guidance."],
  });
});

test("appendPrimaryAssistantAgentPromptSections keeps agent reference when no sections are appended", () => {
  const registeredPrimaryAgent = resolveDefaultUnderstandPrimaryAgent();

  const appendedPrimaryAgent = appendPrimaryAssistantAgentPromptSections({
    primaryAssistantAgent: registeredPrimaryAgent,
    additionalPromptSections: [],
  });

  expect(appendedPrimaryAgent).toBe(registeredPrimaryAgent);
});

test("model-aware primary composition resolver rejects overlays that change the selected agent identity", () => {
  const registeredPrimaryAgent = resolveDefaultUnderstandPrimaryAgent();
  const resolver = createModelAwarePrimaryAssistantAgentCompositionResolver({
    composePrimaryAssistantAgentForModel: (compositionInput) => ({
      primaryAssistantAgent: {
        ...compositionInput.defaultPrimaryAssistantAgent,
        agentName: "plan",
      },
    }),
  });

  expect(() =>
    resolver({
      registeredPrimaryAssistantAgent: registeredPrimaryAgent,
      providerName: "openai",
      selectedModelId: "small-local-model",
    })
  ).toThrow(
    'Primary assistant agent composition returned agentName "plan" for selected agent "understand".',
  );
});

test("model-aware primary composition resolver composes prompt sections and provider/model prompt fragments together", () => {
  const registeredPrimaryAgent = resolveDefaultUnderstandPrimaryAgent();
  const resolver = createModelAwarePrimaryAssistantAgentCompositionResolver({
    composePrimaryAssistantAgentForModel: (compositionInput) => ({
      primaryAssistantAgent: appendPrimaryAssistantAgentPromptSections({
        primaryAssistantAgent: compositionInput.defaultPrimaryAssistantAgent,
        additionalPromptSections: ["Small model prompt section."],
      }),
      assistantProviderModelPromptProfile: appendAssistantProviderModelPromptFragments({
        assistantProviderModelPromptProfile: compositionInput.defaultAssistantProviderModelPromptProfile,
        promptFragments: {
          primaryAssistantSystemPrompt: ["Small model provider fragment."],
        },
      }),
    }),
  });

  const composition = resolver({
    registeredPrimaryAssistantAgent: registeredPrimaryAgent,
    providerName: "openai",
    selectedModelId: "small-local-model",
  });

  expect(composition.primaryAssistantAgent.systemPromptConfiguration.additionalPromptSections).toEqual([
    "Small model prompt section.",
  ]);
  expect(composition.assistantProviderModelPromptProfile.promptFragments.primaryAssistantSystemPrompt).toEqual([
    "Small model provider fragment.",
  ]);
});

function resolveDefaultUnderstandPrimaryAgent(): PrimaryAssistantAgentDefinition {
  const primaryAgent = DEFAULT_PRIMARY_ASSISTANT_AGENT_DEFINITIONS.find((candidatePrimaryAgent) =>
    candidatePrimaryAgent.agentName === "understand"
  );
  if (!primaryAgent) {
    throw new Error("Default understand primary agent was not registered.");
  }

  return primaryAgent;
}
