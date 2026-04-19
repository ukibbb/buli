// Known context-window capacities keyed by model id. When a model isn't in
// this map the UI falls back to showing raw token counts instead of a
// percentage, rather than pretending a capacity it doesn't know.
const MODEL_CONTEXT_WINDOW_TOKEN_CAPACITIES: Record<string, number> = {
  "gpt-5.4": 256_000,
  "gpt-5.4-mini": 128_000,
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
