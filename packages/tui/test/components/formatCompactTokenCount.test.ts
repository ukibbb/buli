import { expect, test } from "bun:test";
import { formatCompactTokenCount } from "../../src/components/formatCompactTokenCount.ts";

test("formatCompactTokenCount renders compact whole and fractional thousand labels", () => {
  expect(formatCompactTokenCount(999)).toBe("999");
  expect(formatCompactTokenCount(1000)).toBe("1k");
  expect(formatCompactTokenCount(22200)).toBe("22.2k");
  expect(formatCompactTokenCount(320000)).toBe("320k");
  expect(formatCompactTokenCount(999949)).toBe("999.9k");
  expect(formatCompactTokenCount(999950)).toBe("1.0m");
  expect(formatCompactTokenCount(1000000)).toBe("1m");
  expect(formatCompactTokenCount(1050000)).toBe("1.1m");
});
