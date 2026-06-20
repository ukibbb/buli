import {
  ASSISTANT_TOOL_REQUEST_NAMES,
  FILE_MUTATION_TOOL_REQUEST_NAMES,
  WORKSPACE_INSPECTION_TOOL_REQUEST_NAMES,
  ProviderToolDefinitionSchema,
  isAssistantToolRequestName,
  isCustomToolCallRequest,
  isFileMutationToolCallRequest,
  isWorkspaceInspectionToolCallRequest,
  type AssistantToolRequestName,
  type BuliDiagnosticLogger,
  type CustomToolCallDetail,
  type CustomToolCallRequest,
  type JsonValue,
  type ProviderAvailableToolName,
  type ProviderToolDefinition,
  type ReasoningEffort,
  type ToolCallRequest,
  type WorkspaceInspectionToolCallRequest,
} from "@buli/contracts";
import type { AssistantProviderName } from "./assistantProviderModelPromptProfile.ts";

export type AssistantToolWorkspaceEffectKind = "read_only" | "workspace_change_possible";

export type AssistantToolExecutionPolicy = {
  workspaceEffectKind: AssistantToolWorkspaceEffectKind;
  isAutoConcurrent: boolean;
  isAutoApprovedReadOnly: boolean;
  clearsSameTurnReadCoverageBeforeExecution: boolean;
};

export type AssistantToolDefinition = {
  toolName: AssistantToolRequestName;
  executionPolicy: AssistantToolExecutionPolicy;
};

export type CustomAssistantToolApprovalPolicy =
  | {
    approvalPolicyKind: "auto_approve";
  }
  | {
    approvalPolicyKind: "requires_user_approval";
    riskExplanation: string;
  };

export type CustomAssistantToolExecutionInput = {
  toolCallId: string;
  toolCallRequest: CustomToolCallRequest;
  workspaceRootPath: string;
  abortSignal: AbortSignal;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export type CustomAssistantToolExecutionOutcome =
  | {
    outcomeKind: "completed";
    toolResultText: string;
    toolResultJson?: JsonValue | undefined;
    toolResultSummary?: string | undefined;
    toolCallDetail?: CustomToolCallDetail | undefined;
    sessionToolResultText?: string | undefined;
    sessionToolCallDetail?: CustomToolCallDetail | undefined;
  }
  | {
    outcomeKind: "failed";
    toolResultText: string;
    failureExplanation: string;
    toolResultJson?: JsonValue | undefined;
    toolResultSummary?: string | undefined;
    toolCallDetail?: CustomToolCallDetail | undefined;
    sessionToolResultText?: string | undefined;
    sessionFailureExplanation?: string | undefined;
    sessionToolCallDetail?: CustomToolCallDetail | undefined;
  };

export type CustomAssistantToolExecutor = (
  input: CustomAssistantToolExecutionInput,
) => Promise<CustomAssistantToolExecutionOutcome>;

export type CustomAssistantToolProviderDefinitionTurnKind = "primary_assistant_agent" | "task_subagent";

export type CustomAssistantToolProviderDefinitionTurnContext = Readonly<{
  providerName: AssistantProviderName;
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort | undefined;
  assistantTurnKind: CustomAssistantToolProviderDefinitionTurnKind;
  assistantAgentName: string;
}>;

export type ResolveCustomAssistantToolProviderDefinitionInput =
  & CustomAssistantToolProviderDefinitionTurnContext
  & Readonly<{
    toolName: string;
    defaultProviderToolDefinition: ProviderToolDefinition;
  }>;

export type CustomAssistantToolProviderDefinitionResolver = (
  input: ResolveCustomAssistantToolProviderDefinitionInput,
) => ProviderToolDefinition;

export type ResolveCustomAssistantToolProviderDefinitionsForTurnInput = Readonly<{
  availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
  turnContext: CustomAssistantToolProviderDefinitionTurnContext;
}>;

export type CustomAssistantToolDefinition = {
  toolName: string;
  providerToolDefinition: ProviderToolDefinition;
  resolveProviderToolDefinitionForTurn?: CustomAssistantToolProviderDefinitionResolver | undefined;
  executionPolicy: AssistantToolExecutionPolicy;
  approvalPolicy?: CustomAssistantToolApprovalPolicy | undefined;
  executor: CustomAssistantToolExecutor;
};

export type RegisteredAssistantToolDefinition = AssistantToolDefinition | CustomAssistantToolDefinition;

export type AutoApprovedReadOnlyToolCallRequest = WorkspaceInspectionToolCallRequest | CustomToolCallRequest;

export type AssistantToolRegistryInput = {
  tools?: readonly AssistantToolDefinition[] | undefined;
  customTools?: readonly CustomAssistantToolDefinition[] | undefined;
};

const WORKSPACE_INSPECTION_TOOL_REQUEST_NAME_SET: ReadonlySet<string> = new Set(WORKSPACE_INSPECTION_TOOL_REQUEST_NAMES);
const FILE_MUTATION_TOOL_REQUEST_NAME_SET: ReadonlySet<string> = new Set(FILE_MUTATION_TOOL_REQUEST_NAMES);

export class AssistantToolRegistry {
  readonly #builtInToolByName = new Map<AssistantToolRequestName, AssistantToolDefinition>();
  readonly #customToolByName = new Map<string, CustomAssistantToolDefinition>();

  constructor(input: AssistantToolRegistryInput = {}) {
    for (const tool of input.tools ?? []) {
      this.registerTool(tool);
    }
    for (const customTool of input.customTools ?? []) {
      this.registerCustomTool(customTool);
    }
  }

  registerTool(tool: AssistantToolDefinition): void {
    if (this.hasRegisteredToolName(tool.toolName)) {
      throw new Error(`Assistant tool is already registered: ${tool.toolName}`);
    }

    assertAssistantToolExecutionPolicyIsValid({
      toolName: tool.toolName,
      toolKind: "built-in",
      executionPolicy: tool.executionPolicy,
    });

    this.#builtInToolByName.set(tool.toolName, tool);
  }

  registerCustomTool(customTool: CustomAssistantToolDefinition): void {
    this.assertCustomToolCanBeRegistered(customTool);
    this.#customToolByName.set(customTool.toolName, customTool);
  }

  resolveToolDefinition(toolName: ProviderAvailableToolName): RegisteredAssistantToolDefinition {
    if (isAssistantToolRequestName(toolName)) {
      const builtInToolDefinition = this.#builtInToolByName.get(toolName);
      if (!builtInToolDefinition) {
        throw new Error(`Assistant tool is not registered: ${toolName}`);
      }

      return builtInToolDefinition;
    }

    return this.resolveCustomToolDefinition(toolName);
  }

  resolveCustomToolDefinition(toolName: string): CustomAssistantToolDefinition {
    const customToolDefinition = this.#customToolByName.get(toolName);
    if (!customToolDefinition) {
      throw new Error(`Custom assistant tool is not registered: ${toolName}`);
    }

    return customToolDefinition;
  }

  listToolDefinitions(): readonly RegisteredAssistantToolDefinition[] {
    return [
      ...this.#builtInToolByName.values(),
      ...this.#customToolByName.values(),
    ];
  }

  listCustomToolDefinitions(): readonly CustomAssistantToolDefinition[] {
    return [...this.#customToolByName.values()];
  }

  listProviderToolDefinitionsForAvailableToolNames(
    availableToolNames: readonly ProviderAvailableToolName[] | undefined,
  ): readonly ProviderToolDefinition[] {
    return this.listCustomToolDefinitionsForAvailableToolNames(availableToolNames).map(
      (customToolDefinition) => customToolDefinition.providerToolDefinition,
    );
  }

  resolveProviderToolDefinitionsForTurn(
    input: ResolveCustomAssistantToolProviderDefinitionsForTurnInput,
  ): readonly ProviderToolDefinition[] {
    return this.listCustomToolDefinitionsForAvailableToolNames(input.availableToolNames).map((customToolDefinition) =>
      this.resolveCustomProviderToolDefinitionForTurn({
        customToolDefinition,
        turnContext: input.turnContext,
      })
    );
  }

  isRegisteredCustomToolName(toolName: string): boolean {
    return this.#customToolByName.has(toolName);
  }

  isAutoConcurrentToolCallRequest(toolCallRequest: ToolCallRequest): boolean {
    return this.#resolveToolDefinitionIfRegistered(toolCallRequest.toolName)?.executionPolicy.isAutoConcurrent ?? false;
  }

  isAutoApprovedReadOnlyToolCallRequest(
    toolCallRequest: ToolCallRequest,
  ): toolCallRequest is AutoApprovedReadOnlyToolCallRequest {
    const registeredToolDefinition = this.#resolveToolDefinitionIfRegistered(toolCallRequest.toolName);
    if (!registeredToolDefinition?.executionPolicy.isAutoApprovedReadOnly) {
      return false;
    }

    return isWorkspaceInspectionToolCallRequest(toolCallRequest) || isCustomToolCallRequest(toolCallRequest);
  }

  shouldClearSameTurnReadCoverageBeforeExecution(toolCallRequest: ToolCallRequest): boolean {
    return this.#resolveToolDefinitionIfRegistered(toolCallRequest.toolName)?.executionPolicy
      .clearsSameTurnReadCoverageBeforeExecution ?? false;
  }

  resolveCustomToolApprovalPolicy(customToolDefinition: CustomAssistantToolDefinition): CustomAssistantToolApprovalPolicy {
    if (customToolDefinition.approvalPolicy) {
      return customToolDefinition.approvalPolicy;
    }

    if (customToolDefinition.executionPolicy.workspaceEffectKind === "workspace_change_possible") {
      return {
        approvalPolicyKind: "requires_user_approval",
        riskExplanation: `${customToolDefinition.toolName} can change the workspace or external state, so it requires approval before running.`,
      };
    }

    return { approvalPolicyKind: "auto_approve" };
  }

  #resolveToolDefinitionIfRegistered(toolName: ProviderAvailableToolName): RegisteredAssistantToolDefinition | undefined {
    if (isAssistantToolRequestName(toolName)) {
      return this.#builtInToolByName.get(toolName);
    }

    return this.#customToolByName.get(toolName);
  }

  private hasRegisteredToolName(toolName: string): boolean {
    return (isAssistantToolRequestName(toolName) && this.#builtInToolByName.has(toolName)) || this.#customToolByName.has(toolName);
  }

  private assertCustomToolCanBeRegistered(customTool: CustomAssistantToolDefinition): void {
    if (isAssistantToolRequestName(customTool.toolName)) {
      throw new Error(`Custom assistant tool cannot use built-in tool name: ${customTool.toolName}`);
    }
    if (this.hasRegisteredToolName(customTool.toolName)) {
      throw new Error(`Assistant tool is already registered: ${customTool.toolName}`);
    }

    assertAssistantToolExecutionPolicyIsValid({
      toolName: customTool.toolName,
      toolKind: "custom",
      executionPolicy: customTool.executionPolicy,
    });

    if (customTool.executionPolicy.isAutoConcurrent && !customTool.executionPolicy.isAutoApprovedReadOnly) {
      throw new Error(
        `Custom assistant tool cannot be auto-concurrent unless it is auto-approved read-only: ${customTool.toolName}`,
      );
    }

    if (
      customTool.executionPolicy.isAutoApprovedReadOnly &&
      this.resolveCustomToolApprovalPolicy(customTool).approvalPolicyKind === "requires_user_approval"
    ) {
      throw new Error(
        `Custom assistant tool cannot be auto-approved read-only when it requires user approval: ${customTool.toolName}`,
      );
    }

    const parsedProviderToolDefinition = ProviderToolDefinitionSchema.parse(customTool.providerToolDefinition);
    if (parsedProviderToolDefinition.toolName !== customTool.toolName) {
      throw new Error(
        `Custom assistant tool provider definition name must match tool name: ${customTool.toolName}`,
      );
    }
  }

  private listCustomToolDefinitionsForAvailableToolNames(
    availableToolNames: readonly ProviderAvailableToolName[] | undefined,
  ): readonly CustomAssistantToolDefinition[] {
    if (!availableToolNames) {
      return this.listCustomToolDefinitions();
    }

    return availableToolNames.flatMap((availableToolName) => {
      const customToolDefinition = this.#customToolByName.get(availableToolName);
      return customToolDefinition ? [customToolDefinition] : [];
    });
  }

  private resolveCustomProviderToolDefinitionForTurn(input: {
    customToolDefinition: CustomAssistantToolDefinition;
    turnContext: CustomAssistantToolProviderDefinitionTurnContext;
  }): ProviderToolDefinition {
    const resolvedProviderToolDefinition = input.customToolDefinition.resolveProviderToolDefinitionForTurn?.({
      ...input.turnContext,
      toolName: input.customToolDefinition.toolName,
      defaultProviderToolDefinition: input.customToolDefinition.providerToolDefinition,
    }) ?? input.customToolDefinition.providerToolDefinition;

    this.assertProviderToolDefinitionBelongsToCustomTool({
      customToolName: input.customToolDefinition.toolName,
      providerToolDefinition: resolvedProviderToolDefinition,
    });
    return resolvedProviderToolDefinition;
  }

  private assertProviderToolDefinitionBelongsToCustomTool(input: {
    customToolName: string;
    providerToolDefinition: ProviderToolDefinition;
  }): void {
    const parsedProviderToolDefinition = ProviderToolDefinitionSchema.parse(input.providerToolDefinition);
    if (parsedProviderToolDefinition.toolName !== input.customToolName) {
      throw new Error(
        `Custom assistant tool provider definition name must match tool name: ${input.customToolName}`,
      );
    }
  }
}

function assertAssistantToolExecutionPolicyIsValid(input: {
  toolName: string;
  toolKind: "built-in" | "custom";
  executionPolicy: AssistantToolExecutionPolicy;
}): void {
  const toolLabel = input.toolKind === "custom" ? "Custom assistant tool" : "Assistant tool";

  if (
    input.executionPolicy.isAutoApprovedReadOnly &&
    input.executionPolicy.workspaceEffectKind !== "read_only"
  ) {
    throw new Error(
      `${toolLabel} cannot be auto-approved read-only unless its workspace effect is read-only: ${input.toolName}`,
    );
  }

  if (
    input.executionPolicy.isAutoApprovedReadOnly &&
    input.executionPolicy.clearsSameTurnReadCoverageBeforeExecution
  ) {
    throw new Error(
      `${toolLabel} cannot be auto-approved read-only and clear same-turn read coverage: ${input.toolName}`,
    );
  }
}

export function appendProviderToolDefinitionDescription(input: {
  providerToolDefinition: ProviderToolDefinition;
  additionalDescriptionParagraphs: readonly string[];
}): ProviderToolDefinition {
  if (input.additionalDescriptionParagraphs.length === 0) {
    return input.providerToolDefinition;
  }

  return {
    ...input.providerToolDefinition,
    description: [
      input.providerToolDefinition.description,
      ...input.additionalDescriptionParagraphs,
    ].join("\n\n"),
  };
}

export const DEFAULT_ASSISTANT_TOOL_DEFINITIONS = ASSISTANT_TOOL_REQUEST_NAMES.map((toolName): AssistantToolDefinition => {
  const isWorkspaceInspectionTool = WORKSPACE_INSPECTION_TOOL_REQUEST_NAME_SET.has(toolName);
  const isFileMutationTool = FILE_MUTATION_TOOL_REQUEST_NAME_SET.has(toolName);
  const isTaskTool = toolName === "task";
  const canChangeWorkspace = toolName === "bash" || isFileMutationTool;

  return {
    toolName,
    executionPolicy: {
      workspaceEffectKind: canChangeWorkspace ? "workspace_change_possible" : "read_only",
      isAutoConcurrent: isWorkspaceInspectionTool || isTaskTool,
      isAutoApprovedReadOnly: isWorkspaceInspectionTool,
      clearsSameTurnReadCoverageBeforeExecution: canChangeWorkspace,
    },
  };
});

export function createDefaultAssistantToolRegistry(input: {
  additionalTools?: readonly AssistantToolDefinition[] | undefined;
  additionalCustomTools?: readonly CustomAssistantToolDefinition[] | undefined;
} = {}): AssistantToolRegistry {
  return new AssistantToolRegistry({
    tools: [
      ...DEFAULT_ASSISTANT_TOOL_DEFINITIONS,
      ...(input.additionalTools ?? []),
    ],
    customTools: input.additionalCustomTools,
  });
}

export function isToolCallRequestAutoApprovedReadOnlyWithDefaultRegistry(
  toolCallRequest: ToolCallRequest,
): toolCallRequest is WorkspaceInspectionToolCallRequest {
  return createDefaultAssistantToolRegistry().isAutoApprovedReadOnlyToolCallRequest(toolCallRequest) &&
    isWorkspaceInspectionToolCallRequest(toolCallRequest);
}

export function isToolCallRequestWorkspaceChangingWithDefaultRegistry(toolCallRequest: ToolCallRequest): boolean {
  return createDefaultAssistantToolRegistry().shouldClearSameTurnReadCoverageBeforeExecution(toolCallRequest) ||
    isFileMutationToolCallRequest(toolCallRequest);
}
