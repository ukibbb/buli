import type { ReactNode } from "react";
import type { ToolCallGrepMatch } from "@buli/contracts";
import { FencedCodeBlock } from "../primitives/FencedCodeBlock.tsx";
import { SourceLocationLabel, type SourceLineRange } from "../primitives/SourceLocationLabel.tsx";
import { limitVisibleItems, VisibleContentLimitNotice } from "../primitives/VisibleContentLimit.tsx";

type GrepMatchFileSnippet = {
  matchFilePath: string;
  sourceLineRange: SourceLineRange;
  sourceLines: {
    lineNumber: number;
    lineText: string;
  }[];
};

type GrepMatchFileLines = {
  matchFilePath: string;
  sourceLineTextByLineNumber: Map<number, string>;
};

export type GrepMatchResultsBlockProps = {
  matchHits: readonly ToolCallGrepMatch[];
  maximumVisibleMatchHitCount: number;
};

export function GrepMatchResultsBlock(props: GrepMatchResultsBlockProps): ReactNode {
  const limitedMatchHits = limitVisibleItems({
    items: props.matchHits,
    maximumVisibleItemCount: props.maximumVisibleMatchHitCount,
  });
  const grepMatchFileSnippets = buildGrepMatchFileSnippets(limitedMatchHits.visibleItems);

  return (
    <box flexDirection="column" width="100%">
      <VisibleContentLimitNotice
        visibleItemCount={limitedMatchHits.visibleItems.length}
        totalItemCount={limitedMatchHits.totalItemCount}
        itemLabelPlural="matches"
      />
      {grepMatchFileSnippets.map((grepMatchFileSnippet, index) => (
        <box
          key={`${grepMatchFileSnippet.matchFilePath}:${grepMatchFileSnippet.sourceLineRange.sourceStartLineNumber}-${grepMatchFileSnippet.sourceLineRange.sourceEndLineNumber}`}
          flexDirection="column"
          width="100%"
          {...(index > 0 ? { marginTop: 1 } : {})}
        >
          <SourceLocationLabel
            filePath={grepMatchFileSnippet.matchFilePath}
            sourceLineRange={grepMatchFileSnippet.sourceLineRange}
          />
          <FencedCodeBlock
            variant="embedded"
            filePath={grepMatchFileSnippet.matchFilePath}
            showLineNumbers={false}
            wrapMode="char"
            codeLines={grepMatchFileSnippet.sourceLines.map((sourceLine) => ({ lineText: sourceLine.lineText }))}
          />
        </box>
      ))}
    </box>
  );
}

function buildGrepMatchFileSnippets(matchHits: readonly ToolCallGrepMatch[]): GrepMatchFileSnippet[] {
  const grepMatchFileLinesByPath = new Map<string, GrepMatchFileLines>();

  for (const matchHit of matchHits) {
    const grepMatchFileLines = getOrCreateGrepMatchFileLines(grepMatchFileLinesByPath, matchHit.matchFilePath);
    appendGrepMatchLines(grepMatchFileLines, matchHit);
  }

  return [...grepMatchFileLinesByPath.values()].flatMap(buildContiguousGrepMatchFileSnippets);
}

function getOrCreateGrepMatchFileLines(
  grepMatchFileLinesByPath: Map<string, GrepMatchFileLines>,
  matchFilePath: string,
): GrepMatchFileLines {
  const existingGrepMatchFileLines = grepMatchFileLinesByPath.get(matchFilePath);
  if (existingGrepMatchFileLines) {
    return existingGrepMatchFileLines;
  }

  const grepMatchFileLines: GrepMatchFileLines = {
    matchFilePath,
    sourceLineTextByLineNumber: new Map<number, string>(),
  };
  grepMatchFileLinesByPath.set(matchFilePath, grepMatchFileLines);
  return grepMatchFileLines;
}

function appendGrepMatchLines(grepMatchFileLines: GrepMatchFileLines, matchHit: ToolCallGrepMatch): void {
  for (const matchLine of [
    ...(matchHit.contextBeforeLines ?? []),
    { lineNumber: matchHit.matchLineNumber, lineText: matchHit.matchSnippet },
    ...(matchHit.contextAfterLines ?? []),
  ]) {
    if (grepMatchFileLines.sourceLineTextByLineNumber.has(matchLine.lineNumber)) {
      continue;
    }

    grepMatchFileLines.sourceLineTextByLineNumber.set(matchLine.lineNumber, matchLine.lineText);
  }
}

function buildContiguousGrepMatchFileSnippets(grepMatchFileLines: GrepMatchFileLines): GrepMatchFileSnippet[] {
  const orderedSourceLines = [...grepMatchFileLines.sourceLineTextByLineNumber.entries()]
    .sort(([leftLineNumber], [rightLineNumber]) => leftLineNumber - rightLineNumber)
    .map(([lineNumber, lineText]) => ({ lineNumber, lineText }));
  const grepMatchFileSnippets: GrepMatchFileSnippet[] = [];
  let currentSnippetSourceLines: GrepMatchFileSnippet["sourceLines"] = [];

  const flushCurrentSnippet = (): void => {
    const firstSourceLine = currentSnippetSourceLines.at(0);
    const lastSourceLine = currentSnippetSourceLines.at(-1);
    if (!firstSourceLine || !lastSourceLine) {
      return;
    }

    grepMatchFileSnippets.push({
      matchFilePath: grepMatchFileLines.matchFilePath,
      sourceLineRange: {
        sourceStartLineNumber: firstSourceLine.lineNumber,
        sourceEndLineNumber: lastSourceLine.lineNumber,
      },
      sourceLines: currentSnippetSourceLines,
    });
    currentSnippetSourceLines = [];
  };

  for (const sourceLine of orderedSourceLines) {
    const previousSourceLine = currentSnippetSourceLines.at(-1);
    if (previousSourceLine && sourceLine.lineNumber !== previousSourceLine.lineNumber + 1) {
      flushCurrentSnippet();
    }

    currentSnippetSourceLines.push(sourceLine);
  }

  flushCurrentSnippet();
  return grepMatchFileSnippets;
}
