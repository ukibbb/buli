import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export type SelectionPaneSelectProps = {
  optionNames: readonly string[];
  highlightedOptionIndex: number;
  maxVisibleOptionCount: number;
};

export function SelectionPaneSelect(props: SelectionPaneSelectProps): ReactNode {
  const selectionPaneOptions = props.optionNames.map((optionName) => ({
    name: optionName,
    description: "",
  }));
  const visibleOptionCount = Math.max(1, Math.min(props.optionNames.length, props.maxVisibleOptionCount));

  return (
    <select
      backgroundColor={chatScreenTheme.surfaceOne}
      // ChatSessionState owns selection keys; this select is a controlled renderer.
      focused={false}
      focusedBackgroundColor={chatScreenTheme.surfaceOne}
      focusedTextColor={chatScreenTheme.textSecondary}
      height={visibleOptionCount}
      options={selectionPaneOptions}
      selectedBackgroundColor={chatScreenTheme.borderSubtle}
      selectedDescriptionColor={chatScreenTheme.textMuted}
      selectedIndex={props.highlightedOptionIndex}
      selectedTextColor={chatScreenTheme.textPrimary}
      showDescription={false}
      showScrollIndicator={props.optionNames.length > props.maxVisibleOptionCount}
      textColor={chatScreenTheme.textSecondary}
      width="100%"
    />
  );
}
