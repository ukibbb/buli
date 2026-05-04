import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { ApprovalDecisionControl } from "../primitives/ApprovalDecisionControl.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { glyphs } from "../glyphs.ts";

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
      headerLeft={
        <box flexDirection="row" alignItems="center" flexShrink={1} minWidth={0} overflow="hidden">
          <box flexShrink={0} width={2}>
            <text fg={chatScreenTheme.accentAmber}>{glyphs.statusDot}</text>
          </box>
          <box flexShrink={1} marginLeft={1} minWidth={0} overflow="hidden">
            <text wrapMode="none">
              <b fg={chatScreenTheme.accentAmber}>{"Approval needed"}</b>
              <span fg={chatScreenTheme.textMuted}>{" — "}</span>
              <span fg={chatScreenTheme.textSecondary}>{props.riskExplanation}</span>
            </text>
          </box>
        </box>
      }
      headerRight={
        <ApprovalDecisionControl onApprove={props.onApprove} onDeny={props.onDeny} />
      }
    />
  );
}
