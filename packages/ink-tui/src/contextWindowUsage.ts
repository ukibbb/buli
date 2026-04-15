// Callers only invoke this helper when they already know the selected model's
// context window capacity. When capacity is unknown at the call site, the
// UI renders a dim placeholder instead of calling into this helper.
export function calculateContextWindowFillPercentage(input: {
  totalTokensUsed: number;
  contextWindowTokenCapacity: number;
}): number {
  if (input.contextWindowTokenCapacity <= 0) {
    return 0;
  }
  const rawPercentage = (input.totalTokensUsed / input.contextWindowTokenCapacity) * 100;
  return Math.min(100, Math.max(0, Math.round(rawPercentage)));
}
