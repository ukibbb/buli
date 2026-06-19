import {
  READ_ONLY_ASSISTANT_MODE_TOOL_REQUEST_NAMES,
  WORKSPACE_INSPECTION_TOOL_REQUEST_NAMES,
  type AssistantAgentAccentColorName,
  type AssistantOperatingMode,
  type AssistantPrimaryAgentDisplayMetadata,
  type AssistantPrimaryAgentName,
  type AssistantSubagentName,
  type ProviderAvailableToolName,
  type WorkflowHandoffKind,
} from "@buli/contracts";

export type BuiltInPrimaryAssistantAgentSystemReminderKind =
  | "understand_mode_system_reminder"
  | "plan_mode_system_reminder"
  | "implementation_mode_system_reminder";

export type PrimaryAssistantAgentSystemPromptConfiguration =
  | {
    promptConfigurationKind: "built_in_system_reminder";
    systemReminderKind: BuiltInPrimaryAssistantAgentSystemReminderKind;
    additionalPromptSections?: readonly string[] | undefined;
  }
  | {
    promptConfigurationKind: "custom";
    systemReminderText?: string | undefined;
    additionalPromptSections?: readonly string[] | undefined;
  };

export type PrimaryAssistantAgentDefinition = {
  agentName: AssistantPrimaryAgentName;
  displayName: string;
  shortLabel: string;
  description?: string | undefined;
  accentColorName: AssistantAgentAccentColorName;
  isReadOnly: boolean;
  availableToolNames: readonly ProviderAvailableToolName[];
  systemPromptConfiguration: PrimaryAssistantAgentSystemPromptConfiguration;
  workflowHandoffKind?: WorkflowHandoffKind | undefined;
};

export type BuiltInSubagentSystemPromptKind = "explorer_system_prompt";

export type SubagentSystemPromptConfiguration =
  | {
    promptConfigurationKind: "built_in_subagent_prompt";
    systemPromptKind: BuiltInSubagentSystemPromptKind;
    additionalPromptSections?: readonly string[] | undefined;
  }
  | {
    promptConfigurationKind: "custom";
    systemPromptText: string;
    additionalPromptSections?: readonly string[] | undefined;
  };

export type SubagentDefinition = {
  subagentName: AssistantSubagentName;
  displayName: string;
  availableToolNames: readonly ProviderAvailableToolName[];
  systemPromptConfiguration: SubagentSystemPromptConfiguration;
  conversationSessionAssistantOperatingMode: AssistantOperatingMode;
};

export type AssistantAgentRegistryInput = {
  primaryAgents?: readonly PrimaryAssistantAgentDefinition[] | undefined;
  subagents?: readonly SubagentDefinition[] | undefined;
};

export class AssistantAgentRegistry {
  readonly #primaryAssistantAgentByName = new Map<AssistantPrimaryAgentName, PrimaryAssistantAgentDefinition>();
  readonly #subagentByName = new Map<AssistantSubagentName, SubagentDefinition>();

  constructor(input: AssistantAgentRegistryInput = {}) {
    for (const primaryAgent of input.primaryAgents ?? []) {
      this.registerPrimaryAgent(primaryAgent);
    }
    for (const subagent of input.subagents ?? []) {
      this.registerSubagent(subagent);
    }
  }

  registerPrimaryAgent(primaryAgent: PrimaryAssistantAgentDefinition): void {
    if (this.#primaryAssistantAgentByName.has(primaryAgent.agentName)) {
      throw new Error(`Assistant primary agent is already registered: ${primaryAgent.agentName}`);
    }

    this.#primaryAssistantAgentByName.set(primaryAgent.agentName, primaryAgent);
  }

  registerSubagent(subagent: SubagentDefinition): void {
    if (this.#subagentByName.has(subagent.subagentName)) {
      throw new Error(`Assistant subagent is already registered: ${subagent.subagentName}`);
    }

    this.#subagentByName.set(subagent.subagentName, subagent);
  }

  resolvePrimaryAgentDefinition(agentName: AssistantPrimaryAgentName): PrimaryAssistantAgentDefinition {
    const primaryAgent = this.#primaryAssistantAgentByName.get(agentName);
    if (!primaryAgent) {
      throw new Error(`Assistant primary agent is not registered: ${agentName}`);
    }

    return primaryAgent;
  }

  resolveSubagentDefinition(subagentName: AssistantSubagentName): SubagentDefinition {
    const subagent = this.#subagentByName.get(subagentName);
    if (!subagent) {
      throw new Error(`Assistant subagent is not registered: ${subagentName}`);
    }

    return subagent;
  }

  listPrimaryAgentDefinitions(): readonly PrimaryAssistantAgentDefinition[] {
    return [...this.#primaryAssistantAgentByName.values()];
  }

  listPrimaryAgentDisplayMetadata(): readonly AssistantPrimaryAgentDisplayMetadata[] {
    return this.listPrimaryAgentDefinitions().map((primaryAgent) => ({
      agentName: primaryAgent.agentName,
      displayName: primaryAgent.displayName,
      shortLabel: primaryAgent.shortLabel,
      ...(primaryAgent.description !== undefined ? { description: primaryAgent.description } : {}),
      accentColorName: primaryAgent.accentColorName,
    }));
  }

  listSubagentDefinitions(): readonly SubagentDefinition[] {
    return [...this.#subagentByName.values()];
  }
}

export const IMPLEMENTATION_ASSISTANT_MODE_TOOL_REQUEST_NAMES = [
  "bash",
  "read",
  "glob",
  "grep",
  "locate_codebase_symbols",
  "edit",
  "patch",
  "write",
  "task",
  "skill",
  "record_workflow_handoff",
] as const satisfies readonly ProviderAvailableToolName[];

export const DEFAULT_PRIMARY_ASSISTANT_AGENT_DEFINITIONS = [
  {
    agentName: "understand",
    displayName: "Understand Agent",
    shortLabel: "Understand",
    description: "Read-only agent for learning, source research, and clarification before planning.",
    accentColorName: "pink",
    isReadOnly: true,
    availableToolNames: READ_ONLY_ASSISTANT_MODE_TOOL_REQUEST_NAMES,
    systemPromptConfiguration: {
      promptConfigurationKind: "built_in_system_reminder",
      systemReminderKind: "understand_mode_system_reminder",
    },
    workflowHandoffKind: "understanding",
  },
  {
    agentName: "plan",
    displayName: "Plan Agent",
    shortLabel: "Plan",
    description: "Read-only agent for turning understanding into an executable implementation plan.",
    accentColorName: "amber",
    isReadOnly: true,
    availableToolNames: READ_ONLY_ASSISTANT_MODE_TOOL_REQUEST_NAMES,
    systemPromptConfiguration: {
      promptConfigurationKind: "built_in_system_reminder",
      systemReminderKind: "plan_mode_system_reminder",
    },
    workflowHandoffKind: "plan",
  },
  {
    agentName: "implementation",
    displayName: "Implementation Agent",
    shortLabel: "Implementation",
    description: "Agent for applying an agreed implementation plan and verifying the result.",
    accentColorName: "green",
    isReadOnly: false,
    availableToolNames: IMPLEMENTATION_ASSISTANT_MODE_TOOL_REQUEST_NAMES,
    systemPromptConfiguration: {
      promptConfigurationKind: "built_in_system_reminder",
      systemReminderKind: "implementation_mode_system_reminder",
    },
    workflowHandoffKind: "implementation",
  },
] as const satisfies readonly PrimaryAssistantAgentDefinition[];

export const DEFAULT_ASSISTANT_SUBAGENT_DEFINITIONS = [
  {
    subagentName: "explore",
    displayName: "Explorer",
    availableToolNames: WORKSPACE_INSPECTION_TOOL_REQUEST_NAMES,
    systemPromptConfiguration: {
      promptConfigurationKind: "built_in_subagent_prompt",
      systemPromptKind: "explorer_system_prompt",
    },
    conversationSessionAssistantOperatingMode: "understand",
  },
] as const satisfies readonly SubagentDefinition[];

export function createDefaultAssistantAgentRegistry(input: {
  additionalPrimaryAgents?: readonly PrimaryAssistantAgentDefinition[] | undefined;
  additionalSubagents?: readonly SubagentDefinition[] | undefined;
} = {}): AssistantAgentRegistry {
  return new AssistantAgentRegistry({
    primaryAgents: [
      ...DEFAULT_PRIMARY_ASSISTANT_AGENT_DEFINITIONS,
      ...(input.additionalPrimaryAgents ?? []),
    ],
    subagents: [
      ...DEFAULT_ASSISTANT_SUBAGENT_DEFINITIONS,
      ...(input.additionalSubagents ?? []),
    ],
  });
}

export const DEFAULT_PRIMARY_ASSISTANT_AGENT_DISPLAY_METADATA = createDefaultAssistantAgentRegistry()
  .listPrimaryAgentDisplayMetadata();
