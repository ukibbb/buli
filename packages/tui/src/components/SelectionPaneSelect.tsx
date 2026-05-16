import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export type SelectionPaneSelectProps = {
  optionNames: readonly string[];
  highlightedOptionIndex: number;
  maxVisibleOptionCount: number;
};

export function SelectionPaneSelect(props: SelectionPaneSelectProps): ReactNode {
  const lastPossibleFirstVisibleOptionIndex = Math.max(
    0,
    props.optionNames.length - props.maxVisibleOptionCount,
  );
  const highlightedOptionIndex = Math.max(
    0,
    Math.min(props.highlightedOptionIndex, props.optionNames.length - 1),
  );
  const firstVisibleOptionIndex = Math.min(
    lastPossibleFirstVisibleOptionIndex,
    Math.max(0, highlightedOptionIndex - props.maxVisibleOptionCount + 1),
  );
  const visibleOptionNames = props.optionNames.slice(
    firstVisibleOptionIndex,
    firstVisibleOptionIndex + props.maxVisibleOptionCount,
  );

  return (
    <>
      {visibleOptionNames.map((optionName, visibleOptionOffset) => {
        const optionIndex = firstVisibleOptionIndex + visibleOptionOffset;
        const isHighlightedOption = optionIndex === highlightedOptionIndex;

        return (
          <box
            backgroundColor={isHighlightedOption ? chatScreenTheme.borderSubtle : chatScreenTheme.surfaceOne}
            flexDirection="row"
            flexShrink={0}
            height={1}
            key={optionIndex}
            width="100%"
          >
            <text
              fg={isHighlightedOption ? chatScreenTheme.textPrimary : chatScreenTheme.textSecondary}
              truncate={true}
              wrapMode="none"
            >
              {optionName}
            </text>
          </box>
        );
      })}
    </>
  );
}
