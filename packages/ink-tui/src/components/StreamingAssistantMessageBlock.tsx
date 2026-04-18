import { Box, Text } from "ink";
import type { ReactNode } from "react";
import type { AssistantStreamingProjection, StreamingAssistantContentPart } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { RenderAssistantResponseTree } from "../richText/renderAssistantResponseTree.tsx";
import { glyphs } from "./glyphs.ts";
import { FencedCodeBlock } from "./primitives/FencedCodeBlock.tsx";
import { SurfaceCard } from "./primitives/SurfaceCard.tsx";

export type StreamingAssistantMessageBlockProps = {
  renderState: "streaming" | "incomplete" | "failed";
  streamingProjection: AssistantStreamingProjection;
};

function resolveStreamingAssistantMessagePresentation(renderState: StreamingAssistantMessageBlockProps["renderState"]): {
  stripeColor: string;
  headerLabel: string;
  footerLabel: string;
} {
  if (renderState === "failed") {
    return {
      stripeColor: chatScreenTheme.accentRed,
      headerLabel: "assistant · failed",
      footerLabel: "response failed",
    };
  }

  if (renderState === "incomplete") {
    return {
      stripeColor: chatScreenTheme.accentAmber,
      headerLabel: "assistant · incomplete",
      footerLabel: "response stopped early",
    };
  }

  return {
    stripeColor: chatScreenTheme.accentCyan,
    headerLabel: "assistant · streaming",
    footerLabel: "working…",
  };
}

function OpenStreamingAssistantContentPartView(props: {
  openContentPart: StreamingAssistantContentPart;
}): ReactNode {
  const { openContentPart } = props;
  if (openContentPart.kind === "streaming_fenced_code_block") {
    return (
      <FencedCodeBlock
        {...(openContentPart.languageLabel ? { languageLabel: openContentPart.languageLabel } : {})}
        codeLines={openContentPart.codeLines.map((codeLineText) => ({ lineText: codeLineText }))}
      />
    );
  }

  return <Text color={chatScreenTheme.textPrimary}>{openContentPart.text}</Text>;
}

export function StreamingAssistantMessageBlock(props: StreamingAssistantMessageBlockProps): ReactNode {
  const presentation = resolveStreamingAssistantMessagePresentation(props.renderState);
  const hasCompletedContentParts = props.streamingProjection.completedContentParts.length > 0;
  const hasOpenContentPart = props.streamingProjection.openContentPart !== undefined;

  return (
    <SurfaceCard
      stripeColor={presentation.stripeColor}
      headerLeft={
        <Box>
          <Text color={presentation.stripeColor}>{glyphs.statusDot}</Text>
          <Text bold color={chatScreenTheme.textPrimary}>{` ${presentation.headerLabel}`}</Text>
        </Box>
      }
      headerRight={<Text color={chatScreenTheme.textMuted}>{presentation.footerLabel}</Text>}
      bodyContent={
        <Box flexDirection="column" paddingX={1} width="100%">
          {hasCompletedContentParts ? (
            <RenderAssistantResponseTree assistantContentParts={props.streamingProjection.completedContentParts} />
          ) : null}
          {hasOpenContentPart ? (
            <Box marginTop={hasCompletedContentParts ? 1 : 0} width="100%">
              <OpenStreamingAssistantContentPartView openContentPart={props.streamingProjection.openContentPart!} />
            </Box>
          ) : null}
          {!hasCompletedContentParts && !hasOpenContentPart ? (
            <Text color={chatScreenTheme.textDim}>Waiting for model output…</Text>
          ) : null}
        </Box>
      }
    />
  );
}
