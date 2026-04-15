import { expect, test } from "bun:test";
import { toTerminalCellsFromDesignPixels } from "../src/toTerminalCellsFromDesignPixels.ts";

test("toTerminalCellsFromDesignPixels maps zero to zero", () => {
  expect(toTerminalCellsFromDesignPixels(0)).toBe(0);
});

test("toTerminalCellsFromDesignPixels maps gap-scale values to one cell", () => {
  expect(toTerminalCellsFromDesignPixels(4)).toBe(1);
  expect(toTerminalCellsFromDesignPixels(6)).toBe(1);
  expect(toTerminalCellsFromDesignPixels(8)).toBe(1);
  expect(toTerminalCellsFromDesignPixels(10)).toBe(1);
});

test("toTerminalCellsFromDesignPixels maps medium values to two cells", () => {
  expect(toTerminalCellsFromDesignPixels(12)).toBe(2);
  expect(toTerminalCellsFromDesignPixels(16)).toBe(2);
});

test("toTerminalCellsFromDesignPixels maps larger values to three cells", () => {
  expect(toTerminalCellsFromDesignPixels(20)).toBe(3);
  expect(toTerminalCellsFromDesignPixels(24)).toBe(3);
});

test("toTerminalCellsFromDesignPixels treats negative input as zero", () => {
  expect(toTerminalCellsFromDesignPixels(-5)).toBe(0);
});
