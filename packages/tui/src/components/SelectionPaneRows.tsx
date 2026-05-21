import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export type VisibleSelectionWindow<TSelectionItem> = {
  firstVisibleSelectionItemIndex: number;
  highlightedSelectionItemIndex: number;
  visibleSelectionItems: readonly TSelectionItem[];
};

export function calculateVisibleSelectionWindow<TSelectionItem>(input: {
  selectionItems: readonly TSelectionItem[];
  highlightedSelectionItemIndex: number;
  maxVisibleSelectionItemCount: number;
}): VisibleSelectionWindow<TSelectionItem> {
  const lastPossibleFirstVisibleSelectionItemIndex = Math.max(
    0,
    input.selectionItems.length - input.maxVisibleSelectionItemCount,
  );
  const highlightedSelectionItemIndex = Math.max(
    0,
    Math.min(input.highlightedSelectionItemIndex, input.selectionItems.length - 1),
  );
  const firstVisibleSelectionItemIndex = Math.min(
    lastPossibleFirstVisibleSelectionItemIndex,
    Math.max(0, highlightedSelectionItemIndex - input.maxVisibleSelectionItemCount + 1),
  );

  return {
    firstVisibleSelectionItemIndex,
    highlightedSelectionItemIndex,
    visibleSelectionItems: input.selectionItems.slice(
      firstVisibleSelectionItemIndex,
      firstVisibleSelectionItemIndex + input.maxVisibleSelectionItemCount,
    ),
  };
}

export type SelectionPaneHighlightedRowProps = {
  children: ReactNode;
  isHighlighted: boolean;
};

export function SelectionPaneHighlightedRow(props: SelectionPaneHighlightedRowProps): ReactNode {
  return (
    <box
      backgroundColor={props.isHighlighted ? chatScreenTheme.borderSubtle : chatScreenTheme.surfaceOne}
      flexDirection="row"
      flexShrink={0}
      height={1}
      width="100%"
    >
      {props.children}
    </box>
  );
}

export function resolveSelectionPaneRowTextColor(input: {
  isHighlighted: boolean;
  unhighlightedTextColor: string;
}): string {
  return input.isHighlighted ? chatScreenTheme.textPrimary : input.unhighlightedTextColor;
}
