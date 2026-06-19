import type { AssistantOperatingMode, AssistantSubagentName, ProviderAvailableToolName } from "@buli/contracts";
import {
  createDefaultAssistantAgentRegistry,
  type PrimaryAssistantAgentDefinition,
  type SubagentDefinition,
} from "./assistantAgentRegistry.ts";

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

const defaultAssistantAgentRegistry = createDefaultAssistantAgentRegistry();

export function resolveBuiltInPrimaryAssistantAgent(agentName: AssistantOperatingMode): BuiltInPrimaryAssistantAgent {
  return toBuiltInPrimaryAssistantAgent(defaultAssistantAgentRegistry.resolvePrimaryAgentDefinition(agentName));
}

export function resolveBuiltInSubagentDefinition(subagentName: AssistantSubagentName): BuiltInSubagentDefinition {
  return toBuiltInSubagentDefinition(defaultAssistantAgentRegistry.resolveSubagentDefinition(subagentName));
}

function toBuiltInPrimaryAssistantAgent(primaryAgent: PrimaryAssistantAgentDefinition): BuiltInPrimaryAssistantAgent {
  return {
    agentName: primaryAgent.agentName,
    displayName: primaryAgent.displayName,
    isReadOnly: primaryAgent.isReadOnly,
    availableToolNames: primaryAgent.availableToolNames,
  };
}

function toBuiltInSubagentDefinition(subagent: SubagentDefinition): BuiltInSubagentDefinition {
  return {
    subagentName: subagent.subagentName,
    displayName: subagent.displayName,
    availableToolNames: subagent.availableToolNames,
  };
}
