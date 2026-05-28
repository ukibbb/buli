// Lucide-style inline SVGs, 16px viewBox 24, stroke 1.5, currentColor.
// Inlined so the exported HTML stays self-contained (no external SVG sprite requests).

const ATTRIBUTES = `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;

function svg(className: string, body: string): string {
  return `<svg class="${className}" ${ATTRIBUTES}>${body}</svg>`;
}

export function renderToolIcon(toolName: string): string {
  switch (toolName) {
    case "read":
      return svg("panel-icon", `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>`);
    case "glob":
      return svg("panel-icon", `<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><circle cx="14" cy="14" r="3"/><line x1="16.5" y1="16.5" x2="19" y2="19"/>`);
    case "grep":
      return svg("panel-icon", `<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>`);
    case "bash":
      return svg("panel-icon", `<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>`);
    case "edit":
    case "edit_many":
    case "patch":
    case "patch_many":
      return svg("panel-icon", `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M10.5 13.5l3 3"/><path d="M13.5 10.5l3 3-3 3-3-3z"/>`);
    case "write":
      return svg("panel-icon", `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="12" x2="12" y2="18"/><line x1="9" y1="15" x2="15" y2="15"/>`);
    case "task":
      return svg("panel-icon", `<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/>`);
    default:
      return svg("panel-icon", `<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`);
  }
}

export function renderInfoAlertIcon(): string {
  return svg("", `<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>`);
}

export function renderFailAlertIcon(): string {
  return svg("", `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`);
}

export function renderWarnAlertIcon(): string {
  return svg("", `<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`);
}

export function renderFileIcon(): string {
  return svg("", `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>`);
}

export function renderCopyIcons(): string {
  return [
    `<svg class="copy" ${ATTRIBUTES}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
    `<svg class="check" ${ATTRIBUTES}><polyline points="20 6 9 17 4 12"/></svg>`,
  ].join("");
}

export function renderSunIcon(): string {
  return `<svg class="i-sun" ${ATTRIBUTES}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;
}

export function renderMoonIcon(): string {
  return `<svg class="i-moon" ${ATTRIBUTES} style="display:none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
}

export function renderKeyboardIcon(): string {
  return svg("", `<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6"/>`);
}

export function renderUpChevronIcon(): string {
  return svg("", `<polyline points="18 15 12 9 6 15"/>`);
}

export function renderTerminalIcon(): string {
  return svg("", `<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>`);
}

export function renderCodeBraceIcon(): string {
  return svg("", `<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>`);
}
