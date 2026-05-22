import { createHighlighterCoreSync, type HighlighterCore } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";

import bashLang from "@shikijs/langs/bash";
import cssLang from "@shikijs/langs/css";
import diffLang from "@shikijs/langs/diff";
import htmlLang from "@shikijs/langs/html";
import javascriptLang from "@shikijs/langs/javascript";
import jsonLang from "@shikijs/langs/json";
import jsxLang from "@shikijs/langs/jsx";
import pythonLang from "@shikijs/langs/python";
import shellLang from "@shikijs/langs/shellscript";
import sqlLang from "@shikijs/langs/sql";
import tsxLang from "@shikijs/langs/tsx";
import typescriptLang from "@shikijs/langs/typescript";

import githubDarkTheme from "@shikijs/themes/github-dark";

import { escapeHtml, escapeHtmlAttribute } from "./htmlEscaping.ts";

// Sync highlighter keeps the public exporter API synchronous; the JS regex engine
// avoids any WASM bootstrap and works with the small grammar set we ship.
let cachedHighlighter: HighlighterCore | null = null;

function getHighlighter(): HighlighterCore {
  if (cachedHighlighter !== null) {
    return cachedHighlighter;
  }
  cachedHighlighter = createHighlighterCoreSync({
    themes: [githubDarkTheme],
    langs: [
      bashLang,
      cssLang,
      diffLang,
      htmlLang,
      javascriptLang,
      jsonLang,
      jsxLang,
      pythonLang,
      shellLang,
      sqlLang,
      tsxLang,
      typescriptLang,
    ],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  return cachedHighlighter;
}

const SUPPORTED_LANGUAGES: ReadonlySet<string> = new Set([
  "bash",
  "css",
  "diff",
  "html",
  "javascript",
  "json",
  "jsx",
  "python",
  "shellscript",
  "sql",
  "tsx",
  "typescript",
]);

const LANGUAGE_ALIASES: Record<string, string> = {
  ts: "typescript",
  typescript: "typescript",
  js: "javascript",
  javascript: "javascript",
  tsx: "tsx",
  jsx: "jsx",
  sh: "bash",
  bash: "bash",
  shell: "bash",
  shellscript: "bash",
  zsh: "bash",
  json: "json",
  json5: "json",
  diff: "diff",
  patch: "diff",
  html: "html",
  htm: "html",
  xml: "html",
  css: "css",
  scss: "css",
  py: "python",
  python: "python",
  sql: "sql",
  postgres: "sql",
  postgresql: "sql",
};

const FILE_EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  diff: "diff",
  patch: "diff",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  html: "html",
  htm: "html",
  css: "css",
  scss: "css",
  py: "python",
  sql: "sql",
};

export type HighlightCodeBlockInput = {
  codeText: string;
  languageLabel?: string | undefined;
  sourceFilePath?: string | undefined;
};

export type HighlightedCode = {
  resolvedLanguageId: string;
  innerHtml: string;
};

export function resolveLanguageId(input: {
  languageLabel?: string | undefined;
  sourceFilePath?: string | undefined;
}): string | undefined {
  if (input.languageLabel !== undefined && input.languageLabel.length > 0) {
    const normalizedLabel = input.languageLabel.trim().toLowerCase();
    const mapped = LANGUAGE_ALIASES[normalizedLabel];
    if (mapped !== undefined && SUPPORTED_LANGUAGES.has(mapped)) {
      return mapped;
    }
  }
  if (input.sourceFilePath !== undefined) {
    const extensionMatch = /\.([a-zA-Z0-9]+)$/.exec(input.sourceFilePath);
    const extension = extensionMatch?.[1]?.toLowerCase();
    if (extension !== undefined) {
      const mapped = FILE_EXTENSION_TO_LANGUAGE[extension];
      if (mapped !== undefined && SUPPORTED_LANGUAGES.has(mapped)) {
        return mapped;
      }
    }
  }
  return undefined;
}

export function highlightCodeBlock(input: HighlightCodeBlockInput): HighlightedCode {
  const resolvedLanguageId = resolveLanguageId(input);
  if (resolvedLanguageId === undefined) {
    return {
      resolvedLanguageId: input.languageLabel ?? "",
      innerHtml: `<pre><code>${escapeHtml(input.codeText)}</code></pre>`,
    };
  }

  try {
    const highlighter = getHighlighter();
    const html = highlighter.codeToHtml(input.codeText, {
      lang: resolvedLanguageId,
      theme: "github-dark",
    });
    return { resolvedLanguageId, innerHtml: html };
  } catch {
    return {
      resolvedLanguageId,
      innerHtml: `<pre><code>${escapeHtml(input.codeText)}</code></pre>`,
    };
  }
}

export type RenderCodeWrapInput = HighlightCodeBlockInput & {
  filePathLabel?: string | undefined;
};

export function renderCodeWrap(input: RenderCodeWrapInput): string {
  const highlighted = highlightCodeBlock(input);
  const tabLabel = input.filePathLabel ?? highlighted.resolvedLanguageId ?? input.languageLabel ?? "code";
  const dataLangAttribute = highlighted.resolvedLanguageId
    ? ` data-lang="${escapeHtmlAttribute(highlighted.resolvedLanguageId)}"`
    : input.languageLabel
      ? ` data-lang="${escapeHtmlAttribute(input.languageLabel)}"`
      : "";
  const dataCopyAttribute = ` data-copy-text="${escapeHtmlAttribute(input.codeText)}"`;
  return `<div class="code-wrap"${dataLangAttribute}>
  <div class="code-tab">${escapeHtml(tabLabel)}</div>
  <div class="code-block"${dataCopyAttribute}>
    <button class="copy-btn" type="button" data-copy aria-label="Copy code"><svg class="copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg></button>
    ${highlighted.innerHtml}
  </div>
</div>`;
}
