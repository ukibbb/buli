import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
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
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedSeconds = Math.floor((Date.now() - props.noticeStartedAtMs) / 1000);
  const remainingSeconds = Math.max(0, props.retryAfterSeconds - elapsedSeconds);
  return (
    <Callout
      severity="warning"
      titleText="Rate limit pending"
      bodyContent={
        <text fg={chatScreenTheme.textPrimary}>
          {`${props.limitExplanation} · retrying in ${remainingSeconds}s`}
        </text>
      }
    />
  );
}
