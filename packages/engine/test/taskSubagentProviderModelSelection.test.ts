import { expect, test } from "bun:test";
import {
  resolveTaskSubagentProviderModelSelection,
  type ResolveTaskSubagentProviderModelSelectionInput,
} from "../src/taskSubagentProviderModelSelection.ts";

test("task subagent model selection downgrades known high-tier OpenAI parent models and clamps expensive reasoning", () => {
  expect(resolveOpenAiTaskSubagentProviderModelSelection({
    parentSelectedModelId: "gpt-5.5",
    parentSelectedReasoningEffort: "xhigh",
  })).toEqual({
    taskSubagentSelectedModelId: "gpt-5.4",
    taskSubagentSelectedReasoningEffort: "medium",
    modelSelectionReason: "known_openai_high_tier_default_downgrade",
    reasoningEffortSelectionReason: "clamped_to_policy_maximum",
  });

  expect(resolveOpenAiTaskSubagentProviderModelSelection({
    parentSelectedModelId: "gpt-5.5-pro",
    parentSelectedReasoningEffort: "high",
  })).toEqual({
    taskSubagentSelectedModelId: "gpt-5.4",
    taskSubagentSelectedReasoningEffort: "medium",
    modelSelectionReason: "known_openai_high_tier_default_downgrade",
    reasoningEffortSelectionReason: "clamped_to_policy_maximum",
  });

  expect(resolveOpenAiTaskSubagentProviderModelSelection({
    parentSelectedModelId: "gpt-5.4-pro",
    parentSelectedReasoningEffort: "low",
  })).toEqual({
    taskSubagentSelectedModelId: "gpt-5.4",
    taskSubagentSelectedReasoningEffort: "low",
    modelSelectionReason: "known_openai_high_tier_default_downgrade",
    reasoningEffortSelectionReason: "inherited_within_policy_maximum",
  });
});

test("task subagent model selection inherits unknown and already smaller models while clamping explicit reasoning", () => {
  expect(resolveOpenAiTaskSubagentProviderModelSelection({
    parentSelectedModelId: "gpt-5.4-mini",
    parentSelectedReasoningEffort: "high",
  })).toEqual({
    taskSubagentSelectedModelId: "gpt-5.4-mini",
    taskSubagentSelectedReasoningEffort: "medium",
    modelSelectionReason: "inherited_parent_model",
    reasoningEffortSelectionReason: "clamped_to_policy_maximum",
  });

  expect(resolveOpenAiTaskSubagentProviderModelSelection({
    parentSelectedModelId: "external-provider-model",
    parentSelectedReasoningEffort: "xhigh",
  })).toEqual({
    taskSubagentSelectedModelId: "external-provider-model",
    taskSubagentSelectedReasoningEffort: "medium",
    modelSelectionReason: "inherited_parent_model",
    reasoningEffortSelectionReason: "clamped_to_policy_maximum",
  });
});

test("task subagent model selection does not downgrade external providers that reuse OpenAI-like model ids", () => {
  expect(resolveTaskSubagentProviderModelSelection({
    parentAssistantProviderName: "external_provider_protocol",
    parentSelectedModelId: "gpt-5.5",
    parentSelectedReasoningEffort: "high",
  })).toEqual({
    taskSubagentSelectedModelId: "gpt-5.5",
    taskSubagentSelectedReasoningEffort: "medium",
    modelSelectionReason: "inherited_parent_model",
    reasoningEffortSelectionReason: "clamped_to_policy_maximum",
  });
});

test("task subagent model selection keeps undefined reasoning undefined to avoid adding unsupported settings", () => {
  expect(resolveOpenAiTaskSubagentProviderModelSelection({
    parentSelectedModelId: "gpt-5.5",
  })).toEqual({
    taskSubagentSelectedModelId: "gpt-5.4",
    modelSelectionReason: "known_openai_high_tier_default_downgrade",
    reasoningEffortSelectionReason: "parent_reasoning_effort_undefined",
  });
});

test("task subagent model selection lets explicit policy overrides win", () => {
  expect(resolveOpenAiTaskSubagentProviderModelSelection({
    parentSelectedModelId: "gpt-5.5",
    parentSelectedReasoningEffort: "xhigh",
    policy: {
      selectedModelIdOverride: "gpt-5.4-mini",
      maximumReasoningEffort: "low",
    },
  })).toEqual({
    taskSubagentSelectedModelId: "gpt-5.4-mini",
    taskSubagentSelectedReasoningEffort: "low",
    modelSelectionReason: "policy_model_override",
    reasoningEffortSelectionReason: "clamped_to_policy_maximum",
  });

  expect(resolveOpenAiTaskSubagentProviderModelSelection({
    parentSelectedModelId: "gpt-5.5",
    parentSelectedReasoningEffort: "high",
    policy: {
      maximumReasoningEffort: "xhigh",
    },
  })).toEqual({
    taskSubagentSelectedModelId: "gpt-5.4",
    taskSubagentSelectedReasoningEffort: "high",
    modelSelectionReason: "known_openai_high_tier_default_downgrade",
    reasoningEffortSelectionReason: "inherited_within_policy_maximum",
  });
});

function resolveOpenAiTaskSubagentProviderModelSelection(
  input: Omit<ResolveTaskSubagentProviderModelSelectionInput, "parentAssistantProviderName">,
): ReturnType<typeof resolveTaskSubagentProviderModelSelection> {
  return resolveTaskSubagentProviderModelSelection({
    parentAssistantProviderName: "openai",
    ...input,
  });
}
