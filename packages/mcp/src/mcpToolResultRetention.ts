import type { CustomToolCallDetail, JsonObject, JsonValue } from "@buli/contracts";
import type { McpToolResultRetentionPolicy } from "./mcpServerConfiguration.ts";

export type ProjectMcpToolResultRetentionInput = Readonly<{
  toolResultRetention: McpToolResultRetentionPolicy;
  customToolName: string;
  toolDisplayName: string;
  serverDisplayName: string;
  mcpToolName: string;
  toolArgumentsJson: JsonObject;
  toolResultText: string;
  toolResultSummary: string;
  toolResultJson?: JsonValue | undefined;
}>;

export type ProjectedMcpToolResultRetention = Readonly<{
  sessionToolResultText?: string | undefined;
  sessionToolCallDetail?: CustomToolCallDetail | undefined;
  sessionFailureExplanation?: string | undefined;
}>;

export function projectMcpToolResultRetention(
  input: ProjectMcpToolResultRetentionInput,
): ProjectedMcpToolResultRetention {
  if (input.toolResultRetention === "full") {
    return {};
  }

  const sessionToolResultText = input.toolResultRetention === "summary"
    ? formatSummaryRetainedMcpToolResultText(input)
    : formatRedactedRetainedMcpToolResultText(input);

  return {
    sessionToolResultText,
    sessionFailureExplanation: sessionToolResultText,
    sessionToolCallDetail: {
      toolName: input.customToolName,
      toolDisplayName: input.toolDisplayName,
      toolArgumentsJson: input.toolArgumentsJson,
      toolResultSummary: input.toolResultRetention === "summary"
        ? input.toolResultSummary
        : `${input.serverDisplayName} MCP result was not saved by retention policy.`,
    },
  };
}

function formatSummaryRetainedMcpToolResultText(input: ProjectMcpToolResultRetentionInput): string {
  return [
    `${input.serverDisplayName} MCP tool result retained as summary by configuration.`,
    `Tool: ${input.mcpToolName}`,
    `Summary: ${input.toolResultSummary}`,
  ].join("\n");
}

function formatRedactedRetainedMcpToolResultText(input: ProjectMcpToolResultRetentionInput): string {
  return [
    `${input.serverDisplayName} MCP tool result was shown to the model during the originating assistant turn but was not saved.`,
    `Tool: ${input.mcpToolName}`,
    "Retention policy: redacted",
  ].join("\n");
}
