import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

// KeyValueList aligns keys on the left in a fixed column and lets values take
// the remaining width. The caller supplies the column width because the
// design tends to use 10–18 cells depending on the longest key.
export type KeyValueEntry = {
  entryKeyLabel: string;
  entryValueContent: ReactNode;
};

export type KeyValueListProps = {
  keyColumnWidth?: number;
  entries: KeyValueEntry[];
};

export function KeyValueList(props: KeyValueListProps): ReactNode {
  const keyColumnWidth =
    props.keyColumnWidth ??
    Math.min(
      Math.max(
        ...props.entries.map((keyValueEntry) => keyValueEntry.entryKeyLabel.length),
        4,
      ),
      24,
    );
  return (
    <box flexDirection="column" width="100%">
      {props.entries.map((keyValueEntry, index) => (
        <box key={`kv-entry-${index}`} width="100%">
          <box flexShrink={0} width={keyColumnWidth}>
            <text>
              <span fg={chatScreenTheme.textMuted}>{keyValueEntry.entryKeyLabel}</span>
            </text>
          </box>
          <box flexGrow={1} flexShrink={1} marginLeft={1}>
            {keyValueEntry.entryValueContent}
          </box>
        </box>
      ))}
    </box>
  );
}
