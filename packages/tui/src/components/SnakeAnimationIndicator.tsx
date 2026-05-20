import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "./glyphs.ts";
import { areTuiAnimationTimersEnabled } from "./tuiAnimationTimerPolicy.ts";

// Renders the six-cell snake from pen component snakeA1-A6: four green
// rectangles with two amber ellipses whose positions cycle each tick to
// signal live work. Used by InputPanel's footer while the assistant
// response is streaming.
//
// The frame counter is driven by a plain useState + setInterval, same pattern
// used by StreamingCursor.
const SNAKE_CELL_COUNT = 6;
const EATING_APPLE_TRACK_CELL_COUNT = 8;

export type SnakeAnimationIndicatorProps = {
  variant?: "sixCell" | "eatingApple";
};

export function SnakeAnimationIndicator(props: SnakeAnimationIndicatorProps = {}): ReactNode {
  const frame = useSnakeAnimationFrame();

  if (props.variant === "eatingApple") {
    return <EatingAppleSnakeAnimationFrame frame={frame} />;
  }

  return <SixCellSnakeAnimationFrame frame={frame} />;
}

export function InlineSnakeAnimationIndicator(props: SnakeAnimationIndicatorProps = {}): ReactNode {
  const frame = useSnakeAnimationFrame();

  if (props.variant === "eatingApple") {
    return <InlineEatingAppleSnakeAnimationFrame frame={frame} />;
  }

  return <InlineSixCellSnakeAnimationFrame frame={frame} />;
}

function useSnakeAnimationFrame(): number {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!areTuiAnimationTimersEnabled()) {
      return;
    }

    const id = setInterval(() => {
      setFrame((prev) => prev + 1);
    }, 150);
    return () => clearInterval(id);
  }, []);

  return frame;
}

function SixCellSnakeAnimationFrame(props: { frame: number }): ReactNode {
  const firstEllipseIndex = props.frame % SNAKE_CELL_COUNT;
  const secondEllipseIndex = (props.frame + 1) % SNAKE_CELL_COUNT;

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

function InlineSixCellSnakeAnimationFrame(props: { frame: number }): ReactNode {
  const firstEllipseIndex = props.frame % SNAKE_CELL_COUNT;
  const secondEllipseIndex = (props.frame + 1) % SNAKE_CELL_COUNT;

  return (
    <>
      {Array.from({ length: SNAKE_CELL_COUNT }, (_unusedValue, cellIndex) => {
        const isEllipseCell = cellIndex === firstEllipseIndex || cellIndex === secondEllipseIndex;
        return (
          <span
            fg={isEllipseCell ? chatScreenTheme.accentAmber : chatScreenTheme.accentGreen}
            key={`inline-six-cell-snake-${cellIndex}`}
          >
            {isEllipseCell ? glyphs.snakeEllipse : glyphs.snakeRectangle}
          </span>
        );
      })}
    </>
  );
}

function EatingAppleSnakeAnimationFrame(props: { frame: number }): ReactNode {
  const headIndex = (props.frame + 2) % EATING_APPLE_TRACK_CELL_COUNT;
  const snakeBodyIndexes = new Set([
    (headIndex + EATING_APPLE_TRACK_CELL_COUNT - 2) % EATING_APPLE_TRACK_CELL_COUNT,
    (headIndex + EATING_APPLE_TRACK_CELL_COUNT - 1) % EATING_APPLE_TRACK_CELL_COUNT,
  ]);
  const appleTargetIndex = resolveEatingAppleTargetIndex(props.frame);

  return (
    <box flexDirection="row">
      {Array.from({ length: EATING_APPLE_TRACK_CELL_COUNT }, (_, cellIndex) => {
        if (cellIndex === headIndex) {
          return <text fg={chatScreenTheme.accentAmber} key={cellIndex}>{glyphs.snakeEllipse}</text>;
        }

        if (cellIndex === appleTargetIndex) {
          return <text fg={chatScreenTheme.accentRed} key={cellIndex}>{glyphs.apple}</text>;
        }

        if (snakeBodyIndexes.has(cellIndex)) {
          return <text fg={chatScreenTheme.accentGreen} key={cellIndex}>{glyphs.snakeRectangle}</text>;
        }

        return <text fg={chatScreenTheme.textDim} key={cellIndex}>{glyphs.snakeTrackEmpty}</text>;
      })}
    </box>
  );
}

function InlineEatingAppleSnakeAnimationFrame(props: { frame: number }): ReactNode {
  const headIndex = (props.frame + 2) % EATING_APPLE_TRACK_CELL_COUNT;
  const snakeBodyIndexes = new Set([
    (headIndex + EATING_APPLE_TRACK_CELL_COUNT - 2) % EATING_APPLE_TRACK_CELL_COUNT,
    (headIndex + EATING_APPLE_TRACK_CELL_COUNT - 1) % EATING_APPLE_TRACK_CELL_COUNT,
  ]);
  const appleTargetIndex = resolveEatingAppleTargetIndex(props.frame);

  return (
    <>
      {Array.from({ length: EATING_APPLE_TRACK_CELL_COUNT }, (_unusedValue, cellIndex) => {
        if (cellIndex === headIndex) {
          return <span fg={chatScreenTheme.accentAmber} key={`inline-eating-apple-snake-${cellIndex}`}>{glyphs.snakeEllipse}</span>;
        }

        if (cellIndex === appleTargetIndex) {
          return <span fg={chatScreenTheme.accentRed} key={`inline-eating-apple-snake-${cellIndex}`}>{glyphs.apple}</span>;
        }

        if (snakeBodyIndexes.has(cellIndex)) {
          return <span fg={chatScreenTheme.accentGreen} key={`inline-eating-apple-snake-${cellIndex}`}>{glyphs.snakeRectangle}</span>;
        }

        return <span fg={chatScreenTheme.textDim} key={`inline-eating-apple-snake-${cellIndex}`}>{glyphs.snakeTrackEmpty}</span>;
      })}
    </>
  );
}

function resolveEatingAppleTargetIndex(frame: number): number {
  const headIndex = (frame + 2) % EATING_APPLE_TRACK_CELL_COUNT;
  const targetAheadDistance = 3 - (frame % 4);
  return (headIndex + targetAheadDistance + EATING_APPLE_TRACK_CELL_COUNT) % EATING_APPLE_TRACK_CELL_COUNT;
}
