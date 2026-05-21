import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import {
  calculateVisibleSelectionWindow,
  resolveSelectionPaneRowTextColor,
  SelectionPaneHighlightedRow,
} from "./SelectionPaneRows.tsx";

export type SelectionPaneSelectProps = {
  optionNames: readonly string[];
  highlightedOptionIndex: number;
  maxVisibleOptionCount: number;
};

export function SelectionPaneSelect(props: SelectionPaneSelectProps): ReactNode {
  const visibleOptionWindow = calculateVisibleSelectionWindow({
    selectionItems: props.optionNames,
    highlightedSelectionItemIndex: props.highlightedOptionIndex,
    maxVisibleSelectionItemCount: props.maxVisibleOptionCount,
  });

  return (
    <>
      {visibleOptionWindow.visibleSelectionItems.map((optionName, visibleOptionOffset) => {
        const optionIndex = visibleOptionWindow.firstVisibleSelectionItemIndex + visibleOptionOffset;
        const isHighlightedOption = optionIndex === visibleOptionWindow.highlightedSelectionItemIndex;

        return (
          <SelectionPaneHighlightedRow isHighlighted={isHighlightedOption} key={optionIndex}>
            <text
              fg={resolveSelectionPaneRowTextColor({
                isHighlighted: isHighlightedOption,
                unhighlightedTextColor: chatScreenTheme.textSecondary,
              })}
              truncate={true}
              wrapMode="none"
            >
              {optionName}
            </text>
          </SelectionPaneHighlightedRow>
        );
      })}
    </>
  );
}
