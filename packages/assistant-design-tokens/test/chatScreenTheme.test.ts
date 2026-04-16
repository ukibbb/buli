import { describe, expect, test } from "bun:test";
import { chatScreenTheme } from "../src/index.ts";

describe("chatScreenTheme", () => {
  test("exports_every_token_required_by_existing_ink_tui_palette", () => {
    const requiredTokenKeys = [
      "bg",
      "surfaceOne",
      "surfaceTwo",
      "surfaceThree",
      "border",
      "borderSubtle",
      "textPrimary",
      "textSecondary",
      "textMuted",
      "textDim",
      "accentGreen",
      "accentAmber",
      "accentCyan",
      "accentRed",
      "accentPrimary",
      "accentPrimaryMuted",
      "accentPurple",
      "diffAdditionBg",
      "diffRemovalBg",
      "calloutInfoBg",
      "calloutSuccessBg",
      "calloutWarningBg",
      "calloutErrorBg",
    ] as const;
    for (const tokenKey of requiredTokenKeys) {
      expect(chatScreenTheme[tokenKey]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});
