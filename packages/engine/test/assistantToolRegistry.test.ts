import { expect, test } from "bun:test";
import {
  AssistantToolRegistry,
  appendProviderToolDefinitionDescription,
  createDefaultAssistantToolRegistry,
  type AssistantToolDefinition,
  type CustomAssistantToolDefinition,
  type CustomAssistantToolProviderDefinitionTurnContext,
  type ResolveCustomAssistantToolProviderDefinitionInput,
} from "../src/assistantToolRegistry.ts";

function createRegistryTestTool(toolName: AssistantToolDefinition["toolName"]): AssistantToolDefinition {
  return {
    toolName,
    executionPolicy: {
      workspaceEffectKind: "read_only",
      isAutoConcurrent: false,
      isAutoApprovedReadOnly: false,
      clearsSameTurnReadCoverageBeforeExecution: false,
    },
  };
}

function createRegistryTestCustomTool(input: {
  toolName?: string;
  isAutoConcurrent?: boolean;
  isAutoApprovedReadOnly?: boolean;
  workspaceEffectKind?: "read_only" | "workspace_change_possible";
  approvalPolicy?: CustomAssistantToolDefinition["approvalPolicy"] | undefined;
  resolveProviderToolDefinitionForTurn?: CustomAssistantToolDefinition["resolveProviderToolDefinitionForTurn"] | undefined;
} = {}): CustomAssistantToolDefinition {
  const toolName = input.toolName ?? "workspace_summary";
  return {
    toolName,
    providerToolDefinition: {
      toolName,
      description: "Summarize a workspace topic.",
      parameters: {
        type: "object",
        properties: { topic: { type: "string" } },
        required: ["topic"],
        additionalProperties: false,
      },
    },
    ...(input.resolveProviderToolDefinitionForTurn
      ? { resolveProviderToolDefinitionForTurn: input.resolveProviderToolDefinitionForTurn }
      : {}),
    ...(input.approvalPolicy ? { approvalPolicy: input.approvalPolicy } : {}),
    executionPolicy: {
      workspaceEffectKind: input.workspaceEffectKind ?? "read_only",
      isAutoConcurrent: input.isAutoConcurrent ?? false,
      isAutoApprovedReadOnly: input.isAutoApprovedReadOnly ?? false,
      clearsSameTurnReadCoverageBeforeExecution: input.workspaceEffectKind === "workspace_change_possible",
    },
    executor: async () => ({
      outcomeKind: "completed",
      toolResultText: "Custom summary complete.",
    }),
  };
}

const registryTestPrimaryTurnContext = {
  providerName: "openai",
  selectedModelId: "gpt-5.5",
  assistantTurnKind: "primary_assistant_agent",
  assistantAgentName: "understand",
} satisfies CustomAssistantToolProviderDefinitionTurnContext;

test("default assistant tool registry preserves built-in tool safety metadata", () => {
  const registry = createDefaultAssistantToolRegistry();

  expect(registry.resolveToolDefinition("read").executionPolicy).toEqual({
    workspaceEffectKind: "read_only",
    isAutoConcurrent: true,
    isAutoApprovedReadOnly: true,
    clearsSameTurnReadCoverageBeforeExecution: false,
  });
  expect(registry.resolveToolDefinition("task").executionPolicy).toEqual({
    workspaceEffectKind: "read_only",
    isAutoConcurrent: true,
    isAutoApprovedReadOnly: false,
    clearsSameTurnReadCoverageBeforeExecution: false,
  });
  expect(registry.resolveToolDefinition("bash").executionPolicy).toEqual({
    workspaceEffectKind: "workspace_change_possible",
    isAutoConcurrent: false,
    isAutoApprovedReadOnly: false,
    clearsSameTurnReadCoverageBeforeExecution: true,
  });
  expect(registry.resolveToolDefinition("write").executionPolicy).toEqual({
    workspaceEffectKind: "workspace_change_possible",
    isAutoConcurrent: false,
    isAutoApprovedReadOnly: false,
    clearsSameTurnReadCoverageBeforeExecution: true,
  });
});

test("assistant tool registry rejects duplicate built-in tools", () => {
  const duplicateTool = createRegistryTestTool("read");

  expect(() => new AssistantToolRegistry({ tools: [duplicateTool, duplicateTool] })).toThrow(
    "Assistant tool is already registered: read",
  );
});

test("assistant tool registry reports missing tools", () => {
  const registry = new AssistantToolRegistry();

  expect(() => registry.resolveToolDefinition("read")).toThrow("Assistant tool is not registered: read");
});

test("assistant tool registry registers custom provider definitions and default approval policy", () => {
  const customTool = createRegistryTestCustomTool();
  const registry = createDefaultAssistantToolRegistry({ additionalCustomTools: [customTool] });

  expect(registry.resolveCustomToolDefinition("workspace_summary")).toBe(customTool);
  expect(registry.listProviderToolDefinitionsForAvailableToolNames(["read", "workspace_summary"])).toEqual([
    customTool.providerToolDefinition,
  ]);
  expect(registry.listProviderToolDefinitionsForAvailableToolNames(["read"])).toEqual([]);
  expect(registry.resolveCustomToolApprovalPolicy(customTool)).toEqual({ approvalPolicyKind: "auto_approve" });
});

test("assistant tool registry resolves custom provider definitions for a concrete model turn", () => {
  const resolverInputs: ResolveCustomAssistantToolProviderDefinitionInput[] = [];
  const customTool = createRegistryTestCustomTool({
    resolveProviderToolDefinitionForTurn: (resolverInput) => {
      resolverInputs.push(resolverInput);
      if (resolverInput.selectedModelId !== "small-local-model") {
        return resolverInput.defaultProviderToolDefinition;
      }

      return appendProviderToolDefinitionDescription({
        providerToolDefinition: resolverInput.defaultProviderToolDefinition,
        additionalDescriptionParagraphs: [
          "Small-model guidance: use one exact topic at a time and do not infer missing files.",
        ],
      });
    },
  });
  const registry = createDefaultAssistantToolRegistry({ additionalCustomTools: [customTool] });

  const resolvedProviderToolDefinitions = registry.resolveProviderToolDefinitionsForTurn({
    availableToolNames: ["read", "workspace_summary"],
    turnContext: {
      ...registryTestPrimaryTurnContext,
      selectedModelId: "small-local-model",
      selectedReasoningEffort: "low",
    },
  });

  expect(resolvedProviderToolDefinitions).toEqual([
    {
      ...customTool.providerToolDefinition,
      description:
        "Summarize a workspace topic.\n\nSmall-model guidance: use one exact topic at a time and do not infer missing files.",
    },
  ]);
  expect(customTool.providerToolDefinition.description).toBe("Summarize a workspace topic.");
  expect(resolverInputs).toEqual([
    {
      ...registryTestPrimaryTurnContext,
      selectedModelId: "small-local-model",
      selectedReasoningEffort: "low",
      toolName: "workspace_summary",
      defaultProviderToolDefinition: customTool.providerToolDefinition,
    },
  ]);
});

test("assistant tool registry falls back to static custom provider definitions when no model resolver is registered", () => {
  const customTool = createRegistryTestCustomTool();
  const registry = createDefaultAssistantToolRegistry({ additionalCustomTools: [customTool] });

  const allCustomProviderToolDefinitions = registry.resolveProviderToolDefinitionsForTurn({
    turnContext: registryTestPrimaryTurnContext,
  });
  const selectedCustomProviderToolDefinitions = registry.resolveProviderToolDefinitionsForTurn({
    availableToolNames: ["read", "workspace_summary"],
    turnContext: registryTestPrimaryTurnContext,
  });
  const builtInOnlyProviderToolDefinitions = registry.resolveProviderToolDefinitionsForTurn({
    availableToolNames: ["read"],
    turnContext: registryTestPrimaryTurnContext,
  });

  expect(allCustomProviderToolDefinitions[0]).toBe(customTool.providerToolDefinition);
  expect(selectedCustomProviderToolDefinitions[0]).toBe(customTool.providerToolDefinition);
  expect(builtInOnlyProviderToolDefinitions).toEqual([]);
});

test("assistant tool registry rejects invalid model-aware custom provider definitions", () => {
  const wrongNameTool = createRegistryTestCustomTool({
    resolveProviderToolDefinitionForTurn: (resolverInput) => ({
      ...resolverInput.defaultProviderToolDefinition,
      toolName: "other_workspace_summary",
    }),
  });
  const emptyDescriptionTool = createRegistryTestCustomTool({
    toolName: "workspace_outline",
    resolveProviderToolDefinitionForTurn: (resolverInput) => ({
      ...resolverInput.defaultProviderToolDefinition,
      description: "",
    }),
  });

  expect(() =>
    createDefaultAssistantToolRegistry({ additionalCustomTools: [wrongNameTool] }).resolveProviderToolDefinitionsForTurn({
      turnContext: registryTestPrimaryTurnContext,
    })
  ).toThrow("Custom assistant tool provider definition name must match tool name: workspace_summary");
  expect(() =>
    createDefaultAssistantToolRegistry({ additionalCustomTools: [emptyDescriptionTool] }).resolveProviderToolDefinitionsForTurn({
      turnContext: registryTestPrimaryTurnContext,
    })
  ).toThrow();
});

test("appendProviderToolDefinitionDescription appends without mutating nested parameter schemas", () => {
  const customTool = createRegistryTestCustomTool();

  expect(appendProviderToolDefinitionDescription({
    providerToolDefinition: customTool.providerToolDefinition,
    additionalDescriptionParagraphs: [],
  })).toBe(customTool.providerToolDefinition);

  const appendedProviderToolDefinition = appendProviderToolDefinitionDescription({
    providerToolDefinition: customTool.providerToolDefinition,
    additionalDescriptionParagraphs: ["Use simple keywords.", "Return concise findings."],
  });

  expect(appendedProviderToolDefinition).toEqual({
    ...customTool.providerToolDefinition,
    description: "Summarize a workspace topic.\n\nUse simple keywords.\n\nReturn concise findings.",
  });
  expect(appendedProviderToolDefinition.parameters).toBe(customTool.providerToolDefinition.parameters);
  expect(customTool.providerToolDefinition.description).toBe("Summarize a workspace topic.");
});

test("assistant tool registry requires approval by default for custom workspace-changing tools", () => {
  const customTool = createRegistryTestCustomTool({
    toolName: "deploy_preview",
    workspaceEffectKind: "workspace_change_possible",
  });
  const registry = createDefaultAssistantToolRegistry({ additionalCustomTools: [customTool] });

  expect(registry.resolveCustomToolApprovalPolicy(customTool)).toEqual({
    approvalPolicyKind: "requires_user_approval",
    riskExplanation: "deploy_preview can change the workspace or external state, so it requires approval before running.",
  });
});

test("assistant tool registry rejects custom tool collisions", () => {
  expect(() => createDefaultAssistantToolRegistry({
    additionalCustomTools: [createRegistryTestCustomTool({ toolName: "read" })],
  })).toThrow("Custom assistant tool cannot use built-in tool name: read");
});

test("assistant tool registry accepts safe custom auto-concurrent read-only policies", () => {
  const customTool = createRegistryTestCustomTool({
    isAutoConcurrent: true,
    isAutoApprovedReadOnly: true,
  });
  const registry = createDefaultAssistantToolRegistry({ additionalCustomTools: [customTool] });

  expect(registry.resolveCustomToolDefinition("workspace_summary").executionPolicy).toEqual({
    workspaceEffectKind: "read_only",
    isAutoConcurrent: true,
    isAutoApprovedReadOnly: true,
    clearsSameTurnReadCoverageBeforeExecution: false,
  });
  expect(registry.resolveCustomToolApprovalPolicy(customTool)).toEqual({ approvalPolicyKind: "auto_approve" });
});

test("assistant tool registry rejects inconsistent custom execution policy combinations", () => {
  expect(() => createDefaultAssistantToolRegistry({
    additionalCustomTools: [createRegistryTestCustomTool({ isAutoConcurrent: true })],
  })).toThrow(
    "Custom assistant tool cannot be auto-concurrent unless it is auto-approved read-only: workspace_summary",
  );
  expect(() => createDefaultAssistantToolRegistry({
    additionalCustomTools: [createRegistryTestCustomTool({
      isAutoApprovedReadOnly: true,
      workspaceEffectKind: "workspace_change_possible",
    })],
  })).toThrow(
    "Custom assistant tool cannot be auto-approved read-only unless its workspace effect is read-only: workspace_summary",
  );
  expect(() => createDefaultAssistantToolRegistry({
    additionalCustomTools: [createRegistryTestCustomTool({
      isAutoConcurrent: true,
      isAutoApprovedReadOnly: true,
      approvalPolicy: {
        approvalPolicyKind: "requires_user_approval",
        riskExplanation: "External summary lookup requires approval.",
      },
    })],
  })).toThrow(
    "Custom assistant tool cannot be auto-approved read-only when it requires user approval: workspace_summary",
  );
});
