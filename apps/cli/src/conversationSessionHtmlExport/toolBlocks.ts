import type {
  ConversationSessionEntry,
  SubagentChildToolCall,
  SubagentChildToolCallDetail,
  ToolCallDetail,
  ToolCallRequest,
} from "@buli/contracts";
import { formatDurationMs } from "./formatting.ts";
import { escapeHtml } from "./htmlEscaping.ts";
import { renderToolIcon } from "./svgIcons.ts";

type ToolResultConversationSessionEntry = Extract<
  ConversationSessionEntry,
  { entryKind: "completed_tool_result" | "failed_tool_result" | "denied_tool_result" }
>;

export type RenderToolResultBlockInput = {
  conversationSessionEntry: ToolResultConversationSessionEntry;
  renderAssistantMarkdownText: (markdownText: string) => string;
};

// Tool call panels intentionally omit the status pill: the role badge in the
// entry header already conveys "this is a request", so an extra "requested"
// pill is noise (docs-v2 design rule).
export function renderToolCallRequestBlock(toolCallRequest: ToolCallRequest): string {
  return renderPanel({
    panelModifier: "",
    toolName: toolCallRequest.toolName,
    purposeHtml: renderToolCallRequestPurpose(toolCallRequest),
    statusHtml: "",
    bodyHtml: renderToolCallRequestBody(toolCallRequest),
  });
}

export function renderToolResultBlock(input: RenderToolResultBlockInput): string {
  const { conversationSessionEntry } = input;
  const toolCallDetail = conversationSessionEntry.toolCallDetail;
  const isFailed = conversationSessionEntry.entryKind === "failed_tool_result";
  const isDenied = conversationSessionEntry.entryKind === "denied_tool_result";
  const panelModifier = isFailed ? "panel--failed" : isDenied ? "panel--failed" : "panel--result";
  const statusHtml = isFailed
    ? `<span class="panel-status fail">failed</span>`
    : isDenied
      ? `<span class="panel-status warn">denied</span>`
      : `<span class="panel-status ok">ok</span>`;

  const taskDetailHtml = toolCallDetail.toolName === "task"
    ? renderTaskToolDetailBlock({
        renderAssistantMarkdownText: input.renderAssistantMarkdownText,
        taskToolCallDetail: toolCallDetail,
      })
    : "";
  const outputHtml = conversationSessionEntry.toolResultText.length > 0
    ? `<div class="panel-section"><div class="panel-section-label">Output</div><pre class="output">${escapeHtml(conversationSessionEntry.toolResultText)}</pre></div>`
    : "";
  const failureNoticeHtml = conversationSessionEntry.entryKind === "failed_tool_result"
    ? `<p class="panel-notice fail">${escapeHtml(conversationSessionEntry.failureExplanation)}</p>`
    : "";
  const denialNoticeHtml = conversationSessionEntry.entryKind === "denied_tool_result"
    ? `<p class="panel-notice warn">${escapeHtml(conversationSessionEntry.denialExplanation)}</p>`
    : "";

  return renderPanel({
    panelModifier,
    toolName: toolCallDetail.toolName,
    purposeHtml: renderToolResultPurpose(toolCallDetail),
    statusHtml,
    bodyHtml: [taskDetailHtml, outputHtml, failureNoticeHtml, denialNoticeHtml].filter((s) => s.length > 0).join("\n"),
  });
}

function renderPanel(input: {
  panelModifier: string;
  toolName: string;
  purposeHtml: string;
  statusHtml: string;
  bodyHtml: string;
}): string {
  const modifierClass = input.panelModifier ? ` ${input.panelModifier}` : "";
  const bodyHtml = input.bodyHtml.length > 0 ? `<div class="panel-body">${input.bodyHtml}</div>` : "";
  return `<div class="panel${modifierClass}">
  <div class="panel-head">
    ${renderToolIcon(input.toolName)}
    <span class="panel-tool">${escapeHtml(input.toolName)}</span>
    ${input.purposeHtml}
    ${input.statusHtml}
  </div>
  ${bodyHtml}
</div>`;
}

function renderToolCallRequestPurpose(toolCallRequest: ToolCallRequest): string {
  if (toolCallRequest.toolName === "bash") {
    return `<span class="panel-purpose">${escapeHtml(toolCallRequest.commandDescription)}</span>`;
  }
  if (toolCallRequest.toolName === "read") {
    return `<span class="panel-purpose">${escapeHtml(toolCallRequest.readTargetPath)}</span>`;
  }
  if (toolCallRequest.toolName === "glob") {
    return toolCallRequest.searchDirectoryPath
      ? `<span class="panel-purpose">${escapeHtml(toolCallRequest.searchDirectoryPath)}</span>`
      : `<span class="panel-purpose">glob pattern</span>`;
  }
  if (toolCallRequest.toolName === "grep") {
    return toolCallRequest.searchPath
      ? `<span class="panel-purpose">${escapeHtml(toolCallRequest.searchPath)}</span>`
      : `<span class="panel-purpose">regex search</span>`;
  }
  if (toolCallRequest.toolName === "edit") {
    return `<span class="panel-purpose">${escapeHtml(toolCallRequest.editTargetPath)}</span>`;
  }
  if (toolCallRequest.toolName === "write") {
    return `<span class="panel-purpose">${escapeHtml(toolCallRequest.writeTargetPath)}</span>`;
  }
  return `<span class="panel-purpose">${escapeHtml(`${toolCallRequest.subagentName}: ${toolCallRequest.subagentDescription}`)}</span>`;
}

function renderToolCallRequestBody(toolCallRequest: ToolCallRequest): string {
  if (toolCallRequest.toolName === "bash") {
    return `<pre class="cmd">${escapeHtml(toolCallRequest.shellCommand)}</pre>`;
  }
  if (toolCallRequest.toolName === "read") {
    return `<div class="arg"><b>path</b> ${escapeHtml(toolCallRequest.readTargetPath)}</div>`;
  }
  if (toolCallRequest.toolName === "glob") {
    const dirArg = toolCallRequest.searchDirectoryPath
      ? `<div class="arg"><b>path</b> ${escapeHtml(toolCallRequest.searchDirectoryPath)}</div>`
      : "";
    return `${dirArg}<div class="arg"><b>pattern</b> ${escapeHtml(toolCallRequest.globPattern)}</div>`;
  }
  if (toolCallRequest.toolName === "grep") {
    const pathArg = toolCallRequest.searchPath
      ? `<div class="arg"><b>path</b> ${escapeHtml(toolCallRequest.searchPath)}</div>`
      : "";
    return `${pathArg}<div class="arg"><b>pattern</b> ${escapeHtml(toolCallRequest.regexPattern)}</div>`;
  }
  if (toolCallRequest.toolName === "edit") {
    return `<div class="arg"><b>path</b> ${escapeHtml(toolCallRequest.editTargetPath)}</div>
<div class="panel-section"><div class="panel-section-label">Old</div><pre class="output">${escapeHtml(toolCallRequest.oldString)}</pre></div>
<div class="panel-section"><div class="panel-section-label">New</div><pre class="output">${escapeHtml(toolCallRequest.newString)}</pre></div>`;
  }
  if (toolCallRequest.toolName === "write") {
    return `<div class="arg"><b>path</b> ${escapeHtml(toolCallRequest.writeTargetPath)}</div>
<div class="panel-section"><div class="panel-section-label">Contents</div><pre class="output">${escapeHtml(toolCallRequest.fileContent)}</pre></div>`;
  }
  return `<div class="arg"><b>subagent</b> ${escapeHtml(toolCallRequest.subagentName)}</div>
<div class="panel-section"><div class="panel-section-label">Prompt</div><pre class="output">${escapeHtml(toolCallRequest.subagentPrompt)}</pre></div>`;
}

function renderToolResultPurpose(toolCallDetail: ToolCallDetail): string {
  if (toolCallDetail.toolName === "bash") {
    return toolCallDetail.commandDescription
      ? `<span class="panel-purpose">${escapeHtml(toolCallDetail.commandDescription)}</span>`
      : "";
  }
  if (toolCallDetail.toolName === "read") {
    return `<span class="panel-purpose">${escapeHtml(toolCallDetail.readFilePath)}</span>`;
  }
  if (toolCallDetail.toolName === "glob") {
    return toolCallDetail.matchedPathCount === undefined
      ? ""
      : `<span class="panel-purpose">${toolCallDetail.matchedPathCount} paths</span>`;
  }
  if (toolCallDetail.toolName === "grep") {
    return toolCallDetail.totalMatchCount === undefined
      ? ""
      : `<span class="panel-purpose">${toolCallDetail.totalMatchCount} matches</span>`;
  }
  if (toolCallDetail.toolName === "edit") {
    const lineChange = renderLineChangeSummary(toolCallDetail.addedLineCount, toolCallDetail.removedLineCount);
    return `<span class="panel-purpose">${escapeHtml(toolCallDetail.editedFilePath)}${lineChange}</span>`;
  }
  if (toolCallDetail.toolName === "write") {
    const lineChange = renderLineChangeSummary(toolCallDetail.addedLineCount, toolCallDetail.removedLineCount);
    return `<span class="panel-purpose">${escapeHtml(toolCallDetail.writtenFilePath)}${lineChange}</span>`;
  }
  if (toolCallDetail.toolName === "task") {
    return `<span class="panel-purpose">${escapeHtml(`${toolCallDetail.subagentName}: ${toolCallDetail.subagentDescription}`)}</span>`;
  }
  return "";
}

function renderLineChangeSummary(
  addedLineCount: number | undefined,
  removedLineCount: number | undefined,
): string {
  if (addedLineCount === undefined && removedLineCount === undefined) {
    return "";
  }
  return ` · +${addedLineCount ?? 0} -${removedLineCount ?? 0}`;
}

function renderTaskToolDetailBlock(input: {
  taskToolCallDetail: Extract<ToolCallDetail, { toolName: "task" }>;
  renderAssistantMarkdownText: (markdownText: string) => string;
}): string {
  const toolCallDetail = input.taskToolCallDetail;
  const subagentHeaderHtml = `<p class="panel-notice">Subagent: ${escapeHtml(toolCallDetail.subagentName)}</p>`;
  const promptHtml = toolCallDetail.subagentPrompt
    ? `<div class="panel-section"><div class="panel-section-label">Subagent prompt</div><pre class="output">${escapeHtml(toolCallDetail.subagentPrompt)}</pre></div>`
    : "";
  const childActivityHtml = toolCallDetail.subagentChildToolCalls && toolCallDetail.subagentChildToolCalls.length > 0
    ? `<div class="panel-section"><div class="panel-section-label">Subagent activity</div>${renderSubagentChildToolCallsBlock(toolCallDetail.subagentChildToolCalls)}</div>`
    : "";
  const resultHtml = toolCallDetail.subagentResultSummary
    ? `<div class="panel-section"><div class="panel-section-label">Subagent result</div>${input.renderAssistantMarkdownText(toolCallDetail.subagentResultSummary)}</div>`
    : "";

  return [subagentHeaderHtml, promptHtml, childActivityHtml, resultHtml].filter((s) => s.length > 0).join("\n");
}

function renderSubagentChildToolCallsBlock(subagentChildToolCalls: readonly SubagentChildToolCall[]): string {
  const childToolCallsHtml = subagentChildToolCalls.map((subagentChildToolCall) => {
    const durationHtml = subagentChildToolCall.subagentChildToolCallDurationMs === undefined
      ? ""
      : `<span class="panel-purpose">${formatDurationMs(subagentChildToolCall.subagentChildToolCallDurationMs)}</span>`;
    const errorHtml = subagentChildToolCall.subagentChildToolCallErrorText
      ? `<p class="panel-notice fail">${escapeHtml(subagentChildToolCall.subagentChildToolCallErrorText)}</p>`
      : "";
    const denialHtml = subagentChildToolCall.subagentChildToolCallDenialText
      ? `<p class="panel-notice warn">${escapeHtml(subagentChildToolCall.subagentChildToolCallDenialText)}</p>`
      : "";
    return `<li>
  <div class="panel-head" style="background:transparent;padding:0 0 4px;border:0;">
    ${renderToolIcon(subagentChildToolCall.subagentChildToolCallDetail.toolName)}
    <span class="panel-tool">${escapeHtml(subagentChildToolCall.subagentChildToolCallStatus)}</span>
    ${durationHtml}
  </div>
  ${renderSubagentChildToolCallDetailSummary(subagentChildToolCall.subagentChildToolCallDetail)}
  ${errorHtml}
  ${denialHtml}
</li>`;
  }).join("\n");

  return `<ul class="subagent-list">${childToolCallsHtml}</ul>`;
}

function renderSubagentChildToolCallDetailSummary(subagentChildToolCallDetail: SubagentChildToolCallDetail): string {
  if (subagentChildToolCallDetail.toolName === "read") {
    return `<div class="arg"><b>read</b> ${escapeHtml(subagentChildToolCallDetail.readFilePath)}</div>`;
  }
  if (subagentChildToolCallDetail.toolName === "glob") {
    const countHtml = subagentChildToolCallDetail.matchedPathCount === undefined ? "" : ` · ${subagentChildToolCallDetail.matchedPathCount} paths`;
    return `<div class="arg"><b>glob</b> ${escapeHtml(subagentChildToolCallDetail.globPattern)}${escapeHtml(countHtml)}</div>`;
  }
  if (subagentChildToolCallDetail.toolName === "grep") {
    const countHtml = subagentChildToolCallDetail.totalMatchCount === undefined ? "" : ` · ${subagentChildToolCallDetail.totalMatchCount} matches`;
    return `<div class="arg"><b>grep</b> ${escapeHtml(subagentChildToolCallDetail.searchPattern)}${escapeHtml(countHtml)}</div>`;
  }
  if (subagentChildToolCallDetail.toolName === "bash") {
    const purposeHtml = subagentChildToolCallDetail.commandDescription
      ? `<div class="arg"><b>desc</b> ${escapeHtml(subagentChildToolCallDetail.commandDescription)}</div>`
      : "";
    return `${purposeHtml}<pre class="cmd">${escapeHtml(subagentChildToolCallDetail.commandLine)}</pre>`;
  }
  if (subagentChildToolCallDetail.toolName === "edit") {
    return `<div class="arg"><b>edit</b> ${escapeHtml(subagentChildToolCallDetail.editedFilePath)}</div>`;
  }
  if (subagentChildToolCallDetail.toolName === "write") {
    return `<div class="arg"><b>write</b> ${escapeHtml(subagentChildToolCallDetail.writtenFilePath)}</div>`;
  }
  return `<div class="arg"><b>task</b> ${escapeHtml(`${subagentChildToolCallDetail.subagentName}: ${subagentChildToolCallDetail.subagentDescription}`)}</div>`;
}
