import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export type SurfaceCardProps = {
  accentColor: string;
  headerLeft: ReactNode;
  headerRight?: ReactNode;
  bodyContent?: ReactNode;
  borderColor?: string;
  density?: "comfortable" | "compact";
};

const leftRailBorderChars = {
  topLeft: "",
  bottomLeft: "",
  vertical: "┃",
  topRight: "",
  bottomRight: "",
  horizontal: " ",
  bottomT: "",
  topT: "",
  cross: "",
  leftT: "",
  rightT: "",
} as const;

export function SurfaceCard(props: SurfaceCardProps): ReactNode {
  const isCompact = props.density === "compact";
  return (
    <box
      borderColor={props.borderColor ?? props.accentColor}
      border={["left"]}
      customBorderChars={leftRailBorderChars}
      flexDirection="column"
      width="100%"
    >
      <box backgroundColor={chatScreenTheme.surfaceOne} flexDirection="column" flexGrow={1} width="100%">
        {isCompact ? (
          <box flexDirection="row" alignItems="flex-start" paddingX={1} paddingY={0} width="100%">
            <box minWidth={0} width="100%">{props.headerLeft}</box>
          </box>
        ) : (
          <box
            flexDirection="row"
            alignItems="center"
            justifyContent="space-between"
            overflow="hidden"
            paddingX={2}
            paddingY={1}
            width="100%"
          >
            <box flexShrink={1} minWidth={0} overflow="hidden">{props.headerLeft}</box>
            {props.headerRight ? <box flexShrink={0} marginLeft={1}>{props.headerRight}</box> : null}
          </box>
        )}
        {props.bodyContent ? (
          <box
            flexDirection="column"
            paddingBottom={isCompact ? 0 : 1}
            paddingX={isCompact ? 1 : 2}
            width="100%"
          >
            {props.bodyContent}
          </box>
        ) : null}
      </box>
    </box>
  );
}
