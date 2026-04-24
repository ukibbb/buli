import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export type SurfaceCardProps = {
  accentColor: string;
  headerLeft: ReactNode;
  headerRight?: ReactNode;
  bodyContent?: ReactNode;
  borderColor?: string;
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
  return (
    <box
      borderColor={props.borderColor ?? props.accentColor}
      border={["left"]}
      customBorderChars={leftRailBorderChars}
      flexDirection="column"
      width="100%"
    >
      <box backgroundColor={chatScreenTheme.surfaceOne} flexDirection="column" flexGrow={1} width="100%">
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
          <box flexDirection="column" paddingBottom={1} width="100%">
            {props.bodyContent}
          </box>
        ) : null}
      </box>
    </box>
  );
}
