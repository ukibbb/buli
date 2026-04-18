import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "./glyphs.ts";

// Renders the six-cell snake from pen component snakeA1-A6: four green
// rectangles with two amber ellipses whose positions cycle each tick to
// signal live work. Used by InputPanel's footer while the assistant
// response is streaming.
//
// useAnimation from Ink has no direct equivalent in OpenTUI. The frame
// counter is driven by a plain useState + setInterval, same pattern used
// by StreamingCursor.
const SNAKE_CELL_COUNT = 6;

export function SnakeAnimationIndicator(): ReactNode {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setFrame((prev) => prev + 1);
    }, 150);
    return () => clearInterval(id);
  }, []);

  const firstEllipseIndex = frame % SNAKE_CELL_COUNT;
  const secondEllipseIndex = (frame + 1) % SNAKE_CELL_COUNT;

  return (
    <box flexDirection="row">
      {Array.from({ length: SNAKE_CELL_COUNT }, (_, cellIndex) => {
        const isEllipseCell =
          cellIndex === firstEllipseIndex || cellIndex === secondEllipseIndex;
        return (
          <text
            fg={isEllipseCell ? chatScreenTheme.accentAmber : chatScreenTheme.accentGreen}
            key={cellIndex}
          >
            {isEllipseCell ? glyphs.snakeEllipse : glyphs.snakeRectangle}
          </text>
        );
      })}
    </box>
  );
}
