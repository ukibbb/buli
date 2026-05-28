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
    <span class="panel-tool">${escapeHtml(formatToolDisplayName(input.toolName))}</span>
    ${input.purposeHtml}
    ${input.statusHtml}
  </div>
  ${bodyHtml}
</div>`;
}

type ToolCallRequestName = ToolCallRequest["toolName"];
type ToolCallRequestByName<ToolName extends ToolCallRequestName> = Extract<ToolCallRequest, { toolName: ToolName }>;

type ToolCallRequestExportRenderer<ToolName extends ToolCallRequestName> = {
  renderPurpose(toolCallRequest: ToolCallRequestByName<ToolName>): string;
  renderBody(toolCallRequest: ToolCallRequestByName<ToolName>): string;
};

const toolCallRequestExportRendererByName: {
  readonly [ToolName in ToolCallRequestName]: ToolCallRequestExportRenderer<ToolName>;
} = {
  bash: { renderPurpose: renderBashToolCallRequestPurpose, renderBody: renderBashToolCallRequestBody },
  read: { renderPurpose: renderReadToolCallRequestPurpose, renderBody: renderReadToolCallRequestBody },
  read_many: { renderPurpose: renderReadManyToolCallRequestPurpose, renderBody: renderReadManyToolCallRequestBody },
  search_many: { renderPurpose: renderSearchManyToolCallRequestPurpose, renderBody: renderSearchManyToolCallRequestBody },
  glob: { renderPurpose: renderGlobToolCallRequestPurpose, renderBody: renderGlobToolCallRequestBody },
  grep: { renderPurpose: renderGrepToolCallRequestPurpose, renderBody: renderGrepToolCallRequestBody },
  query_codebase_knowledge: { renderPurpose: renderQueryCodebaseKnowledgeToolCallRequestPurpose, renderBody: renderQueryCodebaseKnowledgeToolCallRequestBody },
  edit: { renderPurpose: renderEditToolCallRequestPurpose, renderBody: renderEditToolCallRequestBody },
  edit_many: { renderPurpose: renderEditManyToolCallRequestPurpose, renderBody: renderEditManyToolCallRequestBody },
  patch: { renderPurpose: renderPatchToolCallRequestPurpose, renderBody: renderPatchToolCallRequestBody },
  patch_many: { renderPurpose: renderPatchToolCallRequestPurpose, renderBody: renderPatchToolCallRequestBody },
  write: { renderPurpose: renderWriteToolCallRequestPurpose, renderBody: renderWriteToolCallRequestBody },
  task: { renderPurpose: renderTaskToolCallRequestPurpose, renderBody: renderTaskToolCallRequestBody },
  skill: { renderPurpose: renderSkillToolCallRequestPurpose, renderBody: renderSkillToolCallRequestBody },
};

function resolveToolCallRequestExportRenderer<ToolName extends ToolCallRequestName>(
  toolCallRequest: ToolCallRequestByName<ToolName>,
): ToolCallRequestExportRenderer<ToolName> {
  return toolCallRequestExportRendererByName[toolCallRequest.toolName] as ToolCallRequestExportRenderer<ToolName>;
}

function renderToolCallRequestPurpose(toolCallRequest: ToolCallRequest): string {
  return resolveToolCallRequestExportRenderer(toolCallRequest).renderPurpose(toolCallRequest);
}

function renderToolCallRequestBody(toolCallRequest: ToolCallRequest): string {
  return resolveToolCallRequestExportRenderer(toolCallRequest).renderBody(toolCallRequest);
}

function renderBashToolCallRequestPurpose(toolCallRequest: ToolCallRequestByName<"bash">): string {
  return `<span class="panel-purpose">${escapeHtml(toolCallRequest.commandDescription)}</span>`;
}

function renderBashToolCallRequestBody(toolCallRequest: ToolCallRequestByName<"bash">): string {
  return `<pre class="cmd">${escapeHtml(toolCallRequest.shellCommand)}</pre>`;
}

function renderReadToolCallRequestPurpose(toolCallRequest: ToolCallRequestByName<"read">): string {
  return `<span class="panel-purpose">${escapeHtml(toolCallRequest.readTargetPath)}</span>`;
}

function renderReadToolCallRequestBody(toolCallRequest: ToolCallRequestByName<"read">): string {
  return `<div class="arg"><b>path</b> ${escapeHtml(toolCallRequest.readTargetPath)}</div>`;
}

function renderReadManyToolCallRequestPurpose(toolCallRequest: ToolCallRequestByName<"read_many">): string {
  return `<span class="panel-purpose">${formatReadManyPathCount(toolCallRequest.readTargets.length)}</span>`;
}

function renderReadManyToolCallRequestBody(toolCallRequest: ToolCallRequestByName<"read_many">): string {
  return toolCallRequest.readTargets.map((readTarget, readTargetIndex) => {
    const offsetHtml = readTarget.offsetLineNumber === undefined
      ? ""
      : ` <span class="panel-purpose">offset ${readTarget.offsetLineNumber}</span>`;
    const limitHtml = readTarget.maximumLineCount === undefined
      ? ""
      : ` <span class="panel-purpose">limit ${readTarget.maximumLineCount}</span>`;
    return `<div class="arg"><b>path ${readTargetIndex + 1}</b> ${escapeHtml(readTarget.readTargetPath)}${offsetHtml}${limitHtml}</div>`;
  }).join("\n");
}

function renderSearchManyToolCallRequestPurpose(toolCallRequest: ToolCallRequestByName<"search_many">): string {
  return `<span class="panel-purpose">${formatSearchManySearchCount(toolCallRequest.searches.length)}</span>`;
}

function renderSearchManyToolCallRequestBody(toolCallRequest: ToolCallRequestByName<"search_many">): string {
  return toolCallRequest.searches.map(renderSearchManyRequestSearch).join("\n");
}

function renderGlobToolCallRequestPurpose(toolCallRequest: ToolCallRequestByName<"glob">): string {
  return toolCallRequest.searchDirectoryPath
    ? `<span class="panel-purpose">${escapeHtml(toolCallRequest.searchDirectoryPath)}</span>`
    : `<span class="panel-purpose">glob pattern</span>`;
}

function renderGlobToolCallRequestBody(toolCallRequest: ToolCallRequestByName<"glob">): string {
  const dirArg = toolCallRequest.searchDirectoryPath
    ? `<div class="arg"><b>path</b> ${escapeHtml(toolCallRequest.searchDirectoryPath)}</div>`
    : "";
  return `${dirArg}<div class="arg"><b>pattern</b> ${escapeHtml(toolCallRequest.globPattern)}</div>`;
}

function renderGrepToolCallRequestPurpose(toolCallRequest: ToolCallRequestByName<"grep">): string {
  return toolCallRequest.searchPath
    ? `<span class="panel-purpose">${escapeHtml(toolCallRequest.searchPath)}</span>`
    : `<span class="panel-purpose">regex search</span>`;
}

function renderGrepToolCallRequestBody(toolCallRequest: ToolCallRequestByName<"grep">): string {
  const pathArg = toolCallRequest.searchPath
    ? `<div class="arg"><b>path</b> ${escapeHtml(toolCallRequest.searchPath)}</div>`
    : "";
  const includeArg = toolCallRequest.includeGlobPattern
    ? `<div class="arg"><b>include</b> ${escapeHtml(toolCallRequest.includeGlobPattern)}</div>`
    : "";
  const contextArg = toolCallRequest.contextLineCount !== undefined
    ? `<div class="arg"><b>context</b> ${toolCallRequest.contextLineCount}</div>`
    : "";
  return `${pathArg}${includeArg}${contextArg}<div class="arg"><b>pattern</b> ${escapeHtml(toolCallRequest.regexPattern)}</div>`;
}

function renderQueryCodebaseKnowledgeToolCallRequestPurpose(_toolCallRequest: ToolCallRequestByName<"query_codebase_knowledge">): string {
  return `<span class="panel-purpose">codebase knowledge</span>`;
}

function renderQueryCodebaseKnowledgeToolCallRequestBody(toolCallRequest: ToolCallRequestByName<"query_codebase_knowledge">): string {
  const knownFilesHtml = toolCallRequest.knownRelevantFilePaths && toolCallRequest.knownRelevantFilePaths.length > 0
    ? `<div class="arg"><b>known files</b> ${escapeHtml(toolCallRequest.knownRelevantFilePaths.join(", "))}</div>`
    : "";
  const knownSymbolsHtml = toolCallRequest.knownRelevantSymbolNames && toolCallRequest.knownRelevantSymbolNames.length > 0
    ? `<div class="arg"><b>known symbols</b> ${escapeHtml(toolCallRequest.knownRelevantSymbolNames.join(", "))}</div>`
    : "";
  const maximumResultsHtml = toolCallRequest.maximumKnowledgeResultCount === undefined
    ? ""
    : `<div class="arg"><b>maximum results</b> ${toolCallRequest.maximumKnowledgeResultCount}</div>`;
  return `<div class="arg"><b>problem</b> ${escapeHtml(toolCallRequest.codebaseProblemDescription)}</div>${knownFilesHtml}${knownSymbolsHtml}${maximumResultsHtml}`;
}

function renderEditToolCallRequestPurpose(toolCallRequest: ToolCallRequestByName<"edit">): string {
  return `<span class="panel-purpose">${escapeHtml(toolCallRequest.editTargetPath)}</span>`;
}

function renderEditToolCallRequestBody(toolCallRequest: ToolCallRequestByName<"edit">): string {
  return `<div class="arg"><b>path</b> ${escapeHtml(toolCallRequest.editTargetPath)}</div>
<div class="panel-section"><div class="panel-section-label">Old</div><pre class="output">${escapeHtml(toolCallRequest.oldString)}</pre></div>
<div class="panel-section"><div class="panel-section-label">New</div><pre class="output">${escapeHtml(toolCallRequest.newString)}</pre></div>`;
}

function renderEditManyToolCallRequestPurpose(toolCallRequest: ToolCallRequestByName<"edit_many">): string {
  return `<span class="panel-purpose">${toolCallRequest.edits.length} edits</span>`;
}

function renderEditManyToolCallRequestBody(toolCallRequest: ToolCallRequestByName<"edit_many">): string {
  return toolCallRequest.edits.map((edit, editIndex) => `<div class="panel-section"><div class="panel-section-label">Edit ${editIndex + 1}: ${escapeHtml(edit.editTargetPath)}</div><pre class="output">${escapeHtml(edit.oldString)}\n---\n${escapeHtml(edit.newString)}</pre></div>`).join("\n");
}

function renderPatchToolCallRequestPurpose(_toolCallRequest: ToolCallRequestByName<"patch" | "patch_many">): string {
  return `<span class="panel-purpose">patch</span>`;
}

function renderPatchToolCallRequestBody(toolCallRequest: ToolCallRequestByName<"patch" | "patch_many">): string {
  return `<div class="panel-section"><div class="panel-section-label">Patch</div><pre class="output">${escapeHtml(toolCallRequest.patchText)}</pre></div>`;
}

function renderWriteToolCallRequestPurpose(toolCallRequest: ToolCallRequestByName<"write">): string {
  return `<span class="panel-purpose">${escapeHtml(toolCallRequest.writeTargetPath)}</span>`;
}

function renderWriteToolCallRequestBody(toolCallRequest: ToolCallRequestByName<"write">): string {
  return `<div class="arg"><b>path</b> ${escapeHtml(toolCallRequest.writeTargetPath)}</div>
<div class="panel-section"><div class="panel-section-label">Contents</div><pre class="output">${escapeHtml(toolCallRequest.fileContent)}</pre></div>`;
}

function renderTaskToolCallRequestPurpose(toolCallRequest: ToolCallRequestByName<"task">): string {
  return `<span class="panel-purpose">${escapeHtml(`${toolCallRequest.subagentName}: ${toolCallRequest.subagentDescription}`)}</span>`;
}

function renderTaskToolCallRequestBody(toolCallRequest: ToolCallRequestByName<"task">): string {
  return `<div class="arg"><b>subagent</b> ${escapeHtml(toolCallRequest.subagentName)}</div>
<div class="panel-section"><div class="panel-section-label">Prompt</div><pre class="output">${escapeHtml(toolCallRequest.subagentPrompt)}</pre></div>`;
}

function renderSkillToolCallRequestPurpose(toolCallRequest: ToolCallRequestByName<"skill">): string {
  return `<span class="panel-purpose">${escapeHtml(toolCallRequest.skillName)}</span>`;
}

function renderSkillToolCallRequestBody(toolCallRequest: ToolCallRequestByName<"skill">): string {
  return `<div class="arg"><b>skill</b> ${escapeHtml(toolCallRequest.skillName)}</div>`;
}

type ToolCallDetailName = ToolCallDetail["toolName"];
type ToolCallDetailByName<ToolName extends ToolCallDetailName> = Extract<ToolCallDetail, { toolName: ToolName }>;

type ToolCallDetailExportRenderer<ToolName extends ToolCallDetailName> = {
  renderPurpose(toolCallDetail: ToolCallDetailByName<ToolName>): string;
};

const toolCallDetailExportRendererByName: {
  readonly [ToolName in ToolCallDetailName]: ToolCallDetailExportRenderer<ToolName>;
} = {
  bash: { renderPurpose: renderBashToolResultPurpose },
  read: { renderPurpose: renderReadToolResultPurpose },
  read_many: { renderPurpose: renderReadManyToolResultPurpose },
  search_many: { renderPurpose: renderSearchManyToolResultPurpose },
  glob: { renderPurpose: renderGlobToolResultPurpose },
  grep: { renderPurpose: renderGrepToolResultPurpose },
  query_codebase_knowledge: { renderPurpose: renderQueryCodebaseKnowledgeToolResultPurpose },
  edit: { renderPurpose: renderEditToolResultPurpose },
  edit_many: { renderPurpose: renderEditManyToolResultPurpose },
  patch: { renderPurpose: renderPatchToolResultPurpose },
  patch_many: { renderPurpose: renderPatchToolResultPurpose },
  write: { renderPurpose: renderWriteToolResultPurpose },
  task: { renderPurpose: renderTaskToolResultPurpose },
  skill: { renderPurpose: renderSkillToolResultPurpose },
  todowrite: { renderPurpose: renderTodoWriteToolResultPurpose },
};

function resolveToolCallDetailExportRenderer<ToolName extends ToolCallDetailName>(
  toolCallDetail: ToolCallDetailByName<ToolName>,
): ToolCallDetailExportRenderer<ToolName> {
  return toolCallDetailExportRendererByName[toolCallDetail.toolName] as ToolCallDetailExportRenderer<ToolName>;
}

function renderToolResultPurpose(toolCallDetail: ToolCallDetail): string {
  return resolveToolCallDetailExportRenderer(toolCallDetail).renderPurpose(toolCallDetail);
}

function renderBashToolResultPurpose(toolCallDetail: ToolCallDetailByName<"bash">): string {
  return toolCallDetail.commandDescription
    ? `<span class="panel-purpose">${escapeHtml(toolCallDetail.commandDescription)}</span>`
    : "";
}

function renderReadToolResultPurpose(toolCallDetail: ToolCallDetailByName<"read">): string {
  return `<span class="panel-purpose">${escapeHtml(toolCallDetail.readFilePath)}</span>`;
}

function renderReadManyToolResultPurpose(toolCallDetail: ToolCallDetailByName<"read_many">): string {
  const completedReadCount = toolCallDetail.completedReadCount;
  const failedReadCount = toolCallDetail.failedReadCount ?? 0;
  const requestedReadTargetCount = toolCallDetail.requestedReadTargetPaths.length;
  const readManySummary = completedReadCount === undefined
    ? formatReadManyPathCount(requestedReadTargetCount)
    : failedReadCount > 0
      ? `${completedReadCount}/${requestedReadTargetCount} read, ${failedReadCount} failed`
      : `${completedReadCount} read`;
  return `<span class="panel-purpose">${escapeHtml(readManySummary)}</span>`;
}

function renderSearchManyToolResultPurpose(toolCallDetail: ToolCallDetailByName<"search_many">): string {
  const completedSearchCount = toolCallDetail.completedSearchCount;
  const failedSearchCount = toolCallDetail.failedSearchCount ?? 0;
  const requestedSearchCount = toolCallDetail.requestedSearches.length;
  const searchManySummary = completedSearchCount === undefined
    ? formatSearchManySearchCount(requestedSearchCount)
    : failedSearchCount > 0
      ? `${completedSearchCount}/${requestedSearchCount} searched, ${failedSearchCount} failed`
      : `${completedSearchCount} searched`;
  return `<span class="panel-purpose">${escapeHtml(searchManySummary)}</span>`;
}

function renderGlobToolResultPurpose(toolCallDetail: ToolCallDetailByName<"glob">): string {
  return toolCallDetail.matchedPathCount === undefined
    ? ""
    : `<span class="panel-purpose">${toolCallDetail.matchedPathCount} paths</span>`;
}

function renderGrepToolResultPurpose(toolCallDetail: ToolCallDetailByName<"grep">): string {
  return toolCallDetail.totalMatchCount === undefined
    ? ""
    : `<span class="panel-purpose">${toolCallDetail.totalMatchCount} matches</span>`;
}

function renderQueryCodebaseKnowledgeToolResultPurpose(toolCallDetail: ToolCallDetailByName<"query_codebase_knowledge">): string {
  const matchedKnowledgeCount = toolCallDetail.matchedKnowledgeCount;
  if (matchedKnowledgeCount === undefined) {
    return `<span class="panel-purpose">codebase knowledge</span>`;
  }

  const matchLabel = `${matchedKnowledgeCount} ${matchedKnowledgeCount === 1 ? "match" : "matches"}`;
  const recommendedReadCount = toolCallDetail.recommendedReadCount;
  const readLabel = recommendedReadCount === undefined
    ? ""
    : ` · ${recommendedReadCount} ${recommendedReadCount === 1 ? "read" : "reads"}`;
  return `<span class="panel-purpose">${escapeHtml(`${matchLabel}${readLabel}`)}</span>`;
}

function renderEditToolResultPurpose(toolCallDetail: ToolCallDetailByName<"edit">): string {
  const lineChange = renderLineChangeSummary(toolCallDetail.addedLineCount, toolCallDetail.removedLineCount);
  return `<span class="panel-purpose">${escapeHtml(toolCallDetail.editedFilePath)}${lineChange}</span>`;
}

function renderEditManyToolResultPurpose(toolCallDetail: ToolCallDetailByName<"edit_many">): string {
  const lineChange = renderLineChangeSummary(toolCallDetail.addedLineCount, toolCallDetail.removedLineCount);
  return `<span class="panel-purpose">${toolCallDetail.editedFileCount ?? 0} files${lineChange}</span>`;
}

function renderPatchToolResultPurpose(toolCallDetail: ToolCallDetailByName<"patch" | "patch_many">): string {
  const lineChange = renderLineChangeSummary(toolCallDetail.addedLineCount, toolCallDetail.removedLineCount);
  return `<span class="panel-purpose">${toolCallDetail.changedFileCount ?? 0} files${lineChange}</span>`;
}

function renderWriteToolResultPurpose(toolCallDetail: ToolCallDetailByName<"write">): string {
  const lineChange = renderLineChangeSummary(toolCallDetail.addedLineCount, toolCallDetail.removedLineCount);
  return `<span class="panel-purpose">${escapeHtml(toolCallDetail.writtenFilePath)}${lineChange}</span>`;
}

function renderTaskToolResultPurpose(toolCallDetail: ToolCallDetailByName<"task">): string {
  return `<span class="panel-purpose">${escapeHtml(`${toolCallDetail.subagentName}: ${toolCallDetail.subagentDescription}`)}</span>`;
}

function renderSkillToolResultPurpose(toolCallDetail: ToolCallDetailByName<"skill">): string {
  const skillDescriptionText = toolCallDetail.skillDescription ? `: ${toolCallDetail.skillDescription}` : "";
  return `<span class="panel-purpose">${escapeHtml(`${toolCallDetail.skillName}${skillDescriptionText}`)}</span>`;
}

function renderTodoWriteToolResultPurpose(toolCallDetail: ToolCallDetailByName<"todowrite">): string {
  return `<span class="panel-purpose">${toolCallDetail.todoItems.length} items</span>`;
}

function formatReadManyPathCount(readTargetCount: number): string {
  return `${readTargetCount} ${readTargetCount === 1 ? "path" : "paths"}`;
}

function formatSearchManySearchCount(searchCount: number): string {
  return `${searchCount} ${searchCount === 1 ? "search" : "searches"}`;
}

function formatToolDisplayName(toolName: string): string {
  if (toolName === "read_many") {
    return "ReadMany";
  }
  if (toolName === "search_many") {
    return "SearchMany";
  }
  if (toolName === "edit_many") {
    return "EditMany";
  }
  if (toolName === "patch") {
    return "Patch";
  }
  if (toolName === "patch_many") {
    return "PatchMany";
  }
  if (toolName === "query_codebase_knowledge") {
    return "CodebaseKnowledge";
  }
  if (toolName === "skill") {
    return "Skill";
  }
  return toolName;
}

function renderSearchManyRequestSearch(
  search: Extract<ToolCallRequest, { toolName: "search_many" }>["searches"][number],
  searchIndex: number,
): string {
  if (search.searchKind === "glob") {
    const pathHtml = search.searchDirectoryPath
      ? ` <span class="panel-purpose">path ${escapeHtml(search.searchDirectoryPath)}</span>`
      : "";
    return `<div class="arg"><b>search ${searchIndex + 1} glob</b> ${escapeHtml(search.globPattern)}${pathHtml}</div>`;
  }

  const pathHtml = search.searchPath
    ? ` <span class="panel-purpose">path ${escapeHtml(search.searchPath)}</span>`
    : "";
  const includeHtml = search.includeGlobPattern
    ? ` <span class="panel-purpose">include ${escapeHtml(search.includeGlobPattern)}</span>`
    : "";
  const contextHtml = search.contextLineCount !== undefined
    ? ` <span class="panel-purpose">context ${search.contextLineCount}</span>`
    : "";
  return `<div class="arg"><b>search ${searchIndex + 1} grep</b> ${escapeHtml(search.regexPattern)}${pathHtml}${includeHtml}${contextHtml}</div>`;
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

type SubagentChildToolCallDetailName = SubagentChildToolCallDetail["toolName"];
type SubagentChildToolCallDetailByName<ToolName extends SubagentChildToolCallDetailName> = Extract<
  SubagentChildToolCallDetail,
  { toolName: ToolName }
>;
type SubagentChildToolCallDetailSummaryRenderer<ToolName extends SubagentChildToolCallDetailName> = (
  subagentChildToolCallDetail: SubagentChildToolCallDetailByName<ToolName>,
) => string;

const subagentChildToolCallDetailSummaryRendererByName: {
  readonly [ToolName in SubagentChildToolCallDetailName]: SubagentChildToolCallDetailSummaryRenderer<ToolName>;
} = {
  read: renderReadSubagentChildToolCallDetailSummary,
  read_many: renderReadManySubagentChildToolCallDetailSummary,
  search_many: renderSearchManySubagentChildToolCallDetailSummary,
  glob: renderGlobSubagentChildToolCallDetailSummary,
  grep: renderGrepSubagentChildToolCallDetailSummary,
  query_codebase_knowledge: renderQueryCodebaseKnowledgeSubagentChildToolCallDetailSummary,
  bash: renderBashSubagentChildToolCallDetailSummary,
  edit: renderEditSubagentChildToolCallDetailSummary,
  edit_many: renderEditManySubagentChildToolCallDetailSummary,
  patch: renderPatchSubagentChildToolCallDetailSummary,
  patch_many: renderPatchSubagentChildToolCallDetailSummary,
  write: renderWriteSubagentChildToolCallDetailSummary,
  skill: renderSkillSubagentChildToolCallDetailSummary,
  task: renderTaskSubagentChildToolCallDetailSummary,
};

function resolveSubagentChildToolCallDetailSummaryRenderer<ToolName extends SubagentChildToolCallDetailName>(
  subagentChildToolCallDetail: SubagentChildToolCallDetailByName<ToolName>,
): SubagentChildToolCallDetailSummaryRenderer<ToolName> {
  return subagentChildToolCallDetailSummaryRendererByName[subagentChildToolCallDetail.toolName] as SubagentChildToolCallDetailSummaryRenderer<ToolName>;
}

function renderSubagentChildToolCallDetailSummary(subagentChildToolCallDetail: SubagentChildToolCallDetail): string {
  return resolveSubagentChildToolCallDetailSummaryRenderer(subagentChildToolCallDetail)(subagentChildToolCallDetail);
}

function renderReadSubagentChildToolCallDetailSummary(
  subagentChildToolCallDetail: SubagentChildToolCallDetailByName<"read">,
): string {
  return `<div class="arg"><b>read</b> ${escapeHtml(subagentChildToolCallDetail.readFilePath)}</div>`;
}

function renderReadManySubagentChildToolCallDetailSummary(
  subagentChildToolCallDetail: SubagentChildToolCallDetailByName<"read_many">,
): string {
  return `<div class="arg"><b>${formatToolDisplayName(subagentChildToolCallDetail.toolName)}</b> ${escapeHtml(formatReadManyPathCount(subagentChildToolCallDetail.requestedReadTargetPaths.length))}</div>`;
}

function renderSearchManySubagentChildToolCallDetailSummary(
  subagentChildToolCallDetail: SubagentChildToolCallDetailByName<"search_many">,
): string {
  return `<div class="arg"><b>${formatToolDisplayName(subagentChildToolCallDetail.toolName)}</b> ${escapeHtml(formatSearchManySearchCount(subagentChildToolCallDetail.requestedSearches.length))}</div>`;
}

function renderGlobSubagentChildToolCallDetailSummary(
  subagentChildToolCallDetail: SubagentChildToolCallDetailByName<"glob">,
): string {
  const countHtml = subagentChildToolCallDetail.matchedPathCount === undefined ? "" : ` · ${subagentChildToolCallDetail.matchedPathCount} paths`;
  return `<div class="arg"><b>glob</b> ${escapeHtml(subagentChildToolCallDetail.globPattern)}${escapeHtml(countHtml)}</div>`;
}

function renderGrepSubagentChildToolCallDetailSummary(
  subagentChildToolCallDetail: SubagentChildToolCallDetailByName<"grep">,
): string {
  const countHtml = subagentChildToolCallDetail.totalMatchCount === undefined ? "" : ` · ${subagentChildToolCallDetail.totalMatchCount} matches`;
  const contextHtml = subagentChildToolCallDetail.contextLineCount === undefined ? "" : ` · context ${subagentChildToolCallDetail.contextLineCount}`;
  return `<div class="arg"><b>grep</b> ${escapeHtml(subagentChildToolCallDetail.searchPattern)}${escapeHtml(`${countHtml}${contextHtml}`)}</div>`;
}

function renderQueryCodebaseKnowledgeSubagentChildToolCallDetailSummary(
  subagentChildToolCallDetail: SubagentChildToolCallDetailByName<"query_codebase_knowledge">,
): string {
  const countHtml = subagentChildToolCallDetail.matchedKnowledgeCount === undefined ? "" : ` · ${subagentChildToolCallDetail.matchedKnowledgeCount} matches`;
  return `<div class="arg"><b>query_codebase_knowledge</b> ${escapeHtml(subagentChildToolCallDetail.codebaseProblemDescription)}${escapeHtml(countHtml)}</div>`;
}

function renderBashSubagentChildToolCallDetailSummary(
  subagentChildToolCallDetail: SubagentChildToolCallDetailByName<"bash">,
): string {
  const purposeHtml = subagentChildToolCallDetail.commandDescription
    ? `<div class="arg"><b>desc</b> ${escapeHtml(subagentChildToolCallDetail.commandDescription)}</div>`
    : "";
  return `${purposeHtml}<pre class="cmd">${escapeHtml(subagentChildToolCallDetail.commandLine)}</pre>`;
}

function renderEditSubagentChildToolCallDetailSummary(
  subagentChildToolCallDetail: SubagentChildToolCallDetailByName<"edit">,
): string {
  return `<div class="arg"><b>edit</b> ${escapeHtml(subagentChildToolCallDetail.editedFilePath)}</div>`;
}

function renderEditManySubagentChildToolCallDetailSummary(
  subagentChildToolCallDetail: SubagentChildToolCallDetailByName<"edit_many">,
): string {
  return `<div class="arg"><b>${formatToolDisplayName(subagentChildToolCallDetail.toolName)}</b> ${subagentChildToolCallDetail.editCount} edits</div>`;
}

function renderPatchSubagentChildToolCallDetailSummary(
  subagentChildToolCallDetail: SubagentChildToolCallDetailByName<"patch" | "patch_many">,
): string {
  return `<div class="arg"><b>${formatToolDisplayName(subagentChildToolCallDetail.toolName)}</b> ${escapeHtml(subagentChildToolCallDetail.patchTargetText)}</div>`;
}

function renderWriteSubagentChildToolCallDetailSummary(
  subagentChildToolCallDetail: SubagentChildToolCallDetailByName<"write">,
): string {
  return `<div class="arg"><b>write</b> ${escapeHtml(subagentChildToolCallDetail.writtenFilePath)}</div>`;
}

function renderSkillSubagentChildToolCallDetailSummary(
  subagentChildToolCallDetail: SubagentChildToolCallDetailByName<"skill">,
): string {
  return `<div class="arg"><b>skill</b> ${escapeHtml(subagentChildToolCallDetail.skillName)}</div>`;
}

function renderTaskSubagentChildToolCallDetailSummary(
  subagentChildToolCallDetail: SubagentChildToolCallDetailByName<"task">,
): string {
  return `<div class="arg"><b>task</b> ${escapeHtml(`${subagentChildToolCallDetail.subagentName}: ${subagentChildToolCallDetail.subagentDescription}`)}</div>`;
}
