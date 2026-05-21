import type {
  ConversationSessionEntry,
  SubagentChildToolCall,
  SubagentChildToolCallDetail,
  ToolCallDetail,
  ToolCallRequest,
} from "@buli/contracts";
import { formatDurationMs } from "./formatting.ts";
import { escapeHtml } from "./htmlEscaping.ts";

type ToolResultConversationSessionEntry = Extract<
  ConversationSessionEntry,
  { entryKind: "completed_tool_result" | "failed_tool_result" | "denied_tool_result" }
>;

export type RenderToolResultBlockInput = {
  conversationSessionEntry: ToolResultConversationSessionEntry;
  renderAssistantMarkdownText: (markdownText: string) => string;
};

export function renderToolCallRequestBlock(toolCallRequest: ToolCallRequest): string {
  if (toolCallRequest.toolName === "bash") {
    return `<div class="tool-block">
  <div class="tool-summary">
    <span class="tool-name">${escapeHtml(toolCallRequest.toolName)}</span>
    <span class="tool-purpose">${escapeHtml(toolCallRequest.commandDescription)}</span>
  </div>
  <pre class="tool-cmd">${escapeHtml(toolCallRequest.shellCommand)}</pre>
</div>`;
  }
  if (toolCallRequest.toolName === "read") {
    return `<div class="tool-block">
  <div class="tool-summary"><span class="tool-name">read</span><span class="tool-purpose">${escapeHtml(toolCallRequest.readTargetPath)}</span></div>
</div>`;
  }
  if (toolCallRequest.toolName === "glob") {
    const directoryHtml = toolCallRequest.searchDirectoryPath
      ? `<span class="tool-purpose">${escapeHtml(toolCallRequest.searchDirectoryPath)}</span>`
      : "";
    return `<div class="tool-block">
  <div class="tool-summary"><span class="tool-name">glob</span>${directoryHtml}</div>
  <pre class="tool-cmd">${escapeHtml(toolCallRequest.globPattern)}</pre>
</div>`;
  }

  if (toolCallRequest.toolName === "grep") {
    const grepPathHtml = toolCallRequest.searchPath
      ? `<span class="tool-purpose">${escapeHtml(toolCallRequest.searchPath)}</span>`
      : "";
    return `<div class="tool-block">
  <div class="tool-summary">
    <span class="tool-name">grep</span>${grepPathHtml}
  </div>
  <pre class="tool-cmd">${escapeHtml(toolCallRequest.regexPattern)}</pre>
</div>`;
  }

  if (toolCallRequest.toolName === "edit") {
    return `<div class="tool-block">
  <div class="tool-summary"><span class="tool-name">edit</span><span class="tool-purpose">${escapeHtml(toolCallRequest.editTargetPath)}</span></div>
  <pre class="tool-cmd">${escapeHtml(toolCallRequest.oldString)}</pre>
</div>`;
  }

  if (toolCallRequest.toolName === "write") {
    return `<div class="tool-block">
  <div class="tool-summary"><span class="tool-name">write</span><span class="tool-purpose">${escapeHtml(toolCallRequest.writeTargetPath)}</span></div>
  <pre class="tool-cmd">${escapeHtml(toolCallRequest.fileContent)}</pre>
</div>`;
  }

  return `<div class="tool-block">
  <div class="tool-summary"><span class="tool-name">task</span><span class="tool-purpose">${escapeHtml(toolCallRequest.subagentName)}: ${escapeHtml(toolCallRequest.subagentDescription)}</span></div>
  <pre class="tool-cmd">${escapeHtml(toolCallRequest.subagentPrompt)}</pre>
</div>`;
}

export function renderToolResultBlock(input: RenderToolResultBlockInput): string {
  const { conversationSessionEntry } = input;
  const summaryHtml = renderToolDetailSummary(conversationSessionEntry.toolCallDetail);
  const taskDetailHtml = conversationSessionEntry.toolCallDetail.toolName === "task"
    ? renderTaskToolDetailBlock({
        renderAssistantMarkdownText: input.renderAssistantMarkdownText,
        taskToolCallDetail: conversationSessionEntry.toolCallDetail,
      })
    : "";
  const outputHtml = conversationSessionEntry.toolResultText.length > 0
    ? `<pre class="tool-output">${escapeHtml(conversationSessionEntry.toolResultText)}</pre>`
    : "";
  const failureNoticeHtml = conversationSessionEntry.entryKind === "failed_tool_result"
    ? `<p class="tool-notice tool-notice-error">${escapeHtml(conversationSessionEntry.failureExplanation)}</p>`
    : "";
  const denialNoticeHtml = conversationSessionEntry.entryKind === "denied_tool_result"
    ? `<p class="tool-notice tool-notice-warn">${escapeHtml(conversationSessionEntry.denialExplanation)}</p>`
    : "";

  return `<div class="tool-block">
  ${summaryHtml}
  ${taskDetailHtml}
  ${outputHtml}
  ${failureNoticeHtml}
  ${denialNoticeHtml}
</div>`;
}

function renderToolDetailSummary(toolCallDetail: ToolCallDetail): string {
  if (toolCallDetail.toolName === "bash") {
    const purposeHtml = toolCallDetail.commandDescription
      ? `<span class="tool-purpose">${escapeHtml(toolCallDetail.commandDescription)}</span>`
      : "";
    return `<div class="tool-summary"><span class="tool-name">bash</span>${purposeHtml}</div>`;
  }
  if (toolCallDetail.toolName === "read") {
    return `<div class="tool-summary"><span class="tool-name">read</span><span class="tool-purpose">${escapeHtml(toolCallDetail.readFilePath)}</span></div>`;
  }
  if (toolCallDetail.toolName === "glob") {
    const countHtml = toolCallDetail.matchedPathCount === undefined
      ? ""
      : `<span class="tool-purpose">${toolCallDetail.matchedPathCount} paths</span>`;
    return `<div class="tool-summary"><span class="tool-name">glob</span>${countHtml}</div>`;
  }
  if (toolCallDetail.toolName === "grep") {
    const countHtml = toolCallDetail.totalMatchCount === undefined
      ? ""
      : `<span class="tool-purpose">${toolCallDetail.totalMatchCount} matches</span>`;
    return `<div class="tool-summary"><span class="tool-name">grep</span>${countHtml}</div>`;
  }
  if (toolCallDetail.toolName === "edit") {
    const lineChangeHtml = renderToolDetailLineChangeSummary(toolCallDetail.addedLineCount, toolCallDetail.removedLineCount);
    return `<div class="tool-summary"><span class="tool-name">edit</span><span class="tool-purpose">${escapeHtml(toolCallDetail.editedFilePath)}</span>${lineChangeHtml}</div>`;
  }
  if (toolCallDetail.toolName === "write") {
    const lineChangeHtml = renderToolDetailLineChangeSummary(toolCallDetail.addedLineCount, toolCallDetail.removedLineCount);
    return `<div class="tool-summary"><span class="tool-name">write</span><span class="tool-purpose">${escapeHtml(toolCallDetail.writtenFilePath)}</span>${lineChangeHtml}</div>`;
  }
  if (toolCallDetail.toolName === "task") {
    return `<div class="tool-summary"><span class="tool-name">task</span><span class="tool-purpose">${escapeHtml(`${toolCallDetail.subagentName}: ${toolCallDetail.subagentDescription}`)}</span></div>`;
  }
  return `<div class="tool-summary"><span class="tool-name">${escapeHtml(toolCallDetail.toolName)}</span></div>`;
}

function renderTaskToolDetailBlock(input: {
  taskToolCallDetail: Extract<ToolCallDetail, { toolName: "task" }>;
  renderAssistantMarkdownText: (markdownText: string) => string;
}): string {
  const toolCallDetail = input.taskToolCallDetail;
  const promptHtml = toolCallDetail.subagentPrompt
    ? `<p class="muted">Subagent prompt</p><pre class="tool-cmd">${escapeHtml(toolCallDetail.subagentPrompt)}</pre>`
    : "";
  const childActivityHtml = toolCallDetail.subagentChildToolCalls && toolCallDetail.subagentChildToolCalls.length > 0
    ? `<p class="muted">Subagent activity</p>${renderSubagentChildToolCallsBlock(toolCallDetail.subagentChildToolCalls)}`
    : "";
  const resultHtml = toolCallDetail.subagentResultSummary
    ? `<p class="muted">Subagent result</p>${input.renderAssistantMarkdownText(toolCallDetail.subagentResultSummary)}`
    : "";

  return [
    `<p class="status-notice">Subagent: ${escapeHtml(toolCallDetail.subagentName)}</p>`,
    promptHtml,
    childActivityHtml,
    resultHtml,
  ].filter((htmlSegment) => htmlSegment.length > 0).join("\n");
}

function renderSubagentChildToolCallsBlock(subagentChildToolCalls: readonly SubagentChildToolCall[]): string {
  const childToolCallsHtml = subagentChildToolCalls.map((subagentChildToolCall) => {
    const durationHtml = subagentChildToolCall.subagentChildToolCallDurationMs === undefined
      ? ""
      : `<span class="tool-purpose">${formatDurationMs(subagentChildToolCall.subagentChildToolCallDurationMs)}</span>`;
    const errorHtml = subagentChildToolCall.subagentChildToolCallErrorText
      ? `<p class="tool-notice tool-notice-error">${escapeHtml(subagentChildToolCall.subagentChildToolCallErrorText)}</p>`
      : "";
    const denialHtml = subagentChildToolCall.subagentChildToolCallDenialText
      ? `<p class="tool-notice tool-notice-warn">${escapeHtml(subagentChildToolCall.subagentChildToolCallDenialText)}</p>`
      : "";
    return `<li>
  <div class="tool-summary"><span class="tool-name">${escapeHtml(subagentChildToolCall.subagentChildToolCallStatus)}</span>${durationHtml}</div>
  ${renderSubagentChildToolCallDetailSummary(subagentChildToolCall.subagentChildToolCallDetail)}
  ${errorHtml}
  ${denialHtml}
</li>`;
  }).join("\n");

  return `<ul>${childToolCallsHtml}</ul>`;
}

function renderSubagentChildToolCallDetailSummary(subagentChildToolCallDetail: SubagentChildToolCallDetail): string {
  if (subagentChildToolCallDetail.toolName === "read") {
    return `<div class="tool-summary"><span class="tool-name">read</span><span class="tool-purpose">${escapeHtml(subagentChildToolCallDetail.readFilePath)}</span></div>`;
  }
  if (subagentChildToolCallDetail.toolName === "glob") {
    const countHtml = subagentChildToolCallDetail.matchedPathCount === undefined
      ? ""
      : `<span class="tool-purpose">${subagentChildToolCallDetail.matchedPathCount} paths</span>`;
    return `<div class="tool-summary"><span class="tool-name">glob</span>${countHtml}<span class="tool-purpose">${escapeHtml(subagentChildToolCallDetail.globPattern)}</span></div>`;
  }
  if (subagentChildToolCallDetail.toolName === "grep") {
    const countHtml = subagentChildToolCallDetail.totalMatchCount === undefined
      ? ""
      : `<span class="tool-purpose">${subagentChildToolCallDetail.totalMatchCount} matches</span>`;
    return `<div class="tool-summary"><span class="tool-name">grep</span>${countHtml}<span class="tool-purpose">${escapeHtml(subagentChildToolCallDetail.searchPattern)}</span></div>`;
  }
  if (subagentChildToolCallDetail.toolName === "bash") {
    const purposeHtml = subagentChildToolCallDetail.commandDescription
      ? `<span class="tool-purpose">${escapeHtml(subagentChildToolCallDetail.commandDescription)}</span>`
      : "";
    return `<div class="tool-summary"><span class="tool-name">bash</span>${purposeHtml}</div><pre class="tool-cmd">${escapeHtml(subagentChildToolCallDetail.commandLine)}</pre>`;
  }
  if (subagentChildToolCallDetail.toolName === "edit") {
    return `<div class="tool-summary"><span class="tool-name">edit</span><span class="tool-purpose">${escapeHtml(subagentChildToolCallDetail.editedFilePath)}</span></div>`;
  }
  if (subagentChildToolCallDetail.toolName === "write") {
    return `<div class="tool-summary"><span class="tool-name">write</span><span class="tool-purpose">${escapeHtml(subagentChildToolCallDetail.writtenFilePath)}</span></div>`;
  }

  return `<div class="tool-summary"><span class="tool-name">task</span><span class="tool-purpose">${escapeHtml(`${subagentChildToolCallDetail.subagentName}: ${subagentChildToolCallDetail.subagentDescription}`)}</span></div>`;
}

function renderToolDetailLineChangeSummary(
  addedLineCount: number | undefined,
  removedLineCount: number | undefined,
): string {
  if (addedLineCount === undefined && removedLineCount === undefined) {
    return "";
  }

  return `<span class="tool-purpose">+${addedLineCount ?? 0} -${removedLineCount ?? 0}</span>`;
}
