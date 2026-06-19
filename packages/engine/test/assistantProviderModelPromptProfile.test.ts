import { expect, test } from "bun:test";
import {
  CURRENT_DEFAULT_STICKY_NOTES_PROMPT_RENDERING_PROFILE,
  CURRENT_DEFAULT_WORKFLOW_HANDOFF_PROMPT_RENDERING_PROFILE,
  EXTERNAL_PROVIDER_PROTOCOL_CURRENT_PROMPT_PROFILE_ID,
  OPENAI_DEFAULT_CURRENT_PROMPT_PROFILE_ID,
  OPENAI_GPT_5_5_CURRENT_PROMPT_PROFILE_ID,
  appendAssistantProviderModelPromptFragments,
  formatAssistantProviderModelPromptProfileFragmentBlock,
  resolveDefaultAssistantProviderModelPromptProfile,
  type AssistantProviderModelPromptProfile,
} from "../src/assistantProviderModelPromptProfile.ts";

test("resolves openai gpt-5.5 to the current baseline prompt profile", () => {
  const promptProfile = resolveDefaultAssistantProviderModelPromptProfile({
    providerName: "openai",
    selectedModelId: "gpt-5.5",
  });

  expect(promptProfile).toEqual({
    profileId: OPENAI_GPT_5_5_CURRENT_PROMPT_PROFILE_ID,
    providerName: "openai",
    selectedModelId: "gpt-5.5",
    promptFragments: {
      primaryAssistantSystemPrompt: [],
      explorerSystemPrompt: [],
      taskSubagentPrompt: [],
      conversationCompactionSystemPrompt: [],
      conversationCompactionPrompt: [],
    },
    stickyNotes: CURRENT_DEFAULT_STICKY_NOTES_PROMPT_RENDERING_PROFILE,
    workflowHandoff: CURRENT_DEFAULT_WORKFLOW_HANDOFF_PROMPT_RENDERING_PROFILE,
  });
});

test("keeps unknown OpenAI models on the current prompt behavior until a specific profile exists", () => {
  const promptProfile = resolveDefaultAssistantProviderModelPromptProfile({
    providerName: "openai",
    selectedModelId: "future-openai-model",
  });

  expect(promptProfile.profileId).toBe(OPENAI_DEFAULT_CURRENT_PROMPT_PROFILE_ID);
  expect(promptProfile.providerName).toBe("openai");
  expect(promptProfile.selectedModelId).toBe("future-openai-model");
  expect(promptProfile.stickyNotes).toBe(CURRENT_DEFAULT_STICKY_NOTES_PROMPT_RENDERING_PROFILE);
  expect(promptProfile.workflowHandoff).toBe(CURRENT_DEFAULT_WORKFLOW_HANDOFF_PROMPT_RENDERING_PROFILE);
});

test("resolves external provider protocol to a provider-specific prompt profile placeholder", () => {
  const promptProfile = resolveDefaultAssistantProviderModelPromptProfile({
    providerName: "external_provider_protocol",
    selectedModelId: "external-model",
  });

  expect(promptProfile.profileId).toBe(EXTERNAL_PROVIDER_PROTOCOL_CURRENT_PROMPT_PROFILE_ID);
  expect(promptProfile.providerName).toBe("external_provider_protocol");
  expect(promptProfile.selectedModelId).toBe("external-model");
});

test("formats additive profile fragments with provider model metadata and escaped text", () => {
  const baselinePromptProfile = resolveDefaultAssistantProviderModelPromptProfile({
    providerName: "openai",
    selectedModelId: "gpt-5.5",
  });
  const promptProfile: AssistantProviderModelPromptProfile = {
    ...baselinePromptProfile,
    profileId: "test<profile>",
    promptFragments: {
      ...baselinePromptProfile.promptFragments,
      primaryAssistantSystemPrompt: ["Prefer concise output for <small> contexts & keep safety."],
    },
  };

  const promptProfileFragmentBlock = formatAssistantProviderModelPromptProfileFragmentBlock({
    assistantProviderModelPromptProfile: promptProfile,
    fragmentTarget: "primaryAssistantSystemPrompt",
  });

  expect(promptProfileFragmentBlock).toContain("Provider/model prompt profile:");
  expect(promptProfileFragmentBlock).toContain('profile_id="test&lt;profile&gt;"');
  expect(promptProfileFragmentBlock).toContain('provider="openai"');
  expect(promptProfileFragmentBlock).toContain('model="gpt-5.5"');
  expect(promptProfileFragmentBlock).toContain("Prefer concise output for &lt;small&gt; contexts &amp; keep safety.");
});

test("appends provider/model prompt fragments without mutating existing profile fields", () => {
  const baselinePromptProfile = resolveDefaultAssistantProviderModelPromptProfile({
    providerName: "openai",
    selectedModelId: "small-local-model",
  });
  const promptProfile: AssistantProviderModelPromptProfile = {
    ...baselinePromptProfile,
    profileId: "small-model-overlay",
    promptFragments: {
      ...baselinePromptProfile.promptFragments,
      primaryAssistantSystemPrompt: ["Existing primary fragment."],
      explorerSystemPrompt: ["Existing explorer fragment."],
    },
  };

  const appendedPromptProfile = appendAssistantProviderModelPromptFragments({
    assistantProviderModelPromptProfile: promptProfile,
    promptFragments: {
      primaryAssistantSystemPrompt: ["Appended primary fragment."],
      taskSubagentPrompt: ["Appended task fragment."],
      conversationCompactionPrompt: ["Appended compaction prompt fragment."],
    },
  });

  expect(appendedPromptProfile).not.toBe(promptProfile);
  expect(appendedPromptProfile.profileId).toBe("small-model-overlay");
  expect(appendedPromptProfile.providerName).toBe(promptProfile.providerName);
  expect(appendedPromptProfile.selectedModelId).toBe(promptProfile.selectedModelId);
  expect(appendedPromptProfile.stickyNotes).toBe(promptProfile.stickyNotes);
  expect(appendedPromptProfile.workflowHandoff).toBe(promptProfile.workflowHandoff);
  expect(appendedPromptProfile.promptFragments).toEqual({
    primaryAssistantSystemPrompt: ["Existing primary fragment.", "Appended primary fragment."],
    explorerSystemPrompt: ["Existing explorer fragment."],
    taskSubagentPrompt: ["Appended task fragment."],
    conversationCompactionSystemPrompt: [],
    conversationCompactionPrompt: ["Appended compaction prompt fragment."],
  });
  expect(promptProfile.promptFragments.taskSubagentPrompt).toEqual([]);
});

test("keeps prompt profile reference when no provider/model prompt fragments are appended", () => {
  const promptProfile = resolveDefaultAssistantProviderModelPromptProfile({
    providerName: "openai",
    selectedModelId: "gpt-5.5",
  });

  const appendedPromptProfile = appendAssistantProviderModelPromptFragments({
    assistantProviderModelPromptProfile: promptProfile,
    promptFragments: {},
  });

  expect(appendedPromptProfile).toBe(promptProfile);
});
