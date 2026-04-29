import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export function ApprovalDecisionControl(): ReactNode {
  return (
    <box
      border={true}
      borderColor={chatScreenTheme.accentAmber}
      borderStyle="rounded"
      flexDirection="row"
      flexShrink={0}
      paddingX={1}
    >
      <text wrapMode="none">
        <b fg={chatScreenTheme.accentGreen}>{"y Yes"}</b>
      </text>
      <box marginX={1}>
        <text fg={chatScreenTheme.border}>│</text>
      </box>
      <text wrapMode="none">
        <b fg={chatScreenTheme.accentRed}>{"n No"}</b>
      </text>
    </box>
  );
}
