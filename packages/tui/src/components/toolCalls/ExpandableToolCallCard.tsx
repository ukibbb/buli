import { useState, type ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { ToolCallCompactHeader, type ToolCallCompactDisclosureState } from "./ToolCallCardHeaderSlots.tsx";

export type ToolCallRenderState = "streaming" | "completed" | "failed";
export type ToolCallStatusKind = "success" | "error" | "pending";

export type ToolCallRenderStatePresentation = {
  accentColor: string;
  statusKind: ToolCallStatusKind;
};

type SharedToolCallCardProps = {
  accentColor: string;
  approvalDecisionControl?: ReactNode;
  pendingSnakeVariant?: "sixCell" | "eatingApple";
  statusKind: ToolCallStatusKind;
  statusLabel: string;
  toolNameLabel: string;
  toolTargetText: string;
};

export type ExpandableToolCallCardProps = SharedToolCallCardProps & {
  defaultIsContentExpanded?: boolean;
  hasExpandableContent: boolean;
  renderExpandedContent: () => ReactNode;
};

export type AlwaysVisibleToolCallCardProps = SharedToolCallCardProps & {
  hasVisibleContent: boolean;
  renderVisibleContent: () => ReactNode;
};

type ToolCallCardFrameProps = SharedToolCallCardProps & {
  bodyContent?: ReactNode;
  disclosureState: ToolCallCompactDisclosureState;
};

export function ExpandableToolCallCard(props: ExpandableToolCallCardProps): ReactNode {
  const [manualContentExpansionState, setManualContentExpansionState] = useState<boolean | undefined>(undefined);
  const isToolCallContentExpanded = manualContentExpansionState ?? props.defaultIsContentExpanded ?? false;

  return (
    <ToolCallCardFrame
      accentColor={props.accentColor}
      {...(props.approvalDecisionControl !== undefined
        ? { approvalDecisionControl: props.approvalDecisionControl }
        : {})}
      bodyContent={props.hasExpandableContent && isToolCallContentExpanded ? props.renderExpandedContent() : undefined}
      disclosureState={props.hasExpandableContent
        ? {
            isContentExpandable: true,
            isContentExpanded: isToolCallContentExpanded,
            onContentExpansionToggle: () => {
              setManualContentExpansionState((currentManualContentExpansionState) => {
                const currentContentExpansionState = currentManualContentExpansionState ?? props.defaultIsContentExpanded ?? false;
                return !currentContentExpansionState;
              });
            },
          }
        : { isContentExpandable: false }}
      statusKind={props.statusKind}
      statusLabel={props.statusLabel}
      toolNameLabel={props.toolNameLabel}
      toolTargetText={props.toolTargetText}
      {...(props.pendingSnakeVariant !== undefined ? { pendingSnakeVariant: props.pendingSnakeVariant } : {})}
    />
  );
}

export function AlwaysVisibleToolCallCard(props: AlwaysVisibleToolCallCardProps): ReactNode {
  return (
    <ToolCallCardFrame
      accentColor={props.accentColor}
      {...(props.approvalDecisionControl !== undefined
        ? { approvalDecisionControl: props.approvalDecisionControl }
        : {})}
      bodyContent={props.hasVisibleContent ? props.renderVisibleContent() : undefined}
      disclosureState={{ isContentExpandable: false, staticDisclosureMarker: "hidden" }}
      statusKind={props.statusKind}
      statusLabel={props.statusLabel}
      toolNameLabel={props.toolNameLabel}
      toolTargetText={props.toolTargetText}
      {...(props.pendingSnakeVariant !== undefined ? { pendingSnakeVariant: props.pendingSnakeVariant } : {})}
    />
  );
}

function ToolCallCardFrame(props: ToolCallCardFrameProps): ReactNode {
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
          disclosureState={props.disclosureState}
          statusColor={props.accentColor}
          statusKind={props.statusKind}
          statusLabel={props.statusLabel}
          toolNameLabel={props.toolNameLabel}
          toolTargetText={props.toolTargetText}
          {...(props.pendingSnakeVariant !== undefined ? { pendingSnakeVariant: props.pendingSnakeVariant } : {})}
        />
      }
      bodyContent={props.bodyContent}
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
