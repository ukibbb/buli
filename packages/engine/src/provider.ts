import type { ProviderStreamEvent } from "@buli/contracts";

export type TurnInput = {
  prompt: string;
  model: string;
};

export interface TurnProvider {
  streamTurn(input: TurnInput): AsyncIterable<ProviderStreamEvent>;
}
