export function formatCompactTokenCount(tokenCount: number): string {
  if (tokenCount < 1000) {
    return String(tokenCount);
  }

  if (tokenCount < 999_950) {
    return `${formatCompactUnitValue(tokenCount / 1000)}k`;
  }

  return `${formatCompactUnitValue(tokenCount / 1_000_000)}m`;
}

function formatCompactUnitValue(unitValue: number): string {
  return Number.isInteger(unitValue) ? String(unitValue) : unitValue.toFixed(1);
}
