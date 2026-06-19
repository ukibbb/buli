import { expect, test } from "bun:test";
import {
  DEFAULT_OPENAI_LOW_VERBOSITY_REASONING_MODEL_BEHAVIOR_PROFILE,
  DEFAULT_OPENAI_NON_REASONING_MODEL_BEHAVIOR_PROFILE,
  DEFAULT_OPENAI_REASONING_MODEL_BEHAVIOR_PROFILE,
  type OpenAiModelBehaviorProfile,
  OpenAiModelBehaviorProfileRegistry,
  createDefaultOpenAiModelBehaviorProfileRegistry,
  resolveDefaultOpenAiModelBehaviorProfile,
  resolveOpenAiReasoningEncryptedContentInclusionPolicy,
} from "../src/provider/openAiModelBehaviorProfile.ts";

const CUSTOM_OPENAI_MODEL_BEHAVIOR_PROFILE = {
  profileId: "test:custom-openai-model",
  requestReasoningSummary: false,
  requestLowTextVerbosity: true,
  allowParallelToolCalls: false,
  defaultReasoningEncryptedContentInclusionPolicy: "when_input_contains_reasoning",
} as const satisfies OpenAiModelBehaviorProfile;

test("resolveDefaultOpenAiModelBehaviorProfile preserves current reasoning and verbosity model matching", () => {
  expect(resolveDefaultOpenAiModelBehaviorProfile({ selectedModelId: "gpt-5.4" })).toBe(
    DEFAULT_OPENAI_LOW_VERBOSITY_REASONING_MODEL_BEHAVIOR_PROFILE,
  );
  expect(resolveDefaultOpenAiModelBehaviorProfile({ selectedModelId: "gpt-5.5-codex" })).toBe(
    DEFAULT_OPENAI_REASONING_MODEL_BEHAVIOR_PROFILE,
  );
  expect(resolveDefaultOpenAiModelBehaviorProfile({ selectedModelId: "gpt-5.5-chat-latest" })).toBe(
    DEFAULT_OPENAI_NON_REASONING_MODEL_BEHAVIOR_PROFILE,
  );
});

test("OpenAiModelBehaviorProfileRegistry resolves custom registrations before default fallback", () => {
  const registry = createDefaultOpenAiModelBehaviorProfileRegistry({
    additionalProfileRegistrations: [
      {
        profile: CUSTOM_OPENAI_MODEL_BEHAVIOR_PROFILE,
        matchesSelectedModelId: (selectedModelId) => selectedModelId === "custom-model",
      },
    ],
  });

  expect(registry.resolveModelBehaviorProfile({ selectedModelId: "custom-model" })).toBe(
    CUSTOM_OPENAI_MODEL_BEHAVIOR_PROFILE,
  );
  expect(registry.resolveModelBehaviorProfile({ selectedModelId: "gpt-5.4" })).toBe(
    DEFAULT_OPENAI_LOW_VERBOSITY_REASONING_MODEL_BEHAVIOR_PROFILE,
  );
});

test("OpenAiModelBehaviorProfileRegistry rejects duplicate custom profile ids", () => {
  expect(() =>
    new OpenAiModelBehaviorProfileRegistry({
      profileRegistrations: [
        {
          profile: CUSTOM_OPENAI_MODEL_BEHAVIOR_PROFILE,
          matchesSelectedModelId: (selectedModelId) => selectedModelId === "custom-model-a",
        },
        {
          profile: CUSTOM_OPENAI_MODEL_BEHAVIOR_PROFILE,
          matchesSelectedModelId: (selectedModelId) => selectedModelId === "custom-model-b",
        },
      ],
    })
  ).toThrow("OpenAI model behavior profile is already registered: test:custom-openai-model");
});

test("resolveOpenAiReasoningEncryptedContentInclusionPolicy preserves effort-specific include behavior", () => {
  expect(
    resolveOpenAiReasoningEncryptedContentInclusionPolicy({
      selectedReasoningEffort: "none",
      modelBehaviorProfile: DEFAULT_OPENAI_REASONING_MODEL_BEHAVIOR_PROFILE,
    }),
  ).toBe("never");
  expect(
    resolveOpenAiReasoningEncryptedContentInclusionPolicy({
      selectedReasoningEffort: "low",
      modelBehaviorProfile: DEFAULT_OPENAI_NON_REASONING_MODEL_BEHAVIOR_PROFILE,
    }),
  ).toBe("always");
  expect(
    resolveOpenAiReasoningEncryptedContentInclusionPolicy({
      modelBehaviorProfile: DEFAULT_OPENAI_REASONING_MODEL_BEHAVIOR_PROFILE,
    }),
  ).toBe("always");
  expect(
    resolveOpenAiReasoningEncryptedContentInclusionPolicy({
      modelBehaviorProfile: DEFAULT_OPENAI_NON_REASONING_MODEL_BEHAVIOR_PROFILE,
    }),
  ).toBe("when_input_contains_reasoning");
});
