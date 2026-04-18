import { Box } from "ink";
import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { Stripe } from "./Stripe.tsx";

// SurfaceCard is the skeleton for every HERO-1 framed block: tool-call cards,
// plan proposals, behaviour blocks. It mirrors the pen-file layout
// (accent stripe → header row → subtle divider → body) while remaining agnostic
// about the contents of each slot. Callers supply the accent colour, the two
// header slots, and the body children — everything else is standard chrome so
// the cards stay visually consistent across tools.
export type SurfaceCardProps = {
  stripeColor: string;
  headerLeft: ReactNode;
  headerRight?: ReactNode;
  bodyContent?: ReactNode;
  borderColor?: string;
};

export function SurfaceCard(props: SurfaceCardProps): ReactNode {
  return (
    <Box
      borderColor={props.borderColor ?? chatScreenTheme.border}
      borderStyle="round"
      flexDirection="column"
      width="100%"
    >
      <Stripe stripeColor={props.stripeColor} />
      <Box
        alignItems="center"
        justifyContent="space-between"
        paddingX={2}
        paddingY={1}
        width="100%"
      >
        <Box flexShrink={1}>{props.headerLeft}</Box>
        {props.headerRight ? <Box flexShrink={0}>{props.headerRight}</Box> : null}
      </Box>
      {props.bodyContent ? (
        <>
          <Box backgroundColor={chatScreenTheme.borderSubtle} height={1} width="100%" />
          <Box backgroundColor={chatScreenTheme.bg} flexDirection="column" paddingY={1} width="100%">
            {props.bodyContent}
          </Box>
        </>
      ) : null}
    </Box>
  );
}
