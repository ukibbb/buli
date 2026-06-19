import { z } from "zod";

export const MAX_ASSISTANT_AGENT_NAME_LENGTH = 64;
export const ASSISTANT_AGENT_NAME_PATTERN_TEXT = "^[a-z0-9]+(?:[._-][a-z0-9]+)*$";

const AssistantAgentNameSchema = z
  .string()
  .min(1)
  .max(MAX_ASSISTANT_AGENT_NAME_LENGTH)
  .regex(new RegExp(ASSISTANT_AGENT_NAME_PATTERN_TEXT));

export const AssistantPrimaryAgentNameSchema = AssistantAgentNameSchema;
export type AssistantPrimaryAgentName = z.infer<typeof AssistantPrimaryAgentNameSchema>;

export const BUILT_IN_ASSISTANT_PRIMARY_AGENT_NAMES = ["understand", "plan", "implementation"] as const;
export type BuiltInAssistantPrimaryAgentName = (typeof BUILT_IN_ASSISTANT_PRIMARY_AGENT_NAMES)[number];

export const DEFAULT_ASSISTANT_PRIMARY_AGENT_NAME = "understand" satisfies BuiltInAssistantPrimaryAgentName;

export const AssistantSubagentNameSchema = AssistantAgentNameSchema;
export type AssistantSubagentName = z.infer<typeof AssistantSubagentNameSchema>;

export const BUILT_IN_ASSISTANT_SUBAGENT_NAMES = ["explore"] as const;
export type BuiltInAssistantSubagentName = (typeof BUILT_IN_ASSISTANT_SUBAGENT_NAMES)[number];

export const AssistantAgentAccentColorNameSchema = z.enum(["pink", "amber", "green", "blue", "cyan", "purple", "gray"]);
export type AssistantAgentAccentColorName = z.infer<typeof AssistantAgentAccentColorNameSchema>;

export const AssistantPrimaryAgentDisplayMetadataSchema = z
  .object({
    agentName: AssistantPrimaryAgentNameSchema,
    displayName: z.string().min(1),
    shortLabel: z.string().min(1),
    description: z.string().min(1).optional(),
    accentColorName: AssistantAgentAccentColorNameSchema.optional(),
  })
  .strict();
export type AssistantPrimaryAgentDisplayMetadata = z.infer<typeof AssistantPrimaryAgentDisplayMetadataSchema>;

export const DEFAULT_ASSISTANT_PRIMARY_AGENT_DISPLAY_METADATA = [
  {
    agentName: "understand",
    displayName: "Understand Agent",
    shortLabel: "Understand",
    description: "Read-only agent for learning, source research, and clarification before planning.",
    accentColorName: "pink",
  },
  {
    agentName: "plan",
    displayName: "Plan Agent",
    shortLabel: "Plan",
    description: "Read-only agent for turning understanding into an executable implementation plan.",
    accentColorName: "amber",
  },
  {
    agentName: "implementation",
    displayName: "Implementation Agent",
    shortLabel: "Implementation",
    description: "Agent for applying an agreed implementation plan and verifying the result.",
    accentColorName: "green",
  },
] as const satisfies readonly AssistantPrimaryAgentDisplayMetadata[];

const BUILT_IN_ASSISTANT_PRIMARY_AGENT_NAME_SET: ReadonlySet<string> = new Set(BUILT_IN_ASSISTANT_PRIMARY_AGENT_NAMES);
const BUILT_IN_ASSISTANT_SUBAGENT_NAME_SET: ReadonlySet<string> = new Set(BUILT_IN_ASSISTANT_SUBAGENT_NAMES);

export function isAssistantPrimaryAgentName(agentName: string): agentName is AssistantPrimaryAgentName {
  return AssistantPrimaryAgentNameSchema.safeParse(agentName).success;
}

export function isBuiltInAssistantPrimaryAgentName(agentName: string): agentName is BuiltInAssistantPrimaryAgentName {
  return BUILT_IN_ASSISTANT_PRIMARY_AGENT_NAME_SET.has(agentName);
}

export function isAssistantSubagentName(subagentName: string): subagentName is AssistantSubagentName {
  return AssistantSubagentNameSchema.safeParse(subagentName).success;
}

export function isBuiltInAssistantSubagentName(subagentName: string): subagentName is BuiltInAssistantSubagentName {
  return BUILT_IN_ASSISTANT_SUBAGENT_NAME_SET.has(subagentName);
}
