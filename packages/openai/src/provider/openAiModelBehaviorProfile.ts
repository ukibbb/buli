import type { ReasoningEffort } from "@buli/contracts";

export type OpenAiReasoningEncryptedContentInclusionPolicy = "always" | "never" | "when_input_contains_reasoning";

export type OpenAiModelBehaviorProfile = Readonly<{
  profileId: string;
  requestReasoningSummary: boolean;
  requestLowTextVerbosity: boolean;
  allowParallelToolCalls: boolean;
  defaultReasoningEncryptedContentInclusionPolicy: Exclude<OpenAiReasoningEncryptedContentInclusionPolicy, "never">;
}>;

export type ResolveOpenAiModelBehaviorProfileInput = Readonly<{
  selectedModelId: string;
}>;

export type OpenAiModelBehaviorProfileResolver = (
  input: ResolveOpenAiModelBehaviorProfileInput,
) => OpenAiModelBehaviorProfile;

export type OpenAiModelBehaviorProfileRegistration = Readonly<{
  profile: OpenAiModelBehaviorProfile;
  matchesSelectedModelId: (selectedModelId: string) => boolean;
}>;

export class OpenAiModelBehaviorProfileRegistry {
  readonly #profileRegistrations: OpenAiModelBehaviorProfileRegistration[];
  readonly #fallbackProfileResolver: OpenAiModelBehaviorProfileResolver;

  constructor(input: {
    profileRegistrations?: readonly OpenAiModelBehaviorProfileRegistration[] | undefined;
    fallbackProfileResolver?: OpenAiModelBehaviorProfileResolver | undefined;
  } = {}) {
    this.#profileRegistrations = [...(input.profileRegistrations ?? [])];
    this.#fallbackProfileResolver = input.fallbackProfileResolver ?? resolveDefaultOpenAiModelBehaviorProfile;
    assertUniqueProfileIds(this.#profileRegistrations);
  }

  resolveModelBehaviorProfile(input: ResolveOpenAiModelBehaviorProfileInput): OpenAiModelBehaviorProfile {
    const matchingProfileRegistration = this.#profileRegistrations.find((profileRegistration) =>
      profileRegistration.matchesSelectedModelId(input.selectedModelId)
    );
    return matchingProfileRegistration?.profile ?? this.#fallbackProfileResolver(input);
  }

  listProfileRegistrations(): readonly OpenAiModelBehaviorProfileRegistration[] {
    return [...this.#profileRegistrations];
  }
}

export const DEFAULT_OPENAI_REASONING_MODEL_BEHAVIOR_PROFILE = {
  profileId: "openai:reasoning-model-default",
  requestReasoningSummary: true,
  requestLowTextVerbosity: false,
  allowParallelToolCalls: true,
  defaultReasoningEncryptedContentInclusionPolicy: "always",
} as const satisfies OpenAiModelBehaviorProfile;

export const DEFAULT_OPENAI_NON_REASONING_MODEL_BEHAVIOR_PROFILE = {
  profileId: "openai:non-reasoning-model-default",
  requestReasoningSummary: false,
  requestLowTextVerbosity: false,
  allowParallelToolCalls: true,
  defaultReasoningEncryptedContentInclusionPolicy: "when_input_contains_reasoning",
} as const satisfies OpenAiModelBehaviorProfile;

export const DEFAULT_OPENAI_LOW_VERBOSITY_REASONING_MODEL_BEHAVIOR_PROFILE = {
  ...DEFAULT_OPENAI_REASONING_MODEL_BEHAVIOR_PROFILE,
  profileId: "openai:low-verbosity-reasoning-model-default",
  requestLowTextVerbosity: true,
} as const satisfies OpenAiModelBehaviorProfile;

export function createDefaultOpenAiModelBehaviorProfileRegistry(input: {
  additionalProfileRegistrations?: readonly OpenAiModelBehaviorProfileRegistration[] | undefined;
} = {}): OpenAiModelBehaviorProfileRegistry {
  return new OpenAiModelBehaviorProfileRegistry({
    profileRegistrations: input.additionalProfileRegistrations,
    fallbackProfileResolver: resolveDefaultOpenAiModelBehaviorProfile,
  });
}

export function resolveDefaultOpenAiModelBehaviorProfile(
  input: ResolveOpenAiModelBehaviorProfileInput,
): OpenAiModelBehaviorProfile {
  if (shouldRequestLowTextVerbosityForDefaultOpenAiModel(input.selectedModelId)) {
    return DEFAULT_OPENAI_LOW_VERBOSITY_REASONING_MODEL_BEHAVIOR_PROFILE;
  }

  if (isDefaultOpenAiReasoningModel(input.selectedModelId)) {
    return DEFAULT_OPENAI_REASONING_MODEL_BEHAVIOR_PROFILE;
  }

  return DEFAULT_OPENAI_NON_REASONING_MODEL_BEHAVIOR_PROFILE;
}

export function resolveOpenAiReasoningEncryptedContentInclusionPolicy(input: {
  selectedReasoningEffort?: ReasoningEffort | undefined;
  modelBehaviorProfile: OpenAiModelBehaviorProfile;
}): OpenAiReasoningEncryptedContentInclusionPolicy {
  if (input.selectedReasoningEffort === "none") {
    return "never";
  }

  if (input.selectedReasoningEffort !== undefined) {
    return "always";
  }

  return input.modelBehaviorProfile.defaultReasoningEncryptedContentInclusionPolicy;
}

function shouldRequestLowTextVerbosityForDefaultOpenAiModel(selectedModelId: string): boolean {
  const normalizedSelectedModelId = selectedModelId.toLowerCase();
  return (
    normalizedSelectedModelId.includes("gpt-5.") &&
    !normalizedSelectedModelId.includes("codex") &&
    !normalizedSelectedModelId.includes("-chat")
  );
}

function isDefaultOpenAiReasoningModel(selectedModelId: string): boolean {
  const normalizedSelectedModelId = selectedModelId.toLowerCase();
  return (
    (normalizedSelectedModelId.includes("gpt-5") || normalizedSelectedModelId.includes("codex")) &&
    !normalizedSelectedModelId.includes("chat")
  );
}

function assertUniqueProfileIds(profileRegistrations: readonly OpenAiModelBehaviorProfileRegistration[]): void {
  const seenProfileIds = new Set<string>();
  for (const profileRegistration of profileRegistrations) {
    if (seenProfileIds.has(profileRegistration.profile.profileId)) {
      throw new Error(`OpenAI model behavior profile is already registered: ${profileRegistration.profile.profileId}`);
    }

    seenProfileIds.add(profileRegistration.profile.profileId);
  }
}
