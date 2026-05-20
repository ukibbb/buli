import { useState, type ReactNode } from "react";
import type { ToolCallGlobDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { FileReference } from "../primitives/FileReference.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { ToolCallCompactHeader } from "./ToolCallCardHeaderSlots.tsx";

export type GlobToolCallCardProps = {
  toolCallDetail: ToolCallGlobDetail;
  renderState: "streaming" | "completed" | "failed";
  durationMs?: number;
  errorText?: string;
};

const MAX_VISIBLE_GLOB_PATHS = 24;

export function GlobToolCallCard(props: GlobToolCallCardProps): ReactNode {
  const [isGlobResultExpanded, setIsGlobResultExpanded] = useState(false);
  const accentColor =
    props.renderState === "failed"
      ? chatScreenTheme.accentRed
      : props.renderState === "streaming"
        ? chatScreenTheme.accentAmber
        : chatScreenTheme.accentGreen;
  const statusKind =
    props.renderState === "completed"
      ? "success"
      : props.renderState === "failed"
        ? "error"
        : "pending";
  const matchedPaths = props.toolCallDetail.matchedPaths?.slice(0, MAX_VISIBLE_GLOB_PATHS);
  const hasGlobResultContent = props.renderState !== "failed" && (matchedPaths?.length ?? 0) > 0;
  return (
    <SurfaceCard
      accentColor={accentColor}
      density="compact"
      headerLeft={
        <ToolCallCompactHeader
          accentColor={accentColor}
          disclosureState={hasGlobResultContent
            ? {
                isContentExpandable: true,
                isContentExpanded: isGlobResultExpanded,
                onContentExpansionToggle: () => {
                  setIsGlobResultExpanded((currentGlobResultExpanded) => !currentGlobResultExpanded);
                },
              }
            : { isContentExpandable: false }}
          statusColor={accentColor}
          statusKind={statusKind}
          statusLabel={buildGlobStatusLabel(props)}
          toolNameLabel="Glob"
          toolTargetText={props.toolCallDetail.globPattern}
        />
      }
      bodyContent={hasGlobResultContent && isGlobResultExpanded ? buildGlobBodyContent(matchedPaths ?? []) : undefined}
    />
  );
}

function buildGlobStatusLabel(props: GlobToolCallCardProps): string {
  if (props.renderState === "failed") {
    return props.errorText ?? "glob failed";
  }
  if (props.renderState === "streaming") {
    return "searching…";
  }
  const matchedPathCount = props.toolCallDetail.matchedPathCount;
  const returnedPathCount = props.toolCallDetail.returnedPathCount;
  if (matchedPathCount !== undefined) {
    if (returnedPathCount !== undefined && returnedPathCount !== matchedPathCount) {
      return `${returnedPathCount}/${matchedPathCount} paths`;
    }
    return `${matchedPathCount} paths`;
  }
  return "done";
}

function buildGlobBodyContent(matchedPaths: readonly string[]): ReactNode {
  if (matchedPaths.length === 0) {
    return undefined;
  }
  return (
    <box flexDirection="column" width="100%">
      <box flexDirection="column" paddingX={1} width="100%">
        {matchedPaths.map((matchedPath, index) => (
          <box key={`glob-path-${index}`} width="100%">
            <FileReference filePath={matchedPath} variant="inline" />
          </box>
        ))}
      </box>
    </box>
  );
}
