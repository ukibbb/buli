import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

// A numbered list aligns its gutter so all items line up even when the
// largest index is two or three digits. Markers are zero-padded to at least
// 2 digits in bold accentGreen. Design: pen frame 0HlMv (ch04 olBlock).
export type NumberedListProps = {
  itemContents: ReactNode[];
  startingIndex?: number;
};

export function NumberedList(props: NumberedListProps): ReactNode {
  const startingIndex = props.startingIndex ?? 1;
  const highestDisplayedIndex = startingIndex + props.itemContents.length - 1;
  const gutterWidth = Math.max(3, String(highestDisplayedIndex).padStart(2, "0").length + 1);
  return (
    <box flexDirection="column" width="100%">
      {props.itemContents.map((itemContent, index) => (
        <box key={`numbered-item-${index}`} width="100%">
          <box flexShrink={0} marginRight={1} width={gutterWidth}>
            <text>
              <b fg={chatScreenTheme.accentGreen}>
                {`${String(startingIndex + index).padStart(2, "0")}.`.padStart(gutterWidth, " ")}
              </b>
            </text>
          </box>
          <box flexShrink={1}>{itemContent}</box>
        </box>
      ))}
    </box>
  );
}
