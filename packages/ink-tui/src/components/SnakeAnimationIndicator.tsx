import { Box, Text, useAnimation } from "ink";
import React from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "./glyphs.ts";

// Renders the six-cell snake from pen component snakeA1-A6: four green
// rectangles with two amber ellipses whose positions cycle each tick to
// signal live work. Used by InputPanel's footer while the assistant
// response is streaming.
const SNAKE_CELL_COUNT = 6;

export function SnakeAnimationIndicator() {
  const { frame } = useAnimation({ interval: 150 });
  const firstEllipseIndex = frame % SNAKE_CELL_COUNT;
  const secondEllipseIndex = (frame + 1) % SNAKE_CELL_COUNT;

  return (
    <Box>
      {Array.from({ length: SNAKE_CELL_COUNT }, (_, cellIndex) => {
        const isEllipseCell =
          cellIndex === firstEllipseIndex || cellIndex === secondEllipseIndex;
        return (
          <Text
            color={isEllipseCell ? chatScreenTheme.accentAmber : chatScreenTheme.accentGreen}
            key={cellIndex}
          >
            {isEllipseCell ? glyphs.snakeEllipse : glyphs.snakeRectangle}
          </Text>
        );
      })}
    </Box>
  );
}
