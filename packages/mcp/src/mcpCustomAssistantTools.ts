import {
  JsonValueSchema,
  type JsonObject,
  type JsonValue,
} from "@buli/contracts";
import type {
  CustomAssistantToolDefinition,
  CustomAssistantToolExecutionOutcome,
} from "@buli/engine";
import { normalizeMcpToolInputSchema } from "./mcpToolSchemaNormalizer.ts";
import type { McpToolResultRetentionPolicy } from "./mcpServerConfiguration.ts";
import { projectMcpToolResultRetention } from "./mcpToolResultRetention.ts";

export const NOVIBE_MCP_CUSTOM_TOOL_NAME_PREFIX = "novibe_";
export const DEFAULT_MCP_TOOL_RESULT_RETENTION_POLICY: McpToolResultRetentionPolicy = "full";

export type ListedMcpToolDefinition = Readonly<{
  name: string;
  description?: string | undefined;
  inputSchema?: unknown | undefined;
}>;

export type McpToolResultContent = Readonly<Record<string, unknown>>;

export type McpToolCallResult = Readonly<{
  content?: readonly McpToolResultContent[] | undefined;
  structuredContent?: unknown | undefined;
  isError?: boolean | undefined;
}>;

export type McpToolCallInput = Readonly<{
  mcpToolName: string;
  argumentsJson: JsonObject;
  abortSignal: AbortSignal;
}>;

export type CallMcpTool = (input: McpToolCallInput) => Promise<McpToolCallResult>;

export type CreateMcpCustomAssistantToolsInput = Readonly<{
  serverName: string;
  serverDisplayName?: string | undefined;
  listedMcpTools: readonly ListedMcpToolDefinition[];
  callMcpTool: CallMcpTool;
  toolResultRetention?: McpToolResultRetentionPolicy | undefined;
}>;

export type NoVibeMcpToolResultContent = McpToolResultContent;
export type NoVibeMcpToolCallResult = McpToolCallResult;
export type NoVibeMcpToolCallInput = McpToolCallInput;
export type CallNoVibeMcpTool = CallMcpTool;

export type CreateNoVibeMcpCustomAssistantToolsInput = Readonly<{
  listedMcpTools: readonly ListedMcpToolDefinition[];
  callNoVibeMcpTool: CallNoVibeMcpTool;
  toolResultRetention?: McpToolResultRetentionPolicy | undefined;
}>;

export function createMcpCustomAssistantTools(
  input: CreateMcpCustomAssistantToolsInput,
): readonly CustomAssistantToolDefinition[] {
  const claimedCustomToolNames = new Set<string>();
  const serverDisplayName = input.serverDisplayName?.trim() || input.serverName.trim() || "MCP";
  const toolResultRetention = input.toolResultRetention ?? DEFAULT_MCP_TOOL_RESULT_RETENTION_POLICY;

  return input.listedMcpTools.map((listedMcpTool) => {
    const customToolName = createUniqueMcpCustomToolName({
      serverName: input.serverName,
      mcpToolName: listedMcpTool.name,
      claimedCustomToolNames,
    });
    const toolDisplayName = `${serverDisplayName} ${listedMcpTool.name}`;

    return {
      toolName: customToolName,
      providerToolDefinition: {
        toolName: customToolName,
        description: listedMcpTool.description?.trim() || `Call the ${serverDisplayName} MCP tool ${listedMcpTool.name}.`,
        parameters: normalizeMcpToolInputSchema(listedMcpTool.inputSchema),
      },
      executionPolicy: {
        workspaceEffectKind: "read_only",
        isAutoConcurrent: true,
        isAutoApprovedReadOnly: true,
        clearsSameTurnReadCoverageBeforeExecution: false,
      },
      approvalPolicy: { approvalPolicyKind: "auto_approve" },
      executor: async (executionInput) => {
        try {
          const mcpToolCallResult = await input.callMcpTool({
            mcpToolName: listedMcpTool.name,
            argumentsJson: executionInput.toolCallRequest.toolArgumentsJson,
            abortSignal: executionInput.abortSignal,
          });

          return createMcpCustomToolExecutionOutcome({
            customToolName,
            toolDisplayName,
            serverDisplayName,
            mcpToolName: listedMcpTool.name,
            toolArgumentsJson: executionInput.toolCallRequest.toolArgumentsJson,
            mcpToolCallResult,
            toolResultRetention,
          });
        } catch (error) {
          return createMcpCustomToolThrownErrorOutcome({
            customToolName,
            toolDisplayName,
            serverDisplayName,
            toolArgumentsJson: executionInput.toolCallRequest.toolArgumentsJson,
            error,
          });
        }
      },
    } satisfies CustomAssistantToolDefinition;
  });
}

export function createNoVibeMcpCustomAssistantTools(
  input: CreateNoVibeMcpCustomAssistantToolsInput,
): readonly CustomAssistantToolDefinition[] {
  return createMcpCustomAssistantTools({
    serverName: "novibe",
    serverDisplayName: "NoVibe",
    listedMcpTools: input.listedMcpTools,
    callMcpTool: input.callNoVibeMcpTool,
    ...(input.toolResultRetention !== undefined ? { toolResultRetention: input.toolResultRetention } : {}),
  });
}

export function sanitizeMcpCustomToolNameSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "mcp";
}

export function sanitizeMcpCustomToolName(input: { serverName: string; mcpToolName: string }): string {
  return [
    sanitizeMcpCustomToolNameSegment(input.serverName),
    sanitizeMcpCustomToolNameSegment(input.mcpToolName),
  ].join("_");
}

export function sanitizeNoVibeMcpCustomToolName(mcpToolName: string): string {
  return sanitizeMcpCustomToolName({ serverName: "novibe", mcpToolName });
}

function createUniqueMcpCustomToolName(input: {
  serverName: string;
  mcpToolName: string;
  claimedCustomToolNames: Set<string>;
}): string {
  const baseToolName = sanitizeMcpCustomToolName({ serverName: input.serverName, mcpToolName: input.mcpToolName });
  if (!input.claimedCustomToolNames.has(baseToolName)) {
    input.claimedCustomToolNames.add(baseToolName);
    return baseToolName;
  }

  for (let suffix = 2; suffix < Number.MAX_SAFE_INTEGER; suffix += 1) {
    const candidateToolName = `${baseToolName}_${suffix}`;
    if (!input.claimedCustomToolNames.has(candidateToolName)) {
      input.claimedCustomToolNames.add(candidateToolName);
      return candidateToolName;
    }
  }

  throw new Error(`Unable to create a unique MCP custom tool name for ${input.serverName}/${input.mcpToolName}.`);
}

function createMcpCustomToolExecutionOutcome(input: {
  customToolName: string;
  toolDisplayName: string;
  serverDisplayName: string;
  mcpToolName: string;
  toolArgumentsJson: JsonObject;
  mcpToolCallResult: McpToolCallResult;
  toolResultRetention: McpToolResultRetentionPolicy;
}): CustomAssistantToolExecutionOutcome {
  const toolResultText = formatMcpToolResultText(input.mcpToolCallResult, input.serverDisplayName);
  const toolResultJson = parseMcpStructuredContent(input.mcpToolCallResult.structuredContent);
  const toolResultSummary = summarizeToolResultText({ toolResultText, serverDisplayName: input.serverDisplayName });
  const toolCallDetail = {
    toolName: input.customToolName,
    toolDisplayName: input.toolDisplayName,
    toolArgumentsJson: input.toolArgumentsJson,
    ...(toolResultJson !== undefined ? { toolResultJson } : {}),
    toolResultSummary,
  };
  const retainedResult = projectMcpToolResultRetention({
    toolResultRetention: input.toolResultRetention,
    customToolName: input.customToolName,
    toolDisplayName: input.toolDisplayName,
    serverDisplayName: input.serverDisplayName,
    mcpToolName: input.mcpToolName,
    toolArgumentsJson: input.toolArgumentsJson,
    toolResultText,
    toolResultSummary,
    ...(toolResultJson !== undefined ? { toolResultJson } : {}),
  });

  if (input.mcpToolCallResult.isError === true) {
    return {
      outcomeKind: "failed",
      toolResultText,
      failureExplanation: toolResultText,
      ...(toolResultJson !== undefined ? { toolResultJson } : {}),
      toolResultSummary,
      toolCallDetail,
      ...retainedResult,
    };
  }

  return {
    outcomeKind: "completed",
    toolResultText,
    ...(toolResultJson !== undefined ? { toolResultJson } : {}),
    toolResultSummary,
    toolCallDetail,
    ...retainedResult,
  };
}

function createMcpCustomToolThrownErrorOutcome(input: {
  customToolName: string;
  toolDisplayName: string;
  serverDisplayName: string;
  toolArgumentsJson: JsonObject;
  error: unknown;
}): CustomAssistantToolExecutionOutcome {
  const failureExplanation = input.error instanceof Error ? input.error.message : String(input.error);
  const toolResultText = `${input.serverDisplayName} MCP tool call failed: ${failureExplanation}`;
  return {
    outcomeKind: "failed",
    toolResultText,
    failureExplanation,
    toolResultSummary: failureExplanation,
    toolCallDetail: {
      toolName: input.customToolName,
      toolDisplayName: input.toolDisplayName,
      toolArgumentsJson: input.toolArgumentsJson,
      toolResultSummary: failureExplanation,
    },
  };
}

function formatMcpToolResultText(mcpToolCallResult: McpToolCallResult, serverDisplayName: string): string {
  const textContent = (mcpToolCallResult.content ?? [])
    .flatMap((contentItem) => {
      if (contentItem["type"] !== "text" || typeof contentItem["text"] !== "string") {
        return [];
      }

      const text = contentItem["text"].trim();
      return text ? [text] : [];
    })
    .join("\n\n");
  if (textContent) {
    return textContent;
  }

  if (mcpToolCallResult.structuredContent !== undefined) {
    return stringifyJsonLikeValue(mcpToolCallResult.structuredContent);
  }

  return mcpToolCallResult.isError === true
    ? `${serverDisplayName} MCP tool returned an error without content.`
    : `${serverDisplayName} MCP tool returned no content.`;
}

function parseMcpStructuredContent(structuredContent: unknown): JsonValue | undefined {
  if (structuredContent === undefined) {
    return undefined;
  }

  const parsedStructuredContent = JsonValueSchema.safeParse(structuredContent);
  return parsedStructuredContent.success ? parsedStructuredContent.data : undefined;
}

function summarizeToolResultText(input: { toolResultText: string; serverDisplayName: string }): string {
  const firstMeaningfulLine = input.toolResultText.split("\n").find((line) => line.trim().length > 0)?.trim();
  if (!firstMeaningfulLine) {
    return `${input.serverDisplayName} MCP tool completed.`;
  }

  return firstMeaningfulLine.length <= 200 ? firstMeaningfulLine : `${firstMeaningfulLine.slice(0, 197)}...`;
}

function stringifyJsonLikeValue(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch (error) {
    return error instanceof Error ? `Unable to render MCP structured content: ${error.message}` : String(value);
  }
}
