import type { ReactNode } from "react";

// A Stripe substitutes the design's 2 px accent rectangle. The terminal cell
// grid has one-row minimum vertical resolution, so the thinnest possible
// accent is a full-width row of solid colour. See terminal-rendering-limitations.md §2.
export type StripeProps = {
  stripeColor: string;
};

export function Stripe(props: StripeProps): ReactNode {
  // backgroundColor on <box> is unchanged (not renamed to bg per the mapping doc).
  return <box backgroundColor={props.stripeColor} height={1} width="100%" />;
}
