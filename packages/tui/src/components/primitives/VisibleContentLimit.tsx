import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export type VisibleItemLimit<TItem> = {
  visibleItems: readonly TItem[];
  totalItemCount: number;
  wasLimited: boolean;
};

export function limitVisibleItems<TItem>(input: {
  items: readonly TItem[];
  maximumVisibleItemCount: number;
}): VisibleItemLimit<TItem> {
  const maximumVisibleItemCount = Math.max(0, input.maximumVisibleItemCount);
  const visibleItems = input.items.slice(0, maximumVisibleItemCount);

  return {
    visibleItems,
    totalItemCount: input.items.length,
    wasLimited: visibleItems.length < input.items.length,
  };
}

export function VisibleContentLimitNotice(props: {
  visibleItemCount: number;
  totalItemCount: number;
  itemLabelPlural: string;
}): ReactNode {
  if (props.visibleItemCount >= props.totalItemCount) {
    return null;
  }

  return (
    <box width="100%">
      <text fg={chatScreenTheme.textDim} wrapMode="word" width="100%">
        {`showing first ${props.visibleItemCount} of ${props.totalItemCount} ${props.itemLabelPlural}`}
      </text>
    </box>
  );
}
