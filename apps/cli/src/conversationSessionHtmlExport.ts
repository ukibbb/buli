import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AssistantOperatingMode, ConversationSessionEntry, LearningSequence, ToolCallDetail, ToolCallRequest } from "@buli/contracts";
import { marked, Renderer, type Tokens } from "marked";

export type ConversationSessionHtmlExportResult = {
  exportFilePath: string;
  exportFileUrl: string;
};

class SafeAssistantMarkdownHtmlRenderer extends Renderer {
  override html({ text }: Tokens.HTML | Tokens.Tag): string {
    return escapeHtml(text);
  }

  override code({ text, lang }: Tokens.Code): string {
    const languageAttribute = lang ? ` data-lang="${escapeHtmlAttribute(lang)}"` : "";
    return `<pre${languageAttribute}><code>${escapeHtml(text)}</code></pre>`;
  }

  override link({ href, title, tokens }: Tokens.Link): string {
    const linkTextHtml = this.parser.parseInline(tokens);
    const safeHref = safeAssistantMarkdownHref(href);

    if (!safeHref) {
      return linkTextHtml;
    }

    const titleAttribute = title ? ` title="${escapeHtmlAttribute(title)}"` : "";
    return `<a href="${escapeHtmlAttribute(safeHref)}"${titleAttribute}>${linkTextHtml}</a>`;
  }

  override image({ href, text, title }: Tokens.Image): string {
    const imageLabel = text.length > 0 ? text : href;
    const imageText = `image: ${imageLabel}`;
    const safeHref = safeAssistantMarkdownHref(href);

    if (!safeHref) {
      return `<span>${escapeHtml(imageText)}</span>`;
    }

    const titleAttribute = title ? ` title="${escapeHtmlAttribute(title)}"` : "";
    return `<a href="${escapeHtmlAttribute(safeHref)}"${titleAttribute}>${escapeHtml(imageText)}</a>`;
  }
}

const assistantMarkdownHtmlRenderer = new SafeAssistantMarkdownHtmlRenderer();
const MAX_EXPORTED_IMAGE_DATA_URL_LENGTH = 2_000_000;
const privateConversationSessionExportDirectoryMode = 0o700;
const privateConversationSessionExportFileMode = 0o600;
type ConversationSessionExportImageAttachment = NonNullable<
  Extract<ConversationSessionEntry, { entryKind: "user_prompt" }>["imageAttachments"]
>[number];

export function defaultConversationSessionExportDirectoryPath(): string {
  return join(homedir(), ".buli", "session-exports");
}

export function writeConversationSessionHtmlExport(input: {
  conversationSessionEntries: readonly ConversationSessionEntry[];
  workspaceRootPath: string;
  conversationSessionId: string;
  exportDirectoryPath?: string;
  exportedAtMs?: number;
}): ConversationSessionHtmlExportResult {
  const exportDirectoryPath = input.exportDirectoryPath ?? defaultConversationSessionExportDirectoryPath();
  const exportedAtMs = input.exportedAtMs ?? Date.now();
  const exportFilePath = join(
    exportDirectoryPath,
    `${new Date(exportedAtMs).toISOString().replace(/[:.]/g, "-")}-${safeFileNameSegment(input.conversationSessionId)}.html`,
  );
  const html = renderConversationSessionHtmlDocument({
    conversationSessionEntries: input.conversationSessionEntries,
    workspaceRootPath: input.workspaceRootPath,
    conversationSessionId: input.conversationSessionId,
    exportedAtMs,
  });

  mkdirSync(exportDirectoryPath, { recursive: true, mode: privateConversationSessionExportDirectoryMode });
  chmodSync(exportDirectoryPath, privateConversationSessionExportDirectoryMode);
  writeFileSync(exportFilePath, html, { encoding: "utf8", mode: privateConversationSessionExportFileMode });
  chmodSync(exportFilePath, privateConversationSessionExportFileMode);
  return {
    exportFilePath,
    exportFileUrl: pathToFileURL(exportFilePath).href,
  };
}

export function renderConversationSessionHtmlDocument(input: {
  conversationSessionEntries: readonly ConversationSessionEntry[];
  workspaceRootPath: string;
  conversationSessionId: string;
  exportedAtMs: number;
}): string {
  const documentTitle = `Buli Session ${input.conversationSessionId}`;
  const exportedAtDisplayDate = formatExportedDateForDisplay(input.exportedAtMs);
  const exportedAtDisplayDateTime = formatExportedDateTimeForDisplay(input.exportedAtMs);

  const renderedTranscript = input.conversationSessionEntries.length === 0
    ? '<p class="empty-state">This session has no messages yet.</p>'
    : renderConversationSessionTranscriptEntries(input.conversationSessionEntries);

  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(documentTitle)}</title>
<style>${renderConversationSessionExportStyles()}</style>
</head>
<body class="buli-session-export">
<main class="page">
  <div class="metastrip">
    <span class="left">buli · session transcript</span>
    <span class="date">${escapeHtml(exportedAtDisplayDate)}</span>
    <button class="theme-toggle" type="button" data-action="toggle-theme">Theme</button>
  </div>
  <h1 class="title">Session <span class="id">${escapeHtml(input.conversationSessionId)}</span></h1>
  <p class="deck">A working conversation, captured verbatim — including every tool call, every reply.</p>
  <dl class="imprint">
    <div><dt>Workspace</dt><dd>${escapeHtml(input.workspaceRootPath)}</dd></div>
    <div><dt>Exported</dt><dd>${escapeHtml(exportedAtDisplayDateTime)}</dd></div>
    <div><dt>Entries</dt><dd>${input.conversationSessionEntries.length}</dd></div>
  </dl>
  <section class="transcript" id="transcript">
    ${renderedTranscript}
  </section>
  <footer class="colophon-foot">
    <span>buli · ${escapeHtml(input.conversationSessionId)} · ${input.conversationSessionEntries.length} entries</span>
    <a class="top" href="#transcript">↑ top</a>
  </footer>
</main>
<script>${renderConversationSessionExportScript()}</script>
</body>
</html>`;
}

function renderConversationSessionTranscriptEntries(conversationSessionEntries: readonly ConversationSessionEntry[]): string {
  let hasRenderedAssistantSegmentInCurrentTurn = false;

  return conversationSessionEntries.flatMap((conversationSessionEntry, entryIndex) => {
    if (conversationSessionEntry.entryKind === "user_prompt" || conversationSessionEntry.entryKind === "conversation_compaction_summary") {
      hasRenderedAssistantSegmentInCurrentTurn = false;
      return [renderConversationSessionTranscriptEntry(conversationSessionEntry, entryIndex)];
    }

    if (
      conversationSessionEntry.entryKind === "assistant_text_segment" ||
      conversationSessionEntry.entryKind === "assistant_learning_sequence_segment"
    ) {
      hasRenderedAssistantSegmentInCurrentTurn = true;
      return [renderConversationSessionTranscriptEntry(conversationSessionEntry, entryIndex)];
    }

    if (conversationSessionEntry.entryKind === "assistant_message") {
      const renderedTranscriptEntry = renderConversationSessionTranscriptEntry(
        conversationSessionEntry,
        entryIndex,
        { shouldOmitAssistantMessageText: hasRenderedAssistantSegmentInCurrentTurn },
      );
      hasRenderedAssistantSegmentInCurrentTurn = false;
      return renderedTranscriptEntry ? [renderedTranscriptEntry] : [];
    }

    return [renderConversationSessionTranscriptEntry(conversationSessionEntry, entryIndex)];
  }).join("\n");
}

function renderConversationSessionTranscriptEntry(
  conversationSessionEntry: ConversationSessionEntry,
  entryIndex: number,
  options: { shouldOmitAssistantMessageText?: boolean } = {},
): string | undefined {
  const indexNumberLabel = paddedTwoDigitNumberLabel(entryIndex + 1);
  const entryAnchorId = `e-${indexNumberLabel}`;

  if (conversationSessionEntry.entryKind === "user_prompt") {
    return renderConversationSessionTranscriptEntryShell({
      entryAnchorId,
      indexNumberLabel,
      entryIndex,
      entryClassName: "user",
      roleLabel: "User",
      bodyHtml: renderUserPromptBlock(conversationSessionEntry),
    });
  }

  if (conversationSessionEntry.entryKind === "assistant_text_segment") {
    return renderConversationSessionTranscriptEntryShell({
      entryAnchorId,
      indexNumberLabel,
      entryIndex,
      entryClassName: "assistant",
      roleLabel: "Assistant",
      bodyHtml: renderAssistantMarkdownText(conversationSessionEntry.assistantTextSegmentText),
    });
  }

  if (conversationSessionEntry.entryKind === "assistant_learning_sequence_segment") {
    return renderConversationSessionTranscriptEntryShell({
      entryAnchorId,
      indexNumberLabel,
      entryIndex,
      entryClassName: "assistant",
      roleLabel: "Assistant",
      bodyHtml: renderLearningSequenceBlock(conversationSessionEntry),
    });
  }

  if (conversationSessionEntry.entryKind === "assistant_message") {
    const assistantTextHtml = options.shouldOmitAssistantMessageText
      ? ""
      : conversationSessionEntry.assistantMessageText.length > 0
      ? renderAssistantMarkdownText(conversationSessionEntry.assistantMessageText)
      : '<p class="muted">No assistant text was recorded.</p>';

    const assistantStatusNoticeHtml =
      conversationSessionEntry.assistantMessageStatus === "incomplete"
        ? `<p class="status-notice status-notice-warn">Incomplete: ${escapeHtml(conversationSessionEntry.incompleteReason)}</p>`
        : conversationSessionEntry.assistantMessageStatus === "failed"
          ? `<p class="status-notice status-notice-error">Failed: ${escapeHtml(conversationSessionEntry.failureExplanation)}</p>`
          : conversationSessionEntry.assistantMessageStatus === "interrupted"
          ? `<p class="status-notice status-notice-error">Interrupted: ${escapeHtml(conversationSessionEntry.interruptionReason)}</p>`
          : "";

    if (assistantTextHtml.length === 0 && assistantStatusNoticeHtml.length === 0) {
      return undefined;
    }

    return renderConversationSessionTranscriptEntryShell({
      entryAnchorId,
      indexNumberLabel,
      entryIndex,
      entryClassName:
        conversationSessionEntry.assistantMessageStatus === "failed" || conversationSessionEntry.assistantMessageStatus === "interrupted"
          ? "assistant failed"
          : "assistant",
      roleLabel: "Assistant",
      bodyHtml: assistantTextHtml + assistantStatusNoticeHtml,
    });
  }

  if (conversationSessionEntry.entryKind === "tool_call") {
    return renderConversationSessionTranscriptEntryShell({
      entryAnchorId,
      indexNumberLabel,
      entryIndex,
      entryClassName: "tool",
      roleLabel: "Tool · call",
      bodyHtml: renderToolCallRequestBlock(conversationSessionEntry.toolCallRequest),
    });
  }

  if (conversationSessionEntry.entryKind === "conversation_compaction_summary") {
    return renderConversationSessionTranscriptEntryShell({
      entryAnchorId,
      indexNumberLabel,
      entryIndex,
      entryClassName: "assistant compaction-summary",
      roleLabel: "Compaction",
      bodyHtml: renderConversationCompactionSummaryBlock(conversationSessionEntry),
    });
  }

  const isFailedToolResult = conversationSessionEntry.entryKind === "failed_tool_result";
  const isDeniedToolResult = conversationSessionEntry.entryKind === "denied_tool_result";
  const variantClassName = isFailedToolResult ? "failed" : isDeniedToolResult ? "denied" : "tool-result";
  const variantRoleLabel = isFailedToolResult ? "Tool · failed" : isDeniedToolResult ? "Tool · denied" : "Tool · result";

  return renderConversationSessionTranscriptEntryShell({
    entryAnchorId,
    indexNumberLabel,
    entryIndex,
    entryClassName: variantClassName,
    roleLabel: variantRoleLabel,
    bodyHtml: renderToolResultBlock(conversationSessionEntry),
  });
}

function renderConversationSessionTranscriptEntryShell(input: {
  entryAnchorId: string;
  indexNumberLabel: string;
  entryIndex: number;
  entryClassName: string;
  roleLabel: string;
  bodyHtml: string;
}): string {
  return `<article class="entry ${input.entryClassName}" id="${input.entryAnchorId}" style="--i: ${input.entryIndex};">
  <div class="gutter">
    <a class="num" href="#${input.entryAnchorId}">${input.indexNumberLabel}</a>
    <span class="role">${escapeHtml(input.roleLabel)}</span>
  </div>
  <div class="body">${input.bodyHtml}</div>
</article>`;
}

function renderUserPromptBlock(conversationSessionEntry: Extract<ConversationSessionEntry, { entryKind: "user_prompt" }>): string {
  const imageAttachments = conversationSessionEntry.imageAttachments ?? [];
  const assistantOperatingModeHtml = conversationSessionEntry.assistantOperatingMode
    ? `<p class="status-notice">Mode: ${escapeHtml(formatAssistantOperatingModeDisplayName(conversationSessionEntry.assistantOperatingMode))}</p>`
    : "";
  const promptTextHtml = conversationSessionEntry.promptText.length > 0
    ? `<p>${escapeHtml(conversationSessionEntry.promptText)}</p>`
    : imageAttachments.length > 0
    ? ""
    : '<p class="muted">No prompt text was recorded.</p>';
  const safeImageAttachments = imageAttachments.filter(isSafeConversationSessionExportImageAttachment);
  const omittedImageAttachmentCount = imageAttachments.length - safeImageAttachments.length;
  const omittedImageAttachmentsHtml = omittedImageAttachmentCount > 0
    ? `<p class="muted">${omittedImageAttachmentCount} image attachment${omittedImageAttachmentCount === 1 ? "" : "s"} omitted from export because the data URL was invalid or too large.</p>`
    : "";
  const imageAttachmentsHtml = safeImageAttachments
    .map((imageAttachment, imageAttachmentIndex) => {
      const imageLabel = imageAttachment.fileName ?? `image-${imageAttachmentIndex + 1}`;
      return `<figure class="user-image-attachment" style="margin:16px 0 0;">
  <img src="${escapeHtmlAttribute(imageAttachment.dataUrl)}" alt="${escapeHtmlAttribute(`Attached image: ${imageLabel}`)}" style="display:block;max-width:100%;height:auto;border:1px solid var(--rule);background:var(--paper-edge);">
  <figcaption style="margin-top:6px;font:500 11px/1.4 var(--mono);color:var(--ink-soft);">${escapeHtml(imageLabel)} · ${escapeHtml(imageAttachment.mimeType)}</figcaption>
</figure>`;
    })
    .join("\n");

  return `${assistantOperatingModeHtml}${promptTextHtml}${imageAttachmentsHtml}${omittedImageAttachmentsHtml}`;
}

function isSafeConversationSessionExportImageAttachment(
  imageAttachment: ConversationSessionExportImageAttachment,
): boolean {
  const expectedDataUrlPrefix = `data:${imageAttachment.mimeType};base64,`;
  return imageAttachment.dataUrl.length <= MAX_EXPORTED_IMAGE_DATA_URL_LENGTH &&
    imageAttachment.dataUrl.startsWith(expectedDataUrlPrefix) &&
    imageAttachment.dataUrl.slice(expectedDataUrlPrefix.length).trim().length > 0;
}

function formatAssistantOperatingModeDisplayName(assistantOperatingMode: AssistantOperatingMode): string {
  return assistantOperatingMode === "understand"
    ? "Understand"
    : assistantOperatingMode === "plan"
    ? "Plan"
    : "Implementation";
}

function renderConversationCompactionSummaryBlock(
  conversationSessionEntry: Extract<ConversationSessionEntry, { entryKind: "conversation_compaction_summary" }>,
): string {
  return [
    `<p class="status-notice">Context compacted from ${conversationSessionEntry.compactedEntryCount} entries.</p>`,
    renderAssistantMarkdownText(conversationSessionEntry.summaryText),
  ].join("\n");
}

function renderLearningSequenceBlock(learningSequence: LearningSequence): string {
  const summaryHtml = learningSequence.summaryText === undefined
    ? ""
    : `<p class="muted">${escapeHtml(learningSequence.summaryText)}</p>`;
  const sequenceItemsHtml = learningSequence.sequenceItems.map((sequenceItem) => {
    const detailHtml = sequenceItem.detailText === undefined
      ? ""
      : `<p class="muted">${escapeHtml(sequenceItem.detailText)}</p>`;
    return `<li><strong>${escapeHtml(sequenceItem.labelText)}</strong>${detailHtml}</li>`;
  }).join("\n");

  return `<div class="tool-block learning-sequence-block">
  <div class="tool-summary"><span class="tool-name">learning sequence</span><span class="tool-purpose">${escapeHtml(learningSequence.titleText)}</span></div>
  ${summaryHtml}
  <ol>${sequenceItemsHtml}</ol>
</div>`;
}

function renderToolCallRequestBlock(toolCallRequest: ToolCallRequest): string {
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
  <div class="tool-summary"><span class="tool-name">explore</span><span class="tool-purpose">${escapeHtml(toolCallRequest.explorationDescription)}</span></div>
  <pre class="tool-cmd">${escapeHtml(toolCallRequest.explorationPrompt)}</pre>
</div>`;
}

function renderToolResultBlock(
  conversationSessionEntry: Extract<
    ConversationSessionEntry,
    { entryKind: "completed_tool_result" | "failed_tool_result" | "denied_tool_result" }
  >,
): string {
  const summaryHtml = renderToolDetailSummary(conversationSessionEntry.toolCallDetail);
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
  if (toolCallDetail.toolName === "explore") {
    return `<div class="tool-summary"><span class="tool-name">explore</span><span class="tool-purpose">${escapeHtml(toolCallDetail.explorationDescription)}</span></div>`;
  }
  return `<div class="tool-summary"><span class="tool-name">${escapeHtml(toolCallDetail.toolName)}</span></div>`;
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

function renderAssistantMarkdownText(markdownText: string): string {
  return marked(markdownText, {
    async: false,
    gfm: true,
    renderer: assistantMarkdownHtmlRenderer,
  });
}

function safeAssistantMarkdownHref(href: string): string | null {
  const trimmedHref = href.trim();

  if (trimmedHref.length === 0 || /[\u0000-\u001f\u007f]/.test(trimmedHref)) {
    return null;
  }

  const hrefForSchemeCheck = trimmedHref.replace(/\s+/g, "");
  if (hrefForSchemeCheck.startsWith("//")) {
    return null;
  }

  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(hrefForSchemeCheck);
  if (!schemeMatch) {
    return trimmedHref;
  }

  const scheme = schemeMatch[1]?.toLowerCase();
  return scheme === "http" || scheme === "https" || scheme === "mailto" ? trimmedHref : null;
}

function renderConversationSessionExportStyles(): string {
  return `:root{--paper:#fafaf6;--paper-edge:#f1efe6;--paper-deep:#e7e3d5;--ink:#16181c;--ink-soft:#5b6068;--ink-faint:#a8aeb6;--rule:#e0ddd2;--rule-soft:#ebe7da;--accent:#0e7490;--accent-soft:rgba(14,116,144,.08);--warn:#b45309;--warn-soft:rgba(180,83,9,.06);--error:#b91c1c;--error-soft:rgba(185,28,28,.05);--ok:#047857;--ok-soft:rgba(4,120,87,.06);--col-gutter:144px;--col-gap:28px;--pad-h:16px;--row-pad:24px;--serif:ui-serif,"Charter","Source Serif 4","Iowan Old Style",Cambria,Georgia,serif;--mono:"JetBrains Mono",ui-monospace,"SF Mono",Menlo,"Cascadia Code",Consolas,monospace}[data-theme="dark"]{--paper:#000;--paper-edge:#0b0d11;--paper-deep:#161821;--ink:#fff;--ink-soft:#94a3b8;--ink-faint:#64748b;--rule:#1e1e2e;--rule-soft:#14141d;--accent:#22d3ee;--accent-soft:rgba(34,211,238,.1);--warn:#f59e0b;--warn-soft:rgba(245,158,11,.08);--error:#ef4444;--error-soft:rgba(239,68,68,.07);--ok:#10b981;--ok-soft:rgba(16,185,129,.07)}*{box-sizing:border-box}html,body{margin:0;padding:0}html{background:var(--paper)}body{background:var(--paper);color:var(--ink);font:16.5px/1.7 var(--serif);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}.page{max-width:920px;margin:0 auto;padding:56px 56px 96px;position:relative}.metastrip{display:grid;grid-template-columns:1fr auto auto;align-items:baseline;gap:16px;font:500 10px/1 var(--mono);text-transform:uppercase;letter-spacing:.22em;color:var(--ink-soft);border-bottom:1px solid var(--ink);padding-bottom:12px;margin-bottom:32px}.metastrip .left::before{content:"■";color:var(--accent);margin-right:8px;font-size:9px;letter-spacing:0;vertical-align:1px}.metastrip .date{color:var(--ink-faint);font-variant-numeric:tabular-nums}.theme-toggle{background:transparent;border:1px solid var(--rule);color:var(--ink-soft);font:600 10px/1 var(--mono);text-transform:uppercase;letter-spacing:.18em;padding:6px 10px;cursor:pointer;border-radius:0;transition:color .15s ease,border-color .15s ease}.theme-toggle:hover{color:var(--ink);border-color:var(--ink-soft)}.theme-toggle::before{content:"◐";margin-right:6px;color:var(--accent)}.title{font:600 42px/1.05 var(--serif);letter-spacing:-.02em;margin:0;color:var(--ink);display:flex;align-items:baseline;gap:16px;flex-wrap:wrap}.title .id{font:500 28px/1 var(--mono);letter-spacing:0;color:var(--accent)}.deck{font:italic 400 16.5px/1.55 var(--serif);color:var(--ink-soft);margin:12px 0 0;max-width:56ch}.imprint{margin:32px 0 0;display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);font:500 11px/1.35 var(--mono);text-transform:uppercase;letter-spacing:.12em;color:var(--ink-soft)}.imprint>div{padding:12px 16px;border-right:1px solid var(--rule);text-align:left}.imprint>div:first-child{padding-left:0}.imprint>div:last-child{padding-right:0;border-right:0}.imprint dt{color:var(--ink-faint);margin:0 0 6px}.imprint dd{margin:0;color:var(--ink);font-weight:600;letter-spacing:.04em;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.transcript{display:grid;gap:0;margin-top:32px}.entry{display:grid;grid-template-columns:var(--col-gutter) 1fr;gap:var(--col-gap);padding:var(--row-pad) var(--pad-h);margin:0 calc(var(--pad-h) * -1);border-top:1px solid var(--rule-soft);scroll-margin-top:24px;transition:background .18s ease;position:relative}.entry:first-of-type{border-top:0}.entry:hover{background:var(--rule-soft)}.entry:target{background:var(--accent-soft)}.entry:target::before{content:"";position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--accent)}.gutter{text-align:right;padding-top:10px;display:flex;flex-direction:column;align-items:flex-end;gap:6px}.gutter .num{font:600 12px/1 var(--mono);letter-spacing:.04em;color:var(--ink-faint);font-variant-numeric:tabular-nums;text-decoration:none;position:relative}.gutter .num:hover{color:var(--accent)}.gutter .num:hover::before{content:"#";position:absolute;left:-14px;top:0;color:var(--accent);opacity:.7}.gutter .role{font:600 10.5px/1 var(--mono);text-transform:uppercase;letter-spacing:.14em;color:var(--ink);display:inline-flex;align-items:center;gap:6px;white-space:nowrap}.gutter .role::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--ink-faint)}.entry.user{--role-color:var(--accent)}.entry.assistant{--role-color:var(--ok)}.entry.tool{--role-color:var(--warn);--tool-accent:var(--warn);--tool-bg:transparent;--tool-border-style:solid}.entry.tool-result{--role-color:var(--ok);--tool-accent:var(--ok);--tool-bg:var(--ok-soft);--tool-border-style:solid}.entry.failed{--role-color:var(--error);--tool-accent:var(--error);--tool-bg:var(--error-soft);--tool-border-style:solid}.entry.denied{--role-color:var(--warn);--tool-accent:var(--warn);--tool-bg:var(--warn-soft);--tool-border-style:dashed}.gutter .role::before{background:var(--role-color,var(--ink-faint))}.body{min-width:0;max-width:64ch}.entry .body p{margin:0 0 .85em}.entry .body p:last-child{margin-bottom:0}.entry.user .body{font-style:italic;font-size:18px;line-height:1.55;color:var(--ink)}.entry.assistant .body h1,.entry.assistant .body h2,.entry.assistant .body h3,.entry.assistant .body h4{font-family:var(--serif);font-weight:600;letter-spacing:-.01em;margin:1.5em 0 .35em;color:var(--ink);line-height:1.2}.entry.assistant .body h1{font-size:22px}.entry.assistant .body h2{font-size:19px}.entry.assistant .body h3{font-size:17px}.entry.assistant .body h4{font-size:15px}.entry.assistant .body h1:first-child,.entry.assistant .body h2:first-child,.entry.assistant .body h3:first-child{margin-top:0}.entry.assistant .body ul,.entry.assistant .body ol{padding-left:0;margin:8px 0 16px;list-style:none}.entry.assistant .body li{padding-left:22px;position:relative;margin-bottom:4px}.entry.assistant .body ul li::before{content:"—";position:absolute;left:0;top:0;color:var(--ink-faint)}.entry.assistant .body ol{counter-reset:item}.entry.assistant .body ol li{counter-increment:item}.entry.assistant .body ol li::before{content:counter(item) ".";position:absolute;left:0;top:0;font-variant-numeric:tabular-nums;color:var(--ink-faint)}.tool-block{background:var(--tool-bg,var(--paper-edge));border-left:2px var(--tool-border-style,solid) var(--tool-accent,var(--accent));display:grid;gap:0}.tool-block .tool-summary{display:flex;align-items:baseline;gap:10px;padding:10px 14px 6px;font:500 12px/1.4 var(--mono);letter-spacing:.04em;color:var(--ink-soft);flex-wrap:wrap}.tool-block .tool-name{color:var(--tool-accent,var(--accent));font-weight:700;text-transform:lowercase}.tool-block .tool-purpose{color:var(--ink-soft);font-style:italic;font-family:var(--serif);font-size:13px;letter-spacing:0}.tool-block .tool-purpose::before{content:"·";color:var(--ink-faint);margin-right:8px;font-style:normal;font-family:var(--mono)}.tool-block .tool-cmd,.tool-block .tool-output{margin:0;padding:4px 14px 12px;background:transparent;border:0;font:13px/1.6 var(--mono);white-space:pre-wrap;color:var(--ink);word-break:break-word}.tool-block .tool-cmd::before{content:"$ ";color:var(--ink-faint)}.tool-block .tool-output::before{content:"↳ ";color:var(--ink-faint)}.tool-block>.tool-cmd:first-child,.tool-block>.tool-output:first-child{padding-top:12px}.tool-block .tool-notice{margin:0;padding:8px 14px 12px;font:italic 13px/1.5 var(--serif);color:var(--ink-soft)}.tool-block .tool-notice-error{color:var(--error)}.tool-block .tool-notice-warn{color:var(--warn)}.entry.assistant.failed .status-notice{margin-top:12px}.status-notice{margin:12px 0 0;padding:10px 14px;font:13px/1.5 var(--mono);border:1px solid var(--rule);border-left-width:2px}.status-notice-warn{border-left-color:var(--warn);color:var(--warn);background:var(--warn-soft)}.status-notice-error{border-left-color:var(--error);color:var(--error);background:var(--error-soft)}code{font:.9em/1.4 var(--mono);background:var(--paper-edge);padding:1px 5px;color:var(--ink);border-radius:2px}.entry.user .body code{font-style:normal}pre{background:var(--paper-edge);border:1px solid var(--rule);border-top:2px solid var(--accent);padding:36px 16px 14px;font:13px/1.65 var(--mono);white-space:pre-wrap;margin:16px 0;position:relative;border-radius:0}pre code{background:transparent;padding:0;color:var(--ink)}.code-toolbar{position:absolute;top:2px;left:0;right:0;display:flex;justify-content:space-between;align-items:stretch;border-bottom:1px solid var(--rule);background:var(--paper);height:26px}.code-toolbar .lang{font:600 10px/1 var(--mono);text-transform:uppercase;letter-spacing:.18em;color:var(--ink-faint);padding:8px 12px;border-right:1px solid var(--rule)}.code-toolbar .copy{background:transparent;border:0;border-left:1px solid var(--rule);color:var(--ink-faint);font:600 10px/1 var(--mono);text-transform:uppercase;letter-spacing:.18em;padding:8px 12px;cursor:pointer;transition:color .15s ease}.code-toolbar .copy:hover{color:var(--accent)}.code-toolbar .copy[data-copied]{color:var(--ok)}blockquote{margin:16px 0;padding:4px 0 4px 16px;border-left:2px solid var(--accent);font-style:italic;color:var(--ink-soft)}a{color:var(--accent);text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}.callout{margin:14px 0;padding:12px 14px;border-left:2px solid var(--accent);background:var(--accent-soft)}.callout.warning{border-left-color:var(--warn);background:var(--warn-soft)}.callout.error{border-left-color:var(--error);background:var(--error-soft)}.callout.success{border-left-color:var(--ok)}.callout strong{display:block;margin-bottom:4px}.checklist{list-style:none;padding-left:0}.checklist li{padding-left:22px;position:relative}.checklist li::before{content:"☐";position:absolute;left:0;color:var(--ink-faint)}.checklist li[data-status="completed"]::before{content:"☑";color:var(--ok)}.session-rule{border:0;border-top:1px solid var(--rule);margin:24px 0}.empty-state{margin:32px 0;padding:24px;border:1px dashed var(--rule);color:var(--ink-soft);text-align:center;font-style:italic}.colophon-foot{margin-top:64px;padding-top:14px;border-top:1px solid var(--ink);display:flex;justify-content:space-between;align-items:baseline;font:500 10.5px/1.2 var(--mono);text-transform:uppercase;letter-spacing:.18em;color:var(--ink-soft)}.colophon-foot .top{color:var(--ink-soft);text-decoration:none;border-bottom:1px solid transparent}.colophon-foot .top:hover{color:var(--accent);border-bottom-color:var(--accent)}@media(prefers-reduced-motion:no-preference){.metastrip,.title,.deck,.imprint,.entry,.colophon-foot{opacity:0;transform:translateY(4px);animation:rise .5s ease-out forwards}.metastrip{animation-delay:0ms}.title{animation-delay:60ms}.deck{animation-delay:120ms}.imprint{animation-delay:180ms}.entry{animation-delay:calc(240ms + var(--i,0) * 50ms)}.colophon-foot{animation-delay:700ms}}@keyframes rise{to{opacity:1;transform:translateY(0)}}@media(max-width:760px){.page{padding:28px 20px 64px}.metastrip{grid-template-columns:1fr auto;row-gap:8px}.title{font-size:28px;gap:10px}.title .id{font-size:20px}.deck{font-size:15px}.imprint{grid-template-columns:1fr 1fr}.imprint>div{border-right:0;padding:10px 12px;border-bottom:1px solid var(--rule)}.imprint>div:nth-child(odd){border-right:1px solid var(--rule)}.imprint>div:nth-last-child(-n+2){border-bottom:0}.entry{grid-template-columns:1fr;gap:10px;padding:18px 12px;margin:0 -12px}.gutter{padding-top:0;text-align:left;flex-direction:row;align-items:baseline;gap:12px;flex-wrap:wrap}.entry.user .body{font-size:16.5px}}@media print{html,body{background:#fff!important;color:#000!important}.theme-toggle,.code-toolbar .copy{display:none!important}.entry{break-inside:avoid;opacity:1!important;transform:none!important;animation:none!important}}`;
}

function renderConversationSessionExportScript(): string {
  return `(function(){var html=document.documentElement;var stored=localStorage.getItem("buli-export-theme");if(stored==="dark"||stored==="light")html.setAttribute("data-theme",stored);var toggle=document.querySelector("[data-action=toggle-theme]");if(toggle){toggle.addEventListener("click",function(){var next=html.getAttribute("data-theme")==="dark"?"light":"dark";html.setAttribute("data-theme",next);localStorage.setItem("buli-export-theme",next);});}document.querySelectorAll("pre[data-lang]").forEach(function(pre){var bar=document.createElement("div");bar.className="code-toolbar";var lang=document.createElement("span");lang.className="lang";lang.textContent=pre.getAttribute("data-lang");var copy=document.createElement("button");copy.type="button";copy.className="copy";copy.textContent="Copy";copy.addEventListener("click",function(){var node=pre.querySelector("code");var text=node?node.innerText:pre.innerText;navigator.clipboard.writeText(text).then(function(){copy.setAttribute("data-copied","");copy.textContent="Copied";setTimeout(function(){copy.removeAttribute("data-copied");copy.textContent="Copy";},1400);});});bar.appendChild(lang);bar.appendChild(copy);pre.insertBefore(bar,pre.firstChild);});})();`;
}

function paddedTwoDigitNumberLabel(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatExportedDateForDisplay(epochMs: number): string {
  const exportedDate = new Date(epochMs);
  return `${exportedDate.getFullYear()}-${paddedTwoDigitNumberLabel(exportedDate.getMonth() + 1)}-${paddedTwoDigitNumberLabel(exportedDate.getDate())}`;
}

function formatExportedDateTimeForDisplay(epochMs: number): string {
  const exportedDate = new Date(epochMs);
  const hh = paddedTwoDigitNumberLabel(exportedDate.getHours());
  const mm = paddedTwoDigitNumberLabel(exportedDate.getMinutes());
  return `${formatExportedDateForDisplay(epochMs)} ${hh}:${mm}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value);
}

function safeFileNameSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "session";
}
