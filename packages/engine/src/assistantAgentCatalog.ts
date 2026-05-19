import {
  ASSISTANT_TOOL_REQUEST_NAMES,
  READ_ONLY_ASSISTANT_MODE_TOOL_REQUEST_NAMES,
  WORKSPACE_INSPECTION_TOOL_REQUEST_NAMES,
  type AssistantOperatingMode,
  type AssistantSubagentName,
  type ProviderAvailableToolName,
} from "@buli/contracts";

export type BuiltInPrimaryAssistantAgent = {
  agentName: AssistantOperatingMode;
  displayName: string;
  isReadOnly: boolean;
  availableToolNames: readonly ProviderAvailableToolName[];
};

export type BuiltInSubagentDefinition = {
  subagentName: AssistantSubagentName;
  displayName: string;
  availableToolNames: readonly ProviderAvailableToolName[];
};

const PRIMARY_ASSISTANT_AGENT_BY_NAME = {
  understand: {
    agentName: "understand",
    displayName: "Understand Agent",
    isReadOnly: true,
    availableToolNames: READ_ONLY_ASSISTANT_MODE_TOOL_REQUEST_NAMES,
  },
  plan: {
    agentName: "plan",
    displayName: "Plan Agent",
    isReadOnly: true,
    availableToolNames: READ_ONLY_ASSISTANT_MODE_TOOL_REQUEST_NAMES,
  },
  implementation: {
    agentName: "implementation",
    displayName: "Implementation Agent",
    isReadOnly: false,
    availableToolNames: ASSISTANT_TOOL_REQUEST_NAMES,
  },
} as const satisfies Record<AssistantOperatingMode, BuiltInPrimaryAssistantAgent>;

const SUBAGENT_DEFINITION_BY_NAME = {
  explore: {
    subagentName: "explore",
    displayName: "Explorer",
    availableToolNames: WORKSPACE_INSPECTION_TOOL_REQUEST_NAMES,
  },
} as const satisfies Record<AssistantSubagentName, BuiltInSubagentDefinition>;

export function resolveBuiltInPrimaryAssistantAgent(agentName: AssistantOperatingMode): BuiltInPrimaryAssistantAgent {
  return PRIMARY_ASSISTANT_AGENT_BY_NAME[agentName];
}

export function resolveBuiltInSubagentDefinition(subagentName: AssistantSubagentName): BuiltInSubagentDefinition {
  return SUBAGENT_DEFINITION_BY_NAME[subagentName];
}
