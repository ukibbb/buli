import { useState, type ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { ToolCallCompactHeader } from "./ToolCallCardHeaderSlots.tsx";

export type ToolCallRenderState = "streaming" | "completed" | "failed";
export type ToolCallStatusKind = "success" | "error" | "pending";

export type ToolCallRenderStatePresentation = {
  accentColor: string;
  statusKind: ToolCallStatusKind;
};

export type ExpandableToolCallCardProps = {
  accentColor: string;
  approvalDecisionControl?: ReactNode;
  hasExpandableContent: boolean;
  pendingSnakeVariant?: "sixCell" | "eatingApple";
  renderExpandedContent: () => ReactNode;
  statusKind: ToolCallStatusKind;
  statusLabel: string;
  toolNameLabel: string;
  toolTargetText: string;
};

export function ExpandableToolCallCard(props: ExpandableToolCallCardProps): ReactNode {
  const [isToolCallContentExpanded, setIsToolCallContentExpanded] = useState(false);

  return (
    <SurfaceCard
      accentColor={props.accentColor}
      density="compact"
      headerLeft={
        <ToolCallCompactHeader
          accentColor={props.accentColor}
          {...(props.approvalDecisionControl !== undefined
            ? { approvalDecisionControl: props.approvalDecisionControl }
            : {})}
          disclosureState={props.hasExpandableContent
            ? {
                isContentExpandable: true,
                isContentExpanded: isToolCallContentExpanded,
                onContentExpansionToggle: () => {
                  setIsToolCallContentExpanded((currentToolCallContentExpanded) => !currentToolCallContentExpanded);
                },
              }
            : { isContentExpandable: false }}
          statusColor={props.accentColor}
          statusKind={props.statusKind}
          statusLabel={props.statusLabel}
          toolNameLabel={props.toolNameLabel}
          toolTargetText={props.toolTargetText}
          {...(props.pendingSnakeVariant !== undefined ? { pendingSnakeVariant: props.pendingSnakeVariant } : {})}
        />
      }
      bodyContent={props.hasExpandableContent && isToolCallContentExpanded ? props.renderExpandedContent() : undefined}
    />
  );
}

export function resolveDefaultToolCallRenderStatePresentation(
  renderState: ToolCallRenderState,
): ToolCallRenderStatePresentation {
  if (renderState === "failed") {
    return { accentColor: chatScreenTheme.accentRed, statusKind: "error" };
  }

  if (renderState === "streaming") {
    return { accentColor: chatScreenTheme.accentAmber, statusKind: "pending" };
  }

  return { accentColor: chatScreenTheme.accentGreen, statusKind: "success" };
}

export function formatToolCallDurationMs(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
}
