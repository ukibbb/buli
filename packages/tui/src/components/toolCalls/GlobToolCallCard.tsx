import { useState, type ReactNode } from "react";
import type { ToolCallGlobDetail } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { FileReference } from "../primitives/FileReference.tsx";
import { SurfaceCard } from "../primitives/SurfaceCard.tsx";
import { glyphs } from "../glyphs.ts";
import { BracketedTarget } from "./BracketedTarget.tsx";
import {
  ToolCallHeaderLeft,
  ToolCallHeaderRight,
} from "./ToolCallCardHeaderSlots.tsx";
import { ToolCallResultDisclosureControl } from "./ToolCallResultDisclosureControl.tsx";

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
  return (
    <SurfaceCard
      accentColor={accentColor}
      headerLeft={
        <ToolCallHeaderLeft
          toolGlyph={glyphs.globSearch}
          toolGlyphColor={accentColor}
          toolNameLabel="Glob"
          toolTargetContent={
            <BracketedTarget accentColor={accentColor} targetText={props.toolCallDetail.globPattern} />
          }
        />
      }
      headerRight={
        <ToolCallHeaderRight
          statusColor={accentColor}
          statusKind={statusKind}
          statusLabel={buildGlobStatusLabel(props)}
        />
      }
      bodyContent={buildGlobBodyContent({
        globToolCallCardProps: props,
        isGlobResultExpanded,
        onGlobResultExpansionToggle: () => {
          setIsGlobResultExpanded((currentGlobResultExpanded) => !currentGlobResultExpanded);
        },
      })}
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
      return `${returnedPathCount} of ${matchedPathCount} paths · truncated`;
    }
    return `${matchedPathCount} paths${props.toolCallDetail.wasTruncated ? " · truncated" : ""}`;
  }
  return "done";
}

type GlobBodyContentInput = {
  globToolCallCardProps: GlobToolCallCardProps;
  isGlobResultExpanded: boolean;
  onGlobResultExpansionToggle: () => void;
};

function buildGlobBodyContent(input: GlobBodyContentInput): ReactNode {
  const props = input.globToolCallCardProps;
  if (props.renderState === "failed") {
    if (props.errorText !== undefined) {
      return undefined;
    }
    return <text fg={chatScreenTheme.accentRed}>{"glob failed to run"}</text>;
  }
  const matchedPaths = props.toolCallDetail.matchedPaths?.slice(0, MAX_VISIBLE_GLOB_PATHS);
  if (!matchedPaths || matchedPaths.length === 0) {
    return undefined;
  }
  return (
    <box flexDirection="column" width="100%">
      <ToolCallResultDisclosureControl
        isResultExpanded={input.isGlobResultExpanded}
        onResultExpansionToggle={input.onGlobResultExpansionToggle}
        resultSummaryText={buildGlobResultSummaryText({
          toolCallDetail: props.toolCallDetail,
          visiblePathCount: matchedPaths.length,
        })}
      />
      {input.isGlobResultExpanded ? (
        <box flexDirection="column" marginTop={1} paddingX={1} width="100%">
          {matchedPaths.map((matchedPath, index) => (
            <box key={`glob-path-${index}`} width="100%">
              <FileReference filePath={matchedPath} variant="inline" />
            </box>
          ))}
        </box>
      ) : null}
    </box>
  );
}

function buildGlobResultSummaryText(input: {
  toolCallDetail: ToolCallGlobDetail;
  visiblePathCount: number;
}): string {
  const totalMatchedPathCount = input.toolCallDetail.matchedPathCount;
  const visiblePathCountText = totalMatchedPathCount !== undefined && totalMatchedPathCount !== input.visiblePathCount
    ? `${input.visiblePathCount} of ${totalMatchedPathCount}`
    : String(input.visiblePathCount);
  const pathCountForPlural = totalMatchedPathCount ?? input.visiblePathCount;
  const pathCountLabel = pathCountForPlural === 1 ? "matched path" : "matched paths";
  const searchDirectoryText = input.toolCallDetail.searchDirectoryPath
    ? ` in ${input.toolCallDetail.searchDirectoryPath}`
    : "";

  return `${visiblePathCountText} ${pathCountLabel} for ${input.toolCallDetail.globPattern}${searchDirectoryText}`;
}
