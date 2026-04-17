import { describe, expect, test } from "bun:test";
import {
  classifyTerminalSizeTierForChatScreen,
  comfortableTerminalSizeTier,
  compactTerminalSizeTier,
  minimumTerminalSizeTier,
} from "../src/terminalSizeTierForChatScreen.ts";

describe("classifyTerminalSizeTierForChatScreen", () => {
  test("classifies_native_design_dimensions_as_comfortable_tier", () => {
    expect(
      classifyTerminalSizeTierForChatScreen({ rowCount: 30, columnCount: 120 }),
    ).toBe(comfortableTerminalSizeTier);
  });

  test("classifies_exact_comfortable_threshold_as_comfortable_tier", () => {
    expect(
      classifyTerminalSizeTierForChatScreen({ rowCount: 24, columnCount: 80 }),
    ).toBe(comfortableTerminalSizeTier);
  });

  test("classifies_one_row_below_comfortable_as_compact_tier", () => {
    expect(
      classifyTerminalSizeTierForChatScreen({ rowCount: 23, columnCount: 80 }),
    ).toBe(compactTerminalSizeTier);
  });

  test("classifies_one_column_below_comfortable_as_compact_tier", () => {
    expect(
      classifyTerminalSizeTierForChatScreen({ rowCount: 30, columnCount: 79 }),
    ).toBe(compactTerminalSizeTier);
  });

  test("classifies_exact_compact_threshold_as_compact_tier", () => {
    expect(
      classifyTerminalSizeTierForChatScreen({ rowCount: 12, columnCount: 60 }),
    ).toBe(compactTerminalSizeTier);
  });

  test("classifies_one_row_below_compact_as_minimum_tier", () => {
    expect(
      classifyTerminalSizeTierForChatScreen({ rowCount: 11, columnCount: 80 }),
    ).toBe(minimumTerminalSizeTier);
  });

  test("classifies_one_column_below_compact_as_minimum_tier", () => {
    expect(
      classifyTerminalSizeTierForChatScreen({ rowCount: 30, columnCount: 59 }),
    ).toBe(minimumTerminalSizeTier);
  });

  test("classifies_extremely_small_terminal_as_minimum_tier", () => {
    expect(
      classifyTerminalSizeTierForChatScreen({ rowCount: 6, columnCount: 40 }),
    ).toBe(minimumTerminalSizeTier);
  });
});
