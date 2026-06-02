import { escapeModelFacingXmlAttributeValue, escapeModelFacingXmlText } from "./modelFacingXmlEscaping.ts";
import {
  DEFAULT_BULI_STICKY_NOTES_OBSERVATION_TEXT_CHARACTER_COUNT,
  DEFAULT_BULI_STICKY_NOTES_PROMPT_NOTE_TEXT_CHARACTER_COUNT,
  DEFAULT_RELEVANT_EVIDENCE_NOTE_LIMIT,
} from "./readOnlyToolEvidenceNotebook.ts";

export type AssistantProviderName = "openai" | "external_provider_protocol";

export type AssistantProviderModelPromptFragmentTarget =
  | "primaryAssistantSystemPrompt"
  | "explorerSystemPrompt"
  | "taskSubagentPrompt"
  | "conversationCompactionSystemPrompt"
  | "conversationCompactionPrompt";

export type AssistantProviderModelPromptFragments = Readonly<{
  primaryAssistantSystemPrompt: readonly string[];
  explorerSystemPrompt: readonly string[];
  taskSubagentPrompt: readonly string[];
  conversationCompactionSystemPrompt: readonly string[];
  conversationCompactionPrompt: readonly string[];
}>;

export type AssistantStickyNotesPromptRenderingProfile = Readonly<{
  maximumRelevantEvidenceNoteCount: number;
  maximumPromptNoteTextCharacterCount: number;
  maximumObservationTextCharacterCount: number;
}>;

export type AssistantWorkflowHandoffPromptRenderingDetail = "full" | "compact";

export type AssistantWorkflowHandoffPromptRenderingProfile = Readonly<{
  renderingDetail: AssistantWorkflowHandoffPromptRenderingDetail;
  maximumListItemCount?: number | undefined;
  maximumTextCharacterCount?: number | undefined;
}>;

export type AssistantProviderModelPromptProfile = Readonly<{
  profileId: string;
  providerName: AssistantProviderName;
  selectedModelId: string;
  promptFragments: AssistantProviderModelPromptFragments;
  stickyNotes: AssistantStickyNotesPromptRenderingProfile;
  workflowHandoff: AssistantWorkflowHandoffPromptRenderingProfile;
}>;

export type ResolveAssistantProviderModelPromptProfileInput = Readonly<{
  providerName: AssistantProviderName;
  selectedModelId: string;
}>;

export type AssistantProviderModelPromptProfileResolver = (
  input: ResolveAssistantProviderModelPromptProfileInput,
) => AssistantProviderModelPromptProfile;

export const DEFAULT_ASSISTANT_PROVIDER_NAME: AssistantProviderName = "openai";
export const OPENAI_GPT_5_5_CURRENT_PROMPT_PROFILE_ID = "openai:gpt-5.5:current-prompt-behavior";
export const OPENAI_DEFAULT_CURRENT_PROMPT_PROFILE_ID = "openai:default-current-prompt-behavior";
export const EXTERNAL_PROVIDER_PROTOCOL_CURRENT_PROMPT_PROFILE_ID =
  "external_provider_protocol:current-prompt-behavior";

export const EMPTY_ASSISTANT_PROVIDER_MODEL_PROMPT_FRAGMENTS = {
  primaryAssistantSystemPrompt: [],
  explorerSystemPrompt: [],
  taskSubagentPrompt: [],
  conversationCompactionSystemPrompt: [],
  conversationCompactionPrompt: [],
} as const satisfies AssistantProviderModelPromptFragments;

export const CURRENT_DEFAULT_STICKY_NOTES_PROMPT_RENDERING_PROFILE = {
  maximumRelevantEvidenceNoteCount: DEFAULT_RELEVANT_EVIDENCE_NOTE_LIMIT,
  maximumPromptNoteTextCharacterCount: DEFAULT_BULI_STICKY_NOTES_PROMPT_NOTE_TEXT_CHARACTER_COUNT,
  maximumObservationTextCharacterCount: DEFAULT_BULI_STICKY_NOTES_OBSERVATION_TEXT_CHARACTER_COUNT,
} as const satisfies AssistantStickyNotesPromptRenderingProfile;

export const CURRENT_DEFAULT_WORKFLOW_HANDOFF_PROMPT_RENDERING_PROFILE = {
  renderingDetail: "full",
} as const satisfies AssistantWorkflowHandoffPromptRenderingProfile;

export function resolveDefaultAssistantProviderModelPromptProfile(
  input: ResolveAssistantProviderModelPromptProfileInput,
): AssistantProviderModelPromptProfile {
  return createCurrentPromptBehaviorProfile({
    ...input,
    profileId: resolveCurrentPromptBehaviorProfileId(input),
  });
}

export function formatAssistantProviderModelPromptProfileFragmentBlock(input: {
  assistantProviderModelPromptProfile: AssistantProviderModelPromptProfile;
  fragmentTarget: AssistantProviderModelPromptFragmentTarget;
}): string | undefined {
  const promptFragments = input.assistantProviderModelPromptProfile.promptFragments[input.fragmentTarget];
  if (promptFragments.length === 0) {
    return undefined;
  }

  return [
    "Provider/model prompt profile:",
    "- These instructions are additive provider/model prompt tuning. They do not replace Buli's core identity, mode reminders, safety rules, runtime tool-access policy, or project instructions.",
    `<provider_model_prompt_profile profile_id="${escapeModelFacingXmlAttributeValue(input.assistantProviderModelPromptProfile.profileId)}" provider="${input.assistantProviderModelPromptProfile.providerName}" model="${escapeModelFacingXmlAttributeValue(input.assistantProviderModelPromptProfile.selectedModelId)}" target="${input.fragmentTarget}">`,
    ...promptFragments.map((promptFragment) => `  <instruction>${escapeModelFacingXmlText(promptFragment)}</instruction>`),
    "</provider_model_prompt_profile>",
  ].join("\n");
}

function createCurrentPromptBehaviorProfile(input: {
  profileId: string;
  providerName: AssistantProviderName;
  selectedModelId: string;
}): AssistantProviderModelPromptProfile {
  return {
    profileId: input.profileId,
    providerName: input.providerName,
    selectedModelId: input.selectedModelId,
    promptFragments: EMPTY_ASSISTANT_PROVIDER_MODEL_PROMPT_FRAGMENTS,
    stickyNotes: CURRENT_DEFAULT_STICKY_NOTES_PROMPT_RENDERING_PROFILE,
    workflowHandoff: CURRENT_DEFAULT_WORKFLOW_HANDOFF_PROMPT_RENDERING_PROFILE,
  };
}

function resolveCurrentPromptBehaviorProfileId(input: ResolveAssistantProviderModelPromptProfileInput): string {
  if (input.providerName === "openai" && input.selectedModelId.trim().toLowerCase() === "gpt-5.5") {
    return OPENAI_GPT_5_5_CURRENT_PROMPT_PROFILE_ID;
  }

  if (input.providerName === "openai") {
    return OPENAI_DEFAULT_CURRENT_PROMPT_PROFILE_ID;
  }

  return EXTERNAL_PROVIDER_PROTOCOL_CURRENT_PROMPT_PROFILE_ID;
}
