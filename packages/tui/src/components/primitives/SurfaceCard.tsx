import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export type SurfaceCardProps = {
  accentColor: string;
  headerLeft: ReactNode;
  headerRight?: ReactNode;
  bodyContent?: ReactNode;
  borderColor?: string;
};

// The hairline glyph (U+258F, LEFT ONE EIGHTH BLOCK) paints only the leftmost
// 1/8 of a character cell, giving the accent a sub-cell visual thickness. The
// repeat count just has to exceed any reasonable card height; overflow is
// clipped by the parent box.
const HAIRLINE_GLYPH = "▏";
const HAIRLINE_COLUMN = Array.from({ length: 200 }, () => HAIRLINE_GLYPH).join("\n");

export function SurfaceCard(props: SurfaceCardProps): ReactNode {
  return (
    <box
      borderColor={props.borderColor ?? chatScreenTheme.border}
      borderStyle="rounded"
      border={true}
      flexDirection="row"
      width="100%"
    >
      <box width={1} flexShrink={0} overflow="hidden">
        <text fg={props.accentColor} position="absolute">{HAIRLINE_COLUMN}</text>
      </box>
      <box flexDirection="column" flexGrow={1}>
        <box
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          paddingX={2}
          paddingY={1}
          width="100%"
        >
          <box flexShrink={1}>{props.headerLeft}</box>
          {props.headerRight ? <box flexShrink={0}>{props.headerRight}</box> : null}
        </box>
        {props.bodyContent ? (
          <>
            <box backgroundColor={chatScreenTheme.borderSubtle} height={1} width="100%" />
            <box backgroundColor={chatScreenTheme.bg} flexDirection="column" paddingY={1} width="100%">
              {props.bodyContent}
            </box>
          </>
        ) : null}
      </box>
    </box>
  );
}
