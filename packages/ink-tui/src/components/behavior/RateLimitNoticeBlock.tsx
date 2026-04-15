import { Text, useAnimation } from "ink";
import type { ReactNode } from "react";
import { chatScreenTheme } from "../../chatScreenTheme.ts";
import { Callout } from "../primitives/Callout.tsx";

// RateLimitNoticeBlock renders a live countdown so the user can tell when
// the provider will retry. retryAfterSeconds is anchored to noticeStartedAtMs
// rather than recomputed every render so the countdown stays accurate even
// after late re-renders.
export type RateLimitNoticeBlockProps = {
  retryAfterSeconds: number;
  limitExplanation: string;
  noticeStartedAtMs: number;
};

export function RateLimitNoticeBlock(props: RateLimitNoticeBlockProps): ReactNode {
  useAnimation({ interval: 1000 });
  const elapsedSeconds = Math.floor((Date.now() - props.noticeStartedAtMs) / 1000);
  const remainingSeconds = Math.max(0, props.retryAfterSeconds - elapsedSeconds);
  return (
    <Callout
      severity="warning"
      titleText="Rate limit pending"
      bodyContent={
        <Text color={chatScreenTheme.textPrimary}>
          {`${props.limitExplanation} · retrying in ${remainingSeconds}s`}
        </Text>
      }
    />
  );
}
