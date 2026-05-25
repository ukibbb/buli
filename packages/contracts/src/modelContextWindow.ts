import type { TokenUsage } from "./provider.ts";

export type ModelContextWindowTokenLimits = {
  contextWindowTokenCapacity: number;
  inputTokenCapacity?: number | undefined;
};

// Known context-window limits keyed by model id. Raw context capacity remains
// the UI-facing value, while input capacity lets auto-compaction preserve output
// headroom for split input/output models.
const MODEL_CONTEXT_WINDOW_TOKEN_LIMITS: Record<string, ModelContextWindowTokenLimits> = {
  "gpt-5.5": { contextWindowTokenCapacity: 400_000, inputTokenCapacity: 272_000 },
  "gpt-5.5-pro": { contextWindowTokenCapacity: 400_000, inputTokenCapacity: 272_000 },
  "gpt-5.4": { contextWindowTokenCapacity: 1_050_000 },
  "gpt-5.4-pro": { contextWindowTokenCapacity: 1_050_000 },
  "gpt-5.4-mini": { contextWindowTokenCapacity: 400_000, inputTokenCapacity: 272_000 },
  "gpt-5.4-nano": { contextWindowTokenCapacity: 400_000, inputTokenCapacity: 272_000 },
  "gpt-5": { contextWindowTokenCapacity: 256_000 },
  "gpt-4.1": { contextWindowTokenCapacity: 1_000_000 },
  "gpt-4.1-mini": { contextWindowTokenCapacity: 128_000 },
  "gpt-4o": { contextWindowTokenCapacity: 128_000 },
  "gpt-4o-mini": { contextWindowTokenCapacity: 128_000 },
  "o3": { contextWindowTokenCapacity: 200_000 },
  "o3-mini": { contextWindowTokenCapacity: 200_000 },
  "o4-mini": { contextWindowTokenCapacity: 200_000 },
};

export function lookupContextWindowTokenCapacityForModel(modelIdentifier: string): number | undefined {
  return MODEL_CONTEXT_WINDOW_TOKEN_LIMITS[modelIdentifier]?.contextWindowTokenCapacity;
}

export function lookupModelContextWindowTokenLimitsForModel(
  modelIdentifier: string,
): ModelContextWindowTokenLimits | undefined {
  return MODEL_CONTEXT_WINDOW_TOKEN_LIMITS[modelIdentifier];
}

export function calculateContextTokensUsedFromTokenUsage(tokenUsage: TokenUsage): number {
  return tokenUsage.total ?? tokenUsage.input + tokenUsage.output + tokenUsage.reasoning + tokenUsage.cache.read +
    tokenUsage.cache.write;
}
