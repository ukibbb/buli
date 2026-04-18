import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

// A bulleted list renders one row per item, each prefixed with a ">_" glyph
// in bold accentCyan to draw the eye to the list structure while keeping the
// item content clear. Design: pen frame lNP2q (ch04 ulBlock).
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
              <b fg={chatScreenTheme.accentCyan}>{">_"}</b>
            </text>
          </box>
          <box flexShrink={1}>{itemContent}</box>
        </box>
      ))}
    </box>
  );
}
