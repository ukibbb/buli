import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import { SnakeAnimationIndicator } from "../../src/components/SnakeAnimationIndicator.tsx";

function renderWithoutAnsi(node: React.ReactElement) {
  return stripVTControlCharacters(renderToString(node));
}

test("SnakeAnimationIndicator renders six cells combining rectangles and ellipses", () => {
  const output = renderWithoutAnsi(<SnakeAnimationIndicator />);
  const rectangleCount = [...output].filter((character) => character === "▰").length;
  const ellipseCount = [...output].filter((character) => character === "●").length;
  expect(rectangleCount + ellipseCount).toBe(6);
  expect(ellipseCount).toBe(2);
});
