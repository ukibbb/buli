import type { BuliDiagnosticLogFields } from "./diagnosticLog.ts";
import type { TokenUsage } from "./provider.ts";

export function summarizeTokenUsageForDiagnostics(tokenUsage: TokenUsage): BuliDiagnosticLogFields {
  return {
    totalTokens: tokenUsage.total ?? tokenUsage.input + tokenUsage.output + tokenUsage.reasoning,
    inputTokens: tokenUsage.input,
    outputTokens: tokenUsage.output,
    reasoningTokens: tokenUsage.reasoning,
    cacheReadTokens: tokenUsage.cache.read,
    cacheWriteTokens: tokenUsage.cache.write,
  };
}

export function summarizeContextWindowUsageForDiagnostics(
  contextWindowUsage: TokenUsage | undefined,
): BuliDiagnosticLogFields {
  if (!contextWindowUsage) {
    return {};
  }

  return {
    contextWindowTotalTokens: contextWindowUsage.total ??
      contextWindowUsage.input + contextWindowUsage.output + contextWindowUsage.reasoning,
    contextWindowInputTokens: contextWindowUsage.input,
    contextWindowOutputTokens: contextWindowUsage.output,
    contextWindowReasoningTokens: contextWindowUsage.reasoning,
    contextWindowCacheReadTokens: contextWindowUsage.cache.read,
    contextWindowCacheWriteTokens: contextWindowUsage.cache.write,
  };
}
