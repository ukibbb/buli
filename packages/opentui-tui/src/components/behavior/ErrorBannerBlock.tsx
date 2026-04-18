import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { Callout } from "../primitives/Callout.tsx";

// ErrorBannerBlock is the upgraded error transcript entry. The previous
// inline border box is now a Callout, matching the pen-file CalloutError
// component and giving the error a proper left accent.
export type ErrorBannerBlockProps = {
  titleText?: string;
  errorText: string;
  errorHintText?: string;
};

export function ErrorBannerBlock(props: ErrorBannerBlockProps): ReactNode {
  return (
    <Callout
      severity="error"
      titleText={props.titleText ?? "Error"}
      bodyContent={
        <box flexDirection="column">
          <text fg={chatScreenTheme.textPrimary}>{props.errorText}</text>
          {props.errorHintText ? <text fg={chatScreenTheme.textMuted}>{props.errorHintText}</text> : null}
        </box>
      }
    />
  );
}
