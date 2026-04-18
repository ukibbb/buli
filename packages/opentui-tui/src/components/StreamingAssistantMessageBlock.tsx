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
  return <text fg={chatScreenTheme.textPrimary}>{openContentPart.text}</text>;
}

function StreamingAgentBody(props: { streamingProjection: AssistantStreamingProjection }): ReactNode {
  const hasCompleted = props.streamingProjection.completedContentParts.length > 0;
  const hasOpen = props.streamingProjection.openContentPart !== undefined;
  return (
    <box flexDirection="column" width="100%">
      {hasCompleted ? (
        <RenderAssistantResponseTree
          assistantContentParts={props.streamingProjection.completedContentParts}
        />
      ) : null}
      {hasOpen ? (
        <box marginTop={hasCompleted ? 1 : 0} width="100%">
          <OpenStreamingAssistantContentPartView openContentPart={props.streamingProjection.openContentPart!} />
        </box>
      ) : null}
      {!hasCompleted && !hasOpen ? (
        <text fg={chatScreenTheme.textDim}>{"Waiting for model output…"}</text>
      ) : null}
    </box>
  );
}

export function StreamingAssistantMessageBlock(props: StreamingAssistantMessageBlockProps): ReactNode {
  // Pen frame 90pSl (HERO 1 agentResponse): muted `// agent · response`
  // header, primary-text body. No outer stripe wrapper for the success path.
  if (props.renderState === "streaming") {
    return (
      <box flexDirection="column" width="100%">
        <text fg={chatScreenTheme.textMuted}>{"// agent · response"}</text>
        <StreamingAgentBody streamingProjection={props.streamingProjection} />
      </box>
    );
  }
  // No design exists for failed/incomplete — keep the SurfaceCard stripe so
  // the user sees an unmistakable error/incomplete signal.
  const stripeColor =
    props.renderState === "failed" ? chatScreenTheme.accentRed : chatScreenTheme.accentAmber;
  const headerLabel =
    props.renderState === "failed" ? "assistant · failed" : "assistant · incomplete";
  const footerLabel =
    props.renderState === "failed" ? "response failed" : "response stopped early";
  return (
    <SurfaceCard
      stripeColor={stripeColor}
      headerLeft={
        <box flexDirection="row">
          <text fg={stripeColor}>{glyphs.statusDot}</text>
          <text>
            <b>{` ${headerLabel}`}</b>
          </text>
        </box>
      }
      headerRight={<text fg={chatScreenTheme.textMuted}>{footerLabel}</text>}
      bodyContent={
        <box paddingX={1} width="100%">
          <StreamingAgentBody streamingProjection={props.streamingProjection} />
        </box>
      }
    />
  );
}
