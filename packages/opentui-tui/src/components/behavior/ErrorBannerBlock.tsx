import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { Callout } from "../primitives/Callout.tsx";

// ErrorBannerBlock is the upgraded error transcript entry. The previous
// inline border box is now a Callout, matching the pen-file CalloutError
// component and giving the error a proper left accent.
export type ErrorBannerBlockProps = {
  errorText: string;
  errorHintText?: string;
};

export function ErrorBannerBlock(props: ErrorBannerBlockProps): ReactNode {
  return (
    <Callout
      severity="error"
      titleText="Error"
      bodyContent={
        <text fg={chatScreenTheme.textPrimary}>
          {props.errorHintText ? `${props.errorText} — ${props.errorHintText}` : props.errorText}
        </text>
      }
    />
  );
}
