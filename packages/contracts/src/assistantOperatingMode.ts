import {
  AssistantPrimaryAgentNameSchema,
  DEFAULT_ASSISTANT_PRIMARY_AGENT_NAME,
  type AssistantPrimaryAgentName,
} from "./assistantAgent.ts";

export const AssistantOperatingModeSchema = AssistantPrimaryAgentNameSchema;
export type AssistantOperatingMode = AssistantPrimaryAgentName;

export const DEFAULT_ASSISTANT_OPERATING_MODE: AssistantOperatingMode = DEFAULT_ASSISTANT_PRIMARY_AGENT_NAME;
