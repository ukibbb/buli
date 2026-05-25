import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import type { ProviderRetryPendingReason } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { Callout } from "../primitives/Callout.tsx";
import { areTuiAnimationTimersEnabled } from "../tuiAnimationTimerPolicy.ts";

// RateLimitNoticeBlock renders a live countdown so the user can tell when
// the provider will retry. retryAfterSeconds is anchored to noticeStartedAtMs
// rather than recomputed every render so the countdown stays accurate even
// after late re-renders.
export type RateLimitNoticeBlockProps = {
  retryAfterSeconds: number;
  retryReason?: ProviderRetryPendingReason;
  limitExplanation: string;
  noticeStartedAtMs: number;
};

export function RateLimitNoticeBlock(props: RateLimitNoticeBlockProps): ReactNode {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!areTuiAnimationTimersEnabled()) {
      return;
    }

    const id = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedSeconds = Math.floor((Date.now() - props.noticeStartedAtMs) / 1000);
  const remainingSeconds = Math.max(0, props.retryAfterSeconds - elapsedSeconds);
  const retryCountdownText = remainingSeconds === 0 ? "retrying now" : `retrying in ${remainingSeconds}s`;
  return (
    <Callout
      severity="warning"
      titleText={resolveRetryPendingNoticeTitleText(props.retryReason)}
      bodyContent={
        <text fg={chatScreenTheme.textPrimary}>
          {`${props.limitExplanation} · ${retryCountdownText}`}
        </text>
      }
    />
  );
}

function resolveRetryPendingNoticeTitleText(retryReason: ProviderRetryPendingReason | undefined): string {
  switch (retryReason) {
    case "rate_limit":
      return "Rate limit pending";
    case "transient_http_response":
      return "OpenAI retry pending";
    case "transport_error":
      return "Connection retry pending";
    default:
      return "Retry pending";
  }
}
