import type { ReasoningEffort } from "@buli/contracts";
import type { AssistantProviderName } from "./assistantProviderModelPromptProfile.ts";

export const DEFAULT_TASK_SUBAGENT_MAX_REASONING_EFFORT: ReasoningEffort = "medium";
export const DEFAULT_OPENAI_HIGH_TIER_TASK_SUBAGENT_MODEL_ID = "gpt-5.4";

export type TaskSubagentProviderModelSelectionReason =
  | "policy_model_override"
  | "known_openai_high_tier_default_downgrade"
  | "inherited_parent_model";

export type TaskSubagentReasoningEffortSelectionReason =
  | "parent_reasoning_effort_undefined"
  | "clamped_to_policy_maximum"
  | "inherited_within_policy_maximum";

export type TaskSubagentProviderModelSelectionPolicy = Readonly<{
  selectedModelIdOverride?: string | undefined;
  maximumReasoningEffort?: ReasoningEffort | undefined;
}>;

export type ResolveTaskSubagentProviderModelSelectionInput = Readonly<{
  parentAssistantProviderName: AssistantProviderName;
  parentSelectedModelId: string;
  parentSelectedReasoningEffort?: ReasoningEffort | undefined;
  policy?: TaskSubagentProviderModelSelectionPolicy | undefined;
}>;

export type TaskSubagentProviderModelSelection = Readonly<{
  taskSubagentSelectedModelId: string;
  taskSubagentSelectedReasoningEffort?: ReasoningEffort | undefined;
  modelSelectionReason: TaskSubagentProviderModelSelectionReason;
  reasoningEffortSelectionReason: TaskSubagentReasoningEffortSelectionReason;
}>;

const KNOWN_OPENAI_HIGH_TIER_PARENT_MODEL_IDS = new Set<string>([
  "gpt-5.5",
  "gpt-5.5-pro",
  "gpt-5.4-pro",
]);

const REASONING_EFFORT_RANK_BY_VALUE: Record<ReasoningEffort, number> = {
  none: 0,
  minimal: 1,
  low: 2,
  medium: 3,
  high: 4,
  xhigh: 5,
};

export function resolveTaskSubagentProviderModelSelection(
  input: ResolveTaskSubagentProviderModelSelectionInput,
): TaskSubagentProviderModelSelection {
  const taskSubagentModelSelection = resolveTaskSubagentSelectedModelId(input);
  const taskSubagentReasoningEffortSelection = resolveTaskSubagentSelectedReasoningEffort(input);

  return {
    taskSubagentSelectedModelId: taskSubagentModelSelection.taskSubagentSelectedModelId,
    ...(taskSubagentReasoningEffortSelection.taskSubagentSelectedReasoningEffort !== undefined
      ? { taskSubagentSelectedReasoningEffort: taskSubagentReasoningEffortSelection.taskSubagentSelectedReasoningEffort }
      : {}),
    modelSelectionReason: taskSubagentModelSelection.modelSelectionReason,
    reasoningEffortSelectionReason: taskSubagentReasoningEffortSelection.reasoningEffortSelectionReason,
  };
}

function resolveTaskSubagentSelectedModelId(input: ResolveTaskSubagentProviderModelSelectionInput): Readonly<{
  taskSubagentSelectedModelId: string;
  modelSelectionReason: TaskSubagentProviderModelSelectionReason;
}> {
  const selectedModelIdOverride = input.policy?.selectedModelIdOverride?.trim();
  if (selectedModelIdOverride) {
    return {
      taskSubagentSelectedModelId: selectedModelIdOverride,
      modelSelectionReason: "policy_model_override",
    };
  }

  if (
    input.parentAssistantProviderName === "openai" &&
    KNOWN_OPENAI_HIGH_TIER_PARENT_MODEL_IDS.has(input.parentSelectedModelId)
  ) {
    return {
      taskSubagentSelectedModelId: DEFAULT_OPENAI_HIGH_TIER_TASK_SUBAGENT_MODEL_ID,
      modelSelectionReason: "known_openai_high_tier_default_downgrade",
    };
  }

  return {
    taskSubagentSelectedModelId: input.parentSelectedModelId,
    modelSelectionReason: "inherited_parent_model",
  };
}

function resolveTaskSubagentSelectedReasoningEffort(input: ResolveTaskSubagentProviderModelSelectionInput): Readonly<{
  taskSubagentSelectedReasoningEffort?: ReasoningEffort | undefined;
  reasoningEffortSelectionReason: TaskSubagentReasoningEffortSelectionReason;
}> {
  if (input.parentSelectedReasoningEffort === undefined) {
    return { reasoningEffortSelectionReason: "parent_reasoning_effort_undefined" };
  }

  const maximumReasoningEffort = input.policy?.maximumReasoningEffort ?? DEFAULT_TASK_SUBAGENT_MAX_REASONING_EFFORT;
  if (isReasoningEffortGreaterThan(input.parentSelectedReasoningEffort, maximumReasoningEffort)) {
    return {
      taskSubagentSelectedReasoningEffort: maximumReasoningEffort,
      reasoningEffortSelectionReason: "clamped_to_policy_maximum",
    };
  }

  return {
    taskSubagentSelectedReasoningEffort: input.parentSelectedReasoningEffort,
    reasoningEffortSelectionReason: "inherited_within_policy_maximum",
  };
}

function isReasoningEffortGreaterThan(leftReasoningEffort: ReasoningEffort, rightReasoningEffort: ReasoningEffort): boolean {
  return REASONING_EFFORT_RANK_BY_VALUE[leftReasoningEffort] > REASONING_EFFORT_RANK_BY_VALUE[rightReasoningEffort];
}
