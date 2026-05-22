import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  AssistantOperatingMode,
  CodeExecutionCodeExample,
  CodeExecutionWalkthrough,
  ConversationSessionEntry,
} from "@buli/contracts";
import { marked, Renderer, type Tokens } from "marked";
import { escapeHtml, escapeHtmlAttribute } from "./conversationSessionHtmlExport/htmlEscaping.ts";
import { renderConversationSessionExportStyles } from "./conversationSessionHtmlExport/styles.ts";
import {
  renderConversationSessionExportFoucScript,
  renderConversationSessionExportRuntimeScript,
} from "./conversationSessionHtmlExport/scripts.ts";
import {
  renderFailAlertIcon,
  renderFileIcon,
  renderInfoAlertIcon,
  renderKeyboardIcon,
  renderMoonIcon,
  renderSunIcon,
  renderUpChevronIcon,
} from "./conversationSessionHtmlExport/svgIcons.ts";
import {
  highlightCodeBlock,
  renderCodeWrap,
} from "./conversationSessionHtmlExport/syntaxHighlight.ts";
import {
  renderToolCallRequestBlock,
  renderToolResultBlock,
} from "./conversationSessionHtmlExport/toolBlocks.ts";

export type ConversationSessionHtmlExportResult = {
  exportFilePath: string;
  exportFileUrl: string;
};

class SafeAssistantMarkdownHtmlRenderer extends Renderer {
  override html({ text }: Tokens.HTML | Tokens.Tag): string {
    return escapeHtml(text);
  }

  override code({ text, lang }: Tokens.Code): string {
    // Spread lang only when defined so exactOptionalPropertyTypes is satisfied — the renderer
    // signature uses an optional property, not an explicit-undefined property.
    return renderCodeWrap({ codeText: text, ...(lang !== undefined ? { languageLabel: lang } : {}) });
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

type EntryRoleKind = "user" | "assistant" | "tool" | "result" | "failed" | "patch" | "compaction";

type RenderedEntry = {
  html: string;
  roleKind: EntryRoleKind;
  roleLabel: string;
  entryAnchorId: string;
  entryNumberLabel: string;
  traceLabel: string;
};

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
  const exportedAtDisplayDateTime = formatExportedDateTimeForDisplay(input.exportedAtMs);

  const renderedEntries = input.conversationSessionEntries.length === 0
    ? []
    : renderConversationSessionTranscriptEntries(input.conversationSessionEntries);

  const transcriptHtml = renderedEntries.length === 0
    ? '<p class="empty-state">This session has no messages yet.</p>'
    : renderedEntries.map((renderedEntry) => renderedEntry.html).join("\n");

  const railHtml = renderedEntries.length === 0
    ? ""
    : renderRail(renderedEntries);

  return `<!doctype html>
<html lang="en" data-theme="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(documentTitle)}</title>
<style>${renderConversationSessionExportStyles()}</style>
<script>${renderConversationSessionExportFoucScript()}</script>
</head>
<body class="buli-session-export">
<header class="appbar">
  <div class="appbar-inner">
    <span class="wordmark">buli</span>
    <span class="appbar-sep" aria-hidden="true"></span>
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <span>Session</span>
      <span class="breadcrumb-sep">/</span>
      <span class="breadcrumb-leaf">${escapeHtml(input.conversationSessionId)}</span>
    </nav>
    <div class="appbar-spacer"></div>
    <div class="appbar-actions">
      <button class="iconbtn" id="shortcuts-btn" type="button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">${renderKeyboardIcon()}</button>
      <button class="iconbtn" id="theme-toggle" type="button" aria-label="Toggle theme" title="Toggle theme">${renderSunIcon()}${renderMoonIcon()}</button>
    </div>
  </div>
</header>
<div class="shell">
  <main>
    <section class="hero">
      <h1>Session <span class="id" title="${escapeHtmlAttribute(input.conversationSessionId)}">${escapeHtml(shortenSessionIdForDisplay(input.conversationSessionId))}</span></h1>
    </section>
    <section class="meta-grid" aria-label="Session metadata">
      <div class="meta-card">
        <div class="meta-label">Workspace</div>
        <div class="meta-value mono" title="${escapeHtmlAttribute(input.workspaceRootPath)}">${escapeHtml(input.workspaceRootPath)}</div>
      </div>
      <div class="meta-card">
        <div class="meta-label">Exported</div>
        <div class="meta-value">${escapeHtml(exportedAtDisplayDateTime)}</div>
      </div>
      <div class="meta-card">
        <div class="meta-label">Entries</div>
        <div class="meta-value">${input.conversationSessionEntries.length}</div>
      </div>
      <div class="meta-card">
        <div class="meta-label">Model</div>
        <div class="meta-value">&mdash;</div>
      </div>
    </section>
    <nav class="trace" aria-label="Session trace map">
      <span class="trace-label">Trace</span>
      <div class="trace-cells" id="trace-cells"></div>
    </nav>
    <section class="transcript" id="transcript">
      ${transcriptHtml}
    </section>
  </main>
  ${railHtml}
</div>
<button class="totop" id="totop" type="button" aria-label="Back to top">${renderUpChevronIcon()}</button>
<div class="dialog-backdrop" id="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
  <div class="dialog">
    <h3 id="dialog-title">Keyboard shortcuts</h3>
    <p>Navigate the session with the keyboard.</p>
    <ul class="dialog-list">
      <li><span>Next entry</span><span><kbd>J</kbd> or <kbd>&darr;</kbd></span></li>
      <li><span>Previous entry</span><span><kbd>K</kbd> or <kbd>&uarr;</kbd></span></li>
      <li><span>Toggle theme</span><span><kbd>T</kbd></span></li>
      <li><span>Show this dialog</span><span><kbd>?</kbd></span></li>
      <li><span>Close dialog</span><span><kbd>Esc</kbd></span></li>
    </ul>
  </div>
</div>
<script>${renderConversationSessionExportRuntimeScript()}</script>
</body>
</html>`;
}

function renderRail(renderedEntries: readonly RenderedEntry[]): string {
  const userEntries = renderedEntries.filter((renderedEntry) => renderedEntry.roleKind === "user");
  if (userEntries.length === 0) {
    return "";
  }
  const railItemsHtml = userEntries
    .map((renderedEntry) => {
      const label = renderedEntry.traceLabel.length > 80 ? `${renderedEntry.traceLabel.slice(0, 77)}...` : renderedEntry.traceLabel;
      return `<li class="rail-item" data-target="${renderedEntry.entryAnchorId}"><a href="#${renderedEntry.entryAnchorId}"><span class="rail-num">#${escapeHtml(renderedEntry.entryNumberLabel)}</span>${escapeHtml(label)}</a></li>`;
    })
    .join("\n");
  return `<aside class="rail" aria-label="Session prompts">
    <div class="rail-title">In this session</div>
    <ul class="rail-list">${railItemsHtml}</ul>
  </aside>`;
}

function renderConversationSessionTranscriptEntries(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): RenderedEntry[] {
  let hasRenderedAssistantSegmentInCurrentTurn = false;
  const renderedEntries: RenderedEntry[] = [];

  conversationSessionEntries.forEach((conversationSessionEntry, entryIndex) => {
    let nextRenderedEntry: RenderedEntry | undefined;

    if (conversationSessionEntry.entryKind === "user_prompt" || conversationSessionEntry.entryKind === "conversation_compaction_summary") {
      hasRenderedAssistantSegmentInCurrentTurn = false;
      nextRenderedEntry = renderConversationSessionTranscriptEntry(conversationSessionEntry, entryIndex);
    } else if (
      conversationSessionEntry.entryKind === "assistant_text_segment" ||
      conversationSessionEntry.entryKind === "assistant_code_execution_walkthrough_segment"
    ) {
      hasRenderedAssistantSegmentInCurrentTurn = true;
      nextRenderedEntry = renderConversationSessionTranscriptEntry(conversationSessionEntry, entryIndex);
    } else if (conversationSessionEntry.entryKind === "assistant_message") {
      nextRenderedEntry = renderConversationSessionTranscriptEntry(
        conversationSessionEntry,
        entryIndex,
        { shouldOmitAssistantMessageText: hasRenderedAssistantSegmentInCurrentTurn },
      );
      hasRenderedAssistantSegmentInCurrentTurn = false;
    } else {
      nextRenderedEntry = renderConversationSessionTranscriptEntry(conversationSessionEntry, entryIndex);
    }

    if (nextRenderedEntry !== undefined) {
      renderedEntries.push(nextRenderedEntry);
    }
  });

  return renderedEntries;
}

function renderConversationSessionTranscriptEntry(
  conversationSessionEntry: ConversationSessionEntry,
  entryIndex: number,
  options: { shouldOmitAssistantMessageText?: boolean } = {},
): RenderedEntry | undefined {
  const indexNumberLabel = paddedTwoDigitNumberLabel(entryIndex + 1);
  const entryAnchorId = `e-${indexNumberLabel}`;

  if (conversationSessionEntry.entryKind === "user_prompt") {
    return buildRenderedEntry({
      entryAnchorId,
      indexNumberLabel,
      roleKind: "user",
      roleLabel: "User",
      bodyHtml: renderUserPromptBlock(conversationSessionEntry),
      traceLabel: deriveUserTraceLabel(conversationSessionEntry.promptText),
    });
  }

  if (conversationSessionEntry.entryKind === "assistant_text_segment") {
    return buildRenderedEntry({
      entryAnchorId,
      indexNumberLabel,
      roleKind: "assistant",
      roleLabel: "Assistant",
      bodyHtml: `<div class="prose">${renderAssistantMarkdownText(conversationSessionEntry.assistantTextSegmentText)}</div>`,
      traceLabel: "Assistant note",
    });
  }

  if (conversationSessionEntry.entryKind === "assistant_code_execution_walkthrough_segment") {
    return buildRenderedEntry({
      entryAnchorId,
      indexNumberLabel,
      roleKind: "assistant",
      roleLabel: "Assistant",
      bodyHtml: renderCodeExecutionWalkthroughBlock(conversationSessionEntry),
      traceLabel: `Walkthrough: ${conversationSessionEntry.titleText}`,
    });
  }

  if (conversationSessionEntry.entryKind === "assistant_message") {
    const assistantTextHtml = options.shouldOmitAssistantMessageText
      ? ""
      : conversationSessionEntry.assistantMessageText.length > 0
        ? `<div class="prose">${renderAssistantMarkdownText(conversationSessionEntry.assistantMessageText)}</div>`
        : '<p class="panel-notice">No assistant text was recorded.</p>';

    const assistantStatusNoticeHtml =
      conversationSessionEntry.assistantMessageStatus === "incomplete"
        ? renderAlert({ alertKind: "warn", title: "Incomplete", description: conversationSessionEntry.incompleteReason })
        : conversationSessionEntry.assistantMessageStatus === "failed"
          ? renderAlert({ alertKind: "fail", title: "Failed", description: conversationSessionEntry.failureExplanation })
          : conversationSessionEntry.assistantMessageStatus === "interrupted"
            ? renderAlert({ alertKind: "fail", title: "Interrupted", description: conversationSessionEntry.interruptionReason })
            : "";

    if (assistantTextHtml.length === 0 && assistantStatusNoticeHtml.length === 0) {
      return undefined;
    }

    const isFailedOrInterrupted =
      conversationSessionEntry.assistantMessageStatus === "failed" ||
      conversationSessionEntry.assistantMessageStatus === "interrupted";

    return buildRenderedEntry({
      entryAnchorId,
      indexNumberLabel,
      roleKind: isFailedOrInterrupted ? "failed" : "assistant",
      roleLabel: isFailedOrInterrupted ? "Failed" : "Assistant",
      bodyHtml: assistantTextHtml + assistantStatusNoticeHtml,
      traceLabel: isFailedOrInterrupted ? "Assistant failed" : "Assistant reply",
    });
  }

  if (conversationSessionEntry.entryKind === "tool_call") {
    return buildRenderedEntry({
      entryAnchorId,
      indexNumberLabel,
      roleKind: "tool",
      roleLabel: "Tool call",
      bodyHtml: renderToolCallRequestBlock(conversationSessionEntry.toolCallRequest),
      traceLabel: `${conversationSessionEntry.toolCallRequest.toolName} tool call`,
    });
  }

  if (conversationSessionEntry.entryKind === "conversation_compaction_summary") {
    return buildRenderedEntry({
      entryAnchorId,
      indexNumberLabel,
      roleKind: "compaction",
      roleLabel: "Compaction",
      bodyHtml: renderConversationCompactionSummaryBlock(conversationSessionEntry),
      traceLabel: "Context compaction",
    });
  }

  if (conversationSessionEntry.entryKind === "workspace_patch") {
    return buildRenderedEntry({
      entryAnchorId,
      indexNumberLabel,
      roleKind: "patch",
      roleLabel: "Workspace patch",
      bodyHtml: renderWorkspacePatchBlock(conversationSessionEntry),
      traceLabel: "Workspace patch",
    });
  }

  const isFailedToolResult = conversationSessionEntry.entryKind === "failed_tool_result";
  const isDeniedToolResult = conversationSessionEntry.entryKind === "denied_tool_result";
  const roleKind: EntryRoleKind = isFailedToolResult || isDeniedToolResult ? "failed" : "result";
  const roleLabel = isFailedToolResult ? "Failed" : isDeniedToolResult ? "Denied" : "Tool result";
  const traceLabel = `${conversationSessionEntry.toolCallDetail.toolName} ${isFailedToolResult ? "failed" : isDeniedToolResult ? "denied" : "result"}`;

  return buildRenderedEntry({
    entryAnchorId,
    indexNumberLabel,
    roleKind,
    roleLabel,
    bodyHtml: renderToolResultBlock({ conversationSessionEntry, renderAssistantMarkdownText }),
    traceLabel,
  });
}

function buildRenderedEntry(input: {
  entryAnchorId: string;
  indexNumberLabel: string;
  roleKind: EntryRoleKind;
  roleLabel: string;
  bodyHtml: string;
  traceLabel: string;
}): RenderedEntry {
  const badgeClass = `badge badge-${input.roleKind}`;
  const html = `<article class="entry" id="${input.entryAnchorId}" data-role="${input.roleKind}" data-entry-number="${escapeHtmlAttribute(input.indexNumberLabel)}" data-trace-label="${escapeHtmlAttribute(input.traceLabel)}">
  <header class="entry-header">
    <span class="${badgeClass}">${escapeHtml(input.roleLabel)}</span>
    <a class="entry-num" href="#${input.entryAnchorId}">#${escapeHtml(input.indexNumberLabel)}</a>
  </header>
  <div class="entry-body">${input.bodyHtml}</div>
</article>`;
  return {
    html,
    roleKind: input.roleKind,
    roleLabel: input.roleLabel,
    entryAnchorId: input.entryAnchorId,
    entryNumberLabel: input.indexNumberLabel,
    traceLabel: input.traceLabel,
  };
}

function deriveUserTraceLabel(promptText: string): string {
  const trimmed = promptText.trim();
  if (trimmed.length === 0) {
    return "User prompt";
  }
  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? trimmed;
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}

function renderUserPromptBlock(conversationSessionEntry: Extract<ConversationSessionEntry, { entryKind: "user_prompt" }>): string {
  const imageAttachments = conversationSessionEntry.imageAttachments ?? [];
  const assistantOperatingModeHtml = conversationSessionEntry.assistantOperatingMode
    ? renderAlert({
        alertKind: "info",
        title: `Agent: ${formatAssistantOperatingModeDisplayName(conversationSessionEntry.assistantOperatingMode)}`,
        description: formatAssistantOperatingModeDescription(conversationSessionEntry.assistantOperatingMode),
      })
    : "";
  const promptTextHtml = conversationSessionEntry.promptText.length > 0
    ? `<p class="prompt">${escapeHtml(conversationSessionEntry.promptText)}</p>`
    : imageAttachments.length > 0
      ? ""
      : '<p class="prompt">No prompt text was recorded.</p>';
  const safeImageAttachments = imageAttachments.filter(isSafeConversationSessionExportImageAttachment);
  const omittedImageAttachmentCount = imageAttachments.length - safeImageAttachments.length;
  const omittedImageAttachmentsHtml = omittedImageAttachmentCount > 0
    ? `<p class="panel-notice">${omittedImageAttachmentCount} image attachment${omittedImageAttachmentCount === 1 ? "" : "s"} omitted from export because the data URL was invalid or too large.</p>`
    : "";
  const imageAttachmentsHtml = safeImageAttachments
    .map((imageAttachment, imageAttachmentIndex) => {
      const imageLabel = imageAttachment.fileName ?? `image-${imageAttachmentIndex + 1}`;
      return `<figure class="user-image-attachment">
  <img src="${escapeHtmlAttribute(imageAttachment.dataUrl)}" alt="${escapeHtmlAttribute(`Attached image: ${imageLabel}`)}">
  <figcaption>${escapeHtml(imageLabel)} &middot; ${escapeHtml(imageAttachment.mimeType)}</figcaption>
</figure>`;
    })
    .join("\n");

  return `${promptTextHtml}${assistantOperatingModeHtml}${imageAttachmentsHtml}${omittedImageAttachmentsHtml}`;
}

type AlertKind = "info" | "fail" | "warn";

function renderAlert(input: { alertKind: AlertKind; title: string; description: string }): string {
  const iconHtml = input.alertKind === "fail"
    ? renderFailAlertIcon()
    : input.alertKind === "warn"
      ? renderInfoAlertIcon()
      : renderInfoAlertIcon();
  return `<div class="alert ${input.alertKind}">
  ${iconHtml}
  <div>
    <p class="alert-title">${escapeHtml(input.title)}</p>
    <p class="alert-desc">${escapeHtml(input.description)}</p>
  </div>
</div>`;
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
    ? "Understand Agent"
    : assistantOperatingMode === "plan"
      ? "Plan Agent"
      : "Implementation Agent";
}

function formatAssistantOperatingModeDescription(assistantOperatingMode: AssistantOperatingMode): string {
  return assistantOperatingMode === "understand"
    ? "Read-only agent. Will only inspect files, list directories, and search."
    : assistantOperatingMode === "plan"
      ? "Planning agent. Outlines steps before any modifying tools run."
      : "Implementation agent. May edit files and run shell commands.";
}

function renderConversationCompactionSummaryBlock(
  conversationSessionEntry: Extract<ConversationSessionEntry, { entryKind: "conversation_compaction_summary" }>,
): string {
  const summaryHtml = `<div class="prose">${renderAssistantMarkdownText(conversationSessionEntry.summaryText)}</div>`;
  return `${renderAlert({
    alertKind: "info",
    title: "Compaction",
    description: `Context compacted from ${conversationSessionEntry.compactedEntryCount} entries.`,
  })}
${summaryHtml}`;
}

function renderCodeExecutionWalkthroughBlock(codeExecutionWalkthrough: CodeExecutionWalkthrough): string {
  const introHtml = `<div class="panel">
  <div class="panel-head">
    <span class="panel-tool">source evidence</span>
    <span class="panel-purpose">${escapeHtml(codeExecutionWalkthrough.titleText)}</span>
  </div>
  <div class="panel-body">
    <p class="panel-notice">${escapeHtml(formatCodeExecutionWalkthroughKindDisplayName(codeExecutionWalkthrough.walkthroughKind))}</p>
    ${codeExecutionWalkthrough.summaryText === undefined ? "" : `<p>${escapeHtml(codeExecutionWalkthrough.summaryText)}</p>`}
  </div>
</div>`;
  const walkthroughStepsHtml = codeExecutionWalkthrough.steps.map((walkthroughStep) => {
    const whenHtml = walkthroughStep.whenText === undefined
      ? ""
      : `<p><b>when:</b> ${escapeHtml(walkthroughStep.whenText)}</p>`;
    const dataStateHtml = walkthroughStep.dataStateText === undefined
      ? ""
      : `<p><b>data/state:</b> ${escapeHtml(walkthroughStep.dataStateText)}</p>`;
    const decisionHtml = walkthroughStep.decisionText === undefined
      ? ""
      : `<p><b>decision:</b> ${escapeHtml(walkthroughStep.decisionText)}</p>`;
    const stateChangeHtml = walkthroughStep.stateChangeText === undefined
      ? ""
      : `<p><b>state change:</b> ${escapeHtml(walkthroughStep.stateChangeText)}</p>`;
    const nextStepHtml = walkthroughStep.nextStepText === undefined
      ? ""
      : `<p><b>next:</b> ${escapeHtml(walkthroughStep.nextStepText)}</p>`;
    const codeExamplesHtml = walkthroughStep.codeExamples.map(renderCodeExecutionCodeExampleBlock).join("\n");
    return `<li>
  <p><strong>${escapeHtml(walkthroughStep.stepTitle)}</strong></p>
  ${whenHtml}
  <p>${escapeHtml(walkthroughStep.whatHappensText)}</p>
  ${dataStateHtml}
  ${decisionHtml}
  ${stateChangeHtml}
  ${nextStepHtml}
  ${codeExamplesHtml}
</li>`;
  }).join("\n");

  return `${introHtml}
<div class="prose"><ol>${walkthroughStepsHtml}</ol></div>`;
}

function renderCodeExecutionCodeExampleBlock(codeExample: CodeExecutionCodeExample): string {
  const sourceSymbolHtml = codeExample.sourceSymbolName === undefined ? "" : ` &middot; ${escapeHtml(codeExample.sourceSymbolName)}`;
  const explanationHtml = codeExample.explanationText === undefined ? "" : `<p class="panel-notice">${escapeHtml(codeExample.explanationText)}</p>`;
  const sourceLabel = `${formatCodeExampleSourceRange(codeExample)}${codeExample.sourceSymbolName === undefined ? "" : ` ${codeExample.sourceSymbolName}`}`;
  // Spread the optional languageLabel only when defined to keep exactOptionalPropertyTypes happy.
  const codeWrapHtml = renderCodeWrap({
    codeText: codeExample.codeText,
    ...(codeExample.languageLabel !== undefined ? { languageLabel: codeExample.languageLabel } : {}),
    sourceFilePath: codeExample.sourceFilePath,
    filePathLabel: sourceLabel,
  });
  return `<div class="panel">
  <div class="panel-head">
    <span class="panel-tool">source</span>
    <span class="panel-purpose">${escapeHtml(formatCodeExampleSourceRange(codeExample))}${sourceSymbolHtml}</span>
  </div>
  <div class="panel-body">
    ${explanationHtml}
    ${codeWrapHtml}
  </div>
</div>`;
}

function formatCodeExecutionWalkthroughKindDisplayName(walkthroughKind: CodeExecutionWalkthrough["walkthroughKind"]): string {
  return walkthroughKind === "observed_runtime_trace" ? "observed runtime trace" : "source evidence";
}

function formatCodeExampleSourceRange(codeExample: CodeExecutionCodeExample): string {
  const lineRange = codeExample.startLineNumber === codeExample.endLineNumber
    ? `${codeExample.startLineNumber}`
    : `${codeExample.startLineNumber}-${codeExample.endLineNumber}`;
  return `${codeExample.sourceFilePath}:${lineRange}`;
}

function renderWorkspacePatchBlock(
  conversationSessionEntry: Extract<ConversationSessionEntry, { entryKind: "workspace_patch" }>,
): string {
  const workspacePatch = conversationSessionEntry.workspacePatch;
  const changedFileLabel = workspacePatch.changedFileCount === 1 ? "1 file" : `${workspacePatch.changedFileCount} files`;
  const changedFilesHtml = workspacePatch.changedFiles.map((changedFile) => {
    const changeKindLabel = changedFile.changeKind === "added" ? "A" : changedFile.changeKind === "deleted" ? "D" : "M";
    const diffHtml = changedFile.unifiedDiffText && changedFile.unifiedDiffText.length > 0
      ? renderUnifiedDiffPanel(changedFile.unifiedDiffText)
      : "";
    return `<div class="patch">
  <div class="patch-head">
    <span class="patch-file">${renderFileIcon()}<span>${escapeHtml(changeKindLabel)} &middot; ${escapeHtml(changedFile.filePath)}</span></span>
    <span class="patch-stats">
      <span class="add">+${changedFile.addedLineCount}</span>
      <span class="del">-${changedFile.removedLineCount}</span>
    </span>
  </div>
  ${diffHtml}
</div>`;
  }).join("\n");

  return `<div class="panel">
  <div class="panel-head">
    <span class="panel-tool">workspace patch</span>
    <span class="panel-purpose">${escapeHtml(changedFileLabel)} &middot; +${workspacePatch.addedLineCount} -${workspacePatch.removedLineCount}</span>
  </div>
</div>
${changedFilesHtml}`;
}

function renderUnifiedDiffPanel(unifiedDiffText: string): string {
  const highlighted = highlightCodeBlock({ codeText: unifiedDiffText, languageLabel: "diff" });
  return `<div class="patch-diff">${highlighted.innerHtml}</div>`;
}

function renderAssistantMarkdownText(markdownText: string): string {
  return marked(markdownText, {
    async: false,
    gfm: true,
    renderer: assistantMarkdownHtmlRenderer,
  });
}

function safeAssistantMarkdownHref(href: string): string | null {
  const controlCharacterPattern = new RegExp("[\\u0000-\\u001f\\u007f]");
  const trimmedHref = href.trim();
  if (trimmedHref.length === 0 || controlCharacterPattern.test(trimmedHref)) {
    return null;
  }
  return classifyTrimmedHrefImpl(trimmedHref);
}

function classifyTrimmedHrefImpl(trimmedHref: string): string | null {
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

function safeFileNameSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "session";
}

// Hero shows a short session ID for visual calm; full ID stays in the title tooltip and the
// breadcrumb so copy/paste remains lossless.
function shortenSessionIdForDisplay(conversationSessionId: string): string {
  const trimmed = conversationSessionId.trim();
  if (trimmed.length <= 12) {
    return trimmed;
  }
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
}
