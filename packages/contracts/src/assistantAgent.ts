import { z } from "zod";

export const AssistantPrimaryAgentNameSchema = z.enum(["understand", "plan", "implementation"]);
export type AssistantPrimaryAgentName = z.infer<typeof AssistantPrimaryAgentNameSchema>;

export const DEFAULT_ASSISTANT_PRIMARY_AGENT_NAME: AssistantPrimaryAgentName = "understand";

export const AssistantSubagentNameSchema = z.enum(["explore"]);
export type AssistantSubagentName = z.infer<typeof AssistantSubagentNameSchema>;

export const BUILT_IN_ASSISTANT_SUBAGENT_NAMES = ["explore"] as const satisfies readonly AssistantSubagentName[];

const ASSISTANT_SUBAGENT_NAME_SET: ReadonlySet<string> = new Set(BUILT_IN_ASSISTANT_SUBAGENT_NAMES);

export function isAssistantSubagentName(subagentName: string): subagentName is AssistantSubagentName {
  return ASSISTANT_SUBAGENT_NAME_SET.has(subagentName);
}
