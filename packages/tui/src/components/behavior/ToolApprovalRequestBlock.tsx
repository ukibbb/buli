import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { ApprovalDecisionControl } from "../primitives/ApprovalDecisionControl.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";

// The pending tool call itself is already rendered as the latest card in the
// transcript above this block — re-rendering it inside the approval surface
// duplicates the same Bash/Edit/etc. card on screen. The approval bar's job is
// to explain the risk and collect a button decision; the tool detail it refers
// to is the one immediately above it.
export type ToolApprovalRequestBlockProps = {
  riskExplanation: string;
  onApprove: () => void;
  onDeny: () => void;
};

export function ToolApprovalRequestBlock(props: ToolApprovalRequestBlockProps): ReactNode {
  return (
    <SurfaceCard
      accentColor={chatScreenTheme.accentAmber}
      density="compact"
      headerLeft={
        <box alignItems="center" flexDirection="row" justifyContent="space-between" minWidth={0} overflow="hidden" width="100%">
          <box flexShrink={1} minWidth={0} overflow="hidden">
            <text fg={chatScreenTheme.textSecondary} wrapMode="none">{props.riskExplanation}</text>
          </box>
          <box flexShrink={0} marginLeft={1}>
            <ApprovalDecisionControl onApprove={props.onApprove} onDeny={props.onDeny} />
          </box>
        </box>
      }
    />
  );
}
