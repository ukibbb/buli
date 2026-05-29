import { describe, expect, test } from "bun:test";
import type { RGBA } from "@opentui/core";
import {
  codeBlockSyntaxStyle,
  codeLineNumberGutterForegroundColor,
  githubLikeTerminalCodeColors,
  syntaxHighlightSpanForegroundColors,
  terminalDiffColors,
} from "../../../src/components/primitives/codeRenderingTheme.ts";

interface RgbColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

interface ColorContrastSample {
  readonly colorRoleName: string;
  readonly foregroundColor: RgbColor;
  readonly foregroundHexColor: string;
}

interface MeasuredColorContrastSample extends ColorContrastSample {
  readonly contrastRatio: number;
}

const highContrastMinimumRatio = 7;

function parseHexColor(hexColor: string): RgbColor {
  const hexColorMatch = /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/.exec(hexColor);

  if (hexColorMatch === null) {
    throw new Error(`Expected a 6-digit hex color, received ${hexColor}`);
  }

  const [, redHex, greenHex, blueHex] = hexColorMatch;

  if (redHex === undefined || greenHex === undefined || blueHex === undefined) {
    throw new Error(`Expected a complete 6-digit hex color, received ${hexColor}`);
  }

  return {
    red: Number.parseInt(redHex, 16),
    green: Number.parseInt(greenHex, 16),
    blue: Number.parseInt(blueHex, 16),
  };
}

function createHexColorContrastSample(colorRoleName: string, foregroundHexColor: string): ColorContrastSample {
  return {
    colorRoleName,
    foregroundColor: parseHexColor(foregroundHexColor),
    foregroundHexColor: foregroundHexColor.toUpperCase(),
  };
}

function createRgbaColorContrastSample(colorRoleName: string, foregroundRgbaColor: RGBA): ColorContrastSample {
  const [red, green, blue] = foregroundRgbaColor.toInts();
  const foregroundColor = { red, green, blue };

  return {
    colorRoleName,
    foregroundColor,
    foregroundHexColor: formatRgbColorAsHex(foregroundColor),
  };
}

function formatRgbColorAsHex(rgbColor: RgbColor): string {
  return `#${formatRgbChannelAsHex(rgbColor.red)}${formatRgbChannelAsHex(rgbColor.green)}${formatRgbChannelAsHex(
    rgbColor.blue,
  )}`;
}

function formatRgbChannelAsHex(rgbChannel: number): string {
  return rgbChannel.toString(16).padStart(2, "0").toUpperCase();
}

function calculateContrastRatio(firstColor: RgbColor, secondColor: RgbColor): number {
  const firstLuminance = calculateRelativeLuminance(firstColor);
  const secondLuminance = calculateRelativeLuminance(secondColor);
  const lighterLuminance = Math.max(firstLuminance, secondLuminance);
  const darkerLuminance = Math.min(firstLuminance, secondLuminance);

  return (lighterLuminance + 0.05) / (darkerLuminance + 0.05);
}

function calculateRelativeLuminance(rgbColor: RgbColor): number {
  const red = convertSrgbChannelToLinear(rgbColor.red);
  const green = convertSrgbChannelToLinear(rgbColor.green);
  const blue = convertSrgbChannelToLinear(rgbColor.blue);

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function convertSrgbChannelToLinear(rgbChannel: number): number {
  const normalizedChannel = rgbChannel / 255;

  if (normalizedChannel <= 0.04045) {
    return normalizedChannel / 12.92;
  }

  return ((normalizedChannel + 0.055) / 1.055) ** 2.4;
}

function measureLowContrastSamples(
  foregroundSamples: readonly ColorContrastSample[],
  backgroundColor: RgbColor,
): MeasuredColorContrastSample[] {
  return foregroundSamples
    .map((foregroundSample) => ({
      ...foregroundSample,
      contrastRatio: Number(calculateContrastRatio(foregroundSample.foregroundColor, backgroundColor).toFixed(2)),
    }))
    .filter((foregroundSample) => foregroundSample.contrastRatio < highContrastMinimumRatio);
}

describe("codeRenderingTheme", () => {
  test("keeps_live_tui_code_foregrounds_high_contrast_against_the_code_canvas", () => {
    const codeCanvasBackgroundColor = parseHexColor(githubLikeTerminalCodeColors.canvas);
    const syntaxStyleForegroundSamples = Array.from(codeBlockSyntaxStyle.getAllStyles().entries()).flatMap(
      ([captureName, styleDefinition]) => {
        if (styleDefinition.fg === undefined) {
          return [];
        }

        return [createRgbaColorContrastSample(`codeBlockSyntaxStyle.${captureName}`, styleDefinition.fg)];
      },
    );
    const syntaxSpanForegroundSamples = Object.entries(syntaxHighlightSpanForegroundColors).map(
      ([spanStyleName, foregroundHexColor]) =>
        createHexColorContrastSample(`syntaxHighlightSpanForegroundColors.${spanStyleName}`, foregroundHexColor),
    );
    const codeLineNumberForegroundSamples = [
      createRgbaColorContrastSample("codeLineNumberGutterForegroundColor", codeLineNumberGutterForegroundColor),
    ];
    const terminalDiffForegroundSamples = [
      createHexColorContrastSample("terminalDiffColors.addedSignForeground", terminalDiffColors.addedSignForeground),
      createHexColorContrastSample("terminalDiffColors.removedSignForeground", terminalDiffColors.removedSignForeground),
      createHexColorContrastSample("terminalDiffColors.lineNumberForeground", terminalDiffColors.lineNumberForeground),
    ];

    const lowContrastSamples = measureLowContrastSamples(
      [
        ...syntaxStyleForegroundSamples,
        ...syntaxSpanForegroundSamples,
        ...codeLineNumberForegroundSamples,
        ...terminalDiffForegroundSamples,
      ],
      codeCanvasBackgroundColor,
    );

    expect(lowContrastSamples).toEqual([]);
  });
});
