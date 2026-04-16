import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

// A bulleted list renders one row per item, each prefixed with a "·" glyph in
// a muted colour so the bullet reads as punctuation rather than competing
// with the item's content for attention.
export type BulletedListProps = {
  itemContents: ReactNode[];
};

export function BulletedList(props: BulletedListProps): ReactNode {
  return (
    <box flexDirection="column" width="100%">
      {props.itemContents.map((itemContent, index) => (
        <box key={`bulleted-item-${index}`} width="100%">
          <box flexShrink={0} marginRight={1}>
            <text>
              <span fg={chatScreenTheme.accentPrimaryMuted}>·</span>
            </text>
          </box>
          <box flexShrink={1}>{itemContent}</box>
        </box>
      ))}
    </box>
  );
}
