import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { Callout } from "../primitives/Callout.tsx";

export type IncompleteResponseNoticeBlockProps = {
  incompleteReason: string;
};

export function IncompleteResponseNoticeBlock(
  props: IncompleteResponseNoticeBlockProps,
): ReactNode {
  return (
    <Callout
      severity="warning"
      titleText="Response incomplete"
      bodyContent={
        <text fg={chatScreenTheme.textPrimary}>{`The model stopped before completion: ${props.incompleteReason}`}</text>
      }
    />
  );
}
