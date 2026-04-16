import { Text } from "ink";
import type { ReactNode } from "react";
import { Callout } from "../primitives/Callout.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

// ErrorBannerBlock is the upgraded error transcript entry. The previous
// inline `<Box borderColor=red>` is now a Callout, matching the pen-file
// CalloutError component and giving the error a proper left accent.
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
        <Text color={chatScreenTheme.textPrimary}>
          {props.errorHintText ? `${props.errorText} — ${props.errorHintText}` : props.errorText}
        </Text>
      }
    />
  );
}
