import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

// A numbered list aligns its gutter so all items line up even when the
// largest index is two or three digits. The gutter width is computed from the
// number of items so two-digit lists keep their indent consistent.
export type NumberedListProps = {
  itemContents: ReactNode[];
  startingIndex?: number;
};

export function NumberedList(props: NumberedListProps): ReactNode {
  const startingIndex = props.startingIndex ?? 1;
  const highestDisplayedIndex = startingIndex + props.itemContents.length - 1;
  const gutterWidth = String(highestDisplayedIndex).length + 1;
  return (
    <box flexDirection="column" width="100%">
      {props.itemContents.map((itemContent, index) => (
        <box key={`numbered-item-${index}`} width="100%">
          <box flexShrink={0} marginRight={1} width={gutterWidth}>
            <text>
              <span fg={chatScreenTheme.accentPrimaryMuted}>
                {`${startingIndex + index}.`.padStart(gutterWidth, " ")}
              </span>
            </text>
          </box>
          <box flexShrink={1}>{itemContent}</box>
        </box>
      ))}
    </box>
  );
}
