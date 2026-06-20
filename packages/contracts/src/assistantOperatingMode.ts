import {
  AssistantPrimaryAgentNameSchema,
  DEFAULT_ASSISTANT_PRIMARY_AGENT_NAME,
  type AssistantPrimaryAgentName,
} from "./assistantAgent.ts";

/**
 * @deprecated Use AssistantPrimaryAgentNameSchema. This legacy alias is kept so
 * persisted sessions and older package consumers can continue to read/write the
 * historical assistantOperatingMode fields while the runtime moves to selected
 * primary-agent terminology.
 */
export const AssistantOperatingModeSchema = AssistantPrimaryAgentNameSchema;

/** @deprecated Use AssistantPrimaryAgentName. */
export type AssistantOperatingMode = AssistantPrimaryAgentName;

/** @deprecated Use DEFAULT_ASSISTANT_PRIMARY_AGENT_NAME. */
export const DEFAULT_ASSISTANT_OPERATING_MODE: AssistantOperatingMode = DEFAULT_ASSISTANT_PRIMARY_AGENT_NAME;
