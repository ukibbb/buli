const PROMPT_CONTEXT_REFERENCE_REQUIRES_QUOTES = /[\s"\\]/;

export function buildPromptContextReferenceTextFromDisplayPath(displayPath: string): string {
  if (!PROMPT_CONTEXT_REFERENCE_REQUIRES_QUOTES.test(displayPath)) {
    return `@${displayPath}`;
  }

  const escapedDisplayPath = displayPath.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `@"${escapedDisplayPath}"`;
}
