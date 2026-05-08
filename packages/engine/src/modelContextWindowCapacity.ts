// Known context-window capacities keyed by model id. When a model isn't in this
// map the UI can show raw token counts instead of pretending a capacity it
// doesn't know.
const MODEL_CONTEXT_WINDOW_TOKEN_CAPACITIES: Record<string, number> = {
  "gpt-5.5": 400_000,
  "gpt-5.5-pro": 400_000,
  "gpt-5.4": 1_050_000,
  "gpt-5.4-pro": 1_050_000,
  "gpt-5.4-mini": 400_000,
  "gpt-5.4-nano": 400_000,
  "gpt-5": 256_000,
  "gpt-4.1": 1_000_000,
  "gpt-4.1-mini": 128_000,
  "gpt-4o": 128_000,
  "gpt-4o-mini": 128_000,
  "o3": 200_000,
  "o3-mini": 200_000,
  "o4-mini": 200_000,
};

export function lookupContextWindowTokenCapacityForModel(modelIdentifier: string): number | undefined {
  return MODEL_CONTEXT_WINDOW_TOKEN_CAPACITIES[modelIdentifier];
}
